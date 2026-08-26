import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import RiskProfile from './pages/RiskProfile';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import UserProfile from './pages/UserProfile';

/* Premium routes no longer redirect away. Each page wraps itself in
   <PremiumGate>, which renders the real content blurred behind an
   explanation. Bouncing a user to /profile taught them nothing about
   what they were not buying. */

function App() {
    const onboardingCompleted = useAppStore((s) => s.onboardingCompleted);

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<AuthPage />} />
                <Route path="/signup" element={<AuthPage />} />

                <Route
                    path="/dashboard"
                    element={onboardingCompleted ? <DashboardLayout /> : <Navigate to="/login" replace />}
                >
                    <Route index element={<Dashboard />} />
                    <Route path="salary-splitting" element={<SalarySplitting />} />
                    <Route path="tax" element={<TaxCentre />} />
                    <Route path="risk-profile" element={<RiskProfile />} />
                    <Route path="triple-guard" element={<TripleGuard />} />
                    <Route path="quarterly-pulse" element={<QuarterlyPulse />} />
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
