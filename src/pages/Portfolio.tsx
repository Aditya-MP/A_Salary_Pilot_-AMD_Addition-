import { useAppStore } from '../store/useAppStore';
import { TrendingUp, TrendingDown, Briefcase, PieChart, BarChart3, Target } from 'lucide-react';
import { useLivePrices } from '../hooks/useLivePrices';

export default function Portfolio() {
  const { holdings, streakCount } = useAppStore();
  const { changes } = useLivePrices();
  const totalValue = holdings.equity + holdings.crypto + holdings.esg;
  const overallReturn = ((holdings.equity * changes.equity / 100) + (holdings.crypto * changes.crypto / 100) + (holdings.esg * changes.esg / 100)) / (totalValue || 1) * 100;

  const items = [
    { name: 'Indian Equities', value: holdings.equity, change: changes.equity, color: '#00ff88' },
    { name: 'Crypto Assets', value: holdings.crypto, change: changes.crypto, color: '#ffaa00' },
    { name: 'ESG Pools', value: holdings.esg, change: changes.esg, color: '#00c8ff' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-[#00c8ff] to-[#a855f7] p-6 lg:p-8" style={{ boxShadow: '0 0 30px rgba(0,200,255,0.15)' }}>
        <div className="flex items-center gap-2 mb-1"><Briefcase className="text-black/60" size={16} /><span className="text-black/70 text-xs font-bold tracking-wider uppercase">Holdings</span></div>
        <h1 className="text-2xl lg:text-3xl font-bold text-black">Portfolio</h1>
        <p className="text-black/60 mt-1 text-sm font-medium">Your investment holdings and performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: Briefcase, label: 'Total Portfolio', value: `₹${totalValue.toLocaleString()}`, color: '#00ff88', glow: '0 0 12px rgba(0,255,136,0.3)' },
          { icon: TrendingUp, label: 'Overall Return', value: `${overallReturn >= 0 ? '+' : ''}${overallReturn.toFixed(1)}%`, color: '#ffaa00', glow: '0 0 12px rgba(255,170,0,0.3)' },
          { icon: PieChart, label: 'Discipline Streak', value: `${streakCount} months`, color: '#ff0080', glow: '0 0 12px rgba(255,0,128,0.3)' },
        ].map(s => (
          <div key={s.label} className="neon-card p-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: `${s.color}15`, border: `1px solid ${s.color}30`, boxShadow: s.glow }}><s.icon size={18} style={{ color: s.color }} /></div>
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-xl font-bold text-white mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="neon-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#00ff88]/10 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#00ff88]/10 flex items-center justify-center border border-[#00ff88]/20"><BarChart3 className="text-[#00ff88]" size={14} /></div>
          <h2 className="text-white font-semibold">Holdings Breakdown</h2>
        </div>
        <div className="p-4 space-y-3">
          {items.map((item) => {
            const pct = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
            return (
              <div key={item.name} className="rounded-xl p-4 border transition-all hover:border-opacity-50" style={{ borderColor: `${item.color}20`, background: `${item.color}05` }}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-white font-semibold text-sm">{item.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold text-sm">₹{item.value.toLocaleString()}</span>
                    <span className={`text-xs flex items-center gap-0.5 font-semibold ${item.change >= 0 ? 'text-[#00ff88]' : 'text-[#ff0080]'}`}>
                      {item.change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(item.change)}%
                    </span>
                  </div>
                </div>
                <div className="h-2.5 bg-white/5 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: item.color, boxShadow: `0 0 8px ${item.color}50` }} /></div>
                <p className="text-[10px] text-slate-500 mt-1">{pct.toFixed(1)}% of portfolio</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="neon-card overflow-hidden">
          <div className="px-6 py-4 border-b border-[#ff0080]/10 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#ff0080]/10 flex items-center justify-center border border-[#ff0080]/20"><Target className="text-[#ff0080]" size={14} /></div>
            <h3 className="text-white font-semibold">Risk Exposure</h3>
          </div>
          <div className="p-5 space-y-4">
            {[{ l: 'High Risk', p: 30, c: '#ff0080' }, { l: 'Medium Risk', p: 45, c: '#ffaa00' }, { l: 'Low Risk', p: 25, c: '#00ff88' }].map(r => (
              <div key={r.l}>
                <div className="flex justify-between mb-1"><span className="text-sm text-slate-400 font-medium">{r.l}</span><span className="text-sm font-bold" style={{ color: r.c }}>{r.p}%</span></div>
                <div className="h-2.5 bg-white/5 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${r.p}%`, backgroundColor: r.c, boxShadow: `0 0 6px ${r.c}40` }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="neon-card overflow-hidden">
          <div className="px-6 py-4 border-b border-[#00ff88]/10 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#00ff88]/10 flex items-center justify-center border border-[#00ff88]/20"><TrendingUp className="text-[#00ff88]" size={14} /></div>
            <h3 className="text-white font-semibold">Performance</h3>
          </div>
          <div className="p-5 space-y-2">
            {[{ l: '1 Month', v: '+5.2%' }, { l: '3 Month', v: '+12.8%' }, { l: '6 Month', v: '+18.5%' }, { l: 'YTD', v: '+15.2%' }].map(m => (
              <div key={m.l} className="flex justify-between items-center p-3 rounded-xl hover:bg-white/[0.03] transition-all border border-transparent hover:border-[#00ff88]/10">
                <span className="text-sm text-slate-400">{m.l}</span>
                <span className="text-sm font-bold text-[#00ff88]" style={{ textShadow: '0 0 6px rgba(0,255,136,0.3)' }}>{m.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
