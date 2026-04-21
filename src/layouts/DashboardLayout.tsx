import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, DollarSign, TrendingUp, Briefcase, Newspaper, GraduationCap, Bot, LogOut, Sparkles, User, Crown } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export default function DashboardLayout() {
  const isPremium = useAppStore((s) => s.isPremium);
  const togglePremium = useAppStore((s) => s.togglePremium);
  const [showPricingPopup, setShowPricingPopup] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [activatedMsg, setActivatedMsg] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('salary-pilot-storage');
    window.location.href = '/';
  };

  const handleActivatePremium = () => {
    togglePremium();
    setShowPricingPopup(false);
    setActivatedMsg(true);
    setTimeout(() => setActivatedMsg(false), 3000);
  };

  const premiumRoutes = ['/dashboard/quarterly-pulse', '/dashboard/learning', '/dashboard/ai-coach'];

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/dashboard/salary-splitting', icon: DollarSign, label: 'Salary Splitting' },
    { to: '/dashboard/quarterly-pulse', icon: TrendingUp, label: 'Quarterly Pulse' },
    { to: '/dashboard/portfolio', icon: Briefcase, label: 'Portfolio' },
    { to: '/dashboard/news', icon: Newspaper, label: 'News' },
    { to: '/dashboard/learning', icon: GraduationCap, label: 'Learning Hub' },
    { to: '/dashboard/ai-coach', icon: Bot, label: 'AI Coach' },
    { to: '/dashboard/profile', icon: User, label: 'Profile' },
  ];

  return (
    <div className="flex h-screen overflow-hidden relative">
      {/* Neon + warm opposite ambient blobs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Hard neon */}
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-[#00ff88]/[0.08] blur-[150px] animate-breathe" />
        <div className="absolute top-1/2 -left-48 w-[500px] h-[500px] rounded-full bg-[#ff0080]/[0.07] blur-[130px] animate-float-slow" />
        <div className="absolute -bottom-40 right-1/3 w-[500px] h-[500px] rounded-full bg-[#00c8ff]/[0.06] blur-[120px] animate-float-slower" />
        <div className="absolute top-1/4 left-1/3 w-[400px] h-[400px] rounded-full bg-[#ffaa00]/[0.05] blur-[100px] animate-float" />
        {/* Warm opposite (landing-style emerald/teal) */}
        <div className="absolute bottom-1/4 -left-20 w-[500px] h-[500px] rounded-full blur-[160px] animate-float-slower" style={{ background: 'rgba(16,185,129,0.05)' }} />
        <div className="absolute -top-20 left-1/2 w-[400px] h-[400px] rounded-full blur-[140px] animate-breathe" style={{ background: 'rgba(20,184,166,0.04)' }} />
      </div>

      {/* Sidebar — dark glass with neon edge */}
      <aside className="w-72 m-3 flex flex-col rounded-2xl overflow-hidden relative z-10" style={{
        background: 'rgba(10,14,26,0.85)',
        backdropFilter: 'blur(24px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
        border: '1px solid rgba(0,255,136,0.15)',
        boxShadow: '0 0 2px rgba(0,255,136,0.3), 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)'
      }}>
        <div className="p-6">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00ff88] to-[#00c8ff] flex items-center justify-center" style={{ boxShadow: '0 0 15px rgba(0,255,136,0.4)' }}>
              <Sparkles className="text-black" size={20} />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold text-white tracking-tight">SalaryPilot</h1>
              <p className="text-[10px] text-[#00ff88] font-medium tracking-widest uppercase" style={{ textShadow: '0 0 8px rgba(0,255,136,0.4)' }}>Financial Autopilot</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {navItems
            .filter((item) => isPremium || !premiumRoutes.includes(item.to))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/dashboard'}
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 text-sm relative ${isActive
                    ? 'text-[#00ff88] font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <div className="absolute inset-0 rounded-xl bg-[#00ff88]/[0.06] border border-[#00ff88]/20" />}
                    <div
                      className={`relative z-10 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isActive
                        ? 'bg-gradient-to-br from-[#00ff88] to-[#00c8ff] text-black' : 'bg-white/[0.04] text-slate-500 group-hover:bg-white/[0.08] group-hover:text-slate-300'}`}
                      style={isActive ? { boxShadow: '0 0 12px rgba(0,255,136,0.3)' } : {}}
                    >
                      <item.icon size={16} />
                    </div>
                    <span className="relative z-10 font-medium">{item.label}</span>
                    {isActive && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#00ff88] rounded-l-full" style={{ boxShadow: '0 0 8px rgba(0,255,136,0.5)' }} />}
                  </>
                )}
              </NavLink>
            ))}
        </nav>

        <div className="p-3 border-t border-[#00ff88]/10 space-y-0.5">
          <button onClick={() => isPremium ? togglePremium() : setShowPricingPopup(true)}
            className={`group flex items-center gap-3 px-3.5 py-2.5 w-full rounded-xl transition-all duration-200 text-sm ${isPremium
              ? 'text-[#ffaa00]'
              : 'text-slate-400 hover:text-[#ffaa00] hover:bg-[#ffaa00]/[0.05]'
              }`}
            style={isPremium ? { background: 'rgba(255,170,0,0.06)', border: '1px solid rgba(255,170,0,0.15)' } : {}}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isPremium
              ? 'bg-gradient-to-br from-[#ffaa00] to-[#ff6600] text-black' : 'bg-white/[0.04] group-hover:bg-[#ffaa00]/10'}`}
              style={isPremium ? { boxShadow: '0 0 12px rgba(255,170,0,0.3)' } : {}}>
              <Crown size={16} />
            </div>
            <span className="font-medium">Premium</span>
            <div className={`ml-auto w-9 h-5 rounded-full transition-all duration-300 relative ${isPremium ? 'bg-[#ffaa00]' : 'bg-white/10'}`} style={isPremium ? { boxShadow: '0 0 8px rgba(255,170,0,0.4)' } : {}}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-300 ${isPremium ? 'left-[18px]' : 'left-0.5'}`} />
            </div>
          </button>

          <button onClick={handleLogout}
            className="group flex items-center gap-3 px-3.5 py-2.5 w-full rounded-xl text-slate-500 hover:text-[#ff0080] hover:bg-[#ff0080]/[0.05] transition-all duration-200">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.04] group-hover:bg-[#ff0080]/10 transition-all">
              <LogOut size={16} />
            </div>
            <span className="text-sm font-medium">Reset & Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content — dark glass */}
      <main className="flex-1 relative z-10 m-3 ml-0 rounded-2xl overflow-hidden" style={{
        background: 'rgba(10,14,26,0.6)',
        backdropFilter: 'blur(20px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.3)',
        border: '1px solid rgba(0,255,136,0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02), 0 0 1px rgba(0,255,136,0.2)'
      }}>
        <div className="h-full overflow-y-auto">
          <Outlet />
        </div>
      </main>

      {/* ── Pricing Popup Modal ── */}
      {showPricingPopup && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowPricingPopup(false)}>
          <div className="bg-[#0a0e1a] rounded-2xl max-w-lg w-full mx-4 overflow-hidden border border-[#ffaa00]/15" onClick={e => e.stopPropagation()} style={{ boxShadow: '0 0 40px rgba(255,170,0,0.06)' }}>
            <div className="px-6 pt-6 pb-4 border-b border-[#ffaa00]/10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#ffaa00] to-[#ff6600] flex items-center justify-center mx-auto mb-3" style={{ boxShadow: '0 0 20px rgba(255,170,0,0.2)' }}><Crown className="text-black" size={22} /></div>
              <h3 className="text-xl font-bold text-white">Choose Your Plan</h3>
              <p className="text-slate-500 text-sm mt-1">Unlock AI Coach, Learning Hub & Quarterly Pulse</p>
            </div>
            <div className="px-6 py-5 grid grid-cols-2 gap-4">
              <button onClick={() => setSelectedPlan('monthly')} className={`relative rounded-xl p-5 text-left transition-all border-2 ${selectedPlan === 'monthly' ? 'border-[#00ff88]' : 'border-white/[0.06] hover:border-white/15'}`} style={selectedPlan === 'monthly' ? { background: 'rgba(0,255,136,0.04)', boxShadow: '0 0 15px rgba(0,255,136,0.06)' } : { background: 'rgba(255,255,255,0.02)' }}>
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">Monthly</p>
                <p className="text-2xl font-bold text-white">₹499<span className="text-sm font-normal text-slate-500">/mo</span></p>
                <p className="text-[10px] text-slate-500 mt-1">Billed monthly</p>
                {selectedPlan === 'monthly' && <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#00ff88] flex items-center justify-center" style={{ boxShadow: '0 0 8px rgba(0,255,136,0.4)' }}><svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></div>}
              </button>
              <button onClick={() => setSelectedPlan('yearly')} className={`relative rounded-xl p-5 text-left transition-all border-2 ${selectedPlan === 'yearly' ? 'border-[#ffaa00]' : 'border-white/[0.06] hover:border-white/15'}`} style={selectedPlan === 'yearly' ? { background: 'rgba(255,170,0,0.04)', boxShadow: '0 0 15px rgba(255,170,0,0.06)' } : { background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-center gap-2 mb-2"><p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Yearly</p><span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#ffaa00]/10 text-[#ffaa00] border border-[#ffaa00]/20">SAVE 16%</span></div>
                <p className="text-2xl font-bold text-white">₹4,999<span className="text-sm font-normal text-slate-500">/yr</span></p>
                <p className="text-[10px] text-slate-500 mt-1">₹416/mo · Billed yearly</p>
                {selectedPlan === 'yearly' && <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#ffaa00] flex items-center justify-center" style={{ boxShadow: '0 0 8px rgba(255,170,0,0.4)' }}><svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></div>}
              </button>
            </div>
            <div className="px-6 pb-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
                {['AI Wealth Coach — personalized advice', 'Learning Hub — financial education', 'Quarterly Pulse — staged investing', 'Priority Support — 24/7 chat'].map(f => (
                  <div key={f} className="flex items-center gap-2 text-sm text-slate-400"><div className="w-4 h-4 rounded-full bg-[#00ff88]/10 flex items-center justify-center flex-shrink-0"><svg className="w-2.5 h-2.5 text-[#00ff88]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></div>{f}</div>
                ))}
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowPricingPopup(false)} className="flex-1 glass-button-secondary py-3 rounded-xl text-sm font-semibold">Cancel</button>
              <button onClick={handleActivatePremium} className="flex-1 py-3 rounded-xl text-sm font-bold text-black transition-all hover:scale-[1.02]" style={{ background: selectedPlan === 'yearly' ? 'linear-gradient(135deg, #ffaa00, #ff6600)' : 'linear-gradient(135deg, #00ff88, #00c8ff)', boxShadow: selectedPlan === 'yearly' ? '0 0 15px rgba(255,170,0,0.3)' : '0 0 15px rgba(0,255,136,0.3)' }}>Continue — {selectedPlan === 'yearly' ? '₹4,999/yr' : '₹499/mo'}</button>
            </div>
          </div>
        </div>
      )}
      {activatedMsg && <div className="fixed bottom-8 right-8 px-6 py-4 rounded-xl text-sm text-black font-bold bg-gradient-to-r from-[#ffaa00] to-[#ff6600] z-50" style={{ boxShadow: '0 0 15px rgba(255,170,0,0.3)' }}>✓ Premium {selectedPlan === 'yearly' ? 'Yearly' : 'Monthly'} Plan Activated!</div>}
    </div>
  );
}
