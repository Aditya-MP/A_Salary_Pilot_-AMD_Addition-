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
import RiskProfile from './pages/RiskProfile';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import UserProfile from './pages/UserProfile';

function App() {
  const onboardingCompleted = useAppStore((s) => s.onboardingCompleted);
  const isPremium = useAppStore((s) => s.isPremium);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/signup" element={<AuthPage />} />

        {/* Protected Dashboard Routes */}
        <Route path="/dashboard" element={
          onboardingCompleted ? <DashboardLayout /> : <Navigate to="/login" replace />
        }>
          <Route index element={<Dashboard />} />
          <Route path="salary-splitting" element={<SalarySplitting />} />
          <Route path="risk-profile" element={<RiskProfile />} />
          <Route path="triple-guard" element={<TripleGuard />} />
          <Route path="quarterly-pulse" element={isPremium ? <QuarterlyPulse /> : <Navigate to="/dashboard/profile" replace />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="news" element={<News />} />
          <Route path="learning" element={isPremium ? <Learning /> : <Navigate to="/dashboard/profile" replace />} />
          <Route path="ai-coach" element={isPremium ? <AICoach /> : <Navigate to="/dashboard/profile" replace />} />
          <Route path="profile" element={<UserProfile />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
