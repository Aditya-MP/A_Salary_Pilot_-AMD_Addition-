import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
    ShieldCheck, TrendingUp, Zap, ArrowRight, ArrowLeft, Check, Loader2,
    AlertTriangle, Info, CloudOff, PieChart,
} from 'lucide-react';
import { PageHeader } from '../components/primitives/PageHeader';
import { Card, CardHead, CardBody } from '../components/primitives/Card';
import { Badge } from '../components/primitives/Badge';
import { useLivePrices } from '../hooks/useLivePrices';
import { useWalletStore } from '../store/useWalletStore';
import { useAppStore } from '../store/useAppStore';
import {
    allocate, invest, newIdempotencyKey, formatPaise, toPaise,
    type AllocateResponse,
} from '../lib/wallet';
import {
    buildPlan, CLASS_LABEL, CLASS_COLOR, type Plan, type RiskLevel,
} from '../engine/planEngine';

/* ═══════════════════════════════════════════════════════════════════
   Invest — for somebody who does not know how to invest.

   THE USER THIS IS BUILT FOR
   --------------------------
   A salaried employee who wants their money to grow and has no
   intention of learning to read a balance sheet. They have money in
   the wallet. They should be able to say how much and how much risk
   they can stomach, see exactly what will be bought and why, press
   one button, and be done.

   Everything on this screen serves that: no charts to interpret, no
   tickers to choose between, no jargon left unexplained.

   THE HONESTY CONSTRAINT
   ----------------------
   The obvious way to build this is to promise it makes money. The
   model does not support that claim. M5's walk-forward evaluation
   found this allocation earns LESS than an equal-weight portfolio
   (3.0% vs 5.0% a year) while cutting volatility by 54% and worst
   drawdown by 60%.

   So the pitch on this page is the true one: this is built to stop you
   losing badly, because the way beginners actually lose money is
   watching a 35% crash, panicking, selling at the bottom, and never
   returning. That claim is defensible, it is what the numbers show,
   and it earns more trust than a promise the user will eventually
   discover was empty.

   PARTIAL EXECUTION IS THE REAL FAILURE MODE
   ------------------------------------------
   A plan is several purchases. If the fourth fails, the user owns
   three-quarters of a plan and must be told exactly that — see
   `execute`. Silently reporting success because most of it worked
   would leave a portfolio nobody designed.
   ═══════════════════════════════════════════════════════════════════ */

const RISK_OPTIONS: {
    value: RiskLevel;
    title: string;
    line: string;
    detail: string;
    icon: React.ElementType;
}[] = [
    {
        value: 'conservative',
        title: 'Steady',
        line: 'I would rather not watch it fall.',
        detail:
            'Mostly bonds and gold, with a slice of large companies. The smoothest ride, and the lowest expected growth.',
        icon: ShieldCheck,
    },
    {
        value: 'balanced',
        title: 'Balanced',
        line: 'Some ups and downs are fine.',
        detail:
            'A real mix of shares, bonds and gold, with a small capped slice of crypto. The default for most salaried investors.',
        icon: TrendingUp,
    },
    {
        value: 'aggressive',
        title: 'Growth',
        line: 'I can leave it alone for ten years.',
        detail:
            'Weighted towards shares, including mid and small companies. Expect double-digit falls along the way and do not sell into them.',
        icon: Zap,
    },
];

type Stage = 'choose' | 'review' | 'done';

interface ExecResult {
    ok: string[];
    failed: { ticker: string; error: string }[];
}

export default function Invest() {
    const bal = useWalletStore((s) => s.balance);
    const loaded = useWalletStore((s) => s.loaded);
    const offline = useWalletStore((s) => s.offline);
    const refresh = useWalletStore((s) => s.refresh);
    const storedRisk = useAppStore((s) => s.risk);
    const setRisk = useAppStore((s) => s.setRisk);

    const prices = useLivePrices();

    const [stage, setStage] = useState<Stage>('choose');
    const [risk, setLocalRisk] = useState<RiskLevel>(
        (storedRisk as RiskLevel) ?? 'balanced',
    );
    const [amount, setAmount] = useState('');
    const [alloc, setAlloc] = useState<AllocateResponse | null>(null);
    const [loadingPlan, setLoadingPlan] = useState(false);
    const [planError, setPlanError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<ExecResult | null>(null);

    /* One id per plan. Every line's idempotency key derives from it, so
       retrying a partially-failed plan re-sends the SAME keys — the lines
       that already succeeded move no money a second time. */
    const [planId, setPlanId] = useState(() => newIdempotencyKey());

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const walletPaise = bal?.wallet_paise ?? 0;
    const rupees = Number(amount);
    const validAmount = Number.isFinite(rupees) && rupees > 0;
    const paise = validAmount ? toPaise(rupees) : 0;
    const affordable = validAmount && paise <= walletPaise;

    const plan: Plan | null = useMemo(() => {
        if (!alloc || !affordable) return null;
        return buildPlan(alloc.weights, paise, risk, prices.price);
    }, [alloc, affordable, paise, risk, prices.price]);

    const proposePlan = useCallback(async () => {
        setLoadingPlan(true);
        setPlanError(null);
        const res = await allocate(risk);
        if (res.ok) {
            setAlloc(res.data);
            setRisk(risk);
            setStage('review');
        } else {
            setPlanError(res.error);
        }
        setLoadingPlan(false);
    }, [risk, setRisk]);

    const execute = useCallback(async () => {
        if (!plan || busy) return;
        setBusy(true);

        const ok: string[] = [];
        const failed: { ticker: string; error: string }[] = [];

        // Sequential, not Promise.all. Each buy debits the same wallet, and
        // firing them together means several transactions racing the same
        // balance check — the database would reject some of them correctly,
        // but the user would see arbitrary failures rather than a clean
        // "you cannot afford this".
        for (const line of plan.lines) {
            const px = prices.price[line.instrument.ticker] ?? line.instrument.open;
            const res = await invest(
                line.instrument.ticker,
                line.paise,
                toPaise(px),
                `${planId}:${line.instrument.ticker}`,
                `${risk} plan`,
            );
            if (res.ok) ok.push(line.instrument.ticker);
            else failed.push({ ticker: line.instrument.ticker, error: res.error });
        }

        await refresh();
        setResult({ ok, failed });
        setStage('done');
        setBusy(false);
    }, [plan, busy, prices.price, planId, risk, refresh]);

    const restart = () => {
        setStage('choose');
        setAlloc(null);
        setResult(null);
        setAmount('');
        setPlanId(newIdempotencyKey()); // a new plan is a new intent
    };

    /* ─── offline ─────────────────────────────────────────────────── */
    if (offline && !bal) {
        return (
            <div>
                <PageHeader eyebrow="Invest" title="Put your money to work" />
                <Card>
                    <CardBody className="text-center py-12">
                        <CloudOff size={26} className="mx-auto mb-3 text-faint" />
                        <p className="text-[14px] text-hi font-semibold">The API is not running</p>
                        <p className="text-[12.5px] text-lo mt-1.5 max-w-md mx-auto">
                            Investing needs the server. There is deliberately no offline
                            approximation here — a guessed allocation is worse than none,
                            because you could not tell the difference.
                        </p>
                    </CardBody>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Invest"
                title="Put your money to work"
                description="Tell us how much and how much risk you can live with. We choose what to buy, show you exactly why, and you approve it."
                metric={{
                    label: 'In your wallet',
                    value: loaded ? formatPaise(walletPaise) : '—',
                }}
            />

            <AnimatePresence mode="wait">
                {/* ═══════════ STAGE 1 · choose ═══════════ */}
                {stage === 'choose' && (
                    <motion.div
                        key="choose"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-6"
                    >
                        {walletPaise === 0 && loaded && (
                            <div
                                className="flex items-start gap-2.5 p-3.5 rounded-[var(--r-md)]"
                                style={{ background: 'var(--surface-2)', border: '1px solid var(--line-subtle)' }}
                            >
                                <Info size={15} className="shrink-0 mt-px" style={{ color: 'var(--accent)' }} />
                                <p className="text-[12.5px] text-lo leading-relaxed">
                                    Your wallet is empty.{' '}
                                    <Link to="/dashboard/wallet" className="text-accent hover:underline font-semibold">
                                        Add money first
                                    </Link>{' '}
                                    — it is simulated test money, nothing is charged, and it is
                                    there so you can see this whole flow actually work.
                                </p>
                            </div>
                        )}

                        <Card>
                            <CardHead title="How much do you want to invest?" accent="var(--accent)" />
                            <CardBody className="space-y-4">
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-faint">₹</span>
                                    <input
                                        type="number"
                                        min={1}
                                        step={500}
                                        inputMode="numeric"
                                        placeholder="10000"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="field !py-3.5 !pl-8 !text-[16px]"
                                    />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {[25, 50, 100].map((p) => (
                                        <button
                                            key={p}
                                            type="button"
                                            disabled={walletPaise === 0}
                                            onClick={() => setAmount(String(Math.floor((walletPaise * p) / 100 / 100)))}
                                            className="btn btn-secondary !py-1.5 !px-3 !text-[12px] disabled:opacity-40"
                                        >
                                            {p === 100 ? 'All of it' : `${p}%`}
                                        </button>
                                    ))}
                                </div>
                                {validAmount && !affordable && (
                                    <p className="text-[11.5px]" style={{ color: 'var(--warn)' }}>
                                        That is more than the {formatPaise(walletPaise)} in your wallet.
                                    </p>
                                )}
                            </CardBody>
                        </Card>

                        <Card>
                            <CardHead
                                title="How much of a fall could you sit through?"
                                subtitle="Not how much you want to earn — how much you could watch it drop without selling."
                                accent="var(--accent)"
                            />
                            <CardBody className="space-y-2.5">
                                {RISK_OPTIONS.map((o) => {
                                    const active = o.value === risk;
                                    const Icon = o.icon;
                                    return (
                                        <button
                                            key={o.value}
                                            type="button"
                                            onClick={() => setLocalRisk(o.value)}
                                            aria-pressed={active}
                                            className="w-full flex items-start gap-3 p-3.5 rounded-[var(--r-md)] text-left transition-colors"
                                            style={{
                                                background: active ? 'var(--surface-2)' : 'transparent',
                                                border: `1px solid ${active ? 'var(--accent)' : 'var(--line-subtle)'}`,
                                            }}
                                        >
                                            <Icon
                                                size={17}
                                                className="shrink-0 mt-0.5"
                                                style={{ color: active ? 'var(--accent)' : 'var(--text-faint)' }}
                                            />
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-[13.5px] font-semibold text-hi">{o.title}</p>
                                                    <span className="text-[12px] text-lo">— {o.line}</span>
                                                </div>
                                                <p className="text-[12px] text-faint mt-1 leading-relaxed">{o.detail}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </CardBody>
                        </Card>

                        {planError && (
                            <div
                                className="flex items-start gap-2.5 p-3 rounded-[var(--r-md)]"
                                style={{ background: 'rgba(255,86,86,0.08)', border: '1px solid rgba(255,86,86,0.22)' }}
                            >
                                <AlertTriangle size={15} className="shrink-0 mt-px" style={{ color: 'var(--neg)' }} />
                                <p className="text-[12.5px]" style={{ color: 'var(--neg)' }}>{planError}</p>
                            </div>
                        )}

                        <button
                            type="button"
                            disabled={!affordable || loadingPlan}
                            onClick={() => void proposePlan()}
                            className="btn btn-primary w-full !py-3 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {loadingPlan ? (
                                <><Loader2 size={15} className="animate-spin" /> Building your plan</>
                            ) : (
                                <>Show me the plan <ArrowRight size={15} /></>
                            )}
                        </button>
                    </motion.div>
                )}

                {/* ═══════════ STAGE 2 · review ═══════════ */}
                {stage === 'review' && plan && alloc && (
                    <motion.div
                        key="review"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-6"
                    >
                        {/* Only appears when today's real market data has
                            actually inverted the usual risk ordering — not
                            shown speculatively, only when it's true right now. */}
                        {alloc.ordering_note && (
                            <div
                                className="flex items-start gap-2.5 p-3.5 rounded-[var(--r-md)]"
                                style={{ background: 'rgba(255,184,0,0.07)', border: '1px solid rgba(255,184,0,0.2)' }}
                            >
                                <AlertTriangle size={15} className="shrink-0 mt-px" style={{ color: 'var(--warn)' }} />
                                <p className="text-[12px] text-lo leading-relaxed">{alloc.ordering_note}</p>
                            </div>
                        )}

                        {/* the honest headline */}
                        <div
                            className="p-4 rounded-[var(--r-md)]"
                            style={{ background: 'var(--surface-2)', border: '1px solid var(--line-subtle)' }}
                        >
                            <p className="text-[13.5px] text-hi font-semibold">
                                What this plan is designed to do
                            </p>
                            <p className="text-[12.5px] text-lo mt-1.5 leading-relaxed">
                                Keep you invested through a bad year. Evaluated on{' '}
                                {alloc.evidence.n_quarters} real market quarters (
                                {alloc.evidence.evaluation_window.start} to{' '}
                                {alloc.evidence.evaluation_window.end}), it cut volatility by{' '}
                                <span className="text-hi font-semibold">
                                    {alloc.evidence.volatility_reduction_pct.toFixed(0)}%
                                </span>{' '}
                                and the worst drawdown by{' '}
                                <span className="text-hi font-semibold">
                                    {alloc.evidence.drawdown_reduction_pct.toFixed(0)}%
                                </span>{' '}
                                compared with spreading money evenly across the same real assets.
                            </p>
                            <p className="text-[12px] text-faint mt-2.5 leading-relaxed">
                                {alloc.evidence.beats_benchmark_return ? (
                                    <>
                                        It also earned <span className="text-lo">more</span> in this
                                        window —{' '}
                                        {(alloc.evidence.annual_return * 100).toFixed(1)}% a year
                                        against {(alloc.evidence.benchmark_annual_return * 100).toFixed(1)}%
                                        {' '}for the even split. That is a real result on a short real
                                        history, not a promise it repeats — no allocation can guarantee
                                        a profit, and this one does not.
                                    </>
                                ) : (
                                    <>
                                        It also earned <span className="text-lo">less</span> —{' '}
                                        {(alloc.evidence.annual_return * 100).toFixed(1)}% a year against{' '}
                                        {(alloc.evidence.benchmark_annual_return * 100).toFixed(1)}% for
                                        the even split. We are telling you that because it is true.
                                        Smoother is the right trade when the alternative is
                                        panic-selling a crash, but no allocation can promise you a
                                        profit and this one does not.
                                    </>
                                )}
                            </p>
                        </div>

                        <Card>
                            <CardHead
                                icon={PieChart}
                                title={`Your ${risk} plan · ${formatPaise(plan.totalPaise)}`}
                                subtitle={`${plan.lines.length} funds. Expected swing about ${(alloc.expected_annual_volatility * 100).toFixed(0)}% a year.`}
                                action={<Badge tone="neutral">{alloc.model_version}</Badge>}
                            />
                            <CardBody className="space-y-5">
                                {/* class bar */}
                                <div>
                                    <div className="flex h-2.5 rounded-full overflow-hidden">
                                        {plan.byClass.map((c) => (
                                            <div
                                                key={c.assetClass}
                                                style={{
                                                    width: `${c.weight * 100}%`,
                                                    background: CLASS_COLOR[c.assetClass],
                                                }}
                                                title={`${CLASS_LABEL[c.assetClass]} ${(c.weight * 100).toFixed(0)}%`}
                                            />
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
                                        {plan.byClass.map((c) => (
                                            <div key={c.assetClass} className="flex items-center gap-1.5">
                                                <span
                                                    className="w-2 h-2 rounded-full"
                                                    style={{ background: CLASS_COLOR[c.assetClass] }}
                                                />
                                                <span className="text-[11.5px] text-lo">
                                                    {CLASS_LABEL[c.assetClass]}{' '}
                                                    <span className="text-hi tabular-nums">
                                                        {(c.weight * 100).toFixed(0)}%
                                                    </span>
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* the lines, each with its reason */}
                                <div className="space-y-px">
                                    {plan.lines.map((l) => (
                                        <div
                                            key={l.instrument.ticker}
                                            className="py-3 border-b border-[var(--line-subtle)] last:border-0"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <p className="text-[13px] font-semibold text-hi">
                                                            {l.instrument.label}
                                                        </p>
                                                        {l.instrument.holdings && (
                                                            <Badge tone="neutral">
                                                                {l.instrument.holdings} companies
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-[11.5px] text-faint mt-1 leading-relaxed">
                                                        {l.instrument.rationale}
                                                    </p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-[13px] font-semibold text-hi tabular-nums">
                                                        {formatPaise(l.paise)}
                                                    </p>
                                                    <p className="text-[11px] text-faint tabular-nums">
                                                        {(l.weight * 100).toFixed(1)}% · {l.units.toFixed(3)} units
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <p className="text-[11px] text-faint leading-relaxed">
                                    Every holding above is a fund holding dozens or hundreds of
                                    companies, not a bet on one. That is deliberate: a single
                                    company can go to zero, and a broad index structurally cannot.
                                    We do not pick individual shares for you, because doing that
                                    honestly needs company financials this app does not have.
                                </p>
                            </CardBody>
                        </Card>

                        <div className="flex flex-col sm:flex-row gap-2.5">
                            <button
                                type="button"
                                onClick={() => setStage('choose')}
                                disabled={busy}
                                className="btn btn-secondary !py-3 disabled:opacity-40"
                            >
                                <ArrowLeft size={15} /> Change something
                            </button>
                            <button
                                type="button"
                                onClick={() => void execute()}
                                disabled={busy}
                                className="btn btn-primary flex-1 !py-3 disabled:opacity-60"
                            >
                                {busy ? (
                                    <><Loader2 size={15} className="animate-spin" /> Buying…</>
                                ) : (
                                    <><Check size={15} /> Approve &amp; invest {formatPaise(plan.totalPaise)}</>
                                )}
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* ═══════════ STAGE 3 · done ═══════════ */}
                {stage === 'done' && result && (
                    <motion.div
                        key="done"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-5"
                    >
                        <Card>
                            <CardBody className="text-center py-10">
                                {result.failed.length === 0 ? (
                                    <>
                                        <div
                                            className="w-12 h-12 rounded-full grid place-items-center mx-auto mb-4"
                                            style={{ background: 'var(--gain-dim)' }}
                                        >
                                            <Check size={22} style={{ color: 'var(--gain)' }} />
                                        </div>
                                        <p className="text-[16px] font-semibold text-hi">
                                            Done — you own {result.ok.length} funds.
                                        </p>
                                        <p className="text-[12.5px] text-lo mt-2 max-w-md mx-auto leading-relaxed">
                                            Your money is spread across hundreds of companies, bonds and
                                            gold. It will move up and down; that is what investing looks
                                            like. The single most valuable thing you can now do is
                                            nothing.
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <div
                                            className="w-12 h-12 rounded-full grid place-items-center mx-auto mb-4"
                                            style={{ background: 'rgba(255,184,0,0.12)' }}
                                        >
                                            <AlertTriangle size={22} style={{ color: 'var(--warn)' }} />
                                        </div>
                                        <p className="text-[16px] font-semibold text-hi">
                                            Only part of the plan went through
                                        </p>
                                        <p className="text-[12.5px] text-lo mt-2 max-w-md mx-auto leading-relaxed">
                                            {result.ok.length} of {result.ok.length + result.failed.length}{' '}
                                            purchases completed. The rest did not, and the money for them
                                            is still in your wallet — nothing was lost, but what you own
                                            right now is not the mix you approved.
                                        </p>
                                        <div className="mt-4 text-left max-w-sm mx-auto space-y-1.5">
                                            {result.failed.map((f) => (
                                                <div key={f.ticker} className="flex items-start justify-between gap-3 text-[11.5px]">
                                                    <span className="text-hi">{f.ticker}</span>
                                                    <span className="text-right" style={{ color: 'var(--neg)' }}>{f.error}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}

                                <div className="flex flex-wrap gap-2.5 justify-center mt-7">
                                    <Link to="/dashboard/portfolio" className="btn btn-primary !py-2.5">
                                        See my portfolio <ArrowRight size={14} />
                                    </Link>
                                    <button type="button" onClick={restart} className="btn btn-secondary !py-2.5">
                                        Invest more
                                    </button>
                                </div>
                            </CardBody>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
