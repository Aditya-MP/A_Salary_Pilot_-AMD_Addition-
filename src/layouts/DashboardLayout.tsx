import { useState } from 'react';
import { Outlet, NavLink, useLocation, Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
    LayoutDashboard, Wallet, TrendingUp, Briefcase, Newspaper,
    GraduationCap, Bot, User, Crown, LogOut, PanelLeftClose, PanelLeft,
    Receipt, Menu, Activity, Wand2, PiggyBank, Sprout, LineChart,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import { useFinancials } from '../hooks/useFinancials';
import { PageTransition } from '../components/motion/PageTransition';
import { months } from '../lib/format';
import { cn } from '../lib/cn';
import { PricingModal } from '../components/PricingModal';
import { MarketBackground } from '../components/background/MarketBackground';

/* ═══════════════════════════════════════════════════════════════════
   App shell.

   Changes that matter:
   • Navigation is grouped into Plan / Grow / Learn instead of one flat
     list of nine items. A flat list forces the user to re-read every
     label each time; groups let them jump to a region.
   • Premium routes are no longer hidden from the sidebar. Hiding them
     meant a non-paying user could not discover the product's best
     features — they simply saw a shorter menu. They are now visible
     with a lock, and the pages themselves show a real preview.
   • The rail carries the live runway figure, so the one number that
     matters is on screen no matter which page you are on.
   ═══════════════════════════════════════════════════════════════════ */

const GROUPS: { title: string; items: { to: string; icon: React.ElementType; label: string; premium?: boolean }[] }[] = [
    {
        title: 'Plan',
        items: [
            { to: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
            { to: '/dashboard/salary-splitting', icon: Wallet, label: 'Salary Routing' },
            { to: '/dashboard/wallet', icon: PiggyBank, label: 'Wallet' },
            { to: '/dashboard/transactions', icon: Wand2, label: 'Transactions' },
            { to: '/dashboard/tax', icon: Receipt, label: 'Tax Centre' },
        ],
    },
    {
        title: 'Grow',
        items: [
            { to: '/dashboard/invest', icon: Sprout, label: 'Invest' },
            { to: '/dashboard/portfolio', icon: Briefcase, label: 'Portfolio' },
            { to: '/dashboard/screener', icon: LineChart, label: 'Screener' },
            { to: '/dashboard/quarterly-pulse', icon: TrendingUp, label: 'Quarterly Pulse', premium: true },
            { to: '/dashboard/news', icon: Newspaper, label: 'Market News' },
        ],
    },
    {
        title: 'Learn',
        items: [
            { to: '/dashboard/learning', icon: GraduationCap, label: 'Learning Hub', premium: true },
            { to: '/dashboard/ai-coach', icon: Bot, label: 'AI Coach', premium: true },
        ],
    },
];

export default function DashboardLayout() {
    const isPremium = useAppStore((s) => s.isPremium);
    const signOut = useAuthStore((s) => s.signOut);
    const user = useAuthStore((s) => s.user);
    const bgIntensity = useAppStore((s) => s.bgIntensity);
    const setBgIntensity = useAppStore((s) => s.setBgIntensity);
    const navigate = useNavigate();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [pricing, setPricing] = useState(false);
    const location = useLocation();
    const { runway } = useFinancials();

    // Signing out now revokes the refresh token server-side and unbinds
    // this user's storage namespace. It deliberately does not delete their
    // data — that stays under their key, waiting for them to come back.
    const handleLogout = async () => {
        await signOut();
        navigate('/');
    };

    const runwayTone =
        runway.status === 'critical' ? 'var(--loss)'
            : runway.status === 'thin' ? 'var(--warn)'
                : runway.status === 'building' ? 'var(--info)'
                    : 'var(--gain)';

    const rail = (
        <>
            {/* ─── Brand ─── */}
            <div className={cn('flex items-center gap-2.5 px-4 h-16 shrink-0', collapsed && 'justify-center px-0')}>
                <div
                    className="w-8 h-8 rounded-[10px] grid place-items-center shrink-0"
                    style={{ background: 'var(--accent)' }}
                >
                    <span className="font-display font-extrabold text-[15px]" style={{ color: 'var(--accent-ink)' }}>S</span>
                </div>
                {!collapsed && (
                    <div className="min-w-0">
                        <p className="font-display font-bold text-[15px] text-hi leading-tight">SalaryPilot</p>
                        <p className="text-[10px] text-faint leading-tight">Financial autopilot</p>
                    </div>
                )}
            </div>

            {/* ─── Runway readout: always visible, on every page ─── */}
            {!collapsed && (
                <Link
                    to="/dashboard"
                    className="mx-3 mb-3 p-3 rounded-[var(--r-md)] block surface-interactive"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}
                >
                    <p className="label mb-1.5">Your runway</p>
                    <p className="num text-xl font-semibold leading-none" style={{ color: runwayTone }}>
                        {months(runway.months)}
                    </p>
                    <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                        <div
                            className="h-full rounded-full transition-[width] duration-700 ease-smooth"
                            style={{
                                width: `${Math.min(100, (runway.months / runway.target) * 100)}%`,
                                background: runwayTone,
                            }}
                        />
                    </div>
                    <p className="text-[10.5px] text-faint mt-1.5">
                        Safe at {runway.target.toFixed(0)} months
                    </p>
                </Link>
            )}

            {/* ─── Navigation ─── */}
            <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-4">
                {GROUPS.map((group) => (
                    <div key={group.title}>
                        {!collapsed && <p className="label px-3 mb-1.5">{group.title}</p>}
                        <div className="space-y-0.5">
                            {group.items.map((item) => {
                                const locked = item.premium && !isPremium;
                                return (
                                    <NavLink
                                        key={item.to}
                                        to={item.to}
                                        end={item.to === '/dashboard'}
                                        onClick={() => setMobileOpen(false)}
                                        title={collapsed ? item.label : undefined}
                                        className={({ isActive }) =>
                                            cn(
                                                'group relative flex items-center gap-2.5 rounded-[var(--r-md)]',
                                                'px-3 py-2 text-[13px] font-medium transition-colors duration-150',
                                                collapsed && 'justify-center px-0',
                                                isActive
                                                    ? 'text-[var(--accent)]'
                                                    : 'text-lo hover:text-hi hover:bg-[var(--surface-2)]'
                                            )
                                        }
                                    >
                                        {({ isActive }) => (
                                            <>
                                                {isActive && (
                                                    <motion.span
                                                        layoutId="nav-active"
                                                        className="absolute inset-0 rounded-[var(--r-md)]"
                                                        style={{
                                                            background: 'var(--gain-dim)',
                                                            border: '1px solid rgba(0,232,134,0.2)',
                                                        }}
                                                        transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                                                    />
                                                )}
                                                <item.icon size={16} className="relative z-10 shrink-0" aria-hidden />
                                                {!collapsed && (
                                                    <>
                                                        <span className="relative z-10 truncate">{item.label}</span>
                                                        {locked && (
                                                            <Crown
                                                                size={11}
                                                                className="relative z-10 ml-auto shrink-0"
                                                                style={{ color: 'var(--warn)' }}
                                                                aria-label="Premium"
                                                            />
                                                        )}
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </NavLink>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {/* ─── Footer ─── */}
            <div className="p-2 border-t border-[var(--line-subtle)] space-y-0.5 shrink-0">
                {!isPremium && !collapsed && (
                    <button
                        onClick={() => setPricing(true)}
                        className="w-full text-left p-3 mb-1 rounded-[var(--r-md)] surface-interactive"
                        style={{ background: 'var(--warn-dim)', border: '1px solid rgba(255,176,32,0.2)' }}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <Crown size={13} style={{ color: 'var(--warn)' }} />
                            <span className="text-[12px] font-semibold" style={{ color: 'var(--warn)' }}>
                                Go Premium
                            </span>
                        </div>
                        <p className="text-[10.5px] text-lo leading-snug">
                            AI Coach, Learning Hub and Quarterly Pulse
                        </p>
                    </button>
                )}

                <NavLink
                    to="/dashboard/profile"
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                        cn(
                            'flex items-center gap-2.5 rounded-[var(--r-md)] px-3 py-2 text-[13px] font-medium transition-colors',
                            collapsed && 'justify-center px-0',
                            isActive ? 'text-[var(--accent)] bg-[var(--gain-dim)]' : 'text-lo hover:text-hi hover:bg-[var(--surface-2)]'
                        )
                    }
                >
                    <User size={16} className="shrink-0" aria-hidden />
                    {/* Whose data is on screen. With per-user storage this is
                        not decoration: on a shared machine it is the only way
                        to tell at a glance that you are looking at your own
                        numbers and not the last person's. */}
                    {!collapsed && (
                        <span className="min-w-0">
                            <span className="block truncate">{user?.name || 'Profile'}</span>
                            {user?.email && (
                                <span className="block text-[10.5px] text-faint truncate font-normal">
                                    {user.email}
                                </span>
                            )}
                        </span>
                    )}
                </NavLink>

                <button
                    onClick={handleLogout}
                    className={cn(
                        'w-full flex items-center gap-2.5 rounded-[var(--r-md)] px-3 py-2',
                        'text-[13px] font-medium text-lo hover:text-hi',
                        'hover:bg-[var(--surface-2)] transition-colors',
                        collapsed && 'justify-center px-0'
                    )}
                >
                    <LogOut size={16} className="shrink-0" aria-hidden />
                    {!collapsed && <span>Sign out</span>}
                </button>
            </div>
        </>
    );

    return (
        <div className="h-screen flex overflow-hidden" data-bg={bgIntensity}>
            <MarketBackground intensity={bgIntensity} />

            {/* ─── Desktop rail ─── */}
            <aside
                className="hidden lg:flex flex-col shrink-0 transition-[width] duration-300 ease-smooth"
                style={{
                    width: collapsed ? 'var(--rail-w-collapsed)' : 'var(--rail-w)',
                    background: bgIntensity === 'vivid' ? 'rgba(10,13,22,0.72)' : 'var(--bg-base)',
                    backdropFilter: bgIntensity === 'vivid' ? 'blur(18px)' : undefined,
                    borderRight: '1px solid var(--line-subtle)',
                }}
            >
                {rail}
            </aside>

            {/* ─── Mobile drawer ─── */}
            <AnimatePresence>
                {mobileOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setMobileOpen(false)}
                            className="lg:hidden fixed inset-0 z-40"
                            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
                        />
                        <motion.aside
                            initial={{ x: -280 }}
                            animate={{ x: 0 }}
                            exit={{ x: -280 }}
                            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
                            className="lg:hidden fixed inset-y-0 left-0 z-50 flex flex-col"
                            style={{
                                width: 'var(--rail-w)',
                                background: 'var(--bg-base)',
                                borderRight: '1px solid var(--line)',
                            }}
                        >
                            {rail}
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>

            {/* ─── Main ─── */}
            <div className="flex-1 flex flex-col min-w-0">
                <div
                    className="h-12 flex items-center gap-2 px-3 shrink-0"
                    style={{
                        borderBottom: '1px solid var(--line-subtle)',
                        background: bgIntensity === 'vivid' ? 'rgba(10,13,22,0.62)' : 'var(--bg-base)',
                        backdropFilter: bgIntensity === 'vivid' ? 'blur(18px)' : undefined,
                    }}
                >
                    <button
                        onClick={() => setMobileOpen(true)}
                        className="lg:hidden btn btn-ghost !px-2 !py-1.5"
                        aria-label="Open navigation"
                    >
                        <Menu size={17} />
                    </button>
                    <button
                        onClick={() => setCollapsed((c) => !c)}
                        className="hidden lg:flex btn btn-ghost !px-2 !py-1.5"
                        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {collapsed ? <PanelLeft size={17} /> : <PanelLeftClose size={17} />}
                    </button>

                    <div className="ml-auto flex items-center gap-3">
                        <span className="hidden md:flex items-center gap-1.5 text-[11px] text-faint">
                            <span className="live-dot" aria-hidden />
                            Live · prices update every 3s
                        </span>

                        {/* Background intensity. The tape is driven by the live
                            feed, so this is genuinely a display preference —
                            not a decoration toggle. */}
                        <div
                            className="hidden sm:flex items-center gap-0.5 p-0.5 rounded-[var(--r-sm)]"
                            style={{ background: 'var(--surface-3)', border: '1px solid var(--line-subtle)' }}
                            role="group"
                            aria-label="Market tape intensity"
                        >
                            <Activity size={12} className="mx-1.5 text-faint" aria-hidden />
                            {(['off', 'subtle', 'vivid'] as const).map((lvl) => (
                                <button
                                    key={lvl}
                                    onClick={() => setBgIntensity(lvl)}
                                    aria-pressed={bgIntensity === lvl}
                                    className="px-2 py-0.5 rounded-[6px] text-[10.5px] font-semibold capitalize transition-colors"
                                    style={
                                        bgIntensity === lvl
                                            ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
                                            : { color: 'var(--text-faint)' }
                                    }
                                >
                                    {lvl}
                                </button>
                            ))}
                        </div>
                        {isPremium && (
                            <span
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold"
                                style={{ color: 'var(--warn)', background: 'var(--warn-dim)', border: '1px solid rgba(255,176,32,0.22)' }}
                            >
                                <Crown size={10} /> Premium
                            </span>
                        )}
                    </div>
                </div>

                <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
                    <AnimatePresence mode="wait">
                        <PageTransition key={location.pathname}>
                            <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-page mx-auto min-w-0">
                                <Outlet />
                            </div>
                        </PageTransition>
                    </AnimatePresence>
                </main>
            </div>

            <PricingModal open={pricing} onClose={() => setPricing(false)} />
        </div>
    );
}
