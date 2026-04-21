import { create } from "zustand";
import { type PulseData, initializePulse, advancePulse as engineAdvancePulse } from "../engine/pulseEngine";
import { type RiskType } from "../types";
import { analyzeMarket } from "../engine/trendEngine";
import { mockHoldings, mockDecisionLog } from "../data/mockData";

interface AppState {
    salary: number | null;
    risk: RiskType | null;
    pulse: PulseData;
    streakActive: boolean;

    setSalary: (val: number) => void;

    split: { needs: number; wants: number; investments: number };
    setSplit: (val: { needs: number; wants: number; investments: number }) => void;

    setRisk: (val: RiskType) => void;
    advancePulse: (amount: number) => void;
    resetPulse: () => void;

    streakCount: number;
    lastDecisionBlocked: boolean;
    incrementStreak: () => void;
    resetStreak: () => void;
    markBlocked: () => void;

    holdings: {
        equity: number;
        crypto: number;
        esg: number;
    };
    setHoldings: (data: { equity: number; crypto: number; esg: number }) => void;

    marketTrend: any; // Using any for simplicity in store, typical usage is TrendAnalysis
    setMarketTrend: (data: any) => void;

    // Decision Log
    decisionLog: {
        timestamp: string;
        emotion: string;
        guardScore: number;
        marketSignal: string | null;
        result: string;
        hash?: string;
    }[];

    addLog: (entry: {
        emotion: string;
        guardScore: number;
        marketSignal: string | null;
        result: string;
    }) => void;

    onboardingCompleted: boolean;
    completeOnboarding: () => void;
    resetOnboarding: () => void;

    // User Profile
    userProfile: {
        name: string;
        email: string;
        phone: string;
        pan: string;
        dob: string;
        banks: { name: string; accountNo: string; ifsc: string; primary: boolean }[];
        upiIds: string[];
    };
    setUserProfile: (data: Partial<AppState['userProfile']>) => void;
    addBank: (bank: { name: string; accountNo: string; ifsc: string; primary: boolean }) => void;
    removeBank: (index: number) => void;
    addUpi: (upi: string) => void;
    removeUpi: (index: number) => void;

    // Premium
    isPremium: boolean;
    togglePremium: () => void;
}

export const useAppStore = create<AppState>()(
    (set, get) => ({
        salary: 50000,
        risk: 'balanced' as RiskType,
        pulse: initializePulse(),
        streakActive: true,

        setSalary: (val) => set({ salary: val }),

        split: { needs: 50, wants: 30, investments: 20 },
        setSplit: (val) => set({ split: val }),

        setRisk: (val) => set({ risk: val }),

        advancePulse: (amount) => {
            const current = get().pulse;
            const updated = engineAdvancePulse(current, amount);

            // Trigger Market Analysis on Strike (Month 3)
            if (updated.state === "strike" && current.state !== "strike") {
                const trend = analyzeMarket();
                get().setMarketTrend(trend);
            }

            set({ pulse: updated });
        },

        resetPulse: () => set({ pulse: initializePulse() }),

        // Streak Logic
        streakCount: 3,
        lastDecisionBlocked: false,

        incrementStreak: () =>
            set((state) => ({
                streakCount: state.streakCount + 1,
                lastDecisionBlocked: false,
            })),

        resetStreak: () =>
            set({
                streakCount: 0,
                lastDecisionBlocked: true,
            }),

        markBlocked: () =>
            set({
                lastDecisionBlocked: true,
            }),

        // Portfolio Holdings
        holdings: mockHoldings,

        setHoldings: (data) => set((state) => ({
            holdings: {
                equity: state.holdings.equity + data.equity,
                crypto: state.holdings.crypto + data.crypto,
                esg: state.holdings.esg + data.esg,
            }
        })),

        // Market Trend (AI Analysis)
        marketTrend: null,
        setMarketTrend: (data) => set({ marketTrend: data }),

        // Onboarding State
        onboardingCompleted: true,
        completeOnboarding: () => set({ onboardingCompleted: true }),
        resetOnboarding: () => set({ onboardingCompleted: false, salary: null, risk: null, pulse: initializePulse(), streakCount: 0 }), // Full reset

        // Decision Log
        decisionLog: mockDecisionLog,
        addLog: (entry) =>
            set((state) => ({
                decisionLog: [
                    {
                        ...entry,
                        timestamp: new Date().toLocaleTimeString(),
                        hash: `0x${Math.random().toString(16).substr(2, 8)}...${Math.random().toString(16).substr(2, 3)}`,
                    },
                    ...state.decisionLog,
                ],
            })),

        // User Profile
        userProfile: {
            name: '',
            email: '',
            phone: '',
            pan: '',
            dob: '',
            banks: [],
            upiIds: [],
        },
        setUserProfile: (data) => set((state) => ({ userProfile: { ...state.userProfile, ...data } })),
        addBank: (bank) => set((state) => ({ userProfile: { ...state.userProfile, banks: [...state.userProfile.banks, bank] } })),
        removeBank: (index) => set((state) => ({ userProfile: { ...state.userProfile, banks: state.userProfile.banks.filter((_, i) => i !== index) } })),
        addUpi: (upi) => set((state) => ({ userProfile: { ...state.userProfile, upiIds: [...state.userProfile.upiIds, upi] } })),
        removeUpi: (index) => set((state) => ({ userProfile: { ...state.userProfile, upiIds: state.userProfile.upiIds.filter((_, i) => i !== index) } })),

        // Premium
        isPremium: false,
        togglePremium: () => set((state) => ({ isPremium: !state.isPremium })),
    })
);
