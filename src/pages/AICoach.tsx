import { Bot, Scale, AlertTriangle, FileText, TrendingUp, Sparkles, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { getFinancialAdvice } from '../services/gemini';

export default function AICoach() {
  const [showPopup, setShowPopup] = useState(false);
  const [applied, setApplied] = useState(false);
  const [liveAdvice, setLiveAdvice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const agents: Array<{ name: string; icon: any; description: string; clr: string; insights: string[] }> = [
    { name: 'Tax Expert Agent', icon: Scale, description: 'Legal tax optimization suggestions', clr: '#00c8ff', insights: ['Consider ELSS funds for 80C deduction', 'Long-term capital gains tax optimization available', 'Tax-loss harvesting opportunity in crypto holdings'] },
    { name: 'Risk Alert Agent', icon: AlertTriangle, description: 'Monitor potential volatility', clr: '#ffaa00', insights: ['Tech sector showing increased volatility', 'Crypto market entering correction phase', 'Consider rebalancing to reduce risk exposure'] },
    { name: 'Market Rules Agent', icon: FileText, description: 'Regulatory change summaries', clr: '#ff0080', insights: ['New SEBI guidelines for mutual funds', 'Updated KYC requirements effective next month', 'Crypto taxation framework clarified'] },
    { name: 'Portfolio Planner', icon: TrendingUp, description: 'Next-month strategy recommendations', clr: '#00ff88', insights: ['Increase ESG allocation by 5% for better sustainability score', 'Market signals suggest strong entry point next month', 'Projected 1-2 year growth: 18-22% CAGR'] },
  ];

  const handleGetLiveAdvice = async () => {
    setLoading(true);
    const advice = await getFinancialAdvice("User has diverse portfolio with Indian Equity, Crypto, and ESG. Market is volatile.");
    setLiveAdvice(advice);
    setLoading(false);
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-[#a855f7] to-[#ff0080] p-6 lg:p-8" style={{ boxShadow: '0 0 30px rgba(168,85,247,0.15)' }}>
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-1"><Bot className="text-white/70" size={16} /><span className="text-white/70 text-xs font-bold tracking-wider uppercase">AI Agents</span></div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white">AI Coach Agents</h1>
            <p className="text-white/60 mt-1 text-sm font-medium">Advanced assistance for smarter decisions</p>
          </div>
          <button onClick={handleGetLiveAdvice} disabled={loading}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all backdrop-blur-sm border border-white/15">
            {loading ? <RefreshCw className="animate-spin" size={16} /> : <Sparkles size={16} />}
            {loading ? 'Analyzing...' : 'Get Live Insight'}
          </button>
        </div>
      </div>

      {liveAdvice && (
        <div className="neon-card p-6" style={{ borderColor: 'rgba(168,85,247,0.2)', boxShadow: '0 0 20px rgba(168,85,247,0.06)' }}>
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-[#a855f7]/10 border border-[#a855f7]/20" style={{ boxShadow: '0 0 10px rgba(168,85,247,0.15)' }}><Sparkles className="text-[#a855f7]" size={24} /></div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Live Gemini Insight</h3>
              <p className="text-slate-300 text-sm leading-relaxed">{liveAdvice}</p>
              <p className="text-[#a855f7]/60 text-[10px] mt-2 uppercase tracking-widest font-semibold">Powered by Google Gemini Pro</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {agents.map((agent, i) => (
          <div key={i} className="neon-card p-5" style={{ borderColor: `${agent.clr}15` }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-xl border" style={{ background: `${agent.clr}10`, borderColor: `${agent.clr}20`, boxShadow: `0 0 8px ${agent.clr}10` }}><agent.icon size={22} style={{ color: agent.clr }} /></div>
              <div><h3 className="text-white font-semibold">{agent.name}</h3><p className="text-xs text-slate-500">{agent.description}</p></div>
            </div>
            <div className="space-y-2">
              {agent.insights.map((insight, j) => (
                <div key={j} className="flex items-start gap-2 text-sm text-slate-400">
                  <Bot className="flex-shrink-0 mt-0.5" size={14} style={{ color: agent.clr }} />
                  <p>{insight}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="neon-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#00ff88]/10 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#00ff88]/10 flex items-center justify-center border border-[#00ff88]/20"><TrendingUp className="text-[#00ff88]" size={14} /></div>
          <h2 className="text-white font-semibold">Next Month Recommendation</h2>
        </div>
        <div className="p-6">
          <div className="rounded-xl p-6 border border-[#00ff88]/15" style={{ background: 'rgba(0,255,136,0.03)' }}>
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/20" style={{ boxShadow: '0 0 10px rgba(0,255,136,0.15)' }}><TrendingUp className="text-[#00ff88]" size={28} /></div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-2">Optimized Allocation Strategy</h3>
                <div className="space-y-1.5 text-sm text-slate-400">
                  <p>• Increase equity exposure to 45% (from 40%)</p>
                  <p>• Reduce crypto to 20% (from 25%) due to volatility</p>
                  <p>• Boost ESG to 25% (from 20%) for sustainability multiplier</p>
                  <p>• Maintain liquid funds at 10%</p>
                </div>
                <div className="mt-4 pt-4 border-t border-[#00ff88]/10">
                  <p className="text-sm text-slate-500">Projected Growth (1-2 years)</p>
                  <p className="text-2xl font-bold text-[#00ff88] mt-1" style={{ textShadow: '0 0 10px rgba(0,255,136,0.3)' }}>18-22% CAGR</p>
                </div>
                <button onClick={() => setShowPopup(true)} className="neon-button mt-4 text-sm px-6 py-2.5">Apply Recommendation</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="neon-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#00ff88]/10"><h2 className="text-white font-semibold">AI Processing Architecture</h2></div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl p-4 border border-[#00c8ff]/15" style={{ background: 'rgba(0,200,255,0.03)' }}><p className="font-semibold text-[#00c8ff] mb-2 text-sm" style={{ textShadow: '0 0 6px rgba(0,200,255,0.3)' }}>Cloud-Side Processing</p><p className="text-sm text-slate-400">Heavy market analysis, trend detection, and fundamental research executed on cloud infrastructure</p></div>
          <div className="rounded-xl p-4 border border-[#00ff88]/15" style={{ background: 'rgba(0,255,136,0.03)' }}><p className="font-semibold text-[#00ff88] mb-2 text-sm" style={{ textShadow: '0 0 6px rgba(0,255,136,0.3)' }}>Local Decision Control</p><p className="text-sm text-slate-400">Final approval and execution permissions remain with user, ensuring data sovereignty</p></div>
        </div>
      </div>

      {showPopup && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowPopup(false)}>
          <div className="bg-[#0a0e1a] rounded-2xl p-8 max-w-md mx-4 shadow-2xl border border-[#00ff88]/15" onClick={(e) => e.stopPropagation()} style={{ boxShadow: '0 0 30px rgba(0,255,136,0.05)' }}>
            <h3 className="text-2xl font-bold text-white mb-4">Confirm Strategy</h3>
            <div className="space-y-3 mb-6 text-sm text-slate-400">
              <div className="flex justify-between"><span>Equity:</span><span className="font-semibold text-[#00ff88]">45%</span></div>
              <div className="flex justify-between"><span>Crypto:</span><span className="font-semibold text-[#ffaa00]">20%</span></div>
              <div className="flex justify-between"><span>ESG:</span><span className="font-semibold text-[#00c8ff]">25%</span></div>
              <div className="flex justify-between"><span>Liquid:</span><span className="font-semibold text-[#ff0080]">10%</span></div>
              <div className="border-t border-[#00ff88]/10 pt-3 mt-3">
                <div className="flex justify-between"><span>AI Confidence:</span><span className="font-semibold text-[#00ff88]" style={{ textShadow: '0 0 6px rgba(0,255,136,0.3)' }}>87%</span></div>
                <div className="flex justify-between"><span>Risk Level:</span><span className="font-semibold text-white">Moderate</span></div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowPopup(false)} className="flex-1 glass-button-secondary py-3 rounded-xl text-sm font-semibold">Cancel</button>
              <button onClick={() => { setApplied(true); setShowPopup(false); setTimeout(() => setApplied(false), 3000); }} className="flex-1 neon-button py-3 rounded-xl text-sm">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {applied && <div className="fixed bottom-8 right-8 px-6 py-4 rounded-xl text-sm text-black font-bold bg-gradient-to-r from-[#00ff88] to-[#00c8ff]" style={{ boxShadow: '0 0 15px rgba(0,255,136,0.3)' }}>✓ Strategy applied for next month</div>}
    </div>
  );
}
