import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    ArrowRight, ArrowLeft, Check, Plus, Trash2, Info, Sparkles,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import { emptyProfile } from '../domain/empty';
import { computeRunway } from '../engine/runwayEngine';
import type { FinancialProfile, Expense, Debt, ExpenseKind, DebtKind } from '../domain/types';
import { money, months as fmtMonths } from '../lib/format';

/* ═══════════════════════════════════════════════════════════════════
   Onboarding — the app asks before it answers.

   THE PROBLEM THIS SOLVES
   -----------------------
   A new account used to land on a dashboard already full of numbers:
   a salary, three loans, thirteen holdings, a 5.9-month runway. None
   of it was the user's. The app was stating invented facts about
   somebody's money on their first screen, which poisons every real
   number that comes after it.

   Now nothing is assumed. This collects the smallest set of inputs
   that lets the app say something true, and not one field more.

   WHY THESE FIELDS AND NO OTHERS
   ------------------------------
   Runway — the number the whole product is built around — is
   liquid savings ÷ essential monthly burn. That is the entire
   requirement: what comes in, what must go out, and what is already
   saved. Everything else (tax slots, goals, portfolio) either derives
   from those or can be added later from the relevant screen.

   So: no CTC breakdown, no PAN, no bank linking, no risk
   questionnaire. Each of those is a question the app cannot yet
   justify asking, and every extra field is somebody abandoning setup.

   THE RUNNING PREVIEW
   -------------------
   The right-hand panel computes the real runway from whatever has
   been entered so far. It is not decoration: it shows the user what
   each answer is *for*, which is the difference between filling in a
   form and understanding your own position.
   ═══════════════════════════════════════════════════════════════════ */

/* ─── the essential monthly costs worth naming individually ───────
   Prompted rather than free-form, because "monthly expenses: ₹45,000"
   is a number people guess at, while six specific questions get a
   materially more honest total. The `essential` flag on each is what
   the runway calculation actually keys on — these are the things you
   would still pay with no income. */
const ESSENTIALS: { id: string; label: string; kind: ExpenseKind; hint: string }[] = [
    { id: 'rent', label: 'Rent or home loan EMI', kind: 'housing', hint: 'The roof. Usually the largest single line.' },
    { id: 'food', label: 'Groceries & cooking gas', kind: 'food', hint: 'Food you cook, not food you order.' },
    { id: 'utilities', label: 'Electricity, water, internet', kind: 'utilities', hint: 'Phone and broadband included.' },
    { id: 'transport', label: 'Commute & fuel', kind: 'transport', hint: 'Getting to work.' },
    { id: 'family', label: 'Family support', kind: 'family', hint: 'Money sent to parents or dependents.' },
    { id: 'health', label: 'Medicines & checkups', kind: 'health', hint: 'Recurring health costs only.' },
];

const DEBT_KINDS: { value: DebtKind; label: string; typical: string }[] = [
    { value: 'card', label: 'Credit card', typical: '36–48%' },
    { value: 'personal', label: 'Personal loan', typical: '11–18%' },
    { value: 'auto', label: 'Car / two-wheeler', typical: '9–12%' },
    { value: 'education', label: 'Education loan', typical: '8–11%' },
    { value: 'home', label: 'Home loan', typical: '8–9.5%' },
];

type DraftDebt = { id: string; kind: DebtKind; label: string; balance: string; rate: string; emi: string };

const STEPS = ['You', 'Income', 'Monthly costs', 'Savings & debt'] as const;

/* ─── small controlled inputs ─────────────────────────────────────── */

function Money({
    id, label, value, onChange, hint, autoFocus,
}: {
    id: string; label: string; value: string;
    onChange: (v: string) => void; hint?: string; autoFocus?: boolean;
}) {
    return (
        <div>
            <label htmlFor={id} className="label block mb-1.5">{label}</label>
            <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-faint">₹</span>
                <input
                    id={id}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder="0"
                    value={value}
                    autoFocus={autoFocus}
                    onChange={(e) => onChange(e.target.value)}
                    className="field !py-3 !pl-7"
                />
            </div>
            {hint && <p className="text-[11px] text-faint mt-1.5">{hint}</p>}
        </div>
    );
}

function Num({
    id, label, value, onChange, hint, min = 0, max,
}: {
    id: string; label: string; value: string;
    onChange: (v: string) => void; hint?: string; min?: number; max?: number;
}) {
    return (
        <div>
            <label htmlFor={id} className="label block mb-1.5">{label}</label>
            <input
                id={id}
                type="number"
                min={min}
                max={max}
                inputMode="numeric"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="field !py-3"
            />
            {hint && <p className="text-[11px] text-faint mt-1.5">{hint}</p>}
        </div>
    );
}

const n = (s: string) => {
    const v = Number(s);
    return Number.isFinite(v) && v > 0 ? v : 0;
};

/* ═══════════════════════════ Page ═══════════════════════════ */

export default function Onboarding() {
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);
    const completeOnboarding = useAppStore((s) => s.completeOnboarding);

    const [step, setStep] = useState(0);

    // Step 1
    const [age, setAge] = useState('');
    const [dependents, setDependents] = useState('0');
    const [metro, setMetro] = useState(true);

    // Step 2
    const [inHand, setInHand] = useState('');
    const [payDay, setPayDay] = useState('1');
    const [epf, setEpf] = useState('');

    // Step 3
    const [essentials, setEssentials] = useState<Record<string, string>>({});
    const [lifestyle, setLifestyle] = useState('');
    const [subscriptions, setSubscriptions] = useState('');

    // Step 4
    const [cash, setCash] = useState('');
    const [debts, setDebts] = useState<DraftDebt[]>([]);

    /* ─── the draft profile, rebuilt on every keystroke ───────────── */
    const draft: FinancialProfile = useMemo(() => {
        const expenses: Expense[] = ESSENTIALS.filter((e) => n(essentials[e.id]) > 0).map((e) => ({
            id: e.id,
            label: e.label,
            kind: e.kind,
            monthly: n(essentials[e.id]),
            essential: true,
        }));

        if (n(lifestyle) > 0) {
            expenses.push({
                id: 'lifestyle',
                label: 'Eating out, shopping, weekends',
                kind: 'lifestyle',
                monthly: n(lifestyle),
                essential: false,
            });
        }

        const realDebts: Debt[] = debts
            .filter((d) => n(d.balance) > 0)
            .map((d) => ({
                id: d.id,
                label: d.label || DEBT_KINDS.find((k) => k.value === d.kind)!.label,
                kind: d.kind,
                balance: n(d.balance),
                // Entered as a percentage, stored as a fraction.
                rate: n(d.rate) / 100,
                emi: n(d.emi),
                taxDeductible: d.kind === 'home' || d.kind === 'education',
            }));

        return {
            ...emptyProfile,
            name: user?.name || '',
            age: n(age),
            dependents: n(dependents),
            income: {
                ...emptyProfile.income,
                inHand: n(inHand),
                epfEmployee: n(epf),
                epfEmployer: n(epf), // employer matches the employee share by statute
                payDay: n(payDay) || 1,
                metro,
                rentPaid: n(essentials.rent),
            },
            expenses,
            subscriptions:
                n(subscriptions) > 0
                    ? [{ id: 'subs', label: 'Subscriptions', monthly: n(subscriptions), monthsUnused: 0 }]
                    : [],
            debts: realDebts,
            cash: n(cash),
        };
    }, [user, age, dependents, metro, inHand, payDay, epf, essentials, lifestyle, subscriptions, cash, debts]);

    const runway = useMemo(() => computeRunway(draft), [draft]);
    const essentialTotal = runway.essentialBurn;
    const surplus = draft.income.inHand - essentialTotal - runway.discretionaryBurn;

    /* A step is passable only once it has what the maths needs. Nothing
       here is busywork: each gate corresponds to a term in the runway
       formula that would otherwise be silently zero. */
    const canAdvance = [
        n(age) > 0,
        n(inHand) > 0,
        essentialTotal > 0,
        true, // savings and debt are genuinely optional
    ][step];

    const finish = () => {
        completeOnboarding(draft);
        navigate('/dashboard', { replace: true });
    };

    const addDebt = () =>
        setDebts((d) => [
            ...d,
            { id: `d${Date.now()}`, kind: 'card', label: '', balance: '', rate: '42', emi: '' },
        ]);

    const patchDebt = (id: string, patch: Partial<DraftDebt>) =>
        setDebts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));

    return (
        <div className="min-h-screen" style={{ background: 'var(--bg-void)' }}>
            <div className="max-w-5xl mx-auto px-6 py-10 sm:py-14">
                {/* ─── header ─── */}
                <div className="flex items-center gap-2.5 mb-8">
                    <div className="w-8 h-8 rounded-[10px] grid place-items-center" style={{ background: 'var(--accent)' }}>
                        <span className="font-display font-extrabold text-[15px]" style={{ color: 'var(--accent-ink)' }}>S</span>
                    </div>
                    <span className="font-display font-bold text-[15px] text-hi">SalaryPilot</span>
                </div>

                <h1 className="text-[26px] sm:text-[30px] font-bold text-hi tracking-tight">
                    {user?.name ? `Let's start with your numbers, ${user.name.split(' ')[0]}.` : "Let's start with your numbers."}
                </h1>
                <p className="text-[13.5px] text-lo mt-2 max-w-2xl leading-relaxed">
                    This app refuses to show you a figure it made up, so it has nothing to show
                    until you tell it something. Four short steps — about a minute — and every
                    number after this is genuinely yours.
                </p>

                {/* ─── progress ─── */}
                <div className="flex items-center gap-2 mt-8 mb-8">
                    {STEPS.map((label, i) => (
                        <div key={label} className="flex items-center gap-2 flex-1">
                            <div className="flex items-center gap-2 min-w-0">
                                <div
                                    className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold shrink-0 transition-colors"
                                    style={{
                                        background: i < step ? 'var(--accent)' : i === step ? 'var(--surface-2)' : 'transparent',
                                        border: `1px solid ${i <= step ? 'var(--accent)' : 'var(--line-subtle)'}`,
                                        color: i < step ? 'var(--accent-ink)' : i === step ? 'var(--accent)' : 'var(--text-faint)',
                                    }}
                                >
                                    {i < step ? <Check size={12} /> : i + 1}
                                </div>
                                <span
                                    className="text-[12px] hidden sm:block truncate"
                                    style={{ color: i <= step ? 'var(--text-hi)' : 'var(--text-faint)' }}
                                >
                                    {label}
                                </span>
                            </div>
                            {i < STEPS.length - 1 && (
                                <div className="h-px flex-1" style={{ background: i < step ? 'var(--accent)' : 'var(--line-subtle)' }} />
                            )}
                        </div>
                    ))}
                </div>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start">
                    {/* ─── the form ─── */}
                    <div className="surface p-5 sm:p-6">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={step}
                                initial={{ opacity: 0, x: 12 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -12 }}
                                transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                                className="space-y-5"
                            >
                                {step === 0 && (
                                    <>
                                        <div>
                                            <h2 className="text-[16px] font-semibold text-hi">About you</h2>
                                            <p className="text-[12.5px] text-lo mt-1">
                                                Age sets the retirement horizon. Dependents raise the emergency
                                                fund target — supporting parents genuinely needs a deeper buffer
                                                than the generic "three to six months" advice assumes.
                                            </p>
                                        </div>
                                        <div className="grid sm:grid-cols-2 gap-4">
                                            <Num id="age" label="Your age" value={age} onChange={setAge} min={16} max={100} />
                                            <Num id="dep" label="People who depend on you" value={dependents} onChange={setDependents} max={12} hint="Not counting yourself." />
                                        </div>
                                        <div>
                                            <span className="label block mb-2">
                                                Is your city one of the four HRA metro cities?
                                            </span>
                                            <div className="flex gap-2">
                                                {[
                                                    { v: true, l: 'Yes — Mumbai, Delhi, Kolkata or Chennai' },
                                                    { v: false, l: 'No — anywhere else' },
                                                ].map((o) => (
                                                    <button
                                                        key={String(o.v)}
                                                        type="button"
                                                        onClick={() => setMetro(o.v)}
                                                        aria-pressed={metro === o.v}
                                                        className="flex-1 px-3 py-2.5 rounded-[var(--r-md)] text-[12.5px] text-left transition-colors"
                                                        style={{
                                                            background: metro === o.v ? 'var(--surface-2)' : 'transparent',
                                                            border: `1px solid ${metro === o.v ? 'var(--accent)' : 'var(--line-subtle)'}`,
                                                            color: metro === o.v ? 'var(--text-hi)' : 'var(--text-lo)',
                                                            boxShadow: metro === o.v ? '0 0 0 1px var(--accent)' : 'none',
                                                        }}
                                                    >
                                                        {o.l}
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-[11px] text-faint mt-1.5 leading-relaxed">
                                                This isn't about how big your city is — it's a narrow, specific
                                                rule from Income Tax Rule 2A. Only those four cities get a 50%
                                                HRA exemption; every other city, including Bengaluru, Hyderabad,
                                                Pune and Gurugram, gets 40% regardless of size or cost of living.
                                                A wrong answer here changes your actual tax number, so pick "No"
                                                unless you're genuinely in one of the four.
                                            </p>
                                        </div>
                                    </>
                                )}

                                {step === 1 && (
                                    <>
                                        <div>
                                            <h2 className="text-[16px] font-semibold text-hi">What comes in</h2>
                                            <p className="text-[12.5px] text-lo mt-1">
                                                In-hand pay, not CTC. CTC includes money you never see — employer
                                                EPF, gratuity, insurance premiums — and budgeting against it is
                                                how people end a month short.
                                            </p>
                                        </div>
                                        <Money
                                            id="inhand"
                                            label="Monthly in-hand salary"
                                            value={inHand}
                                            onChange={setInHand}
                                            autoFocus
                                            hint="What actually lands in your bank account each month."
                                        />
                                        <div className="grid sm:grid-cols-2 gap-4">
                                            <Num id="payday" label="Salary day" value={payDay} onChange={setPayDay} min={1} max={31} hint="Day of the month." />
                                            <Money id="epf" label="Your EPF deduction" value={epf} onChange={setEpf} hint="Optional. On your payslip. It counts under 80C." />
                                        </div>
                                    </>
                                )}

                                {step === 2 && (
                                    <>
                                        <div>
                                            <h2 className="text-[16px] font-semibold text-hi">What must go out</h2>
                                            <p className="text-[12.5px] text-lo mt-1">
                                                These are the bills you would still owe if your income stopped
                                                tomorrow. Runway is measured against exactly this line — measured
                                                against total spending it is a vanity number, because nobody keeps
                                                ordering dinner while unemployed.
                                            </p>
                                        </div>
                                        <div className="space-y-3.5">
                                            {ESSENTIALS.map((e, i) => (
                                                <Money
                                                    key={e.id}
                                                    id={e.id}
                                                    label={e.label}
                                                    value={essentials[e.id] ?? ''}
                                                    autoFocus={i === 0}
                                                    onChange={(v) => setEssentials((s) => ({ ...s, [e.id]: v }))}
                                                    hint={e.hint}
                                                />
                                            ))}
                                        </div>
                                        <div className="pt-2 space-y-3.5" style={{ borderTop: '1px solid var(--line-subtle)' }}>
                                            <p className="label pt-3">Everything else — not counted as essential</p>
                                            <Money id="lifestyle" label="Eating out, shopping, weekends" value={lifestyle} onChange={setLifestyle} hint="A rough monthly figure is fine." />
                                            <Money id="subs" label="Subscriptions" value={subscriptions} onChange={setSubscriptions} hint="Streaming, gym, cloud storage, apps." />
                                        </div>
                                    </>
                                )}

                                {step === 3 && (
                                    <>
                                        <div>
                                            <h2 className="text-[16px] font-semibold text-hi">What you have, what you owe</h2>
                                            <p className="text-[12.5px] text-lo mt-1">
                                                Cash is what keeps you afloat. Debt eats the surplus that would
                                                otherwise build the buffer, so the app needs both to tell you
                                                which to fix first.
                                            </p>
                                        </div>
                                        <Money
                                            id="cash"
                                            label="Cash in savings accounts"
                                            value={cash}
                                            onChange={setCash}
                                            autoFocus
                                            hint="Instantly available money. Investments come from the Wallet later."
                                        />

                                        <div className="pt-2" style={{ borderTop: '1px solid var(--line-subtle)' }}>
                                            <div className="flex items-center justify-between pt-3 mb-3">
                                                <p className="label">Loans & credit card balances</p>
                                                <button type="button" onClick={addDebt} className="btn btn-secondary !py-1.5 !px-3 !text-[12px]">
                                                    <Plus size={13} /> Add
                                                </button>
                                            </div>

                                            {debts.length === 0 && (
                                                <p className="text-[12px] text-faint py-3">
                                                    Nothing owed? Leave this empty — that is the best possible answer.
                                                </p>
                                            )}

                                            <div className="space-y-3">
                                                {debts.map((d) => (
                                                    <div key={d.id} className="p-3 rounded-[var(--r-md)] space-y-3"
                                                        style={{ background: 'var(--surface-2)', border: '1px solid var(--line-subtle)' }}>
                                                        <div className="flex items-center gap-2">
                                                            <select
                                                                value={d.kind}
                                                                onChange={(e) => {
                                                                    const kind = e.target.value as DebtKind;
                                                                    // Pre-fill a typical rate so the field is a
                                                                    // correction rather than a blank guess.
                                                                    const typical: Record<DebtKind, string> = {
                                                                        card: '42', personal: '14', auto: '10',
                                                                        education: '9.5', home: '8.5',
                                                                    };
                                                                    patchDebt(d.id, { kind, rate: typical[kind] });
                                                                }}
                                                                className="field !py-2 !text-[12.5px] flex-1"
                                                            >
                                                                {DEBT_KINDS.map((k) => (
                                                                    <option key={k.value} value={k.value}>{k.label}</option>
                                                                ))}
                                                            </select>
                                                            <button
                                                                type="button"
                                                                onClick={() => setDebts((ds) => ds.filter((x) => x.id !== d.id))}
                                                                aria-label="Remove"
                                                                className="p-2 rounded-[var(--r-sm)] text-faint hover:text-hi"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            <div>
                                                                <label className="label block mb-1 !text-[10px]">Outstanding</label>
                                                                <input type="number" min={0} value={d.balance}
                                                                    onChange={(e) => patchDebt(d.id, { balance: e.target.value })}
                                                                    className="field !py-2 !text-[12.5px]" placeholder="0" />
                                                            </div>
                                                            <div>
                                                                <label className="label block mb-1 !text-[10px]">Rate %</label>
                                                                <input type="number" min={0} step={0.5} value={d.rate}
                                                                    onChange={(e) => patchDebt(d.id, { rate: e.target.value })}
                                                                    className="field !py-2 !text-[12.5px]" />
                                                            </div>
                                                            <div>
                                                                <label className="label block mb-1 !text-[10px]">Monthly EMI</label>
                                                                <input type="number" min={0} value={d.emi}
                                                                    onChange={(e) => patchDebt(d.id, { emi: e.target.value })}
                                                                    className="field !py-2 !text-[12.5px]" placeholder="0" />
                                                            </div>
                                                        </div>
                                                        <p className="text-[10.5px] text-faint">
                                                            Typical rate for {DEBT_KINDS.find((k) => k.value === d.kind)!.label.toLowerCase()}:{' '}
                                                            {DEBT_KINDS.find((k) => k.value === d.kind)!.typical}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </motion.div>
                        </AnimatePresence>

                        {/* ─── navigation ─── */}
                        <div className="flex items-center justify-between gap-3 mt-7 pt-5" style={{ borderTop: '1px solid var(--line-subtle)' }}>
                            <button
                                type="button"
                                onClick={() => setStep((s) => Math.max(0, s - 1))}
                                disabled={step === 0}
                                className="btn btn-secondary !py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <ArrowLeft size={14} /> Back
                            </button>

                            {step < STEPS.length - 1 ? (
                                <button
                                    type="button"
                                    onClick={() => setStep((s) => s + 1)}
                                    disabled={!canAdvance}
                                    className="btn btn-primary !py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    Continue <ArrowRight size={14} />
                                </button>
                            ) : (
                                <button type="button" onClick={finish} className="btn btn-primary !py-2.5">
                                    <Sparkles size={14} /> Show me my dashboard
                                </button>
                            )}
                        </div>

                        {!canAdvance && (
                            <p className="text-[11.5px] text-faint mt-3">
                                {step === 0 && 'Your age is needed before the next step.'}
                                {step === 1 && 'Monthly in-hand pay is the one figure the app cannot work without.'}
                                {step === 2 && 'Add at least one essential cost — runway is measured against this line.'}
                            </p>
                        )}
                    </div>

                    {/* ─── live preview ─── */}
                    <div className="surface p-5 lg:sticky lg:top-6">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="live-dot" aria-hidden />
                            <span className="label">Computed from your answers</span>
                        </div>

                        {essentialTotal > 0 && draft.cash > 0 ? (
                            <>
                                <p className="text-[34px] font-bold text-hi leading-none mt-3 tabular-nums">
                                    {fmtMonths(runway.months)}
                                </p>
                                <p className="text-[12.5px] text-lo mt-1.5">
                                    is how long your savings would cover the essentials with no income at all.
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-[34px] font-bold text-faint leading-none mt-3">—</p>
                                <p className="text-[12.5px] text-lo mt-1.5">
                                    {essentialTotal === 0
                                        ? 'Your runway appears once the app knows what you must spend each month.'
                                        : 'Add your savings on the last step and this becomes a real number.'}
                                </p>
                            </>
                        )}

                        <div className="mt-5 space-y-2.5 pt-4" style={{ borderTop: '1px solid var(--line-subtle)' }}>
                            {[
                                ['Coming in', draft.income.inHand],
                                ['Essential burn', essentialTotal],
                                ['Everything else', runway.discretionaryBurn],
                            ].map(([label, v]) => (
                                <div key={label as string} className="flex items-center justify-between text-[12.5px]">
                                    <span className="text-lo">{label}</span>
                                    <span className="tabular-nums text-hi">{v ? money(v as number) : '—'}</span>
                                </div>
                            ))}

                            {draft.income.inHand > 0 && essentialTotal > 0 && (
                                <div className="flex items-center justify-between text-[12.5px] pt-2.5"
                                    style={{ borderTop: '1px solid var(--line-subtle)' }}>
                                    <span className="text-lo font-semibold">Monthly surplus</span>
                                    <span
                                        className="tabular-nums font-semibold"
                                        style={{ color: surplus >= 0 ? 'var(--gain)' : 'var(--loss)' }}
                                    >
                                        {surplus >= 0 ? '+' : '−'}{money(Math.abs(surplus))}
                                    </span>
                                </div>
                            )}
                        </div>

                        {surplus < 0 && draft.income.inHand > 0 && (
                            <p className="text-[11.5px] mt-3 leading-relaxed" style={{ color: 'var(--warn)' }}>
                                You are spending more than you earn. That is worth knowing on day one,
                                and it is the first thing the dashboard will help you fix.
                            </p>
                        )}

                        <div className="flex items-start gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--line-subtle)' }}>
                            <Info size={13} className="shrink-0 mt-px text-faint" />
                            <p className="text-[11px] text-faint leading-relaxed">
                                Everything here stays on your account and can be changed any time from
                                your profile. Nothing is shared, and nothing is guessed on your behalf.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
