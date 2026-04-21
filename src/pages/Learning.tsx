import { useState } from 'react';
import { GraduationCap, BookOpen, MessageCircle, Send, Youtube } from 'lucide-react';

export default function Learning() {
  const [chatMessages, setChatMessages] = useState<any[]>([
    { type: 'bot', text: 'Hi! I can help you understand financial concepts. Ask me anything!' },
  ]);
  const [input, setInput] = useState('');

  const modules = [
    { title: 'What is Quarterly Pulse?', duration: '5 min', completed: false },
    { title: 'Why 15-second cooldown works?', duration: '8 min', completed: true },
    { title: 'How tax impacts compounding?', duration: '12 min', completed: false },
    { title: 'Understanding ESG investing', duration: '10 min', completed: false },
    { title: 'Crypto basics for beginners', duration: '15 min', completed: false },
    { title: 'Risk profiling explained', duration: '7 min', completed: true },
  ];

  const handleSend = () => {
    if (!input.trim()) return;
    setChatMessages([...chatMessages,
    { type: 'user', text: input },
    { type: 'bot', text: 'Great question! Quarterly Pulse reduces transaction frequency and emotional overtrading by staging investments over 3 months. This approach lowers fees and optimizes market entry timing.' }
    ]);
    setInput('');
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-[#ff0080] to-[#ff4da6] p-6 lg:p-8" style={{ boxShadow: '0 0 30px rgba(255,0,128,0.15)' }}>
        <div className="flex items-center gap-2 mb-1"><GraduationCap className="text-white/70" size={16} /><span className="text-white/70 text-xs font-bold tracking-wider uppercase">Education</span></div>
        <h1 className="text-2xl lg:text-3xl font-bold text-white">Learning Hub</h1>
        <p className="text-white/60 mt-1 text-sm font-medium">Master financial concepts at your own pace</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="neon-card overflow-hidden">
          <div className="px-6 py-4 border-b border-[#00c8ff]/10 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#00c8ff]/10 flex items-center justify-center border border-[#00c8ff]/20"><BookOpen className="text-[#00c8ff]" size={14} /></div>
            <h2 className="text-white font-semibold">Learning Modules</h2>
          </div>
          <div className="p-4 space-y-2">
            {modules.map((module, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-[#00ff88]/8 hover:border-[#00ff88]/20 hover:bg-white/[0.04] transition-all cursor-pointer">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${module.completed ? 'text-black' : 'bg-white/5 text-slate-500'}`}
                  style={module.completed ? { background: '#00ff88', boxShadow: '0 0 8px rgba(0,255,136,0.3)' } : {}}>
                  {module.completed ? '✓' : <GraduationCap size={14} />}
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium text-sm">{module.title}</p>
                  <p className="text-xs text-slate-500">{module.duration}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="neon-card overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-[#00ff88]/10 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#00ff88]/10 flex items-center justify-center border border-[#00ff88]/20"><MessageCircle className="text-[#00ff88]" size={14} /></div>
            <h2 className="text-white font-semibold">AI Learning Assistant</h2>
          </div>
          <div className="flex-1 p-4 overflow-y-auto max-h-96 space-y-3">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs px-4 py-3 rounded-2xl text-sm ${msg.type === 'user'
                  ? 'text-black rounded-br-md' : 'bg-white/[0.04] text-slate-300 border border-[#00ff88]/10 rounded-bl-md'}`}
                  style={msg.type === 'user' ? { background: 'linear-gradient(135deg, #00ff88, #00c8ff)', boxShadow: '0 0 10px rgba(0,255,136,0.2)' } : {}}>{msg.text}</div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-[#00ff88]/10 flex gap-2">
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask about financial concepts..."
              className="flex-1 bg-white/[0.03] border border-[#00ff88]/15 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-[#00ff88]/40 focus:ring-2 focus:ring-[#00ff88]/15" />
            <button onClick={handleSend} className="w-11 h-11 rounded-xl flex items-center justify-center text-black bg-gradient-to-r from-[#00ff88] to-[#00c8ff]" style={{ boxShadow: '0 0 12px rgba(0,255,136,0.3)' }}>
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="neon-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#ff0080]/10 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#ff0080]/10 flex items-center justify-center border border-[#ff0080]/20"><Youtube className="text-[#ff0080]" size={14} /></div>
          <h2 className="text-white font-semibold">Recommended Videos</h2>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { title: 'Understanding Market Volatility', channel: 'Finance Basics', views: '125K' },
            { title: 'Tax-Efficient Investing', channel: 'Money Matters', views: '89K' },
            { title: 'ESG Investing Guide', channel: 'Sustainable Finance', views: '67K' },
          ].map((v, i) => (
            <div key={i} className="bg-white/[0.02] border border-[#ff0080]/10 rounded-xl p-4 hover:border-[#ff0080]/25 hover:bg-white/[0.04] transition-all cursor-pointer">
              <div className="bg-[#ff0080]/5 rounded-lg h-32 mb-3 flex items-center justify-center border border-[#ff0080]/10">
                <Youtube className="text-[#ff0080]" size={48} />
              </div>
              <p className="text-white font-medium text-sm mb-1">{v.title}</p>
              <p className="text-xs text-slate-500">{v.channel} • {v.views} views</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
