"""
Loads the M8 artifact into memory.

WHY THIS IS A LOADER, NOT A TRAINER
--------------------------------------
Every other model in this service (M1) trains at boot because training is
seconds and the data is synthetic. M8 depends on genuinely fetching ~500
real tickers' worth of price history over the network, which takes minutes
and can fail on a flaky connection or a rate limit - unacceptable things to
gate server startup on. So M8 is trained OFFLINE
(`python -m salarypilot_ml.train.m8_screener`, after `python fetch_data.py`)
and this just reads the artifact it wrote.

THE VERDICT IS LOAD-BEARING
------------------------------
The training script's walk-forward evaluation decides whether this beat the
real Nifty 500 index. If it did not, `enabled` is False and the API says so
plainly instead of quietly returning a losing strategy's picks as if they
were a shipped feature - the same discipline M2 was held to.
"""

from __future__ import annotations

import json
from pathlib import Path

ARTIFACTS = Path(__file__).resolve().parents[1] / "artifacts"


class Screener:
    def __init__(self) -> None:
        self.available = False
        self.enabled = False
        self.data: dict = {}

    def load(self) -> "Screener":
        path = ARTIFACTS / "m8_metrics.json"
        if not path.exists():
            # Not an error - the offline training script simply has not
            # been run yet. The API should say that plainly, not 500.
            return self

        self.data = json.loads(path.read_text(encoding="utf-8"))
        self.available = True
        self.enabled = self.data.get("verdict") == "ship"
        return self

    def summary(self) -> dict:
        if not self.available:
            return {
                "enabled": False,
                "reason": "not yet trained - run fetch_data.py then "
                          "python -m salarypilot_ml.train.m8_screener",
            }
        if not self.enabled:
            return {
                "enabled": False,
                "reason": "evaluated against the real Nifty 500 index and did "
                          "not beat it on a walk-forward test - not shipped",
                "evaluation": self._evaluation(),
            }
        return {
            "enabled": True,
            "model_version": self.data["model_version"],
            "as_of_date": self.data["as_of_date"],
            "data_source": self.data["data_source"],
            "universe_size": self.data["universe_size"],
            "caveat": self.data["caveat"],
            "evaluation": self._evaluation(),
            "picks": self.data["current_picks"],
        }

    def _evaluation(self) -> dict:
        return {
            "n_quarters_tested": self.data["n_quarters"],
            "hit_rate": self.data["hit_rate"],
            "top_quintile": self.data["top_quintile"],
            "nifty500_index": self.data["nifty500_index"],
        }


_screener: Screener | None = None


def get_screener() -> Screener:
    global _screener
    if _screener is None:
        _screener = Screener().load()
    return _screener
