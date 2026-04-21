import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { DollarSign, Sparkles, Sliders, Shield, TrendingUp, Coins, Wallet, ArrowRight } from 'lucide-react';

export default function SalarySplitting() {
  const { salary, risk, split, setSplit, setSalary, setRisk } = useAppStore();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');
  const [localSalary, setLocalSalary] = useState(salary || 100000);

  const profiles: Record<string, { needs: number; wants: number; investments: number }> = {
    conservative: { investments: 20, needs: 50, wants: 30 },
    balanced: { investments: 35, needs: 35, wants: 30 },
    aggressive: { investments: 50, needs: 25, wants: 25 },
  };
  const currentProfile = (risk && profiles[risk]) ? profiles[risk] : profiles.balanced;

  const handleApplyAI = () => { setSalary(localSalary); setSplit(currentProfile); navigate('/dashboard/triple-guard'); };
  const handleManualChange = (key: 'investments' | 'needs' | 'wants', val: number) => {
    const remainder = 100 - val; const half = Math.round(remainder / 2); const rest = remainder - half;
    let newSplit = { ...split }; newSplit[key] = val;
    if (key === 'investments') { newSplit.needs = half; newSplit.wants = rest; }
    else if (key === 'needs') { newSplit.investments = half; newSplit.wants = rest; }
    else { newSplit.investments = half; newSplit.needs = rest; }
    setSplit(newSplit);
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-[#00ff88] via-[#00e077] to-[#00c8ff] p-6 lg:p-8" style={{ boxShadow: '0 0 30px rgba(0,255,136,0.2), 0 4px 20px rgba(0,0,0,0.3)' }}>
        <div className="flex items-center gap-2 mb-1"><DollarSign className="text-black/60" size={16} /><span className="text-black/70 text-xs font-bold tracking-wider uppercase">AI Allocation</span></div>
        <h1 className="text-2xl lg:text-3xl font-bold text-black">Salary Splitting</h1>
        <p className="text-black/60 mt-1 text-sm font-medium">Optimize your income distribution</p>
      </div>

      <div className="neon-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#ffaa00]/15 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#ffaa00]/10 flex items-center justify-center border border-[#ffaa00]/20"><Wallet className="text-[#ffaa00]" size={14} /></div>
          <h2 className="text-white font-semibold">Monthly Salary</h2>
        </div>
        <div className="p-6">
          <input type="number" value={localSalary} onChange={(e) => setLocalSalary(Number(e.target.value))}
            className="w-full bg-white/[0.04] border border-[#00ff88]/20 rounded-xl px-4 py-3 text-white text-lg font-semibold focus:outline-none focus:border-[#00ff88]/50 focus:ring-2 focus:ring-[#00ff88]/20 placeholder-slate-600 transition-all" placeholder="Enter salary" />
        </div>
      </div>

      <div className="flex rounded-xl p-1 gap-1 bg-white/[0.03] border border-[#00ff88]/10">
        <button onClick={() => setMode('ai')} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-200 ${mode === 'ai' ? 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20' : 'text-slate-500 hover:text-slate-300'}`} style={mode === 'ai' ? { boxShadow: '0 0 10px rgba(0,255,136,0.1)' } : {}}><Sparkles size={16} /> AI Mode</button>
        <button onClick={() => setMode('manual')} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-200 ${mode === 'manual' ? 'bg-[#ffaa00]/10 text-[#ffaa00] border border-[#ffaa00]/20' : 'text-slate-500 hover:text-slate-300'}`} style={mode === 'manual' ? { boxShadow: '0 0 10px rgba(255,170,0,0.1)' } : {}}><Sliders size={16} /> Manual</button>
      </div>

      {mode === 'ai' ? (
        <div className="space-y-4">
          <div className="neon-card overflow-hidden">
            <div className="px-6 py-4 border-b border-[#ff0080]/15 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#ff0080]/10 flex items-center justify-center border border-[#ff0080]/20"><Shield className="text-[#ff0080]" size={14} /></div>
              <h2 className="text-white font-semibold">Risk Profile: <span className="text-[#00ff88] capitalize" style={{ textShadow: '0 0 8px rgba(0,255,136,0.3)' }}>{risk}</span></h2>
            </div>
            <div className="p-5 grid grid-cols-3 gap-3">
              {[
                { k: 'conservative' as const, emoji: '🛡️', desc: 'Safety first', clr: '#00c8ff' },
                { k: 'balanced' as const, emoji: '⚖️', desc: 'Best of both', clr: '#00ff88' },
                { k: 'aggressive' as const, emoji: '⚡', desc: 'Max growth', clr: '#ff0080' },
              ].map(p => (
                <div key={p.k} onClick={() => setRisk(p.k)} className={`text-center p-4 rounded-xl border transition-all cursor-pointer ${risk === p.k ? '' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10'}`}
                  style={risk === p.k ? { borderColor: `${p.clr}40`, background: `${p.clr}10`, boxShadow: `0 0 15px ${p.clr}15` } : {}}>
                  <div className="text-3xl mb-2">{p.emoji}</div>
                  <p className="text-white font-semibold text-sm capitalize">{p.k}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="neon-card overflow-hidden">
            <div className="px-6 py-4 border-b border-[#00ff88]/15 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#00ff88]/10 flex items-center justify-center border border-[#00ff88]/20"><TrendingUp className="text-[#00ff88]" size={14} /></div>
              <h2 className="text-white font-semibold">AI-Recommended Split</h2>
            </div>
            <div className="p-5 space-y-4">
              {[
                { label: 'Investments', value: currentProfile.investments, clr: '#00ff88', amount: localSalary * currentProfile.investments / 100 },
                { label: 'Needs', value: currentProfile.needs, clr: '#ffaa00', amount: localSalary * currentProfile.needs / 100 },
                { label: 'Wants', value: currentProfile.wants, clr: '#ff0080', amount: localSalary * currentProfile.wants / 100 },
              ].map(b => (
                <div key={b.label}>
                  <div className="flex justify-between mb-1.5"><span className="text-sm text-slate-400 font-medium">{b.label}</span><span className="text-sm text-white font-bold">{b.value}% <span className="text-slate-500 font-normal">· ₹{b.amount.toLocaleString()}</span></span></div>
                  <div className="h-3 bg-white/[0.04] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${b.value}%`, backgroundColor: b.clr, boxShadow: `0 0 8px ${b.clr}50` }} /></div>
                </div>
              ))}
            </div>
          </div>

          <button onClick={handleApplyAI} className="w-full neon-button py-4 rounded-2xl text-sm flex items-center justify-center gap-2">Approve Investment → Triple Guard <ArrowRight size={16} /></button>
        </div>
      ) : (
        <>
          <div className="neon-card overflow-hidden">
            <div className="px-6 py-4 border-b border-[#ffaa00]/15 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#ffaa00]/10 flex items-center justify-center border border-[#ffaa00]/20"><Sliders className="text-[#ffaa00]" size={14} /></div>
              <h2 className="text-white font-semibold">Manual Allocation</h2>
            </div>
            <div className="p-5 space-y-5">
              {[
                { key: 'investments' as const, label: 'Investments', clr: '#00ff88' },
                { key: 'needs' as const, label: 'Needs', clr: '#ffaa00' },
                { key: 'wants' as const, label: 'Wants', clr: '#ff0080' },
              ].map(s => (
                <div key={s.key}>
                  <div className="flex justify-between mb-1.5"><span className="text-sm text-slate-400">{s.label}</span><span className="text-sm font-bold" style={{ color: s.clr }}>{split[s.key]}%</span></div>
                  <input type="range" min="0" max="100" value={split[s.key]} onChange={(e) => handleManualChange(s.key, Number(e.target.value))} className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-white/5" style={{ accentColor: s.clr }} />
                </div>
              ))}
            </div>
          </div>
          <button onClick={handleApplyAI} className="w-full neon-button py-4 rounded-2xl text-sm flex items-center justify-center gap-2">Approve Investment → Triple Guard <ArrowRight size={16} /></button>
        </>
      )}

      <div className="neon-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#00c8ff]/15 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#00c8ff]/10 flex items-center justify-center border border-[#00c8ff]/20"><Coins className="text-[#00c8ff]" size={14} /></div>
          <h2 className="text-white font-semibold">Where Your Money Goes</h2>
        </div>
        <div className="p-4 grid grid-cols-3 gap-3">
          {[
            { name: 'Equities', emoji: '📈', value: `₹${(localSalary * (split.investments || 0) / 100 * 0.4).toFixed(0)}`, clr: '#00ff88' },
            { name: 'Crypto', emoji: '₿', value: `₹${(localSalary * (split.investments || 0) / 100 * 0.25).toFixed(0)}`, clr: '#ffaa00' },
            { name: 'ESG', emoji: '🌱', value: `₹${(localSalary * (split.investments || 0) / 100 * 0.2).toFixed(0)}`, clr: '#00c8ff' },
          ].map(a => (
            <div key={a.name} className="rounded-xl p-4 text-center border transition-all hover:scale-[1.02]" style={{ borderColor: `${a.clr}25`, background: `${a.clr}08`, boxShadow: `0 0 10px ${a.clr}08` }}>
              <div className="text-2xl mb-2">{a.emoji}</div>
              <p className="font-bold text-sm text-white">{a.name}</p>
              <p className="text-xs mt-1 font-semibold" style={{ color: a.clr }}>{a.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
