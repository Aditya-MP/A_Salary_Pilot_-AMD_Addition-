import { useAppStore } from '../store/useAppStore';
import { TrendingUp, Shield, Leaf, Calendar, Wallet, Activity, Sparkles, ChevronRight, BarChart3, Target, Flame, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie, AreaChart, Area, CartesianGrid } from 'recharts';
import { useLivePrices, calculatePortfolioValue, BASE_PRICES } from '../hooks/useLivePrices';

export default function Dashboard() {
  const { holdings, streakCount, pulse, decisionLog } = useAppStore();
  const { prices, changes } = useLivePrices();
  const totalPortfolio = calculatePortfolioValue(holdings, prices);

  const liveEquity = Math.round((holdings.equity / BASE_PRICES.equity) * prices.equity);
  const liveCrypto = Math.round((holdings.crypto / BASE_PRICES.crypto) * prices.crypto);
  const liveEsg = Math.round((holdings.esg / BASE_PRICES.esg) * prices.esg);

  const sustainabilityScore = Math.min(100, streakCount * 5 + (liveEsg / totalPortfolio) * 50);

  const portfolioData = [
    { name: 'Equity', value: liveEquity, color: '#00ff88' },
    { name: 'Crypto', value: liveCrypto, color: '#ffaa00' },
    { name: 'ESG', value: liveEsg, color: '#00c8ff' },
  ];
  const performanceData = [
    { month: 'Jan', profit: 150, cumulative: 150 }, { month: 'Feb', profit: 280, cumulative: 430 },
    { month: 'Mar', profit: -120, cumulative: 310 }, { month: 'Apr', profit: 420, cumulative: 730 },
    { month: 'May', profit: 180, cumulative: 910 }, { month: 'Jun', profit: 650, cumulative: 1560 },
    { month: 'Jul', profit: -80, cumulative: 1480 }, { month: 'Aug', profit: 320, cumulative: 1800 },
    { month: 'Sep', profit: 510, cumulative: 2310 }, { month: 'Oct', profit: -200, cumulative: 2110 },
    { month: 'Nov', profit: 380, cumulative: 2490 }, { month: 'Dec', profit: 720, cumulative: 3210 },
  ];
  const totalReturn = performanceData.reduce((s, d) => s + d.profit, 0);
  const bestMonth = performanceData.reduce((best, d) => d.profit > best.profit ? d : best, performanceData[0]);
  const avgMonthly = Math.round(totalReturn / performanceData.length);
  const winRate = Math.round((performanceData.filter(d => d.profit > 0).length / performanceData.length) * 100);

  const tooltipStyle = { backgroundColor: 'rgba(10,14,26,0.95)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: '12px', color: '#fff', fontSize: '12px', boxShadow: '0 0 15px rgba(0,255,136,0.1)' };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-[#00ff88] via-[#00e077] to-[#00c8ff] p-6 lg:p-8" style={{ boxShadow: '0 0 30px rgba(0,255,136,0.2), 0 4px 20px rgba(0,0,0,0.3)' }}>
        <div className="flex items-center gap-2 mb-1"><Activity className="text-black/60" size={16} /><span className="text-black/70 text-xs font-bold tracking-wider uppercase">Live Dashboard</span></div>
        <h1 className="text-2xl lg:text-3xl font-bold text-black">Financial Control Center</h1>
        <p className="text-black/60 mt-1 text-sm font-medium">Your intelligent investment autopilot</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={TrendingUp} label="Total Portfolio" value={`₹${Math.round(totalPortfolio).toLocaleString()}`} color="green" trend={`${((totalPortfolio - (holdings.equity + holdings.crypto + holdings.esg)) / (holdings.equity + holdings.crypto + holdings.esg) * 100).toFixed(2)}%`} />
        <MetricCard icon={Shield} label="Discipline Streak" value={`${streakCount} months`} color="orange" trend="Active" />
        <MetricCard icon={Leaf} label="Sustainability" value={`${sustainabilityScore.toFixed(0)}%`} color="cyan" trend="+5%" />
        <MetricCard icon={Calendar} label="Pulse Status" value={`Month ${pulse.currentMonth}/3`} color="pink" trend={pulse.state} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="neon-card overflow-hidden">
          <div className="px-6 py-4 border-b border-[#00ff88]/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#00ff88]/10 flex items-center justify-center border border-[#00ff88]/20"><BarChart3 className="text-[#00ff88]" size={14} /></div>
              <div><h2 className="text-white font-semibold">Asset Allocation</h2><p className="text-[10px] text-slate-500">Portfolio distribution</p></div>
            </div>
            <Link to="/dashboard/portfolio" className="text-[10px] text-[#00ff88] hover:text-[#00ff88] font-medium flex items-center gap-1 transition-colors">View All <ChevronRight size={12} /></Link>
          </div>
          <div className="p-6">
            {totalPortfolio > 0 ? (
              <div className="flex flex-col items-center gap-5">
                <div className="relative w-[200px] h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={portfolioData} cx="50%" cy="50%" outerRadius={85} innerRadius={55} dataKey="value" strokeWidth={0} startAngle={90} endAngle={-270}>
                        {portfolioData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number | undefined) => [`₹${(v ?? 0).toLocaleString()}`, '']} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-[9px] text-slate-500 uppercase tracking-widest">Total</p>
                    <p className="text-lg font-bold text-white">₹{totalPortfolio.toLocaleString()}</p>
                    <p className="text-[10px] text-[#00ff88] font-medium" style={{ textShadow: '0 0 6px rgba(0,255,136,0.4)' }}>+12.5%</p>
                  </div>
                </div>
                <div className="w-full space-y-2.5">
                  {[
                    { name: 'Indian Equities', value: liveEquity, color: '#00ff88', border: 'border-[#00ff88]/20', bg: 'bg-[#00ff88]/5', change: changes.equity, changeUp: changes.equity >= 0 },
                    { name: 'Crypto Assets', value: liveCrypto, color: '#ffaa00', border: 'border-[#ffaa00]/20', bg: 'bg-[#ffaa00]/5', change: changes.crypto, changeUp: changes.crypto >= 0 },
                    { name: 'ESG Funds', value: liveEsg, color: '#00c8ff', border: 'border-[#00c8ff]/20', bg: 'bg-[#00c8ff]/5', change: changes.esg, changeUp: changes.esg >= 0 },
                  ].map(asset => {
                    const pct = totalPortfolio > 0 ? ((asset.value / totalPortfolio) * 100) : 0;
                    return (
                      <div key={asset.name} className={`flex items-center gap-3 p-3 rounded-xl ${asset.bg} border ${asset.border} hover:border-opacity-40 transition-all group`}>
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center border flex-shrink-0 ${asset.border} ${asset.bg}`}><div className="w-3 h-3 rounded-full" style={{ backgroundColor: asset.color, boxShadow: `0 0 8px ${asset.color}40` }} /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-white font-semibold">{asset.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400">{pct.toFixed(1)}%</span>
                              <span className="text-xs text-white font-bold">₹{asset.value.toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: asset.color, boxShadow: `0 0 6px ${asset.color}50` }} /></div>
                            <span className={`text-[10px] font-semibold ${asset.changeUp ? 'text-[#00ff88]' : 'text-[#ff0080]'}`}>{asset.changeUp ? '+' : ''}{asset.change.toFixed(2)}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : <div className="h-56 flex flex-col items-center justify-center text-slate-500"><Target className="mb-2 text-[#ffaa00]/40" size={32} /><p className="text-sm">No investments yet.</p></div>}
          </div>
        </div>

        <div className="neon-card overflow-hidden">
          <div className="px-6 py-4 border-b border-[#00ff88]/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#ffaa00]/10 flex items-center justify-center border border-[#ffaa00]/20"><TrendingUp className="text-[#ffaa00]" size={14} /></div>
              <div><h2 className="text-white font-semibold">Performance Trend</h2><p className="text-[10px] text-slate-500">12-month returns overview</p></div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#00ff88]/10 border border-[#00ff88]/20">
              <TrendingUp size={12} className="text-[#00ff88]" />
              <span className="text-[11px] text-[#00ff88] font-bold">+₹{totalReturn.toLocaleString()}</span>
            </div>
          </div>

          <div className="grid grid-cols-4 border-b border-[#00ff88]/10">
            {[
              { label: 'Total Return', value: `₹${totalReturn.toLocaleString()}`, icon: TrendingUp, color: 'text-[#00ff88]' },
              { label: 'Best Month', value: `${bestMonth.month} (₹${bestMonth.profit})`, icon: Trophy, color: 'text-[#ffaa00]' },
              { label: 'Avg Monthly', value: `₹${avgMonthly.toLocaleString()}`, icon: Flame, color: 'text-[#ff6600]' },
              { label: 'Win Rate', value: `${winRate}%`, icon: Target, color: 'text-[#00c8ff]' },
            ].map(stat => (
              <div key={stat.label} className="px-4 py-3 border-r border-[#00ff88]/10 last:border-r-0 hover:bg-white/[0.02] transition-all">
                <div className="flex items-center gap-1.5 mb-1"><stat.icon size={11} className={stat.color} /><span className="text-[9px] text-slate-500 uppercase tracking-wider">{stat.label}</span></div>
                <p className="text-xs text-white font-bold">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="p-6 pb-4">
            <div className="mb-5">
              <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider">Cumulative Growth</p>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={performanceData}>
                  <defs><linearGradient id="perfGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00ff88" stopOpacity={0.25} /><stop offset="100%" stopColor="#00ff88" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,255,136,0.06)" />
                  <XAxis dataKey="month" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number | undefined) => [`₹${(v ?? 0).toLocaleString()}`, 'Growth']} />
                  <Area type="monotone" dataKey="cumulative" stroke="#00ff88" strokeWidth={2} fill="url(#perfGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider">Monthly P&L</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={performanceData} barSize={14} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,255,136,0.06)" vertical={false} />
                  <XAxis dataKey="month" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number | undefined) => [`₹${(v ?? 0).toLocaleString()}`, 'P&L']} />
                  <Bar dataKey="profit" radius={[6, 6, 0, 0]}>{performanceData.map((e, i) => <Cell key={i} fill={e.profit >= 0 ? '#00ff88' : '#ff0080'} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* AI Insight */}
      <div className="neon-card p-6" style={{ borderColor: 'rgba(0,255,136,0.25)', boxShadow: '0 0 20px rgba(0,255,136,0.08), 0 4px 20px rgba(0,0,0,0.3)' }}>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00ff88] to-[#00c8ff] flex items-center justify-center shrink-0" style={{ boxShadow: '0 0 15px rgba(0,255,136,0.3)' }}>
            <Sparkles className="text-black" size={22} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold text-[#00ff88] uppercase tracking-widest" style={{ textShadow: '0 0 8px rgba(0,255,136,0.3)' }}>AI Insight</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff0080] animate-pulse" style={{ boxShadow: '0 0 6px rgba(255,0,128,0.5)' }} />
            </div>
            <p className="text-white font-semibold text-sm">Increase SIP by ₹500 to reach your goal 8 months faster</p>
            <p className="text-slate-500 text-xs mt-1">Based on your spending patterns and market conditions</p>
            <button className="neon-button mt-4 text-sm px-5 py-2.5">Apply Recommendation</button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="neon-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#00ff88]/10 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#ffaa00]/10 flex items-center justify-center border border-[#ffaa00]/20"><Sparkles className="text-[#ffaa00]" size={14} /></div>
          <h2 className="text-white font-semibold">Quick Actions</h2>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <ActionCard to="/dashboard/salary-splitting" label="Split Salary" desc="Configure allocation" icon={Wallet} color="from-[#00ff88] to-[#00c8ff]" />
          <ActionCard to="/dashboard/triple-guard" label="Approve Investment" desc="Triple Guard check" icon={Shield} color="from-[#ffaa00] to-[#ff6600]" />
          <ActionCard to="/dashboard/quarterly-pulse" label="Quarterly Pulse" desc="3-month strategy" icon={TrendingUp} color="from-[#ff0080] to-[#ff4da6]" />
        </div>
      </div>

      {/* Holdings */}
      <div className="neon-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#00ff88]/10 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#00c8ff]/10 flex items-center justify-center border border-[#00c8ff]/20"><Wallet className="text-[#00c8ff]" size={14} /></div>
          <h2 className="text-white font-semibold">Investment Holdings</h2>
        </div>
        <div className="p-4">
          {totalPortfolio > 0 ? (
            <div className="grid md:grid-cols-3 gap-3">
              <HoldingCard title="Indian Equities" color="#00ff88" items={[{ n: 'Reliance', v: liveEquity * 0.3 }, { n: 'TCS', v: liveEquity * 0.25 }, { n: 'HDFC Bank', v: liveEquity * 0.25 }, { n: 'Infosys', v: liveEquity * 0.2 }]} />
              <HoldingCard title="Crypto Assets" color="#ffaa00" items={[{ n: 'Bitcoin', v: liveCrypto * 0.6 }, { n: 'Ethereum', v: liveCrypto * 0.4 }]} />
              <HoldingCard title="ESG Funds" color="#00c8ff" items={[{ n: 'Nifty ESG Index', v: liveEsg * 0.5 }, { n: 'Green Bonds', v: liveEsg * 0.5 }]} />
            </div>
          ) : <p className="text-slate-500 text-center py-8 text-sm">No holdings yet.</p>}
        </div>
      </div>

      {/* Decisions */}
      <div className="neon-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#00ff88]/10 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#ff0080]/10 flex items-center justify-center border border-[#ff0080]/20"><Shield className="text-[#ff0080]" size={14} /></div>
          <h2 className="text-white font-semibold">Recent Decisions</h2>
        </div>
        <div className="p-4">
          {decisionLog.length > 0 ? <div className="space-y-2">{decisionLog.slice(0, 5).map((log, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-[#00ff88]/10 hover:border-[#00ff88]/20 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#ffaa00]/10 flex items-center justify-center text-[#ffaa00] text-xs font-bold border border-[#ffaa00]/20">{i + 1}</div>
                <div>
                  <span className="text-sm text-slate-300">{log.timestamp}</span>
                  <span className="ml-3 text-xs px-2 py-0.5 rounded-full bg-[#00c8ff]/10 text-[#00c8ff] font-medium border border-[#00c8ff]/20">{log.emotion}</span>
                  {log.hash && <span className="ml-2 text-[10px] text-slate-600 font-mono" title={log.hash}>Hash: {log.hash.substring(0, 10)}...</span>}
                </div>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20">{log.result}</span>
            </div>
          ))}</div> : <p className="text-slate-500 text-sm text-center py-6">No decisions logged yet.</p>}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color, trend }: { icon: any; label: string; value: string; color: string; trend: string }) {
  const c: Record<string, { grad: string; glow: string; text: string }> = {
    green: { grad: 'from-[#00ff88] to-[#00c8ff]', glow: '0 0 12px rgba(0,255,136,0.3)', text: 'text-[#00ff88]' },
    orange: { grad: 'from-[#ffaa00] to-[#ff6600]', glow: '0 0 12px rgba(255,170,0,0.3)', text: 'text-[#ffaa00]' },
    cyan: { grad: 'from-[#00c8ff] to-[#a855f7]', glow: '0 0 12px rgba(0,200,255,0.3)', text: 'text-[#00c8ff]' },
    pink: { grad: 'from-[#ff0080] to-[#ff4da6]', glow: '0 0 12px rgba(255,0,128,0.3)', text: 'text-[#ff0080]' },
  };
  const cfg = c[color] || c.green;
  return (
    <div className="neon-card p-5">
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cfg.grad} flex items-center justify-center mb-3`} style={{ boxShadow: cfg.glow }}><Icon className="text-black" size={18} /></div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-bold text-white mt-0.5">{value}</p>
      <p className={`text-xs ${cfg.text} font-semibold mt-1`} style={{ textShadow: `0 0 6px currentColor` }}>{trend}</p>
    </div>
  );
}

function ActionCard({ to, label, desc, icon: Icon, color }: { to: string; label: string; desc: string; icon: any; color: string }) {
  return (
    <Link to={to} className="group flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-[#00ff88]/10 hover:border-[#00ff88]/25 hover:bg-white/[0.04] transition-all duration-200">
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center`} style={{ boxShadow: '0 0 10px rgba(0,0,0,0.3)' }}><Icon className="text-black" size={18} /></div>
      <div className="flex-1"><p className="text-white font-semibold text-sm">{label}</p><p className="text-xs text-slate-500">{desc}</p></div>
      <ChevronRight className="text-slate-600 group-hover:text-[#00ff88] group-hover:translate-x-1 transition-all" size={18} />
    </Link>
  );
}

function HoldingCard({ title, color, items }: { title: string; color: string; items: { n: string; v: number }[] }) {
  return (
    <div className="rounded-xl p-4 border" style={{ borderColor: `${color}20`, background: `${color}08` }}>
      <p className="text-sm font-bold mb-3" style={{ color, textShadow: `0 0 8px ${color}40` }}>{title}</p>
      <div className="space-y-2">{items.map(i => <div key={i.n} className="flex items-center justify-between text-xs"><div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}60` }} /><span className="text-slate-400">{i.n}</span></div><span className="font-bold text-white">₹{i.v.toFixed(0)}</span></div>)}</div>
    </div>
  );
}
