import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Wallet as WalletIcon, ArrowDownToLine, ArrowUpFromLine, TrendingUp,
    CloudOff, Loader2, Check, AlertTriangle, Info, History, Sprout, ArrowRight,
} from 'lucide-react';
import { PageHeader } from '../components/primitives/PageHeader';
import { Card, CardHead, CardBody } from '../components/primitives/Card';
import { Badge } from '../components/primitives/Badge';
import { Stat } from '../components/primitives/Stat';
import { useLivePrices } from '../hooks/useLivePrices';
import { useWalletStore } from '../store/useWalletStore';
import {
    topUp, withdraw, redeem,
    newIdempotencyKey, formatPaise, formatUnits, toPaise,
} from '../lib/wallet';

/* ═══════════════════════════════════════════════════════════════════
   Wallet — the money loop, end to end.

   ⚠  SIMULATED MONEY. No real funds move. Handling real money in India
      needs an RBI Prepaid Payment Instrument licence; this is a faithful
      model of how such a system works, with test balances. The page says
      so where it can be read, not in a footnote.

   Every other screen in this app has been a projection: what your runway
   would be, what a portfolio might do. This is the one place where an
   action changes a durable, server-side balance — so it is the one place
   where being right actually matters.

   WHAT THE UI HAS TO GET RIGHT, AND WHY
   -------------------------------------

   ONE KEY PER INTENT. The idempotency key is generated when the user
   commits to an amount, not when the request is built. That is what
   makes a double tap, a retry, or an impatient reload collapse into a
   single transaction instead of two debits. Generating it per-request
   would look identical in the happy path and silently double-spend in
   exactly the case it exists to protect.

   THE SERVER OWNS THE BALANCE. No optimistic arithmetic. Nothing here
   guesses the new balance and patches it in — it re-reads. Optimistic
   updates are how a UI ends up confidently displaying a number the
   ledger disagrees with, and a wallet that lies about its balance is
   worse than a wallet that takes 200ms.

   REFUSALS ARE SHOWN AS SENT. Overdrawing is refused by a database
   trigger, not by this component. The check here is only to disable the
   button early; if the two ever disagree, the database is right and its
   message is what the user reads.

   WHY THIS PAGE DOES NOT LET YOU PICK WHAT TO BUY
   ------------------------------------------------
   An earlier version had a ticker picker here — choose an instrument,
   choose an amount, buy. That put an allocation decision on a screen
   whose whole job is moving money in and out, and duplicated the one
   place that decision actually belongs: Invest, where the system
   proposes a diversified plan with a stated reason for every line and
   the user approves or declines it. A user who does not know how to
   invest — the person this product is built for — should never be
   staring at a list of eighteen tickers wondering which one to press.
   So: this page is add money, take money out, see what you hold, sell
   something you no longer want. Deciding what to buy happens on Invest.
   ═══════════════════════════════════════════════════════════════════ */

const QUICK_TOPUP = [5_000, 10_000, 25_000, 50_000];

type Flash = { tone: 'ok' | 'err'; text: string } | null;

export default function Wallet() {
    // Shared with the dashboard and portfolio, so a trade made here shows
    // up there without a reload and without the two disagreeing.
    const bal = useWalletStore((s) => s.balance);
    const entries = useWalletStore((s) => s.entries);
    const loading = !useWalletStore((s) => s.loaded);
    const offline = useWalletStore((s) => s.offline);
    const reload = useWalletStore((s) => s.refresh);

    const [busy, setBusy] = useState(false);
    const [flash, setFlash] = useState<Flash>(null);

    const [amount, setAmount] = useState('10000');
    /** Which holding's Sell button is mid-request, so only that row spins. */
    const [selling, setSelling] = useState<string | null>(null);

    const prices = useLivePrices();

    // Guards against setState after unmount when a request outlives the
    // page — switching tabs mid-top-up should not warn in the console.
    const alive = useRef(true);
    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);

    useEffect(() => {
        void (async () => {
            await reload();
        })();
    }, [reload]);

    const rupees = Number(amount);
    const validAmount = Number.isFinite(rupees) && rupees > 0;
    const paise = validAmount ? toPaise(rupees) : 0;

    const walletPaise = bal?.wallet_paise ?? 0;
    const canSpend = validAmount && paise <= walletPaise;

    /* ─── one place where money moves ───────────────────────────────
       Every action funnels through here so the key, the busy lock, the
       error surface and the re-read are identical for all four. */
    const run = useCallback(
        async (label: string, fn: (key: string) => Promise<{ ok: boolean; error?: string }>) => {
            if (busy) return;
            setBusy(true);
            setFlash(null);

            // Generated ONCE, here. See the note at the top of the file.
            const key = newIdempotencyKey();
            const res = await fn(key);

            if (!alive.current) return;
            if (res.ok) {
                setFlash({ tone: 'ok', text: `${label} completed.` });
                await reload();
            } else {
                setFlash({ tone: 'err', text: res.error ?? 'That did not go through.' });
            }
            if (alive.current) setBusy(false);
        },
        [busy, reload],
    );

    /** Sells an entire position at the live price. The one investment
        decision this page still permits: exiting something you already
        hold, at your own request — not choosing what to buy. */
    const sellHolding = useCallback(
        async (ticker: string, costPaise: number) => {
            if (selling) return;
            setSelling(ticker);
            setFlash(null);

            const live = prices.price[ticker];
            const unitPricePaise = toPaise(live && live > 0 ? live : 100);
            const key = newIdempotencyKey();
            const res = await redeem(ticker, costPaise, unitPricePaise, key, `Sold ${ticker}`);

            if (!alive.current) return;
            if (res.ok) {
                setFlash({ tone: 'ok', text: `Sold ${ticker}.` });
                await reload();
            } else {
                setFlash({ tone: 'err', text: res.error ?? 'That did not go through.' });
            }
            if (alive.current) setSelling(null);
        },
        [selling, prices.price, reload],
    );

    /* ─── offline ─────────────────────────────────────────────────── */
    if (offline && !bal) {
        return (
            <div>
                <PageHeader
                    eyebrow="Wallet"
                    title="Your wallet"
                    description="Fund it, invest from it, and watch every rupee land in the ledger."
                />
                <Card>
                    <CardBody className="text-center py-12">
                        <CloudOff size={26} className="mx-auto mb-3 text-faint" />
                        <p className="text-[14px] text-hi font-semibold">The API is not running</p>
                        <p className="text-[12.5px] text-lo mt-1.5 max-w-md mx-auto leading-relaxed">
                            Unlike the rest of the app, this page has no local fallback — a
                            wallet balance is only meaningful if the server is the one keeping
                            it. Start the API and reload:
                        </p>
                        <code className="inline-block mt-4 px-3 py-2 rounded-[var(--r-sm)] text-[11.5px] text-lo"
                            style={{ background: 'var(--surface-2)', border: '1px solid var(--line-subtle)' }}>
                            cd backend/go-api &amp;&amp; go run ./cmd/server
                        </code>
                    </CardBody>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Wallet"
                title="Your wallet"
                description="Fund it, invest from it, sell back into it. Every move is a double-entry ledger transaction."
                metric={{
                    label: 'Available',
                    value: loading ? '—' : formatPaise(walletPaise),
                }}
            />

            {/* The disclosure sits above the money, not below it. */}
            <div
                className="flex items-start gap-2.5 p-3 rounded-[var(--r-md)]"
                style={{
                    background: 'rgba(255,184,0,0.07)',
                    border: '1px solid rgba(255,184,0,0.2)',
                }}
            >
                <Info size={15} className="shrink-0 mt-px" style={{ color: 'var(--warn)' }} />
                <div className="text-[12px] text-lo leading-relaxed space-y-1.5">
                    <p>
                        <span className="font-semibold text-hi">Where this money comes from.</span>{' '}
                        Nothing is charged and no bank or card is connected. Pressing
                        &ldquo;Add money&rdquo; credits your wallet from a simulated external
                        account and records both sides in the ledger, exactly as a real
                        top-up would.
                    </p>
                    <p>
                        Handling real rupees in India needs an RBI Prepaid Payment Instrument
                        licence, which this project does not have. So the accounting is
                        genuine — every paisa is traceable and the books balance to zero — and
                        the rupees are test rupees. It is here so you can put money in, invest
                        it, sell it and take it back out, and watch that whole loop actually
                        work.
                    </p>
                    <p className="text-faint">
                        This is separate from the savings you entered during setup. Those are
                        your real-world numbers; this is the sandbox you can trade in.
                    </p>
                </div>
            </div>

            {flash && (
                <div
                    role="status"
                    className="flex items-center gap-2.5 p-3 rounded-[var(--r-md)]"
                    style={{
                        background: flash.tone === 'ok' ? 'rgba(0,232,134,0.08)' : 'rgba(255,86,86,0.08)',
                        border: `1px solid ${flash.tone === 'ok' ? 'rgba(0,232,134,0.22)' : 'rgba(255,86,86,0.22)'}`,
                    }}
                >
                    {flash.tone === 'ok'
                        ? <Check size={15} style={{ color: 'var(--gain)' }} />
                        : <AlertTriangle size={15} style={{ color: 'var(--neg)' }} />}
                    <p className="text-[12.5px]" style={{ color: flash.tone === 'ok' ? 'var(--gain)' : 'var(--neg)' }}>
                        {flash.text}
                    </p>
                </div>
            )}

            {/* ─── the three numbers ─── */}
            <div className="grid gap-4 sm:grid-cols-3">
                <Stat
                    label="Available to spend"
                    value={loading ? '—' : formatPaise(walletPaise)}
                    icon={WalletIcon}
                    tone="accent"
                    hint="Settled and unreserved"
                />
                <Stat
                    label="Invested at cost"
                    value={loading ? '—' : formatPaise(bal?.invested_paise ?? 0)}
                    icon={TrendingUp}
                    hint="What you paid, not what it is worth"
                />
                <Stat
                    label="Total in the system"
                    value={loading ? '—' : formatPaise(walletPaise + (bal?.invested_paise ?? 0))}
                    hint="Wallet plus holdings at cost"
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                {/* ─── add / withdraw ─── */}
                <Card>
                    <CardHead
                        icon={ArrowDownToLine}
                        title="Move money"
                        subtitle="In from your bank, or back out to it"
                        accent="var(--accent)"
                    />
                    <CardBody className="space-y-4">
                        <div>
                            <label htmlFor="amount" className="label block mb-1.5">
                                Amount
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-faint">
                                    ₹
                                </span>
                                <input
                                    id="amount"
                                    type="number"
                                    min={1}
                                    step={100}
                                    inputMode="numeric"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="field !py-3 !pl-7"
                                />
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {QUICK_TOPUP.map((v) => (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() => setAmount(String(v))}
                                    className="btn btn-secondary !py-1.5 !px-3 !text-[12px]"
                                >
                                    ₹{v.toLocaleString('en-IN')}
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 pt-1">
                            <button
                                type="button"
                                disabled={busy || !validAmount}
                                onClick={() =>
                                    void run('Top-up', (key) => topUp(paise, key, 'Wallet top-up'))
                                }
                                className="btn btn-primary !py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}
                                Add money
                            </button>
                            <button
                                type="button"
                                disabled={busy || !canSpend}
                                onClick={() =>
                                    void run('Withdrawal', (key) => withdraw(paise, key, 'Withdrawal to bank'))
                                }
                                className="btn btn-secondary !py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                title={
                                    validAmount && !canSpend
                                        ? 'More than your wallet holds'
                                        : undefined
                                }
                            >
                                <ArrowUpFromLine size={14} />
                                Withdraw
                            </button>
                        </div>

                        {validAmount && !canSpend && (
                            <p className="text-[11.5px]" style={{ color: 'var(--warn)' }}>
                                {formatPaise(paise)} is more than the {formatPaise(walletPaise)} in
                                your wallet. The server would refuse this too — the button is
                                disabled only to save you the round trip.
                            </p>
                        )}
                    </CardBody>
                </Card>

                {/* ─── invest, elsewhere on purpose ───────────────────
                       No ticker picker here. Deciding what to buy is
                       Invest's job: it proposes a diversified plan with a
                       reason for every line, and you approve it — nobody
                       is left choosing between eighteen tickers. */}
                <Card>
                    <CardHead
                        icon={Sprout}
                        title="Ready to invest it?"
                        subtitle="We build the plan; you approve it"
                        accent="var(--accent)"
                    />
                    <CardBody className="flex flex-col h-full">
                        <p className="text-[12.5px] text-lo leading-relaxed">
                            Tell Invest how much and how much risk you can live with. It spreads
                            your money across a diversified set of funds — never a single
                            company — and explains why each one is in the plan before anything
                            is bought.
                        </p>
                        <div className="flex-1" />
                        <Link
                            to="/dashboard/invest"
                            className="btn btn-primary w-full !py-2.5 mt-5"
                        >
                            <Sprout size={14} /> Build a plan <ArrowRight size={14} />
                        </Link>
                    </CardBody>
                </Card>
            </div>

            {/* ─── holdings ─── */}
            <Card>
                <CardHead
                    icon={TrendingUp}
                    title="Holdings"
                    subtitle="Bought with wallet money, at the price shown when you bought"
                />
                <CardBody>
                    {!bal?.holdings.length ? (
                        <p className="text-[12.5px] text-faint py-4 text-center">
                            Nothing yet. Add money, then{' '}
                            <Link to="/dashboard/invest" className="text-accent hover:underline font-semibold">
                                build a plan
                            </Link>.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12.5px]">
                                <thead>
                                    <tr className="text-left">
                                        <th className="label pb-2 font-normal">Instrument</th>
                                        <th className="label pb-2 font-normal text-right">Units</th>
                                        <th className="label pb-2 font-normal text-right">Cost</th>
                                        <th className="label pb-2 font-normal text-right">Now</th>
                                        <th className="label pb-2 font-normal text-right">P/L</th>
                                        <th className="label pb-2 font-normal text-right sr-only">Sell</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bal.holdings.map((h) => {
                                        // Units are a decimal STRING on the wire. Number()
                                        // here is for display only; the authoritative
                                        // quantity never round-trips through a double.
                                        const live = prices.price[h.ticker];
                                        const nowPaise = live
                                            ? Math.round(Number(h.units) * toPaise(live))
                                            : null;
                                        const pl = nowPaise === null ? null : nowPaise - h.cost_paise;
                                        const isSelling = selling === h.ticker;
                                        return (
                                            <tr key={h.ticker} className="border-t border-[var(--line-subtle)]">
                                                <td className="py-2.5 text-hi font-medium">{h.ticker}</td>
                                                <td className="py-2.5 text-right tabular-nums text-lo">
                                                    {formatUnits(h.units)}
                                                </td>
                                                <td className="py-2.5 text-right tabular-nums text-lo">
                                                    {formatPaise(h.cost_paise)}
                                                </td>
                                                <td className="py-2.5 text-right tabular-nums text-hi">
                                                    {nowPaise === null ? '—' : formatPaise(nowPaise)}
                                                </td>
                                                <td
                                                    className="py-2.5 text-right tabular-nums font-semibold"
                                                    style={{
                                                        color:
                                                            pl === null
                                                                ? 'var(--text-faint)'
                                                                : pl >= 0
                                                                  ? 'var(--gain)'
                                                                  : 'var(--loss)',
                                                    }}
                                                >
                                                    {pl === null
                                                        ? '—'
                                                        : `${pl >= 0 ? '+' : '−'}${formatPaise(Math.abs(pl))}`}
                                                </td>
                                                <td className="py-2.5 text-right pl-3">
                                                    <button
                                                        type="button"
                                                        disabled={selling !== null}
                                                        onClick={() => void sellHolding(h.ticker, h.cost_paise)}
                                                        className="btn btn-secondary !py-1.5 !px-2.5 !text-[11.5px] disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title={`Sell your entire ${h.ticker} position`}
                                                    >
                                                        {isSelling
                                                            ? <Loader2 size={12} className="animate-spin" />
                                                            : 'Sell'}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardBody>
            </Card>

            {/* ─── the ledger ─── */}
            <Card>
                <CardHead
                    icon={History}
                    title="Ledger"
                    subtitle="Every entry, append-only. Corrections are new rows, never edits."
                    action={<Badge tone="neutral">{entries.length} entries</Badge>}
                />
                <CardBody>
                    {!entries.length ? (
                        <p className="text-[12.5px] text-faint py-4 text-center">
                            No transactions yet.
                        </p>
                    ) : (
                        <div className="space-y-px">
                            {entries.map((e, i) => (
                                <div
                                    key={`${e.txn_id}-${i}`}
                                    className="flex items-center justify-between gap-3 py-2.5 border-b border-[var(--line-subtle)] last:border-0"
                                >
                                    <div className="min-w-0 flex items-center gap-2.5">
                                        <Badge
                                            tone={
                                                e.kind === 'topup'
                                                    ? 'gain'
                                                    : e.kind === 'withdraw'
                                                      ? 'warn'
                                                      : 'info'
                                            }
                                        >
                                            {e.kind}
                                        </Badge>
                                        <div className="min-w-0">
                                            <p className="text-[12.5px] text-hi truncate">
                                                {e.memo || e.account}
                                                {e.ticker ? ` · ${e.ticker}` : ''}
                                            </p>
                                            <p className="text-[11px] text-faint">
                                                {e.account} ·{' '}
                                                {new Date(e.created_at).toLocaleString('en-IN', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                    <span
                                        className="text-[12.5px] tabular-nums font-semibold shrink-0"
                                        style={{
                                            color: e.amount_paise >= 0 ? 'var(--gain)' : 'var(--loss)',
                                        }}
                                    >
                                        {e.amount_paise >= 0 ? '+' : '−'}
                                        {formatPaise(Math.abs(e.amount_paise))}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </CardBody>
            </Card>
        </div>
    );
}
