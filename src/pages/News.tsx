import { Newspaper, TrendingUp, Globe } from 'lucide-react';
import { useLivePrices } from '../hooks/useLivePrices';

export default function News() {
  const { changes } = useLivePrices();
  const portfolioNews = [
    { title: 'Tech stocks rally on AI optimism', impact: `${changes.equity > 0 ? '+' : ''}${changes.equity.toFixed(1)}%`, type: changes.equity > 0 ? 'positive' : 'negative', category: 'Equities' },
    { title: 'Bitcoin volatility increases amid regulatory concerns', impact: `${changes.crypto > 0 ? '+' : ''}${changes.crypto.toFixed(1)}%`, type: changes.crypto > 0 ? 'positive' : 'negative', category: 'Crypto' },
    { title: 'ESG funds outperform traditional indices', impact: `${changes.esg > 0 ? '+' : ''}${changes.esg.toFixed(1)}%`, type: changes.esg > 0 ? 'positive' : 'negative', category: 'ESG' },
  ];
  const globalNews = [
    { title: 'SEBI introduces new mutual fund regulations', date: '2 hours ago', source: 'Economic Times' },
    { title: 'RBI maintains repo rate at 6.5%', date: '5 hours ago', source: 'Mint' },
    { title: 'New crypto tax guidelines announced', date: '1 day ago', source: 'Bloomberg' },
    { title: 'Green bonds see record issuance in Q1', date: '2 days ago', source: 'Reuters' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-[#ffaa00] to-[#ff6600] p-6 lg:p-8" style={{ boxShadow: '0 0 30px rgba(255,170,0,0.15)' }}>
        <div className="flex items-center gap-2 mb-1"><Newspaper className="text-black/60" size={16} /><span className="text-black/70 text-xs font-bold tracking-wider uppercase">Live Feed</span></div>
        <h1 className="text-2xl lg:text-3xl font-bold text-black">Market News</h1>
        <p className="text-black/60 mt-1 text-sm font-medium">Stay informed about your investments</p>
      </div>

      <div className="neon-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#00ff88]/10 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#00ff88]/10 flex items-center justify-center border border-[#00ff88]/20"><TrendingUp className="text-[#00ff88]" size={14} /></div>
          <h2 className="text-white font-semibold">Portfolio Impact News</h2>
        </div>
        <div className="p-4 space-y-2">
          {portfolioNews.map((news, i) => (
            <div key={i} className="p-4 rounded-xl border transition-all hover:scale-[1.01]" style={{
              borderColor: news.type === 'positive' ? 'rgba(0,255,136,0.2)' : 'rgba(255,0,128,0.2)',
              background: news.type === 'positive' ? 'rgba(0,255,136,0.04)' : 'rgba(255,0,128,0.04)',
              boxShadow: news.type === 'positive' ? '0 0 10px rgba(0,255,136,0.03)' : '0 0 10px rgba(255,0,128,0.03)',
            }}>
              <div className="flex justify-between items-start">
                <div><span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: '#ffaa00', textShadow: '0 0 6px rgba(255,170,0,0.3)' }}>{news.category}</span><p className="text-white font-medium text-sm mt-0.5">{news.title}</p></div>
                <div className="text-right ml-4"><p className="text-lg font-bold" style={{ color: news.type === 'positive' ? '#00ff88' : '#ff0080', textShadow: `0 0 8px ${news.type === 'positive' ? 'rgba(0,255,136,0.4)' : 'rgba(255,0,128,0.4)'}` }}>{news.impact}</p></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="neon-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#00c8ff]/10 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#00c8ff]/10 flex items-center justify-center border border-[#00c8ff]/20"><Globe className="text-[#00c8ff]" size={14} /></div>
          <h2 className="text-white font-semibold">Global Financial News</h2>
        </div>
        <div className="p-4 space-y-2">
          {globalNews.map((news, i) => (
            <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-[#00ff88]/15 hover:bg-white/[0.03] transition-all">
              <p className="text-white font-medium text-sm">{news.title}</p>
              <div className="flex gap-2 mt-1.5 text-[10px] text-slate-500">
                <span className="px-2 py-0.5 rounded-full bg-[#ffaa00]/10 font-semibold text-[#ffaa00] border border-[#ffaa00]/20">{news.source}</span>
                <span>{news.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
