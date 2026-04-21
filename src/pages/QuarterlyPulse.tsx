import { useAppStore } from '../store/useAppStore';
import { Calendar, Clock, Target, Shield, TrendingUp, Landmark, Leaf, Bitcoin, IndianRupee } from 'lucide-react';
import { useState } from 'react';

export default function QuarterlyPulse() {
  const { pulse, salary, split, advancePulse } = useAppStore();
  const [showExecutePopup, setShowExecutePopup] = useState(false);
  const [executed, setExecuted] = useState(false);
  const [showMonthPopup, setShowMonthPopup] = useState(false);
  const monthlyInvestment = salary ? (salary * split.investments) / 100 : 0;

  const capital = pulse.stagedCapital;
  const taxAllocations = [
    { label: 'ELSS Mutual Funds', pct: 0.25, icon: Shield, clr: '#00ff88', taxNote: 'Sec 80C · ₹1.5L deduction · 3yr lock-in', taxSaving: true },
    { label: 'PPF Contribution', pct: 0.15, icon: Landmark, clr: '#00c8ff', taxNote: 'Sec 80C · Tax-free returns · EEE status', taxSaving: true },
    { label: 'Large Cap Equities', pct: 0.25, icon: TrendingUp, clr: '#ffaa00', taxNote: 'LTCG > ₹1.25L taxed @ 12.5%', taxSaving: false },
    { label: 'ESG / Green Bonds', pct: 0.15, icon: Leaf, clr: '#00ff88', taxNote: 'Sec 54EC eligible · Indexed gains', taxSaving: true },
    { label: 'Crypto (BTC/ETH)', pct: 0.10, icon: Bitcoin, clr: '#ff6600', taxNote: 'Flat 30% tax · 1% TDS on transfer', taxSaving: false },
    { label: 'NPS Tier-I', pct: 0.10, icon: IndianRupee, clr: '#ff0080', taxNote: 'Sec 80CCD(1B) · Extra ₹50K deduction', taxSaving: true },
  ];

  const totalTaxSavable = taxAllocations.filter(a => a.taxSaving).reduce((s, a) => s + capital * a.pct, 0);
  const estimatedTaxSaved = Math.round(totalTaxSavable * 0.312);

  const handleAdvanceMonth = () => { advancePulse(monthlyInvestment); setShowMonthPopup(true); setTimeout(() => setShowMonthPopup(false), 2000); };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-[#00c8ff] to-[#a855f7] p-6 lg:p-8" style={{ boxShadow: '0 0 30px rgba(0,200,255,0.15)' }}>
        <div className="flex items-center gap-2 mb-1"><Clock className="text-black/60" size={16} /><span className="text-black/70 text-xs font-bold tracking-wider uppercase">3-Month Strategy</span></div>
        <h1 className="text-2xl lg:text-3xl font-bold text-black">Quarterly Pulse</h1>
        <p className="text-black/60 mt-1 text-sm font-medium">Staged wealth accumulation strategy</p>
      </div>

      <div className="neon-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#00ff88]/10 flex justify-between items-center">
          <div><p className="text-xs text-slate-500">Status</p><p className="text-xl font-bold text-white capitalize">{pulse.state}</p></div>
          <div className="text-right"><p className="text-xs text-slate-500">Progress</p><p className="text-xl font-bold text-[#00c8ff]" style={{ textShadow: '0 0 8px rgba(0,200,255,0.4)' }}>{pulse.currentMonth} / 3</p></div>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map(m => (
              <div key={m} className={`p-4 rounded-xl border-2 text-center transition-all ${pulse.currentMonth >= m ? '' : 'border-white/[0.06] bg-white/[0.02]'}`}
                style={pulse.currentMonth >= m ? { borderColor: 'rgba(0,255,136,0.3)', background: 'rgba(0,255,136,0.05)', boxShadow: '0 0 10px rgba(0,255,136,0.05)' } : {}}>
                <Calendar className={`mx-auto mb-2 ${pulse.currentMonth >= m ? 'text-[#00ff88]' : 'text-slate-600'}`} size={22} />
                <p className={`font-semibold text-sm ${pulse.currentMonth >= m ? 'text-white' : 'text-slate-600'}`}>Month {m}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{m < 3 ? 'Accumulate' : 'Execute'}</p>
              </div>
            ))}
          </div>
          <div className="bg-white/[0.02] rounded-xl p-4 space-y-2 border border-[#00ff88]/10">
            <div className="flex justify-between text-sm"><span className="text-slate-400">Staged Capital</span><span className="font-bold text-white">₹{pulse.stagedCapital.toLocaleString()}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-400">Monthly Contribution</span><span className="font-semibold text-[#00c8ff]" style={{ textShadow: '0 0 6px rgba(0,200,255,0.3)' }}>₹{monthlyInvestment.toLocaleString()}</span></div>
          </div>
        </div>
      </div>

      <div className="neon-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#ff0080]/10 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#ff0080]/10 flex items-center justify-center border border-[#ff0080]/20"><Target className="text-[#ff0080]" size={14} /></div>
          <h3 className="text-white font-semibold">How It Works</h3>
        </div>
        <div className="p-5 space-y-3">
          {[
            { num: '01', text: 'Month 1 & 2: Capital accumulates in low-risk staging pool', clr: '#00c8ff' },
            { num: '02', text: 'Month 3: AI analyzes market and executes bulk investment', clr: '#00ff88' },
            { num: '03', text: 'Benefits: Lower fees, reduced emotional trading, optimal timing', clr: '#ff0080' },
          ].map(i => (
            <div key={i.num} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-black text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: i.clr, boxShadow: `0 0 8px ${i.clr}40` }}>{i.num}</div>
              <p className="text-sm text-slate-400 pt-0.5">{i.text}</p>
            </div>
          ))}
        </div>
      </div>

      {pulse.state !== 'strike' ? (
        <button onClick={handleAdvanceMonth} className="w-full neon-button py-4 rounded-2xl text-sm">Advance to Month {pulse.currentMonth + 1}</button>
      ) : (
        <button onClick={() => setShowExecutePopup(true)} className="w-full py-4 rounded-2xl font-bold text-sm text-black bg-gradient-to-r from-[#ffaa00] to-[#ff6600]" style={{ boxShadow: '0 0 20px rgba(255,170,0,0.3)' }}>Execute Bulk Investment</button>
      )}

      {showExecutePopup && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowExecutePopup(false)}>
          <div className="bg-[#0a0e1a] rounded-2xl max-w-lg w-full mx-4 shadow-2xl border border-[#00ff88]/15 overflow-hidden" onClick={(e) => e.stopPropagation()} style={{ boxShadow: '0 0 30px rgba(0,255,136,0.05)' }}>
            <div className="px-6 pt-6 pb-4 border-b border-[#00ff88]/10">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg bg-[#00ff88]/10 flex items-center justify-center border border-[#00ff88]/20"><Shield className="text-[#00ff88]" size={16} /></div>
                <div><h3 className="text-xl font-bold text-white">Execute Investment</h3><p className="text-[11px] text-slate-500">Tax-optimized allocation by AI</p></div>
              </div>
            </div>
            <div className="px-6 py-3 bg-white/[0.02] border-b border-[#00ff88]/10 flex justify-between items-center">
              <span className="text-sm text-slate-400">Staged Capital</span>
              <span className="text-lg font-bold text-[#ffaa00]" style={{ textShadow: '0 0 8px rgba(255,170,0,0.4)' }}>₹{capital.toLocaleString()}</span>
            </div>
            <div className="px-6 py-4 space-y-2.5 max-h-[340px] overflow-y-auto">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Where your money goes</p>
              {taxAllocations.map((item) => {
                const Icon = item.icon;
                const amount = capital * item.pct;
                return (
                  <div key={item.label} className="rounded-xl p-3 flex items-start gap-3 transition-all hover:scale-[1.01] border" style={{ borderColor: `${item.clr}15`, background: `${item.clr}06` }}>
                    <div className="flex-shrink-0 mt-0.5"><Icon size={16} style={{ color: item.clr }} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-white truncate">{item.label}</span>
                        <span className="text-sm font-bold text-white ml-2">₹{amount.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {item.taxSaving && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20">TAX SAVER</span>}
                        <span className="text-[10px] text-slate-500">{item.taxNote}</span>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 font-mono flex-shrink-0">{(item.pct * 100).toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
            <div className="mx-6 mb-4 mt-1 rounded-xl border border-[#00ff88]/15 p-3" style={{ background: 'rgba(0,255,136,0.04)' }}>
              <div className="flex justify-between items-center">
                <div><p className="text-[10px] text-[#00ff88]/70 uppercase tracking-wider font-semibold">Estimated Tax Saved</p><p className="text-xs text-slate-400 mt-0.5">Under Sec 80C, 80CCD & LTCG rules</p></div>
                <p className="text-xl font-bold text-[#00ff88]" style={{ textShadow: '0 0 10px rgba(0,255,136,0.3)' }}>₹{estimatedTaxSaved.toLocaleString()}</p>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowExecutePopup(false)} className="flex-1 glass-button-secondary py-3 rounded-xl text-sm font-semibold">Cancel</button>
              <button onClick={() => { setExecuted(true); setShowExecutePopup(false); setTimeout(() => setExecuted(false), 3000); }} className="flex-1 neon-button py-3 rounded-xl text-sm">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {showMonthPopup && <div className="fixed bottom-8 right-8 px-6 py-4 rounded-xl text-sm text-black font-bold bg-gradient-to-r from-[#00ff88] to-[#00c8ff]" style={{ boxShadow: '0 0 15px rgba(0,255,136,0.3)' }}>✓ Month {pulse.currentMonth} added</div>}
      {executed && <div className="fixed bottom-8 right-8 px-6 py-4 rounded-xl text-sm text-black font-bold bg-gradient-to-r from-[#ffaa00] to-[#ff6600]" style={{ boxShadow: '0 0 15px rgba(255,170,0,0.3)' }}>✓ Investment executed</div>}
    </div>
  );
}
