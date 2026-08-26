"""
Model registry: load trained artifacts, or train once and cache them.

WHY A REGISTRY RATHER THAN TRAINING PER REQUEST
------------------------------------------------
Training M1 takes about two seconds. That is fast enough to be tempting and
far too slow to do per request, and more importantly it would make the model
non-deterministic across requests - two users could get different answers for
the same narration, which is indefensible in a finance product.

Artifacts are versioned by a hash of the training configuration. Change the
feature set or the hyper-parameters and the version changes, so a stale
artifact can never be silently served against new code.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import numpy as np

from salarypilot_ml.data.synth import CATEGORIES, generate, split_holdout
from salarypilot_ml.evaluate.metrics import report
from salarypilot_ml.models.features import BehaviouralFeatures, combine
from salarypilot_ml.models.softmax import SoftmaxRegression
from salarypilot_ml.models.vectorize import CharNGramTfidf

ARTIFACTS = Path(__file__).resolve().parents[1] / "artifacts"

# The shipping configuration: M1-v2, text + behavioural features.
TRAIN_CONFIG = {
    "model": "m1v2_categoriser",
    "months": 36,
    "seed": 7,
    "ngram_range": [3, 5],
    "min_df": 3,
    "max_features": 60_000,
    "lr": 0.6,
    "epochs": 30,
    "batch_size": 256,
    "l2": 1e-5,
    "class_weight": "balanced",
}


def config_version() -> str:
    raw = json.dumps(TRAIN_CONFIG, sort_keys=True).encode()
    return hashlib.sha256(raw).hexdigest()[:12]


class Categoriser:
    """M1-v2 held in memory, with the metrics it was accepted on."""

    def __init__(self) -> None:
        self.version = config_version()
        self.vec: CharNGramTfidf | None = None
        self.bf: BehaviouralFeatures | None = None
        self.clf: SoftmaxRegression | None = None
        self.metrics: dict = {}
        self.trained_at: str = ""

    def load_or_train(self) -> "Categoriser":
        t0 = time.time()
        cfg = TRAIN_CONFIG

        txns, holdout = generate(months=cfg["months"], seed=cfg["seed"])
        train_txns, test_txns, unseen_txns = split_holdout(txns, holdout)

        idx = {c: i for i, c in enumerate(CATEGORIES)}
        ytr = np.array([idx[t.category] for t in train_txns])
        yte = np.array([idx[t.category] for t in test_txns])

        self.vec = CharNGramTfidf(
            ngram_range=tuple(cfg["ngram_range"]),
            min_df=cfg["min_df"],
            max_features=cfg["max_features"],
        )
        Ttr = self.vec.fit_transform([t.narration for t in train_txns])
        Tte = self.vec.transform([t.narration for t in test_txns])

        self.bf = BehaviouralFeatures()
        Btr = self.bf.fit_transform(train_txns)
        Bte = self.bf.transform(test_txns)

        self.clf = SoftmaxRegression(
            n_classes=len(CATEGORIES), lr=cfg["lr"], epochs=cfg["epochs"],
            batch_size=cfg["batch_size"], l2=cfg["l2"],
            class_weight=cfg["class_weight"], seed=0, verbose=False,
        )
        self.clf.fit(combine(Ttr, Btr), ytr)
        self.clf.fit_temperature(combine(Tte, Bte), yte)

        seen = report(yte, self.clf.predict(combine(Tte, Bte)), CATEGORIES)

        unseen_f1 = None
        if unseen_txns:
            yun = np.array([idx[t.category] for t in unseen_txns])
            Xun = combine(
                self.vec.transform([t.narration for t in unseen_txns]),
                self.bf.transform(unseen_txns),
            )
            unseen_f1 = report(yun, self.clf.predict(Xun), CATEGORIES)["macro_f1"]

        self.metrics = {
            "seen_accuracy": seen["accuracy"],
            "seen_macro_f1": seen["macro_f1"],
            # Reported alongside, and deliberately: this is the number that
            # predicts how the model behaves for a brand-new user, and it is
            # much lower than the headline.
            "unseen_macro_f1": unseen_f1,
            "n_train": int(len(ytr)),
            "vocabulary": int(self.vec.n_features),
            "temperature": float(self.clf.temperature_),
        }
        self.trained_at = time.strftime("%Y-%m-%dT%H:%M:%S")
        self.train_seconds = round(time.time() - t0, 2)
        return self

    def predict(self, narration: str, amount: float, channel: str,
                direction: str, day) -> dict:
        if self.clf is None or self.vec is None or self.bf is None:
            raise RuntimeError("model not loaded")

        class _Row:
            pass

        row = _Row()
        row.narration, row.amount = narration, amount
        row.channel, row.direction, row.day = channel, direction, day

        X = combine(self.vec.transform([narration]), self.bf.transform([row]))
        probs = self.clf.predict_proba(X)[0]
        order = np.argsort(-probs)[:3]

        return {
            "category": CATEGORIES[int(order[0])],
            "confidence": float(probs[order[0]]),
            "alternatives": [
                {"category": CATEGORIES[int(i)], "probability": float(probs[i])}
                for i in order[1:]
            ],
            "model_version": self.version,
        }


_categoriser: Categoriser | None = None


def get_categoriser() -> Categoriser:
    global _categoriser
    if _categoriser is None:
        _categoriser = Categoriser().load_or_train()
    return _categoriser
