// Package engine holds the financial calculations, ported from the
// TypeScript in src/engine/. The frontend versions stay as the reference
// implementation until the golden tests are green in CI.
//
// EVERY AMOUNT IN THIS PACKAGE IS PAISE, AS int64.
// The TypeScript works in float rupees, which is fine for display but wrong
// for arithmetic: binary floating point cannot represent 0.1, so repeated
// addition drifts. The golden test compares against the TS output with a
// one-paisa tolerance precisely to catch where that drift already exists.
package engine

import (
	"math"
	"time"
)

type RiskType string

const (
	Conservative RiskType = "conservative"
	Balanced     RiskType = "balanced"
	Aggressive   RiskType = "aggressive"
)

type AssetClass string

const (
	Equity     AssetClass = "equity"
	Debt       AssetClass = "debt"
	Gold       AssetClass = "gold"
	Crypto     AssetClass = "crypto"
	ESG        AssetClass = "esg"
	Cash       AssetClass = "cash"
	Retirement AssetClass = "retirement"
)

type Holding struct {
	Ticker     string
	AssetClass AssetClass
	Units      float64
	Price      int64 // paise per unit
	// Days until this can become spendable cash. 9999 means locked.
	LiquidityDays int
}

type Expense struct {
	Label     string
	Monthly   int64
	Essential bool
}

type DebtItem struct {
	Balance    int64
	AnnualRate float64
	EMI        int64
	Deductible bool
}

type Profile struct {
	Age        int
	Dependents int
	Risk       RiskType
	Cash       int64
	Expenses   []Expense
	Subs       []int64 // monthly subscription amounts
	Debts      []DebtItem
	Holdings   []Holding
	TermCover  int64
	HealthCove int64
	InHand     int64
	AnnualBonu int64
	EPFEmp     int64
	EPFEmpr    int64
}

// haircut is what you would realistically realise on a forced sale, not the
// screen price. An emergency correlates with bad markets - layoffs cluster in
// downturns - so counting equity at par overstates the buffer exactly when it
// matters. Retirement assets are zero because they cannot be reached at all.
func haircut(c AssetClass) float64 {
	switch c {
	case Cash:
		return 1.00
	case Debt:
		return 0.99
	case Gold:
		return 0.96
	case Equity, ESG:
		return 0.85
	case Crypto:
		return 0.70
	case Retirement:
		return 0.00
	default:
		return 0.85
	}
}

func accessible(h Holding, withinDays int) int64 {
	if h.LiquidityDays > withinDays {
		return 0
	}
	value := float64(h.Units) * float64(h.Price)
	return int64(math.Round(value * haircut(h.AssetClass)))
}

type RunwayStatus string

const (
	StatusCritical RunwayStatus = "critical"
	StatusThin     RunwayStatus = "thin"
	StatusBuilding RunwayStatus = "building"
	StatusSafe     RunwayStatus = "safe"
)

type Runway struct {
	EssentialBurn     int64
	DiscretionaryBurn int64
	DebtService       int64
	TotalBurn         int64

	LiquidToday int64
	Liquid30d   int64
	Liquid1y    int64
	Locked      int64

	Months        float64
	MonthsLean    float64
	MonthsStretch float64

	Target  float64
	Gap     int64
	DryDate time.Time
	Status  RunwayStatus
}

func clamp(v, lo, hi float64) float64 {
	return math.Min(hi, math.Max(lo, v))
}

// ComputeRunway mirrors computeRunway() in src/engine/runwayEngine.ts.
func ComputeRunway(p Profile, now time.Time) Runway {
	var essentialExpenses, discretionaryExpenses int64
	for _, e := range p.Expenses {
		if e.Essential {
			essentialExpenses += e.Monthly
		} else {
			discretionaryExpenses += e.Monthly
		}
	}

	var subs int64
	for _, s := range p.Subs {
		subs += s
	}

	var debtService int64
	for _, d := range p.Debts {
		debtService += d.EMI
	}

	// Debt service is contractual, so it belongs on the essential line.
	// Treating an EMI as discretionary is how a runway number ends up
	// comfortably wrong.
	essentialBurn := essentialExpenses + debtService
	discretionaryBurn := discretionaryExpenses + subs

	liquidToday, liquid30d, liquid1y, locked := p.Cash, p.Cash, p.Cash, int64(0)
	for _, h := range p.Holdings {
		liquidToday += accessible(h, 1)
		liquid30d += accessible(h, 30)
		liquid1y += accessible(h, 365)
		if h.LiquidityDays > 365 {
			locked += int64(math.Round(h.Units * float64(h.Price)))
		}
	}

	var months, monthsLean, monthsStretch float64
	if essentialBurn > 0 {
		months = float64(liquidToday) / float64(essentialBurn)
		monthsLean = float64(liquidToday) / (float64(essentialBurn) * 0.92)
		monthsStretch = float64(liquid1y) / float64(essentialBurn)
	}

	// Baseline six months, plus half a month per dependent, capped at nine.
	// The generic "3 to 6 months" advice assumes a dual-income household with
	// nobody depending on it.
	target := clamp(6+float64(p.Dependents)*0.5, 6, 9)

	gap := int64(math.Max(0, target*float64(essentialBurn)-float64(liquidToday)))

	status := StatusSafe
	switch {
	case months < 1:
		status = StatusCritical
	case months < 3:
		status = StatusThin
	case months < target:
		status = StatusBuilding
	}

	return Runway{
		EssentialBurn:     essentialBurn,
		DiscretionaryBurn: discretionaryBurn,
		DebtService:       debtService,
		TotalBurn:         essentialBurn + discretionaryBurn,
		LiquidToday:       liquidToday,
		Liquid30d:         liquid30d,
		Liquid1y:          liquid1y,
		Locked:            locked,
		Months:            months,
		MonthsLean:        monthsLean,
		MonthsStretch:     monthsStretch,
		Target:            target,
		Gap:               gap,
		DryDate:           now.AddDate(0, 0, int(math.Round(months*30.44))),
		Status:            status,
	}
}

type Pillar struct {
	Key   string
	Label string
	Score float64
	Max   float64
	State string
}

type FreedomScore struct {
	Total          int
	Pillars        []Pillar
	NetWorth       int64
	FINumber       int64
	FIProgress     float64
	YearsToFreedom float64
	FreedomAge     float64
	Surplus        int64
	SavingsRate    float64
}

func pillarState(score, max float64) string {
	r := score / max
	switch {
	case r < 0.30:
		return "bad"
	case r < 0.55:
		return "weak"
	case r < 0.80:
		return "ok"
	default:
		return "good"
	}
}

// ComputeFreedomScore mirrors computeFreedomScore() in runwayEngine.ts.
func ComputeFreedomScore(p Profile, r Runway) FreedomScore {
	var grossAssets = p.Cash
	for _, h := range p.Holdings {
		grossAssets += int64(math.Round(h.Units * float64(h.Price)))
	}
	var totalDebt int64
	for _, d := range p.Debts {
		totalDebt += d.Balance
	}
	netWorth := grossAssets - totalDebt

	annualIncome := p.InHand*12 + p.AnnualBonu
	surplus := p.InHand - r.TotalBurn
	var savingsRate float64
	if p.InHand > 0 {
		savingsRate = float64(surplus) / float64(p.InHand)
	}

	runwayScore := clamp(r.Months/r.Target*30, 0, 30)

	// Debt is weighted by RATE, not balance. A small card at 42% is a bigger
	// emergency than a large education loan at 9.5%, and ranking by balance
	// gets that exactly backwards.
	var weightedDebt float64
	for _, d := range p.Debts {
		w := 1.0
		if d.Deductible {
			w = 0.5
		}
		weightedDebt += float64(d.Balance) * (d.AnnualRate / 0.42) * w
	}
	debtBurden := 1.0
	if annualIncome > 0 {
		debtBurden = weightedDebt / float64(annualIncome)
	}
	debtScore := clamp(20*(1-debtBurden/0.5), 0, 20)

	savingsScore := clamp(savingsRate/0.30*20, 0, 20)

	termNeeded := float64(annualIncome) * 10
	healthNeeded := 500000.0 * 100 // paise
	if p.Dependents > 0 {
		healthNeeded = 1000000.0 * 100
	}
	termRatio := clamp(float64(p.TermCover)/termNeeded, 0, 1)
	healthRatio := clamp(float64(p.HealthCove)/healthNeeded, 0, 1)
	protectionScore := termRatio*8 + healthRatio*7

	annualEssential := r.EssentialBurn * 12
	fiNumber := annualEssential * 25
	var fiProgress float64
	if fiNumber > 0 {
		fiProgress = clamp(float64(netWorth)/float64(fiNumber), 0, 1)
	}
	growthScore := fiProgress * 15

	pillars := []Pillar{
		{"runway", "Safety runway", runwayScore, 30, pillarState(runwayScore, 30)},
		{"debt", "Debt drag", debtScore, 20, pillarState(debtScore, 20)},
		{"savings", "Savings rate", savingsScore, 20, pillarState(savingsScore, 20)},
		{"protection", "Protection", protectionScore, 15, pillarState(protectionScore, 15)},
		{"growth", "Freedom progress", growthScore, 15, pillarState(growthScore, 15)},
	}

	total := 0.0
	for _, pl := range pillars {
		total += pl.Score
	}

	realReturn := 0.075
	switch p.Risk {
	case Aggressive:
		realReturn = 0.09
	case Conservative:
		realReturn = 0.06
	}
	monthlyInvest := math.Max(0, float64(surplus)) + float64(p.EPFEmpr) + float64(p.EPFEmp)
	years := yearsToTarget(float64(netWorth), monthlyInvest, realReturn, float64(fiNumber))

	return FreedomScore{
		Total:          int(math.Round(total)),
		Pillars:        pillars,
		NetWorth:       netWorth,
		FINumber:       fiNumber,
		FIProgress:     fiProgress,
		YearsToFreedom: years,
		FreedomAge:     float64(p.Age) + years,
		Surplus:        surplus,
		SavingsRate:    savingsRate,
	}
}

func yearsToTarget(current, monthly, annualReturn, target float64) float64 {
	if current >= target {
		return 0
	}
	if monthly <= 0 && current <= 0 {
		return 99
	}
	r := annualReturn / 12
	balance := current
	m := 0
	// Capped at 70 years so a hopeless case returns something displayable
	// rather than looping forever.
	for balance < target && m < 840 {
		balance = balance*(1+r) + monthly
		m++
	}
	return math.Round(float64(m)/12*10) / 10
}
