import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { type PulseData, initializePulse, advancePulse as engineAdvancePulse } from '../engine/pulseEngine';
import { analyzeMarket } from '../engine/trendEngine';
import { emptyProfile } from '../domain/empty';
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

/** Where an unauthenticated visitor's tinkering goes. Never merged into a
    real account: it exists so the store works on the landing page. */
const ANON_KEY = `${STORAGE_KEY}:anon`;

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
    /** Writes the answers collected during onboarding and unlocks the app. */
    completeOnboarding: (p: FinancialProfile) => void;
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
            profile: emptyProfile,

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
            salary: 0,
            setSalary: (v) =>
                set((s) => ({
                    salary: v,
                    profile: { ...s.profile, income: { ...s.profile.income, inHand: v } },
                })),

            split: { needs: 50, wants: 30, investments: 20 },
            setSplit: (v) => set({ split: v }),

            risk: emptyProfile.risk,
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
            streakCount: 0,
            streakActive: false,
            lastDecisionBlocked: false,
            incrementStreak: () =>
                set((s) => ({ streakCount: s.streakCount + 1, lastDecisionBlocked: false })),
            resetStreak: () => set({ streakCount: 0, lastDecisionBlocked: true }),
            markBlocked: () => set({ lastDecisionBlocked: true }),

            /* ───────────── Legacy holdings ───────────── */
            holdings: { equity: 0, crypto: 0, esg: 0 },
            setHoldings: (d) =>
                set((s) => ({
                    holdings: {
                        equity: s.holdings.equity + d.equity,
                        crypto: s.holdings.crypto + d.crypto,
                        esg: s.holdings.esg + d.esg,
                    },
                })),

            /* ───────────── Decision log ───────────── */
            // Empty. This used to ship with four invented decisions,
            // complete with fabricated block hashes, so a user who had
            // never made a decision was shown a history of them.
            decisionLog: [],
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
            completedLessons: [],
            toggleLesson: (id) =>
                set((s) => ({
                    completedLessons: s.completedLessons.includes(id)
                        ? s.completedLessons.filter((x) => x !== id)
                        : [...s.completedLessons, id],
                })),
            lessonStreak: 0,

            /* ───────────── Session ───────────── */
            // False, and it stays false until the user has actually told
            // the app something about themselves. The old default of `true`
            // is why a fresh account opened straight onto invented numbers.
            onboardingCompleted: false,
            completeOnboarding: (p) =>
                set({
                    profile: p,
                    salary: p.income.inHand,
                    risk: p.risk,
                    onboardingCompleted: true,
                }),
            resetOnboarding: () =>
                set({
                    onboardingCompleted: false,
                    pulse: initializePulse(),
                    streakCount: 0,
                    appliedLevers: [],
                    profile: emptyProfile,
                }),

            userProfile: {
                name: '',
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

            // Signing out is not a reset. The previous version cleared
            // onboardingCompleted, which meant every returning user was
            // marched through the questionnaire again while their answers
            // sat untouched in storage. Unbinding the namespace is what
            // ends the session; see bindStorageToUser.
            logout: () => {},
        }),
        {
            // Placeholder. The real key is set by bindStorageToUser once
            // the session is known; see the note below.
            name: ANON_KEY,
            storage: createJSONStorage(() => localStorage),
            version: 2,
            // Do NOT read localStorage at import time. At that moment we do
            // not yet know who is signed in, so any hydration would be from
            // the wrong namespace — and on a shared machine that means one
            // user's salary and holdings rendering under another user's
            // login before the session check has even finished.
            skipHydration: true,
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
   Per-user data isolation.

   THE BUG THIS CLOSES
   -------------------
   One localStorage key held one financial profile. With a real login,
   that is a data leak on any shared machine: user A signs out, user B
   signs in, and the store rehydrates A's salary, debts and holdings
   under B's name. B then edits them, and A gets B's numbers back.

   The fix is to make the key part of the identity — one namespace per
   user id — and to rebind it before anything renders.

   THE ORDER BELOW IS THE WHOLE TRICK
   ----------------------------------
   Reset to defaults FIRST, then rehydrate. zustand's persist merges the
   stored slice over whatever is currently in memory, so hydrating
   straight into a populated store would leave every field the new user
   has never set still holding the previous user's value. A user with no
   saved data would inherit the entire previous profile. Wiping first
   makes "absent in storage" mean "default", which is what it has to
   mean.
   ═══════════════════════════════════════════════════════════════════ */

// Captured while the store is still pristine — skipHydration guarantees
// nothing has been read from localStorage yet. Includes the action
// closures, which are stable, so this can be used as a full replacement.
const DEFAULTS = { ...useAppStore.getState() };

let boundKey: string | null = null;

/**
 * Points the store at one user's storage namespace.
 *
 * Pass null on sign-out. That unbinds without deleting: the data stays
 * under the user's own key so signing back in restores it.
 */
export async function bindStorageToUser(userId: string | null): Promise<void> {
    const key = userId ? `${STORAGE_KEY}:${userId}` : ANON_KEY;
    if (key === boundKey) return;
    boundKey = key;

    // THE BUG THIS GUARDS AGAINST
    // ---------------------------
    // A first version always did setOptions(key) → setState(DEFAULTS, true)
    // → rehydrate(). That reset was supposed to stop the previous user's
    // fields leaking into a fresh account. Instead it broke every RETURNING
    // user: setState triggers persist's write-through, and by that point
    // setOptions had already pointed persist at THIS user's real storage
    // slot — so the reset overwrote their saved onboarding answers with
    // blank defaults a moment before rehydrate tried to read them back.
    // Every login looked like a brand new account.
    //
    // The reset is only needed when there is nothing real to lose. For a
    // returning user, skip it: partialize saves a fixed, complete set of
    // fields, so a successful rehydrate always fully overwrites every one
    // of them, and no prior reset is needed to prevent cross-user leakage.
    let hasStoredData = false;
    try {
        hasStoredData = localStorage.getItem(key) !== null;
    } catch {
        hasStoredData = false;
    }

    useAppStore.persist.setOptions({ name: key });

    if (!hasStoredData) {
        // Replace, not merge (the `true`), so no field of the previous
        // user can survive into a brand new account.
        useAppStore.setState(DEFAULTS, true);
    }

    // Awaited, because the caller needs to know the store holds this
    // user's data before it renders anything derived from it.
    await useAppStore.persist.rehydrate();
}

/**
 * Stamps the signed-in identity onto the profile.
 *
 * Only fills what is still at its default. A user who has edited their
 * display name keeps it; the server's copy does not overwrite a local
 * choice on every boot.
 */
export function applyIdentity(identity: { name: string; email: string }): void {
    const s = useAppStore.getState();
    const patch: Partial<AppState['userProfile']> = {};

    if (!s.userProfile.email) patch.email = identity.email;
    if (identity.name && s.userProfile.name === DEFAULTS.userProfile.name) {
        patch.name = identity.name;
    }
    if (Object.keys(patch).length) s.setUserProfile(patch);

    // The financial profile carries a name too, and it is what greets the
    // user on the dashboard. A screen that says "Good morning, Arjun" to
    // someone called Aditya undoes every other personalisation on it.
    if (identity.name && s.profile.name === DEFAULTS.profile.name) {
        s.updateProfile({ name: identity.name });
    }
}

/** Which namespace is live. Exported for the profile screen to show. */
export function boundStorageKey(): string | null {
    return boundKey;
}

/* ═══════════════════════════════════════════════════════════════════
   Selectors — subscribe narrowly so a live price tick does not
   re-render the whole tree.
   ═══════════════════════════════════════════════════════════════════ */

export const selectProfile = (s: AppState) => s.profile;
export const selectPremium = (s: AppState) => s.isPremium;
