"""
Character n-gram TF-IDF, implemented directly.

WHY CHARACTER N-GRAMS AND NOT WORDS
-----------------------------------
Word tokenisation fails on this data. `SWIGGY*ORDER`, `SWIGGYINSTAMART`,
`swiggy@okhdfcbank` and `SWIGGY BANGALORE` share no whole word, but they share
the character run `SWIGG`. Sub-word features are what let the model recognise
a merchant across four different narration grammars, and they degrade
gracefully on merchants it has never seen - which is exactly the case we care
about most.

WHAT IS HAND-WRITTEN HERE
-------------------------
Vocabulary construction, document frequency, the smoothed IDF weighting, term
frequency with sub-linear damping, and L2 row normalisation. scipy.sparse is
used only as a storage container for the resulting matrix; every number in it
is computed by this file.
"""

from __future__ import annotations

import numpy as np
from scipy import sparse


class CharNGramTfidf:
    """
    TF-IDF over character n-grams.

    Parameters
    ----------
    ngram_range : inclusive (min_n, max_n) character window sizes.
    min_df      : an n-gram must appear in at least this many documents to
                  earn a column. Kills one-off reference numbers, which are
                  pure noise and would otherwise dominate the vocabulary.
    max_features: keep only the most frequent n-grams after min_df.
    sublinear_tf: use 1 + log(tf) instead of raw tf. A narration that repeats
                  a merchant token three times is not three times as much
                  evidence.
    """

    def __init__(
        self,
        ngram_range: tuple[int, int] = (3, 5),
        min_df: int = 3,
        max_features: int = 60_000,
        sublinear_tf: bool = True,
        lowercase: bool = True,
    ) -> None:
        self.min_n, self.max_n = ngram_range
        self.min_df = min_df
        self.max_features = max_features
        self.sublinear_tf = sublinear_tf
        self.lowercase = lowercase

        self.vocabulary_: dict[str, int] = {}
        self.idf_: np.ndarray | None = None

    # ── tokenisation ────────────────────────────────────────────────────
    def _normalise(self, doc: str) -> str:
        if self.lowercase:
            doc = doc.lower()
        # Collapse digit runs to a single sentinel. Reference numbers carry no
        # category signal whatsoever, and leaving them in floods the
        # vocabulary with n-grams that appear exactly once.
        out = []
        prev_digit = False
        for ch in doc:
            if ch.isdigit():
                if not prev_digit:
                    out.append("#")
                prev_digit = True
            else:
                out.append(ch)
                prev_digit = False
        return " " + "".join(out) + " "

    def _ngrams(self, doc: str) -> list[str]:
        s = self._normalise(doc)
        grams: list[str] = []
        L = len(s)
        for n in range(self.min_n, self.max_n + 1):
            if L < n:
                continue
            for i in range(L - n + 1):
                grams.append(s[i : i + n])
        return grams

    # ── fit ─────────────────────────────────────────────────────────────
    def fit(self, docs: list[str]) -> "CharNGramTfidf":
        # Document frequency: in how many documents does each n-gram occur?
        df: dict[str, int] = {}
        for doc in docs:
            for g in set(self._ngrams(doc)):
                df[g] = df.get(g, 0) + 1

        kept = [(g, c) for g, c in df.items() if c >= self.min_df]
        kept.sort(key=lambda kv: (-kv[1], kv[0]))
        kept = kept[: self.max_features]

        self.vocabulary_ = {g: i for i, (g, _) in enumerate(kept)}

        n_docs = len(docs)
        idf = np.empty(len(kept), dtype=np.float64)
        for g, i in self.vocabulary_.items():
            # Smoothed IDF, the standard +1 form: pretend one extra document
            # contains every term, so nothing divides by zero and no weight
            # runs away to infinity.
            idf[i] = np.log((1.0 + n_docs) / (1.0 + df[g])) + 1.0
        self.idf_ = idf
        return self

    # ── transform ───────────────────────────────────────────────────────
    def transform(self, docs: list[str]) -> sparse.csr_matrix:
        if self.idf_ is None:
            raise RuntimeError("fit() before transform()")

        indptr = [0]
        indices: list[int] = []
        data: list[float] = []

        for doc in docs:
            counts: dict[int, int] = {}
            for g in self._ngrams(doc):
                j = self.vocabulary_.get(g)
                if j is not None:
                    counts[j] = counts.get(j, 0) + 1

            if counts:
                cols = np.fromiter(counts.keys(), dtype=np.int64, count=len(counts))
                tf = np.fromiter(counts.values(), dtype=np.float64, count=len(counts))

                if self.sublinear_tf:
                    tf = 1.0 + np.log(tf)

                vals = tf * self.idf_[cols]

                # L2 normalise each row, so long narrations do not simply
                # outweigh short ones.
                norm = np.sqrt((vals * vals).sum())
                if norm > 0:
                    vals /= norm

                indices.extend(cols.tolist())
                data.extend(vals.tolist())

            indptr.append(len(indices))

        return sparse.csr_matrix(
            (
                np.asarray(data, dtype=np.float64),
                np.asarray(indices, dtype=np.int64),
                np.asarray(indptr, dtype=np.int64),
            ),
            shape=(len(docs), len(self.vocabulary_)),
        )

    def fit_transform(self, docs: list[str]) -> sparse.csr_matrix:
        return self.fit(docs).transform(docs)

    @property
    def n_features(self) -> int:
        return len(self.vocabulary_)
