"""
Synthetic Indian bank-transaction corpus.

WHY THIS EXISTS, STATED PLAINLY
-------------------------------
We do not have real bank statements and should not use anyone else's. So the
training corpus for M1 is generated from the narration *grammars* that Indian
banks actually emit, populated with real merchant names and realistic amount
distributions.

This is a genuine limitation and it belongs in the README, not hidden. What
makes it defensible is that the hard parts of the real problem are preserved
rather than smoothed away:

  * Every channel has its own narration grammar. A UPI debit looks nothing
    like an NEFT credit, which looks nothing like a POS swipe. The model has
    to learn merchant tokens that survive across all of them.
  * Class frequencies are wildly imbalanced by construction, exactly as they
    are in life: rent fires once a month, food sixty times.
  * Merchant strings are noisy - truncated, abbreviated, inconsistently cased,
    with reference numbers glued on. Character n-grams matter precisely
    because whole-word matching fails on `SWIGGY*ORDER` and `SWIGGYINSTAMART`.
  * A held-out slice of merchants never appears in training, so the reported
    accuracy includes genuinely unseen vendors rather than memorised ones.

If real anonymised statements ever become available, only this module is
replaced. Nothing downstream knows the difference.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterator

# ── Label space ──────────────────────────────────────────────────────────
# Mirrors ExpenseKind in the frontend's domain/types.ts, plus the three
# non-expense classes any real statement contains.
CATEGORIES = [
    "housing",
    "food",
    "transport",
    "utilities",
    "health",
    "family",
    "lifestyle",
    "subscriptions",
    "debt",
    "investment",
    "income",
    "transfer",
]
CATEGORY_INDEX = {c: i for i, c in enumerate(CATEGORIES)}


@dataclass(frozen=True)
class Merchant:
    name: str
    category: str
    # Log-normal parameters for the rupee amount: (mu, sigma) on log scale.
    mu: float
    sigma: float
    # Expected occurrences per month.
    rate: float
    # Channels this merchant realistically appears on.
    channels: tuple[str, ...]


# ── Merchants ────────────────────────────────────────────────────────────
# Amounts are calibrated to a metro salaried household. `rate` drives the
# class imbalance, which is the whole point: the model must not simply learn
# to predict "food" for everything.
MERCHANTS: list[Merchant] = [
    # ── food: very high frequency, small amounts ──
    Merchant("SWIGGY", "food", 5.9, 0.55, 11.0, ("upi", "card")),
    Merchant("ZOMATO", "food", 5.9, 0.55, 9.0, ("upi", "card")),
    Merchant("BLINKIT", "food", 5.6, 0.6, 7.0, ("upi",)),
    Merchant("ZEPTO", "food", 5.5, 0.6, 6.0, ("upi",)),
    Merchant("BIGBASKET", "food", 6.8, 0.5, 3.0, ("upi", "card")),
    Merchant("DMART", "food", 7.2, 0.45, 2.0, ("card", "upi")),
    Merchant("MORE SUPERMARKET", "food", 6.6, 0.5, 2.0, ("card",)),
    Merchant("RELIANCE FRESH", "food", 6.7, 0.5, 2.0, ("card", "upi")),
    Merchant("STARBUCKS", "food", 6.0, 0.4, 1.5, ("card",)),
    Merchant("CAFE COFFEE DAY", "food", 5.5, 0.4, 1.2, ("upi",)),
    Merchant("DOMINOS", "food", 6.1, 0.45, 1.5, ("upi", "card")),
    Merchant("INDIAN COFFEE HOUSE", "food", 5.2, 0.5, 1.0, ("upi",)),
    # ── transport ──
    Merchant("UBER", "transport", 5.5, 0.6, 8.0, ("upi", "card")),
    Merchant("OLA", "transport", 5.4, 0.6, 5.0, ("upi",)),
    Merchant("RAPIDO", "transport", 4.8, 0.5, 4.0, ("upi",)),
    Merchant("INDIAN OIL", "transport", 7.5, 0.35, 3.0, ("card", "upi")),
    Merchant("HP PETROL PUMP", "transport", 7.5, 0.35, 2.0, ("card",)),
    Merchant("BHARAT PETROLEUM", "transport", 7.5, 0.35, 1.5, ("card",)),
    Merchant("IRCTC", "transport", 7.0, 0.7, 0.6, ("card", "netbanking")),
    Merchant("BMTC BUS", "transport", 3.9, 0.4, 3.0, ("upi",)),
    Merchant("NAMMA METRO", "transport", 4.1, 0.4, 4.0, ("upi",)),
    Merchant("FASTAG RECHARGE", "transport", 6.2, 0.4, 1.0, ("upi", "netbanking")),
    # ── housing: low frequency, large amounts ──
    Merchant("RENT PAYMENT", "housing", 10.3, 0.2, 1.0, ("upi", "neft")),
    Merchant("NOBROKER RENT", "housing", 10.3, 0.2, 0.4, ("neft",)),
    Merchant("SOCIETY MAINTENANCE", "housing", 8.3, 0.3, 1.0, ("upi", "neft")),
    Merchant("URBAN COMPANY", "housing", 6.6, 0.5, 0.8, ("upi", "card")),
    # ── utilities ──
    Merchant("BESCOM", "utilities", 7.7, 0.35, 1.0, ("upi", "netbanking")),
    Merchant("MSEB ELECTRICITY", "utilities", 7.7, 0.35, 0.5, ("netbanking",)),
    Merchant("BWSSB WATER", "utilities", 6.3, 0.3, 1.0, ("upi",)),
    Merchant("AIRTEL POSTPAID", "utilities", 6.6, 0.25, 1.0, ("ach", "upi")),
    Merchant("JIO FIBER", "utilities", 6.8, 0.2, 1.0, ("ach", "upi")),
    Merchant("ACT FIBERNET", "utilities", 6.9, 0.2, 0.5, ("ach",)),
    Merchant("INDANE GAS", "utilities", 6.7, 0.15, 0.7, ("upi",)),
    Merchant("TATA POWER", "utilities", 7.6, 0.35, 0.4, ("netbanking",)),
    # ── health ──
    Merchant("APOLLO PHARMACY", "health", 6.3, 0.6, 1.5, ("upi", "card")),
    Merchant("PHARMEASY", "health", 6.4, 0.6, 0.8, ("upi",)),
    Merchant("1MG", "health", 6.3, 0.6, 0.7, ("upi",)),
    Merchant("MANIPAL HOSPITAL", "health", 8.2, 0.8, 0.3, ("card",)),
    Merchant("PRACTO", "health", 6.5, 0.4, 0.4, ("upi",)),
    Merchant("DR LAL PATHLABS", "health", 7.0, 0.5, 0.3, ("upi", "card")),
    Merchant("STAR HEALTH PREMIUM", "health", 8.6, 0.3, 0.25, ("ach",)),
    # ── family ──
    Merchant("TRF TO MOTHER", "family", 9.4, 0.3, 1.0, ("upi", "neft")),
    Merchant("TRF TO FATHER", "family", 9.4, 0.3, 0.5, ("neft",)),
    Merchant("SCHOOL FEES", "family", 9.6, 0.4, 0.3, ("neft", "netbanking")),
    # ── lifestyle ──
    Merchant("AMAZON", "lifestyle", 6.9, 0.9, 4.0, ("card", "upi")),
    Merchant("FLIPKART", "lifestyle", 6.9, 0.9, 3.0, ("card", "upi")),
    Merchant("MYNTRA", "lifestyle", 7.2, 0.7, 1.5, ("card",)),
    Merchant("AJIO", "lifestyle", 7.1, 0.7, 0.8, ("card",)),
    Merchant("DECATHLON", "lifestyle", 7.4, 0.6, 0.4, ("card",)),
    Merchant("PVR CINEMAS", "lifestyle", 6.3, 0.4, 0.8, ("upi", "card")),
    Merchant("BOOKMYSHOW", "lifestyle", 6.2, 0.5, 0.9, ("upi",)),
    Merchant("MAKEMYTRIP", "lifestyle", 8.9, 0.8, 0.25, ("card",)),
    Merchant("OYO ROOMS", "lifestyle", 7.8, 0.6, 0.2, ("card",)),
    Merchant("NYKAA", "lifestyle", 6.9, 0.6, 0.7, ("card", "upi")),
    # ── subscriptions: small, highly regular. M2 depends on this regularity ──
    Merchant("NETFLIX", "subscriptions", 6.4, 0.05, 1.0, ("ach", "card")),
    Merchant("SPOTIFY", "subscriptions", 4.8, 0.05, 1.0, ("ach", "card")),
    Merchant("AMAZON PRIME", "subscriptions", 5.7, 0.05, 0.35, ("card",)),
    Merchant("HOTSTAR", "subscriptions", 5.9, 0.05, 0.3, ("card",)),
    Merchant("GOOGLE ONE", "subscriptions", 5.3, 0.05, 1.0, ("card",)),
    Merchant("CULT FIT", "subscriptions", 7.6, 0.1, 1.0, ("ach", "card")),
    Merchant("YOUTUBE PREMIUM", "subscriptions", 4.9, 0.05, 1.0, ("card",)),
    Merchant("ADOBE CREATIVE CLOUD", "subscriptions", 7.4, 0.05, 1.0, ("card",)),
    # ── debt ──
    Merchant("HDFC CARD PAYMENT", "debt", 9.0, 0.7, 1.0, ("neft", "upi")),
    Merchant("BAJAJ FINSERV EMI", "debt", 8.6, 0.3, 1.0, ("ach",)),
    Merchant("HDFC HOME LOAN EMI", "debt", 10.2, 0.15, 1.0, ("ach",)),
    Merchant("SBI EDUCATION LOAN", "debt", 8.7, 0.15, 1.0, ("ach",)),
    Merchant("ICICI PERSONAL LOAN", "debt", 9.2, 0.2, 1.0, ("ach",)),
    # ── investment ──
    Merchant("ZERODHA", "investment", 9.2, 0.6, 1.5, ("upi", "netbanking")),
    Merchant("GROWW", "investment", 8.9, 0.6, 1.2, ("upi",)),
    Merchant("INDIAN CLEARING CORP SIP", "investment", 9.0, 0.4, 2.0, ("ach",)),
    Merchant("NPS CONTRIBUTION", "investment", 8.6, 0.3, 0.5, ("netbanking",)),
    Merchant("PPF DEPOSIT", "investment", 9.4, 0.4, 0.3, ("netbanking",)),
    Merchant("COINDCX", "investment", 8.2, 0.8, 0.4, ("upi",)),
    # ── income ──
    Merchant("ACME TECHNOLOGIES SALARY", "income", 11.7, 0.05, 1.0, ("neft",)),
    Merchant("INTEREST CREDIT", "income", 5.8, 0.6, 1.0, ("internal",)),
    Merchant("CASHBACK CREDIT", "income", 4.5, 0.7, 0.8, ("internal",)),
    Merchant("DIVIDEND CREDIT", "income", 6.5, 0.8, 0.3, ("internal",)),
    # ── transfer: the class that exists to be confusable ──
    Merchant("TRF TO SELF", "transfer", 9.0, 0.8, 1.2, ("neft", "upi")),
    Merchant("ATM WITHDRAWAL", "transfer", 7.9, 0.4, 1.5, ("atm",)),
    Merchant("TRF TO FRIEND", "transfer", 6.5, 0.9, 2.0, ("upi",)),
]

# ── Narration grammars ───────────────────────────────────────────────────
# Each channel formats the same merchant completely differently. This is the
# core difficulty the model has to overcome.
BANK_CODES = ["HDFC0001234", "ICIC0000456", "SBIN0007890", "UTIB0002345", "KKBK0001111"]
CITIES = ["BANGALORE", "BENGALURU", "MUMBAI", "PUNE", "HYDERABAD", "GURGAON", "BLR", "MUM"]


def _ref(rng: random.Random, n: int) -> str:
    return "".join(rng.choice("0123456789") for _ in range(n))


# Real Indian statements almost never print the brand you recognise. They print
# the registered entity, a payment-aggregator prefix, or whatever survived the
# bank's field-width limit. Learning to see through that IS the problem.
LEGAL_NAMES: dict[str, tuple[str, ...]] = {
    "SWIGGY": ("BUNDL TECHNOLOGIES", "SWIGGY LTD", "SWIGGYINSTAMART"),
    "ZOMATO": ("ZOMATO LTD", "ZOMATO MEDIA", "ETERNAL LTD"),
    "AMAZON": ("AMAZON SELLER SER", "AMZN", "AMAZON.IN", "ACI*AMAZON"),
    "FLIPKART": ("FKRT", "FLIPKART INTERNET", "FKRT*ORDER"),
    "UBER": ("UBER INDIA SYSTEMS", "UBER*TRIP", "UBERINDIA"),
    "OLA": ("ANI TECHNOLOGIES", "OLACABS", "OLA*RIDE"),
    "BLINKIT": ("BLINK COMMERCE", "GROFERS INDIA"),
    "ZEPTO": ("KIRANAKART TECH", "ZEPTONOW"),
    "BIGBASKET": ("SUPERMARKET GROCERY", "BBDAILY", "BIGBSKT"),
    "MYNTRA": ("MYNTRA DESIGNS", "MYNTRA JABONG"),
    "NETFLIX": ("NETFLIX.COM", "NETFLIX ENTERTAIN"),
    "CULT FIT": ("CUREFIT HEALTHCARE", "CULTFIT", "CUREFIT"),
    "ZERODHA": ("ZERODHA BROKING", "ZERODHA*"),
    "GROWW": ("NEXTBILLION TECH", "GROWWAPP"),
    "APOLLO PHARMACY": ("APOLLO PHARM", "APOLLOPHARMACY"),
    "DMART": ("AVENUE SUPERMARTS", "DMART READY"),
    "PVR CINEMAS": ("PVR INOX LTD", "PVRCINEMAS"),
    "MAKEMYTRIP": ("MMT", "MAKEMYTRIP INDIA", "MMTINDIA"),
}

AGGREGATORS = ("PAYU*", "RAZORPAY*", "BILLDESK*", "CCAVENUE*", "PYTM*", "PHONEPE*")


def _variant(rng: random.Random, name: str) -> str:
    """One realistic rendering of a merchant name, as a bank would print it."""
    # A third of the time, use the registered entity instead of the brand.
    if name in LEGAL_NAMES and rng.random() < 0.34:
        name = rng.choice(LEGAL_NAMES[name])

    roll = rng.random()
    if roll < 0.14:
        # Bank field-width truncation.
        name = name[: rng.randint(8, 16)].rstrip()
    elif roll < 0.24:
        name = name.replace(" ", "")
    elif roll < 0.31:
        name = name.split(" ")[0]
    elif roll < 0.37:
        # Vowel-dropping abbreviation, common in older core-banking systems.
        name = " ".join(
            w if len(w) <= 4 else w[0] + w[1:].translate(str.maketrans("", "", "AEIOU"))
            for w in name.split(" ")
        )
    elif roll < 0.44:
        name = rng.choice(AGGREGATORS) + name.replace(" ", "")

    return name


def _narration(rng: random.Random, m: Merchant, channel: str) -> str:
    """Render one merchant into one channel's narration grammar."""
    name = _variant(rng, m.name)
    city = rng.choice(CITIES)
    bank = rng.choice(BANK_CODES)

    if channel == "upi":
        handle = rng.choice(["okhdfcbank", "okaxis", "ybl", "paytm", "oksbi", "apl"])
        vendor = name.replace(" ", rng.choice(["", ".", "-"])).lower()
        form = rng.randint(0, 3)
        if form == 0:
            return f"UPI/DR/{_ref(rng, 9)}/{name}/{bank}/{vendor}@{handle}"
        if form == 1:
            return f"UPI-{name}-{vendor}@{handle}-{bank}-{_ref(rng, 12)}"
        if form == 2:
            return f"UPI/{_ref(rng, 12)}/P2M/{vendor}@{handle}/{name}"
        return f"BY TRANSFER-UPI/DR/{_ref(rng, 10)}/{name}//{bank}"

    if channel == "card":
        last4 = _ref(rng, 4)
        form = rng.randint(0, 2)
        if form == 0:
            return f"POS 4521XXXXXXXX{last4} {name} {city}"
        if form == 1:
            return f"VISA-{name}*{_ref(rng, 4)} {city} IN"
        return f"CARD PAYMENT TO {name} {city} REF {_ref(rng, 8)}"

    if channel == "neft":
        return f"NEFT-{rng.choice(['CITIN', 'HDFCN', 'SBIN'])}{_ref(rng, 8)}-{name}-{bank}"

    if channel == "ach":
        form = rng.randint(0, 1)
        if form == 0:
            return f"ACH-D-{name}-{_ref(rng, 10)}"
        return f"NACH DR {name} MANDATE {_ref(rng, 12)}"

    if channel == "netbanking":
        return f"IB FUNDS TRANSFER TO {name} {_ref(rng, 9)}"

    if channel == "atm":
        return f"ATM-WDL-{_ref(rng, 4)}-{city}-{_ref(rng, 6)}"

    return f"{name} CREDIT {_ref(rng, 8)}"


@dataclass(frozen=True)
class Txn:
    day: date
    narration: str
    amount: float
    category: str
    merchant: str
    direction: str  # "debit" | "credit"
    channel: str    # upi | card | neft | ach | netbanking | atm | internal


CREDIT_CATEGORIES = {"income"}


def generate(
    months: int = 24,
    seed: int = 7,
    holdout_merchants: float = 0.12,
    start: date | None = None,
) -> tuple[list[Txn], set[str]]:
    """
    Generate a transaction history.

    Returns the transactions plus the set of merchant names reserved as a
    holdout. Those merchants are still generated - the caller decides what to
    do with them - which is how we measure performance on vendors the model
    has genuinely never seen, rather than on memorised strings.
    """
    rng = random.Random(seed)
    start = start or date.today() - timedelta(days=30 * months)

    names = sorted({m.name for m in MERCHANTS})
    rng.shuffle(names)
    holdout = set(names[: max(1, int(len(names) * holdout_merchants))])

    txns: list[Txn] = []
    for month in range(months):
        month_start = start + timedelta(days=30 * month)
        for m in MERCHANTS:
            # Poisson-ish count for the month.
            count = 0
            lam = m.rate
            while lam > 0:
                if rng.random() < min(1.0, lam):
                    count += 1
                lam -= 1.0

            for _ in range(count):
                # Subscriptions and EMIs land on a stable day of month; that
                # regularity is the signal M2 will later key off.
                if m.category in ("subscriptions", "debt", "housing"):
                    day_offset = (hash(m.name) % 26) + rng.randint(-1, 1)
                else:
                    day_offset = rng.randint(0, 29)
                day = month_start + timedelta(days=max(0, min(29, day_offset)))

                channel = rng.choice(m.channels)
                amount = round(rng.lognormvariate(m.mu, m.sigma), 2)
                txns.append(
                    Txn(
                        day=day,
                        narration=_narration(rng, m, channel),
                        amount=amount,
                        category=m.category,
                        merchant=m.name,
                        direction="credit" if m.category in CREDIT_CATEGORIES else "debit",
                        channel=channel,
                    )
                )

    txns.sort(key=lambda t: t.day)
    return txns, holdout


def time_split(txns: list[Txn], test_fraction: float = 0.25) -> tuple[list[Txn], list[Txn]]:
    """
    Split by TIME, never at random.

    A random split leaks future information into the training set and inflates
    every metric. For a stream of dated transactions the only honest split is
    chronological, and it is the first thing an interviewer checks.
    """
    cut = int(len(txns) * (1 - test_fraction))
    return txns[:cut], txns[cut:]


def split_holdout(
    txns: list[Txn], holdout: set[str], test_fraction: float = 0.25
) -> tuple[list[Txn], list[Txn], list[Txn]]:
    """
    Chronological split with the reserved vendors genuinely withheld.

    An earlier version of this file computed a holdout set and then trained on
    it anyway, so the "unseen merchant" number was never actually measured -
    and the headline accuracy was really just string memorisation. Training
    now excludes those vendors outright:

        train  : before the cutoff, holdout vendors removed
        test   : after the cutoff, vendors the model has seen
        unseen : after the cutoff, vendors it has never once been shown

    The third number is the one that predicts how this behaves for a new user.
    """
    cut = int(len(txns) * (1 - test_fraction))
    early, late = txns[:cut], txns[cut:]

    train = [t for t in early if t.merchant not in holdout]
    test = [t for t in late if t.merchant not in holdout]
    unseen = [t for t in late if t.merchant in holdout]
    return train, test, unseen


def iter_examples(txns: list[Txn]) -> Iterator[tuple[str, int]]:
    for t in txns:
        yield t.narration, CATEGORY_INDEX[t.category]
