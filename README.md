# 💰 SalaryPilot — AI-Powered Wealth Management

> **AMD Pervasive AI Developer Contest (Slingshot) Submission**
> Intelligent salary routing, behavioral finance guardrails, and tax-optimized investing — powered by AI.

---

## 🎯 What is SalaryPilot?

SalaryPilot is a **next-generation personal finance platform** that transforms how salaried professionals manage, invest, and grow their wealth. Instead of manually budgeting and making emotional investment decisions, SalaryPilot uses **AI agents** to automate salary splitting, enforce behavioral guardrails, and optimize for tax efficiency.

### The Problem
- 78% of Indian millennials have no structured investment plan
- Emotional trading causes average investors to underperform by 4-6% annually  
- Tax-saving opportunities worth ₹1.5L+ are missed every year
- Manual budgeting fails within 3 months for most people

### Our Solution
An AI-first wealth dashboard that **automatically splits your salary**, protects you from emotional decisions via **Triple Guard**, stages investments via **Quarterly Pulse**, and provides **real-time AI coaching** — all in a stunning cyberpunk neon interface.

---

## ✨ Key Features

### 🤖 AI-Powered Salary Splitting
- **AI Mode**: Machine learning analyzes your income, expenses, and goals to recommend optimal splits across Investments, Needs, and Wants
- **Manual Mode**: Full slider control with real-time calculations
- **Risk Profiling**: Conservative, Balanced, or Aggressive allocation presets
- One-click **Approve Investment → Triple Guard** flow

### 🛡️ Triple Guard — Behavioral Finance Protection
A 3-step emotional firewall before any investment executes:
1. **Emotion Check** — 15-second cooldown timer to prevent impulsive decisions
2. **Peer Benchmark** — Compare your decision against community averages
3. **Streak Protection** — Maintain your discipline streak for better long-term returns

### 📊 Quarterly Pulse — Staged Investing
- Capital accumulates over 3 months in a low-risk staging pool
- AI analyzes market conditions and executes bulk investment at optimal timing
- **Tax-aware allocation** across ELSS, PPF, Large Cap, ESG, Crypto, and NPS
- Estimated tax savings displayed with Sec 80C/80CCD breakdown

### 🎓 Learning Hub (Premium)
- Bite-sized financial education modules (5-15 min each)
- **AI Learning Assistant** chatbot for Q&A on financial concepts
- Curated video recommendations

### 🧠 AI Coach Agents (Premium)
- **Tax Expert Agent** — Legal tax optimization suggestions
- **Risk Alert Agent** — Volatility monitoring and alerts
- **Market Rules Agent** — Regulatory change summaries
- **Portfolio Planner** — Next-month strategy with projected CAGR
- **Live Gemini Insight** — Real-time AI analysis powered by Google Gemini Pro

### 📈 Portfolio Dashboard
- Real-time holdings tracking (Indian Equities, Crypto, ESG)
- Live price simulation with market-like fluctuations
- Risk exposure breakdown and performance metrics (1M, 3M, 6M, YTD)

### 📰 Market News
- Portfolio-impact news with real-time P&L indicators
- Global financial news feed with source attribution

### 👤 User Profile & Premium
- KYC details management (PAN validation, bank accounts, UPI)
- **Premium Subscription Popup** — Monthly (₹499/mo) or Yearly (₹4,999/yr, save 16%)
- Feature gating for premium-only pages

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React 19 + TypeScript |
| **Build Tool** | Vite |
| **Styling** | Tailwind CSS + Custom Neon Dark Theme |
| **State Management** | Zustand (with localStorage persistence) |
| **Routing** | React Router v7 |
| **Charts** | Recharts |
| **Animations** | Framer Motion |
| **Icons** | Lucide React |
| **AI Integration** | Google Gemini Pro API |
| **Design System** | Custom glassmorphism + cyberpunk neon aesthetic |

---

## 🎨 Design Philosophy

SalaryPilot features a **bold cyberpunk neon dark theme** with:

- **Deep dark base** (`#0a0e1a`) with translucent glass panels
- **Neon accents**: Electric Green (`#00ff88`), Hot Pink (`#ff0080`), Cyan (`#00c8ff`), Amber (`#ffaa00`)
- **Ambient background blobs** — animated radial gradients that bleed through glassmorphic cards
- **Glowing borders and shadows** on every interactive element
- **Canvas-rendered node network** on the auth page with animated data streams
- **Warm emerald/teal undertones** mixed with hard neon for a balanced duotone aesthetic

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm

### Installation

```bash
# Clone the repository
git clone https://github.com/Aditya-MP/A_Salary_Pilot_-AMD_Addition-.git
cd A_Salary_Pilot_-AMD_Addition-

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Environment Variables (Optional)

For the AI Coach's live Gemini insight feature, create a `.env` file:

```env
VITE_GEMINI_API_KEY=your_google_gemini_api_key
```

> The app works fully without the API key — all other AI features use local computation.

### Build for Production

```bash
npm run build
npm run preview
```

---

## 📁 Project Structure

```
src/
├── components/
│   ├── landing/          # Landing page components (Background, UltraBackground)
│   ├── layout/           # Navbar
│   └── ui/               # Reusable UI (Button, GlassCard)
├── data/
│   └── mockData.ts       # Sample financial data
├── engine/               # Core AI/computation engines
│   ├── decisionEngine.ts # Investment decision logic
│   ├── guardEngine.ts    # Triple Guard behavioral checks
│   ├── pulseEngine.ts    # Quarterly Pulse staging logic
│   ├── sustainabilityEngine.ts # ESG scoring
│   ├── taxEngine.ts      # Tax optimization calculations
│   └── trendEngine.ts    # Market trend analysis
├── hooks/
│   └── useLivePrices.ts  # Real-time price simulation hook
├── layouts/
│   └── DashboardLayout.tsx # Sidebar + main content layout
├── pages/
│   ├── AICoach.tsx        # AI Coach agents (Premium)
│   ├── AuthPage.tsx       # Login / Sign-up
│   ├── Dashboard.tsx      # Main dashboard with metrics & charts
│   ├── LandingPage.tsx    # Public landing page
│   ├── Learning.tsx       # Learning Hub (Premium)
│   ├── News.tsx           # Market news feed
│   ├── Portfolio.tsx      # Holdings & performance
│   ├── QuarterlyPulse.tsx # Staged investment strategy (Premium)
│   ├── RiskProfile.tsx    # Risk assessment
│   ├── SalarySplitting.tsx# AI/Manual salary split + approve
│   ├── TripleGuard.tsx    # 3-step emotional firewall
│   └── UserProfile.tsx    # Profile, KYC, premium subscription
├── services/
│   └── gemini.ts          # Google Gemini API integration
├── store/
│   └── useAppStore.ts     # Zustand global state
├── types/
│   └── index.ts           # TypeScript type definitions
├── App.tsx                # Route definitions
├── index.css              # Global styles + neon theme
└── main.tsx               # Entry point
```

---

## 🔧 Core Engines

| Engine | Purpose |
|--------|---------|
| **Decision Engine** | Analyzes salary, risk profile, and market conditions to recommend optimal investment splits |
| **Guard Engine** | Implements the Triple Guard behavioral checks (emotion, peer, streak) |
| **Pulse Engine** | Manages the 3-month staged capital accumulation and bulk execution |
| **Tax Engine** | Calculates tax-saving opportunities under Sec 80C, 80CCD, LTCG rules |
| **Sustainability Engine** | Scores ESG investments and green bond allocations |
| **Trend Engine** | Analyzes market trends for timing recommendations |

---

## 🏆 AMD Slingshot Hackathon Highlights

### Why SalaryPilot?
- **Real-world AI application** — Not a toy demo; solves actual financial planning pain points
- **Multiple AI agents** working in concert (Tax, Risk, Rules, Planner)
- **Behavioral finance innovation** — Triple Guard is a novel approach to emotional investing protection
- **Tax optimization** — Automatically routes capital through 80C/80CCD-eligible instruments
- **Production-quality UI** — Cyberpunk neon dark theme with premium glassmorphism

### AMD AI Integration Points
- AI-powered salary split recommendations
- Multi-agent coaching system (Tax, Risk, Market, Portfolio)
- Real-time Gemini Pro integration for live market insights
- Behavioral pattern recognition for streak protection
- Tax-loss harvesting opportunity detection

---

## 📋 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (Vite) |
| `npm run build` | TypeScript check + production build |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |

---

## 🔒 Security & Compliance

- Bank-grade encryption (256-bit SSL)
- SEBI compliant investment recommendations
- PAN validation with format checking
- No sensitive data stored on external servers
- Local-first architecture with Zustand persistence

---

## 📄 License

This project is built for the **AMD Pervasive AI Developer Contest (Slingshot)**. 

---

## 👨‍💻 Author

**Aditya MP**  
- GitHub: [@Aditya-MP](https://github.com/Aditya-MP)

---

<p align="center">
  <strong>Built with ❤️ and AI for the AMD Slingshot Hackathon</strong><br/>
  <em>SalaryPilot — Smarter Finance. Effortless Control.</em>
</p>
