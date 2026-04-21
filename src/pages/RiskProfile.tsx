import { useAppStore } from '../store/useAppStore';
import { Shield, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { type RiskType } from '../types';

export default function RiskProfile() {
  const { risk, setRisk } = useAppStore();
  const navigate = useNavigate();

  const profiles: Array<{ id: RiskType; title: string; emoji: string; desc: string; color: string; traits: string[] }> = [
    { id: 'conservative', title: 'Conservative', emoji: '🛡️', desc: 'Capital preservation first', color: 'blue', traits: ['Low volatility', 'Stable returns', 'Bond-heavy'] },
    { id: 'balanced', title: 'Balanced', emoji: '⚖️', desc: 'Growth with stability', color: 'emerald', traits: ['Mixed allocation', 'Moderate risk', 'Diversified'] },
    { id: 'aggressive', title: 'Aggressive', emoji: '⚡', desc: 'Maximum growth potential', color: 'amber', traits: ['High growth', 'Equity-heavy', 'Volatile'] },
  ];

  const cardCfg: Record<string, string> = {
    blue: 'bg-blue-500/5 border-blue-500/20 hover:bg-blue-500/10',
    emerald: 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10',
    amber: 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10',
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 p-6 lg:p-8 shadow-lg shadow-blue-500/10">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1"><Shield className="text-white/70" size={16} /><span className="text-blue-200 text-xs font-semibold tracking-wider uppercase">Profile</span></div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white">Risk Profile</h1>
          <p className="text-blue-200/70 mt-1 text-sm">Define your investment personality</p>
        </div>
      </div>

      <div className="space-y-4">
        {profiles.map((p) => (
          <button key={p.id} onClick={() => setRisk(p.id)}
            className={`w-full ${cardCfg[p.color]} border-2 rounded-2xl p-6 text-left transition-all ${risk === p.id ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-[#0a0f1a] shadow-lg shadow-emerald-500/10' : 'hover:scale-[1.01]'}`}>
            <div className="flex items-start gap-4">
              <div className="text-4xl">{p.emoji}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">{p.title}</h3>
                  {risk === p.id && <CheckCircle className="text-emerald-400" size={18} />}
                </div>
                <p className="text-sm text-slate-500 mt-0.5">{p.desc}</p>
                <div className="flex gap-2 mt-3">
                  {p.traits.map((t) => (
                    <span key={t} className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-white/[0.05] text-slate-400 border border-white/[0.06]">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <button onClick={() => navigate('/dashboard/salary-splitting')}
        className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-4 rounded-2xl font-semibold hover:shadow-lg hover:shadow-emerald-500/20 transition-all text-sm">
        Save & Continue to Salary Split
      </button>
    </div>
  );
}
