export const mockHoldings = {
  equity: 45000,
  crypto: 15000,
  esg: 25000,
};

export const mockDecisionLog = [
  { timestamp: '10:42 AM', emotion: 'Fear', guardScore: 85, marketSignal: 'Bearish', result: 'Blocked', hash: '0x7f8a9d...2b1' },
  { timestamp: 'Yesterday', emotion: 'Greed', guardScore: 72, marketSignal: 'Bullish', result: 'Approved', hash: '0x3c4e1f...9a2' },
  { timestamp: '2d ago', emotion: 'Neutral', guardScore: 90, marketSignal: 'Stable', result: 'Approved', hash: '0x9b2a4c...8d3' },
  { timestamp: '3d ago', emotion: 'FOMO', guardScore: 45, marketSignal: 'Volatile', result: 'Blocked', hash: '0x1d5e8f...4c6' },
  { timestamp: '5d ago', emotion: 'Confident', guardScore: 88, marketSignal: 'Bullish', result: 'Approved', hash: '0x6a2b9d...1e5' },
];

export const mockNews = [
  {
    id: 1,
    title: 'Indian Markets Hit All-Time High',
    source: 'Economic Times',
    time: '2 hours ago',
    category: 'Market',
    sentiment: 'positive',
  },
  {
    id: 2,
    title: 'Bitcoin Surges Past $45,000',
    source: 'CoinDesk',
    time: '5 hours ago',
    category: 'Crypto',
    sentiment: 'positive',
  },
  {
    id: 3,
    title: 'ESG Funds See Record Inflows',
    source: 'Bloomberg',
    time: '1 day ago',
    category: 'ESG',
    sentiment: 'positive',
  },
  {
    id: 4,
    title: 'Fed Signals Rate Cut in Q2',
    source: 'Reuters',
    time: '1 day ago',
    category: 'Economy',
    sentiment: 'neutral',
  },
];

export const mockLearningModules = [
  {
    id: 1,
    title: 'Understanding Risk Management',
    duration: '15 min',
    progress: 75,
    category: 'Basics',
  },
  {
    id: 2,
    title: 'Crypto Investment Strategies',
    duration: '20 min',
    progress: 40,
    category: 'Advanced',
  },
  {
    id: 3,
    title: 'ESG Investing 101',
    duration: '12 min',
    progress: 100,
    category: 'Basics',
  },
  {
    id: 4,
    title: 'Tax Optimization Techniques',
    duration: '25 min',
    progress: 0,
    category: 'Advanced',
  },
];

export const mockPortfolioHistory = [
  { month: 'Jan', value: 65000, profit: 2500 },
  { month: 'Feb', value: 70000, profit: 5000 },
  { month: 'Mar', value: 68000, profit: -2000 },
  { month: 'Apr', value: 75000, profit: 7000 },
  { month: 'May', value: 80000, profit: 5000 },
  { month: 'Jun', value: 85000, profit: 5000 },
];

export const mockAIInsights = [
  {
    id: 1,
    type: 'opportunity',
    title: 'Strong Buy Signal Detected',
    description: 'AI analysis suggests favorable conditions for equity allocation',
    confidence: 87,
  },
  {
    id: 2,
    type: 'warning',
    title: 'High Volatility Expected',
    description: 'Crypto markets showing increased volatility patterns',
    confidence: 92,
  },
  {
    id: 3,
    type: 'info',
    title: 'Rebalancing Recommended',
    description: 'Portfolio drift detected, consider rebalancing',
    confidence: 78,
  },
];
