import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { Shield, Users, Award, CheckCircle, Zap, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { PageHeader } from '../components/primitives/PageHeader';

export default function TripleGuard() {
  const navigate = useNavigate();
  const { salary, split, streakCount, incrementStreak, addLog, setHoldings } = useAppStore();
  const [step, setStep] = useState<'emotion' | 'cooldown' | 'peer' | 'streak' | 'complete'>('emotion');
  const [emotion, setEmotion] = useState<'calm' | 'stressed' | 'excited' | null>(null);
  const [countdown, setCountdown] = useState(15);
  const investmentAmount = salary ? (salary * split.investments) / 100 : 0;

  const handleEmotionSelect = (selected: 'calm' | 'stressed' | 'excited') => {
    setEmotion(selected);
    if (selected === 'calm') { setStep('peer'); }
    else { setStep('cooldown'); let count = 15; const timer = setInterval(() => { count--; setCountdown(count); if (count === 0) { clearInterval(timer); setStep('peer'); } }, 1000); }
  };

  const handleFinalApproval = () => {
    incrementStreak();
    addLog({ emotion: emotion || 'calm', guardScore: 95, marketSignal: 'Strong', result: 'Executed' });
    setHoldings({ equity: investmentAmount * 0.4, crypto: investmentAmount * 0.25, esg: investmentAmount * 0.2 });
    setStep('complete');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <PageHeader
        eyebrow="Behavioural layer"
        title="Triple Guard"
        description="Three checks between an impulse and an irreversible transaction. Most investing losses are behavioural, not analytical."
      />

      <div className="flex items-center justify-center gap-3 py-2">
        <GuardStep active={step === 'emotion' || step === 'cooldown'} completed={step !== 'emotion' && step !== 'cooldown'} label="Emotional" />
        <div className={`h-0.5 w-10 rounded-full transition-all ${step !== 'emotion' && step !== 'cooldown' ? 'bg-[var(--accent)] shadow-[0_0_6px_rgba(0,232,134,0.5)]' : 'bg-white/10'}`} />
        <GuardStep active={step === 'peer'} completed={step === 'streak' || step === 'complete'} label="Peer" />
        <div className={`h-0.5 w-10 rounded-full transition-all ${step === 'streak' || step === 'complete' ? 'bg-[var(--loss)] shadow-[0_0_6px_rgba(255,77,109,0.5)]' : 'bg-white/10'}`} />
        <GuardStep active={step === 'streak'} completed={step === 'complete'} label="Streak" />
      </div>

      {step === 'emotion' && (
        <div className="surface overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--info)]/15 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--info)]/10 flex items-center justify-center border border-[var(--info)]/20"><Shield className="text-[var(--info)]" size={14} /></div>
            <h2 className="text-hi font-semibold">How are you feeling?</h2>
          </div>
          <div className="p-6 grid grid-cols-3 gap-4">
            <EmotionCard label="Calm" emoji="😌" desc="Clear minded" onClick={() => handleEmotionSelect('calm')} color="var(--accent)" />
            <EmotionCard label="Stressed" emoji="😰" desc="Under pressure" onClick={() => handleEmotionSelect('stressed')} color="var(--warn)" />
            <EmotionCard label="Excited" emoji="🤩" desc="FOMO active" onClick={() => handleEmotionSelect('excited')} color="var(--loss)" />
          </div>
        </div>
      )}

      {step === 'cooldown' && (
        <div className="rounded-2xl border border-[var(--warn)]/25 bg-[var(--warn)]/5 p-8 text-center space-y-4" style={{ boxShadow: '0 0 20px rgba(255,176,32,0.08)' }}>
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--warn)] to-[var(--warn)] mx-auto flex items-center justify-center" style={{ boxShadow: '0 0 20px rgba(255,176,32,0.3)' }}>
            <span className="text-3xl font-bold text-black">{countdown}</span>
          </div>
          <h2 className="text-2xl font-bold text-hi">Take a moment to reflect</h2>
          <p className="text-faint text-sm">This pause helps prevent emotional regret trades</p>
          <button onClick={() => navigate('/dashboard/salary-splitting')} className="btn btn-secondary text-sm">Cancel & Go Back</button>
        </div>
      )}

      {step === 'peer' && (
        <div className="surface overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--info)]/15 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--info)]/10 flex items-center justify-center border border-[var(--info)]/20"><Users className="text-[var(--info)]" size={14} /></div>
            <h2 className="text-hi font-semibold">Peer Benchmark</h2>
          </div>
          <div className="p-6 space-y-5">
            <div className="bg-[var(--info)]/5 border border-[var(--info)]/20 rounded-xl p-6 text-center" style={{ boxShadow: 'inset 0 0 20px rgba(56,189,248,0.03)' }}>
              <p className="text-5xl font-bold text-[var(--info)] mb-1" style={{ textShadow: '0 0 15px rgba(56,189,248,0.4)' }}>72%</p>
              <p className="text-lo text-sm">of disciplined investors held during similar volatility</p>
            </div>
            <button onClick={() => setStep('streak')} className="w-full btn btn-primary py-3.5 text-sm mt-2">Continue</button>
          </div>
        </div>
      )}

      {step === 'streak' && (
        <div className="surface overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--loss)]/15 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--loss)]/10 flex items-center justify-center border border-[var(--loss)]/20"><Award className="text-[var(--loss)]" size={14} /></div>
            <h2 className="text-hi font-semibold">Streak Protector</h2>
          </div>
          <div className="p-6 space-y-5">
            <div className="bg-[var(--warn)]/5 border border-[var(--warn)]/20 rounded-xl p-6 text-center" style={{ boxShadow: 'inset 0 0 20px rgba(255,176,32,0.03)' }}>
              <p className="text-4xl font-bold text-[var(--warn)] mb-1" style={{ textShadow: '0 0 15px rgba(255,176,32,0.4)' }}>🔥 Current Streak</p>
              <p className="text-2xl text-hi font-semibold">{streakCount} months</p>
              <p className="text-xs text-faint mt-2">Breaking this resets your sustainability multiplier</p>
            </div>
            <button onClick={handleFinalApproval} className="w-full btn btn-primary py-4 text-sm flex items-center justify-center gap-2">Confirm & Execute <Zap size={16} /></button>
          </div>
        </div>
      )}

      {step === 'complete' && <CompletionAnimation investmentAmount={investmentAmount} onDashboard={() => navigate('/dashboard')} />}
    </div>
  );
}

function GuardStep({ active, completed, label }: { active: boolean; completed: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${completed ? 'bg-gradient-to-br from-[var(--accent)] to-[var(--info)] border-[var(--accent)] text-black' : active ? 'bg-gradient-to-br from-[var(--warn)] to-[var(--warn)] border-[var(--warn)] text-black' : 'bg-white/5 border-white/10 text-faint'}`}
        style={completed ? { boxShadow: '0 0 12px rgba(0,232,134,0.3)' } : active ? { boxShadow: '0 0 12px rgba(255,176,32,0.3)' } : {}}>
        {completed && <CheckCircle size={18} />}
        {active && !completed && <div className="w-2.5 h-2.5 bg-black rounded-full animate-pulse" />}
      </div>
      <span className="text-[10px] text-faint mt-1.5 font-medium">{label}</span>
    </div>
  );
}

function EmotionCard({ label, emoji, desc, onClick, color }: { label: string; emoji: string; desc: string; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} className="border-2 hover:scale-[1.03] rounded-2xl p-5 transition-all duration-300 text-center" style={{ borderColor: `${color}25`, background: `${color}08` }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${color}50`; e.currentTarget.style.boxShadow = `0 0 15px ${color}15`; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${color}25`; e.currentTarget.style.boxShadow = 'none'; }}>
      <div className="text-4xl mb-2">{emoji}</div>
      <div className="text-sm font-bold text-hi">{label}</div>
      <div className="text-[10px] text-faint mt-1">{desc}</div>
    </button>
  );
}

/* ─── Asset node ───────────────────────────────────────────────────
   Hoisted out of CompletionAnimation. A component declared inside
   another component's body is a brand-new component type on every
   render, so React unmounts and remounts the entire subtree — which
   restarted these entrance animations mid-flight. */

type NodeColor = 'blue' | 'purple' | 'emerald';
interface NodeStyle { bg: string; border: string; text: string; dot: string; line: string }
interface NodeItem { name: string; amount: string; shares: string }

const NODE_LINE = { hidden: { scaleY: 0 }, visible: { scaleY: 1, transition: { duration: 0.4 } } };
const NODE_ITEM = { hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 200, damping: 20 } } };

const NODE_STYLES: Record<NodeColor, NodeStyle> = {
  blue: { bg: 'bg-[var(--accent)]/5', border: 'border-[var(--accent)]/20', text: 'text-[var(--accent)]', dot: 'bg-[var(--accent)]', line: 'bg-gradient-to-b from-[var(--accent)]/50 to-[var(--accent)]/10' },
  purple: { bg: 'bg-[var(--warn)]/5', border: 'border-[var(--warn)]/20', text: 'text-[var(--warn)]', dot: 'bg-[var(--warn)]', line: 'bg-gradient-to-b from-[var(--warn)]/50 to-[var(--warn)]/10' },
  emerald: { bg: 'bg-[var(--info)]/5', border: 'border-[var(--info)]/20', text: 'text-[var(--info)]', dot: 'bg-[var(--info)]', line: 'bg-gradient-to-b from-[var(--info)]/50 to-[var(--info)]/10' },
};

function AssetNode({ title, amount, color, delay, items }: {
  title: string; amount: number; color: NodeColor; delay: number; items: NodeItem[];
}) {
  const c = NODE_STYLES[color];
  return (
      <div className="flex flex-col items-center w-full">
        <div className="relative flex justify-center w-full h-8 overflow-hidden">
          <motion.div variants={NODE_LINE} className={`w-[2px] h-full origin-top ${c.line}`} style={{ willChange: "transform" }} />
          <motion.div animate={{ y: ["0%", "300%"], opacity: [0, 1, 0] }} transition={{ duration: 1.5, repeat: Infinity, delay, ease: "linear" }} className={`absolute top-0 w-2 h-4 rounded-full blur-[2px] ${c.dot}`} style={{ willChange: "transform, opacity" }} />
        </div>
        <motion.div variants={NODE_ITEM} className={`w-full rounded-xl border ${c.border} ${c.bg} p-2 sm:p-3 text-center relative overflow-hidden`} style={{ willChange: "transform, opacity" }}>
          <h3 className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${c.text} mb-1.5`}>{title}</h3>
          <p className="text-hi font-mono text-[10px] sm:text-xs font-semibold">₹{amount.toLocaleString()}</p>
        </motion.div>
        <div className="w-full flex flex-col items-center mt-2">
          {items.map((item, i) => (
            <div key={i} className="w-full flex flex-col items-center">
              <div className="relative flex justify-center w-full h-4 sm:h-6 overflow-hidden">
                <motion.div variants={NODE_LINE} className={`w-[1px] h-full origin-top ${c.line} opacity-50`} />
                <motion.div animate={{ y: ["0%", "300%"], opacity: [0, 1, 0] }} transition={{ duration: 1.5, repeat: Infinity, delay: delay + 0.2 + (i * 0.1), ease: "linear" }} className={`absolute top-0 w-1.5 h-3 rounded-full blur-[1px] ${c.dot}`} style={{ willChange: "transform, opacity" }} />
              </div>
              <motion.div variants={NODE_ITEM} className={`w-full rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5 sm:p-2 flex justify-between items-center hover:bg-white/[0.04] transition-all relative`} style={{ willChange: "transform, opacity" }}>
                <div className={`absolute left-0 top-0 bottom-0 w-[2px] ${c.dot} opacity-60 rounded-l-lg`} />
                <span className="text-[8px] sm:text-[9px] text-lo font-medium pl-1.5 truncate max-w-[60%]">{item.name}</span>
                <div className="text-right shrink-0"><div className={`text-[8px] sm:text-[9px] font-mono ${c.text}`}>{item.shares}</div><div className="text-[7px] text-faint">₹{item.amount}</div></div>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
  );
}

function CompletionAnimation({ investmentAmount, onDashboard }: { investmentAmount: number, onDashboard: () => void }) {
  const containerVariants = { hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1, transition: { duration: 0.4, staggerChildren: 0.1 } } };
  const itemVariants = NODE_ITEM;

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="rounded-3xl border border-[var(--accent)]/15 bg-[var(--surface-1)]/80 backdrop-blur-2xl p-6 sm:p-8 w-full max-w-3xl mx-auto overflow-hidden relative" style={{ boxShadow: '0 0 30px rgba(0,232,134,0.05), 0 20px 50px rgba(0,0,0,0.5)' }}>
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-[var(--info)]/8 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-[300px] h-[300px] bg-[var(--accent)]/8 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-[300px] h-[300px] bg-[var(--loss)]/6 rounded-full blur-[80px] pointer-events-none" />

      <motion.div variants={itemVariants} className="flex flex-col items-center text-center relative z-10 pt-2">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--info)] flex items-center justify-center p-[2px] mb-4 sm:mb-6" style={{ boxShadow: '0 0 25px rgba(0,232,134,0.3)' }}>
          <div className="w-full h-full rounded-full bg-[var(--surface-1)] flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[var(--accent)]/10 animate-pulse" />
            <CheckCircle className="text-[var(--accent)] w-8 h-8 sm:w-10 sm:h-10 relative z-10" />
          </div>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-hi tracking-tight">Investment Executed</h2>
        <p className="text-faint text-xs sm:text-sm mt-1 sm:mt-2">Capital dynamically routed to your portfolio.</p>
        <div className="mt-4 sm:mt-6 px-5 sm:px-6 py-2 sm:py-2.5 rounded-2xl border border-[var(--warn)]/25 bg-[var(--warn)]/5 text-[var(--warn)] font-mono text-lg sm:text-2xl font-bold flex flex-col items-center" style={{ textShadow: '0 0 10px rgba(255,176,32,0.3)' }}>
          <span className="text-[9px] sm:text-[10px] text-[var(--warn)]/60 font-sans uppercase tracking-widest mb-0.5">Total Deployed</span>
          ₹{investmentAmount.toLocaleString()}
        </div>
      </motion.div>

      <div className="mt-6 sm:mt-8 relative z-10">
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <AssetNode title="Equities" amount={investmentAmount * 0.4} color="blue" delay={0.6} items={[
            { name: "RELIANCE", amount: (investmentAmount * 0.4 * 0.3).toFixed(0), shares: ((investmentAmount * 0.4 * 0.3) / 2500).toFixed(2) },
            { name: "TCS", amount: (investmentAmount * 0.4 * 0.25).toFixed(0), shares: ((investmentAmount * 0.4 * 0.25) / 3800).toFixed(2) },
            { name: "HDFCBANK", amount: (investmentAmount * 0.4 * 0.25).toFixed(0), shares: ((investmentAmount * 0.4 * 0.25) / 1650).toFixed(2) },
            { name: "INFY", amount: (investmentAmount * 0.4 * 0.2).toFixed(0), shares: ((investmentAmount * 0.4 * 0.2) / 1450).toFixed(2) }
          ]} />
          <AssetNode title="Digital" amount={investmentAmount * 0.25} color="purple" delay={0.8} items={[
            { name: "BTC", amount: (investmentAmount * 0.25 * 0.6).toFixed(0), shares: ((investmentAmount * 0.25 * 0.6) / 3500000).toFixed(5) },
            { name: "ETH", amount: (investmentAmount * 0.25 * 0.4).toFixed(0), shares: ((investmentAmount * 0.25 * 0.4) / 250000).toFixed(4) }
          ]} />
          <AssetNode title="ESG Fund" amount={investmentAmount * 0.2} color="emerald" delay={1.0} items={[
            { name: "GRN-ETF", amount: (investmentAmount * 0.2).toFixed(0), shares: ((investmentAmount * 0.2) / 500).toFixed(2) }
          ]} />
        </div>
      </div>

      <motion.div variants={itemVariants} className="mt-8 sm:mt-10 relative z-10">
        <button onClick={onDashboard} className="w-full btn btn-secondary py-3 sm:py-4 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2">Return to Dashboard <ArrowRight size={16} /></button>
      </motion.div>
    </motion.div>
  );
}
