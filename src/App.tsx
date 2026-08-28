import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { useAppStore } from './store/useAppStore';
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/Dashboard';
import SalarySplitting from './pages/SalarySplitting';
import TripleGuard from './pages/TripleGuard';
import QuarterlyPulse from './pages/QuarterlyPulse';
import Portfolio from './pages/Portfolio';
import News from './pages/News';
import Learning from './pages/Learning';
import AICoach from './pages/AICoach';
import TaxCentre from './pages/TaxCentre';
import Transactions from './pages/Transactions';
import RiskProfile from './pages/RiskProfile';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import UserProfile from './pages/UserProfile';
import Wallet from './pages/Wallet';
import Onboarding from './pages/Onboarding';
import Invest from './pages/Invest';
import Screener from './pages/Screener';

/* Premium routes no longer redirect away. Each page wraps itself in
   <PremiumGate>, which renders the real content blurred behind an
   explanation. Bouncing a user to /profile taught them nothing about
   what they were not buying. */

/* Shown for the moment it takes to verify a stored session. Without it
   a returning user sees the login page flash before being bounced to
   the dashboard they were already entitled to. */
function Booting() {
    return (
        <div
            className="min-h-screen grid place-items-center"
            style={{ background: 'var(--bg-void)' }}
        >
            <div className="flex items-center gap-3">
                <div
                    className="w-8 h-8 rounded-[10px] grid place-items-center"
                    style={{ background: 'var(--accent)' }}
                >
                    <span
                        className="font-display font-extrabold text-[15px]"
                        style={{ color: 'var(--accent-ink)' }}
                    >
                        S
                    </span>
                </div>
                <span className="text-[13px] text-lo">Restoring your session…</span>
            </div>
        </div>
    );
}

function App() {
    const status = useAuthStore((s) => s.status);
    const boot = useAuthStore((s) => s.boot);
    const onboarded = useAppStore((s) => s.onboardingCompleted);

    // Runs once. This is what decides which storage namespace the app
    // reads, so nothing that touches user data should render before it.
    useEffect(() => {
        void boot();
    }, [boot]);

    if (status === 'checking') return <Booting />;

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<AuthPage />} />
                <Route path="/signup" element={<AuthPage />} />

                <Route
                    path="/onboarding"
                    element={
                        status !== 'authenticated' ? (
                            <Navigate to="/login" replace />
                        ) : onboarded ? (
                            // Already set up. Re-running setup from the URL
                            // would silently overwrite real answers.
                            <Navigate to="/dashboard" replace />
                        ) : (
                            <Onboarding />
                        )
                    }
                />

                <Route
                    path="/dashboard"
                    element={
                        status !== 'authenticated' ? (
                            <Navigate to="/login" replace />
                        ) : !onboarded ? (
                            // Signed in but the app knows nothing about them yet.
                            // Sending them to a dashboard here is what produced
                            // the invented ₹1.24L salary and 5.9-month runway.
                            <Navigate to="/onboarding" replace />
                        ) : (
                            <DashboardLayout />
                        )
                    }
                >
                    <Route index element={<Dashboard />} />
                    <Route path="salary-splitting" element={<SalarySplitting />} />
                    <Route path="tax" element={<TaxCentre />} />
                    <Route path="transactions" element={<Transactions />} />
                    <Route path="risk-profile" element={<RiskProfile />} />
                    <Route path="triple-guard" element={<TripleGuard />} />
                    <Route path="quarterly-pulse" element={<QuarterlyPulse />} />
                    <Route path="wallet" element={<Wallet />} />
                    <Route path="invest" element={<Invest />} />
                    <Route path="screener" element={<Screener />} />
                    <Route path="portfolio" element={<Portfolio />} />
                    <Route path="news" element={<News />} />
                    <Route path="learning" element={<Learning />} />
                    <Route path="ai-coach" element={<AICoach />} />
                    <Route path="profile" element={<UserProfile />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
