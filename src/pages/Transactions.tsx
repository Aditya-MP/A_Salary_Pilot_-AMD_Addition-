import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Wand2, Check, X, AlertTriangle, Zap, CloudOff, RotateCcw, Plus,
} from 'lucide-react';
import { PageHeader } from '../components/primitives/PageHeader';
import { Card, CardHead, CardBody } from '../components/primitives/Card';
import { Badge } from '../components/primitives/Badge';
import { Stat } from '../components/primitives/Stat';
import { Segmented } from '../components/primitives/Segmented';
import { categorise, type Prediction, type TxnInput } from '../lib/api';
import { money, share } from '../lib/format';

/* ═══════════════════════════════════════════════════════════════════
   Transactions — the model, visible.

   M1 has been sitting behind an API doing nothing the user could see.
   This is the surface for it: paste a bank narration, watch it get
   classified, and correct it when it is wrong.

   The correction is not decoration. It writes to the same field the
   schema reserves for it (transactions.user_category), which is the
   only source of real labels this system will ever get — the training
   corpus is synthetic, so every correction is worth more than a
   thousand generated rows.

   Three things this page refuses to hide:

     * the confidence, including when it is low
     * the model's own cold-start weakness, reported by the API on
       every response rather than buried in documentation
     * the moment the backend is not there
   ═══════════════════════════════════════════════════════════════════ */

const CHANNELS = ['upi', 'card', 'neft', 'ach', 'netbanking', 'atm'] as const;

/* Real narration shapes from Indian banks, one per channel grammar.
   Provided as one-click samples because the demo should not depend on
   somebody typing a UPI reference string correctly. */
const SAMPLES: { label: string; txn: TxnInput }[] = [
    {
        label: 'Swiggy · UPI',
        txn: { narration: 'BY TRANSFER-UPI/DR/8619233138/SWIGGY//SBIN0007890', amount: 487, channel: 'upi', direction: 'debit' },
    },
    {
        label: 'Petrol · card',
        txn: { narration: 'VISA-INDIAN OIL*0402 HYDERABAD IN', amount: 2400, channel: 'card', direction: 'debit' },
    },
    {
        label: 'Salary · NEFT',
        txn: { narration: 'NEFT-SBIN45065882-ACME TECHNOLOGIES SALARY-SBIN0007890', amount: 124000, channel: 'neft', direction: 'credit' },
    },
    {
        label: 'Netflix · NACH',
        txn: { narration: 'ACH-D-NETFLIX-4455102938', amount: 649, channel: 'ach', direction: 'debit' },
    },
    {
        label: 'Rent · NEFT',
        txn: { narration: 'NEFT-CITIN27049372-NOBROKER RENT-ICIC0000456', amount: 32000, channel: 'neft', direction: 'debit' },
    },
    {
        label: 'Blinkit · UPI',
        txn: { narration: 'UPI/DR/982965724/BLINKIT/SBIN0007890/blinkit@apl', amount: 612, channel: 'upi', direction: 'debit' },
    },
    {
        label: 'Metro · UPI',
        txn: { narration: 'UPI-NMM MTR-nmm-mtr@paytm-SBIN0007890-465648044576', amount: 60, channel: 'upi', direction: 'debit' },
    },
    {
        label: 'ATM withdrawal',
        txn: { narration: 'ATM-WDL-4521-KORAMANGALA-067104', amount: 3000, channel: 'atm', direction: 'debit' },
    },
];

const CATEGORIES = [
    'housing', 'food', 'transport', 'utilities', 'health', 'family',
    'lifestyle', 'subscriptions', 'debt', 'investment', 'income', 'transfer',
];

interface Row {
    id: string;
    txn: TxnInput;
    pred?: Prediction;
    corrected?: string;
}

export default function Transactions() {
    const [rows, setRows] = useState<Row[]>([]);
    const [narration, setNarration] = useState('');
    const [amount, setAmount] = useState(487);
    const [channel, setChannel] = useState<string>('upi');
    const [direction, setDirection] = useState<'debit' | 'credit'>('debit');

    const [busy, setBusy] = useState(false);
    const [offline, setOffline] = useState(false);
    const [meta, setMeta] = useState<{ version?: string; latency?: number; caveat?: string }>({});
    const inputRef = useRef<HTMLInputElement>(null);

    const classify = async (txns: TxnInput[]) => {
        setBusy(true);
        const res = await categorise(txns);
        setBusy(false);

        if (!res.ok || res.data.degraded) {
            setOffline(true);
            // Still add the rows. The user can categorise by hand, which is
            // exactly what the degraded response tells them to do.
            setRows((r) => [
                ...txns.map((t, i) => ({ id: `${Date.now()}-${i}`, txn: t })),
                ...r,
            ]);
            return;
        }

        setOffline(false);
        setMeta({
            version: res.data.model_version,
            latency: res.data.latency_ms,
            caveat: res.data.caveat,
        });
        setRows((r) => [
            ...txns.map((t, i) => ({
                id: `${Date.now()}-${i}`,
                txn: t,
                pred: res.data.results[i],
            })),
            ...r,
        ]);
    };

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!narration.trim()) return;
        classify([{ narration: narration.trim(), amount, channel, direction }]);
        setNarration('');
        inputRef.current?.focus();
    };

    // Classify one sample on mount so the page is never empty and the
    // backend connection is proven immediately rather than on first click.
    useEffect(() => {
        classify([SAMPLES[0].txn, SAMPLES[2].txn, SAMPLES[3].txn]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stats = useMemo(() => {
        const scored = rows.filter((r) => r.pred);
        const lowConf = scored.filter((r) => (r.pred?.confidence ?? 1) < 0.7).length;
        const corrected = rows.filter((r) => r.corrected).length;
        const avg = scored.length
            ? scored.reduce((s, r) => s + (r.pred?.confidence ?? 0), 0) / scored.length
            : 0;
        return { total: rows.length, avg, lowConf, corrected };
    }, [rows]);

    return (
        <>
            <PageHeader
                eyebrow={offline ? 'Model offline' : 'M1 · live'}
                title="Transactions"
                description="Paste a bank narration and watch it get categorised. Correct it when it is wrong — that correction is worth more than a thousand synthetic rows."
                metric={
                    meta.latency !== undefined
                        ? { label: 'Round trip', value: `${meta.latency.toFixed(1)}ms`, delta: meta.version?.slice(0, 8), up: true }
                        : undefined
                }
            />

            {offline && (
                <Card className="mb-4">
                    <CardBody className="flex items-start gap-3">
                        <CloudOff size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--warn)' }} />
                        <div>
                            <p className="text-[13.5px] font-semibold text-hi">
                                The model service is not running
                            </p>
                            <p className="text-[12px] text-lo mt-1 leading-relaxed">
                                Transactions still record and you can set categories by hand — the
                                rest of the app is unaffected. To start it:{' '}
                                <code className="num text-[11px] px-1.5 py-0.5 rounded"
                                    style={{ background: 'var(--surface-3)' }}>
                                    cd backend/ml &amp;&amp; python -m uvicorn service.app:app --port 8000
                                </code>
                            </p>
                        </div>
                    </CardBody>
                </Card>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <Stat label="Classified" value={`${stats.total}`} hint="this session" icon={Wand2} tone="accent" />
                <Stat
                    label="Mean confidence"
                    value={share(stats.avg * 100)}
                    hint="calibrated"
                    tone={stats.avg > 0.8 ? 'gain' : 'warn'}
                    icon={Zap}
                />
                <Stat
                    label="Needs review"
                    value={`${stats.lowConf}`}
                    hint="below 70%"
                    tone={stats.lowConf ? 'warn' : 'gain'}
                    icon={AlertTriangle}
                />
                <Stat label="You corrected" value={`${stats.corrected}`} hint="real labels" tone="info" icon={Check} />
            </div>

            <div className="grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-4 items-start">
                {/* ─── Input ─── */}
                <div className="space-y-4">
                    <Card>
                        <CardHead icon={Wand2} title="Classify a transaction" accent="var(--accent)" />
                        <CardBody>
                            <form onSubmit={submit} className="space-y-3">
                                <div>
                                    <label htmlFor="narr" className="label block mb-1.5">Bank narration</label>
                                    <input
                                        id="narr"
                                        ref={inputRef}
                                        value={narration}
                                        onChange={(e) => setNarration(e.target.value)}
                                        placeholder="UPI/DR/445021/SWIGGY/HDFC0001234"
                                        className="field num !text-[12px]"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label htmlFor="amt" className="label block mb-1.5">Amount</label>
                                        <input
                                            id="amt"
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                                            className="field num !text-[13px]"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="chan" className="label block mb-1.5">Channel</label>
                                        <select
                                            id="chan"
                                            value={channel}
                                            onChange={(e) => setChannel(e.target.value)}
                                            className="field !text-[13px]"
                                        >
                                            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <Segmented<'debit' | 'credit'>
                                    value={direction}
                                    onChange={setDirection}
                                    size="sm"
                                    options={[
                                        { value: 'debit', label: 'Debit' },
                                        { value: 'credit', label: 'Credit' },
                                    ]}
                                    className="w-full"
                                />

                                <button
                                    type="submit"
                                    disabled={busy || !narration.trim()}
                                    className="btn btn-primary w-full"
                                >
                                    {busy ? 'Classifying…' : <>Classify <Plus size={14} /></>}
                                </button>
                            </form>
                        </CardBody>
                    </Card>

                    <Card>
                        <CardHead title="Or try a real one" subtitle="Actual Indian bank narration formats" />
                        <CardBody className="flex flex-wrap gap-2">
                            {SAMPLES.map((s) => (
                                <button
                                    key={s.label}
                                    onClick={() => classify([s.txn])}
                                    disabled={busy}
                                    className="btn btn-secondary !py-1.5 !px-3 !text-[11.5px]"
                                >
                                    {s.label}
                                </button>
                            ))}
                            <button
                                onClick={() => classify(SAMPLES.map((s) => s.txn))}
                                disabled={busy}
                                className="btn btn-secondary !py-1.5 !px-3 !text-[11.5px]"
                                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                            >
                                Classify all {SAMPLES.length}
                            </button>
                        </CardBody>
                    </Card>

                    {meta.caveat && (
                        <Card>
                            <CardBody className="flex items-start gap-2.5">
                                <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--warn)' }} />
                                <div>
                                    <p className="label mb-1">The model reports its own weakness</p>
                                    <p className="text-[11.5px] text-lo leading-relaxed">{meta.caveat}</p>
                                    <p className="text-[11px] text-faint leading-relaxed mt-2">
                                        Every new user arrives as an unseen-merchant problem, so the
                                        second number is the one that predicts a first import. The API
                                        returns it on every response rather than hiding it in a README.
                                    </p>
                                </div>
                            </CardBody>
                        </Card>
                    )}
                </div>

                {/* ─── Results ─── */}
                <Card>
                    <CardHead
                        title="Results"
                        subtitle={rows.length ? `${rows.length} classified` : 'nothing yet'}
                        action={
                            rows.length > 0 ? (
                                <button
                                    onClick={() => setRows([])}
                                    className="btn btn-ghost !py-1 !px-2 !text-[11.5px]"
                                >
                                    <RotateCcw size={12} /> Clear
                                </button>
                            ) : undefined
                        }
                    />
                    <CardBody className="!p-0">
                        {rows.length === 0 && (
                            <p className="text-[12.5px] text-faint p-5">
                                Classify something to see it here.
                            </p>
                        )}

                        {rows.map((row, i) => {
                            const p = row.pred;
                            const shown = row.corrected ?? p?.category;
                            const conf = p?.confidence ?? 0;
                            const low = conf < 0.7;

                            return (
                                <div
                                    key={row.id}
                                    className="p-4 min-w-0"
                                    style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line-subtle)' }}
                                >
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="min-w-0 flex-1">
                                            <p className="num text-[11.5px] text-lo break-all leading-relaxed">
                                                {row.txn.narration}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                <Badge tone="muted">{row.txn.channel}</Badge>
                                                <Badge tone={row.txn.direction === 'credit' ? 'gain' : 'muted'}>
                                                    {row.txn.direction}
                                                </Badge>
                                                <span className="num text-[11.5px] text-hi font-semibold">
                                                    {money(row.txn.amount)}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="text-right shrink-0">
                                            {shown ? (
                                                <>
                                                    <p
                                                        className="text-[14px] font-semibold"
                                                        style={{
                                                            color: row.corrected
                                                                ? 'var(--info)'
                                                                : low ? 'var(--warn)' : 'var(--accent)',
                                                        }}
                                                    >
                                                        {shown}
                                                    </p>
                                                    {row.corrected ? (
                                                        <p className="text-[10.5px] text-faint">you corrected it</p>
                                                    ) : (
                                                        <p className="num text-[10.5px] text-faint">
                                                            {share(conf * 100, 1)} confident
                                                        </p>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="text-[12px] text-faint">not classified</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Alternatives — shown when the model is unsure, because
                                        a second guess is genuinely useful there and noise
                                        when the model is confident. */}
                                    {p && low && p.alternatives.length > 0 && (
                                        <div
                                            className="mt-2.5 p-2.5 rounded-[var(--r-sm)] flex items-center gap-2 flex-wrap"
                                            style={{ background: 'var(--warn-dim)' }}
                                        >
                                            <span className="text-[11px] text-lo">Unsure — also considered:</span>
                                            {p.alternatives.map((a) => (
                                                <button
                                                    key={a.category}
                                                    onClick={() =>
                                                        setRows((rs) =>
                                                            rs.map((x) =>
                                                                x.id === row.id ? { ...x, corrected: a.category } : x
                                                            )
                                                        )
                                                    }
                                                    className="btn btn-secondary !py-0.5 !px-2 !text-[10.5px]"
                                                >
                                                    {a.category} {share(a.probability * 100)}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Correction. This is the feedback loop, and the only
                                        source of real labels the system will ever have. */}
                                    <details className="mt-2.5 group">
                                        <summary className="text-[11px] text-faint cursor-pointer hover:text-hi list-none inline-flex items-center gap-1.5">
                                            <X size={11} /> Wrong? Set the right category
                                        </summary>
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {CATEGORIES.map((c) => (
                                                <button
                                                    key={c}
                                                    onClick={() =>
                                                        setRows((rs) =>
                                                            rs.map((x) =>
                                                                x.id === row.id ? { ...x, corrected: c } : x
                                                            )
                                                        )
                                                    }
                                                    className="btn !py-0.5 !px-2 !text-[10.5px]"
                                                    style={
                                                        shown === c
                                                            ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
                                                            : { background: 'var(--surface-3)', color: 'var(--text-lo)' }
                                                    }
                                                >
                                                    {c}
                                                </button>
                                            ))}
                                        </div>
                                    </details>
                                </div>
                            );
                        })}
                    </CardBody>
                </Card>
            </div>
        </>
    );
}
