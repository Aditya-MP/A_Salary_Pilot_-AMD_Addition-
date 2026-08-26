import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { type PulseData, initializePulse, advancePulse as engineAdvancePulse } from '../engine/pulseEngine';
import { analyzeMarket } from '../engine/trendEngine';
import { seedProfile } from '../domain/seed';
import type { FinancialProfile, RiskType, Holding, Goal } from '../domain/types';

/* ═══════════════════════════════════════════════════════════════════
   Global store.

   Two fixes over the previous version:

   1. It now actually persists. The old store had no persist middleware
      at all, yet logout called `localStorage.removeItem('salary-pilot-
      storage')` — a key nothing ever wrote. Every reload silently reset
      the user's data, which is fatal for an app whose whole pitch is
      tracking progress over months.

   2. There is now ONE financial profile that every page derives from,
      instead of each screen hardcoding its own facts.
   ═══════════════════════════════════════════════════════════════════ */

export const STORAGE_KEY = 'salary-pilot-storage';

interface DecisionEntry {
    timestamp: string;
    emotion: string;
    guardScore: number;
    marketSignal: string | null;
    result: string;
    hash?: string;
}

interface AppState {
    /* ─── The financial profile: single source of truth ─── */
    profile: FinancialProfile;
    updateProfile: (patch: Partial<FinancialProfile>) => void;
    updateIncome: (patch: Partial<FinancialProfile['income']>) => void;
    setCash: (v: number) => void;

    /** Apply a lever from the runway engine — mutates the real profile
        so the score visibly moves. This is what makes the advice feel
        real rather than decorative. */
    applyLever: (id: string) => void;
    appliedLevers: string[];

    addHolding: (h: Holding) => void;
    removeHolding: (id: string) => void;
    updateGoal: (id: string, patch: Partial<Goal>) => void;
    cancelSubscription: (id: string) => void;

    /* ─── Salary routing ─── */
    salary: number;
    setSalary: (v: number) => void;
    split: { needs: number; wants: number; investments: number };
    setSplit: (v: { needs: number; wants: number; investments: number }) => void;

    risk: RiskType;
    setRisk: (v: RiskType) => void;

    /* ─── Quarterly Pulse ─── */
    pulse: PulseData;
    advancePulse: (amount: number) => void;
    resetPulse: () => void;
    marketTrend: unknown;
    setMarketTrend: (d: unknown) => void;

    /* ─── Behavioural streak ─── */
    streakCount: number;
    streakActive: boolean;
    lastDecisionBlocked: boolean;
    incrementStreak: () => void;
    resetStreak: () => void;
    markBlocked: () => void;

    /* ─── Legacy simple holdings, still used by the Triple Guard flow ─── */
    holdings: { equity: number; crypto: number; esg: number };
    setHoldings: (d: { equity: number; crypto: number; esg: number }) => void;

    /* ─── Decision log ─── */
    decisionLog: DecisionEntry[];
    addLog: (e: Omit<DecisionEntry, 'timestamp' | 'hash'>) => void;

    /* ─── Learning progress ─── */
    completedLessons: string[];
    toggleLesson: (id: string) => void;
    lessonStreak: number;

    /* ─── Session ─── */
    onboardingCompleted: boolean;
    completeOnboarding: () => void;
    resetOnboarding: () => void;

    userProfile: {
        name: string;
        email: string;
        phone: string;
        pan: string;
        dob: string;
        banks: { name: string; accountNo: string; ifsc: string; primary: boolean }[];
        upiIds: string[];
    };
    setUserProfile: (d: Partial<AppState['userProfile']>) => void;

    /** How loud the live market tape behind the app is. */
    bgIntensity: 'off' | 'subtle' | 'vivid';
    setBgIntensity: (v: 'off' | 'subtle' | 'vivid') => void;

    isPremium: boolean;
    /** Explicit, so cancelling is never an accidental re-activation. */
    setPremium: (v: boolean) => void;
    togglePremium: () => void;

    /** Ends the session. Deliberately does NOT wipe the user's data —
        a logout button that silently deletes everything is not a
        logout button. `resetOnboarding` remains available for a true
        wipe, but nothing in the UI surfaces it. */
    logout: () => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set, get) => ({
            /* ───────────── Profile ───────────── */
            profile: seedProfile,

            updateProfile: (patch) =>
                set((s) => ({ profile: { ...s.profile, ...patch } })),

            updateIncome: (patch) =>
                set((s) => ({
                    profile: { ...s.profile, income: { ...s.profile.income, ...patch } },
                })),

            setCash: (v) =>
                set((s) => ({ profile: { ...s.profile, cash: Math.max(0, v) } })),

            appliedLevers: [],

            /* Levers mutate the profile for real. Cancelling subscriptions
               removes them; clearing the card zeroes that debt; filling NPS
               moves the deduction. The score then recomputes on its own. */
            applyLever: (id) =>
                set((s) => {
                    if (s.appliedLevers.includes(id)) return s;
                    const p = { ...s.profile };

                    if (id === 'kill-subs') {
                        p.subscriptions = p.subscriptions.filter((x) => x.monthsUnused < 3);
                    }

                    if (id === 'kill-debt') {
                        const worst = [...p.debts].sort((a, b) => b.rate - a.rate)[0];
                        if (worst) {
                            p.debts = p.debts.filter((d) => d.id !== worst.id);
                            p.cash = Math.max(0, p.cash - worst.balance);
                        }
                    }

                    if (id === 'nps') {
                        p.deductions = p.deductions.map((d) =>
                            d.section === '80CCD1B' ? { ...d, used: d.limit } : d
                        );
                    }

                    if (id === 'trim') {
                        p.expenses = p.expenses.map((e) =>
                            e.essential ? e : { ...e, monthly: Math.round(e.monthly * 0.8) }
                        );
                    }

                    if (id === 'term') {
                        const annual = p.income.inHand * 12 + p.income.annualBonus;
                        p.insurance = { ...p.insurance, term: annual * 10 };
                    }

                    if (id === 'liquid-first') {
                        p.cash = p.cash + 8_000;
                    }

                    return { profile: p, appliedLevers: [...s.appliedLevers, id] };
                }),

            addHolding: (h) =>
                set((s) => ({
                    profile: { ...s.profile, holdings: [...s.profile.holdings, h] },
                })),

            removeHolding: (id) =>
                set((s) => ({
                    profile: {
                        ...s.profile,
                        holdings: s.profile.holdings.filter((h) => h.id !== id),
                    },
                })),

            updateGoal: (id, patch) =>
                set((s) => ({
                    profile: {
                        ...s.profile,
                        goals: s.profile.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
                    },
                })),

            cancelSubscription: (id) =>
                set((s) => ({
                    profile: {
                        ...s.profile,
                        subscriptions: s.profile.subscriptions.filter((x) => x.id !== id),
                    },
                })),

            /* ───────────── Salary ───────────── */
            salary: seedProfile.income.inHand,
            setSalary: (v) =>
                set((s) => ({
                    salary: v,
                    profile: { ...s.profile, income: { ...s.profile.income, inHand: v } },
                })),

            split: { needs: 50, wants: 30, investments: 20 },
            setSplit: (v) => set({ split: v }),

            risk: seedProfile.risk,
            setRisk: (v) =>
                set((s) => ({ risk: v, profile: { ...s.profile, risk: v } })),

            /* ───────────── Pulse ───────────── */
            pulse: initializePulse(),
            advancePulse: (amount) => {
                const current = get().pulse;
                const updated = engineAdvancePulse(current, amount);
                if (updated.state === 'strike' && current.state !== 'strike') {
                    set({ marketTrend: analyzeMarket() });
                }
                set({ pulse: updated });
            },
            resetPulse: () => set({ pulse: initializePulse() }),
            marketTrend: null,
            setMarketTrend: (d) => set({ marketTrend: d }),

            /* ───────────── Streak ───────────── */
            streakCount: 3,
            streakActive: true,
            lastDecisionBlocked: false,
            incrementStreak: () =>
                set((s) => ({ streakCount: s.streakCount + 1, lastDecisionBlocked: false })),
            resetStreak: () => set({ streakCount: 0, lastDecisionBlocked: true }),
            markBlocked: () => set({ lastDecisionBlocked: true }),

            /* ───────────── Legacy holdings ───────────── */
            holdings: { equity: 45_000, crypto: 15_000, esg: 25_000 },
            setHoldings: (d) =>
                set((s) => ({
                    holdings: {
                        equity: s.holdings.equity + d.equity,
                        crypto: s.holdings.crypto + d.crypto,
                        esg: s.holdings.esg + d.esg,
                    },
                })),

            /* ───────────── Decision log ───────────── */
            decisionLog: [
                { timestamp: '10:42 AM', emotion: 'Fear', guardScore: 85, marketSignal: 'Bearish', result: 'Blocked', hash: '0x7f8a9d…2b1' },
                { timestamp: 'Yesterday', emotion: 'Greed', guardScore: 72, marketSignal: 'Bullish', result: 'Approved', hash: '0x3c4e1f…9a2' },
                { timestamp: '2d ago', emotion: 'Neutral', guardScore: 90, marketSignal: 'Stable', result: 'Approved', hash: '0x9b2a4c…8d3' },
                { timestamp: '3d ago', emotion: 'FOMO', guardScore: 45, marketSignal: 'Volatile', result: 'Blocked', hash: '0x1d5e8f…4c6' },
            ],
            addLog: (e) =>
                set((s) => ({
                    decisionLog: [
                        {
                            ...e,
                            timestamp: new Date().toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                            }),
                            hash: `0x${Math.random().toString(16).slice(2, 8)}…${Math.random().toString(16).slice(2, 5)}`,
                        },
                        ...s.decisionLog,
                    ].slice(0, 40),
                })),

            /* ───────────── Learning ───────────── */
            completedLessons: ['fx-1', 'fx-2', 'tax-1'],
            toggleLesson: (id) =>
                set((s) => ({
                    completedLessons: s.completedLessons.includes(id)
                        ? s.completedLessons.filter((x) => x !== id)
                        : [...s.completedLessons, id],
                })),
            lessonStreak: 4,

            /* ───────────── Session ───────────── */
            onboardingCompleted: true,
            completeOnboarding: () => set({ onboardingCompleted: true }),
            resetOnboarding: () =>
                set({
                    onboardingCompleted: false,
                    pulse: initializePulse(),
                    streakCount: 0,
                    appliedLevers: [],
                    profile: seedProfile,
                }),

            userProfile: {
                name: seedProfile.name,
                email: '',
                phone: '',
                pan: '',
                dob: '',
                banks: [],
                upiIds: [],
            },
            setUserProfile: (d) =>
                set((s) => ({ userProfile: { ...s.userProfile, ...d } })),

            bgIntensity: 'vivid',
            setBgIntensity: (v) => set({ bgIntensity: v }),

            isPremium: false,
            setPremium: (v) => set({ isPremium: v }),
            togglePremium: () => set((s) => ({ isPremium: !s.isPremium })),

            logout: () => set({ onboardingCompleted: false }),
        }),
        {
            name: STORAGE_KEY,
            storage: createJSONStorage(() => localStorage),
            version: 2,
            // Anything not listed here is recreated from defaults on load,
            // which keeps stale seed data from surviving a code change.
            partialize: (s) => ({
                profile: s.profile,
                appliedLevers: s.appliedLevers,
                salary: s.salary,
                split: s.split,
                risk: s.risk,
                pulse: s.pulse,
                streakCount: s.streakCount,
                holdings: s.holdings,
                decisionLog: s.decisionLog,
                completedLessons: s.completedLessons,
                lessonStreak: s.lessonStreak,
                onboardingCompleted: s.onboardingCompleted,
                userProfile: s.userProfile,
                isPremium: s.isPremium,
                bgIntensity: s.bgIntensity,
            }),
        }
    )
);

/* ═══════════════════════════════════════════════════════════════════
   Selectors — subscribe narrowly so a live price tick does not
   re-render the whole tree.
   ═══════════════════════════════════════════════════════════════════ */

export const selectProfile = (s: AppState) => s.profile;
export const selectPremium = (s: AppState) => s.isPremium;
