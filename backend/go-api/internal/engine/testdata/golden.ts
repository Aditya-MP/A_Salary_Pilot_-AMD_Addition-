import { seedProfile } from '../../../../../src/domain/seed';
import { computeRunway, computeFreedomScore } from '../../../../../src/engine/runwayEngine';

const r = computeRunway(seedProfile);
const s = computeFreedomScore(seedProfile, r);

// Emitted in PAISE so the Go side, which is integer-only, can compare
// directly. Any drift shows up as a non-integer here.
const P = (v: number) => Math.round(v * 100);

console.log(JSON.stringify({
  runway: {
    essentialBurn: P(r.essentialBurn),
    discretionaryBurn: P(r.discretionaryBurn),
    debtService: P(r.debtService),
    totalBurn: P(r.totalBurn),
    liquidToday: P(r.liquidToday),
    liquid1y: P(r.liquid1y),
    locked: P(r.locked),
    months: r.months,
    target: r.target,
    gap: P(r.gap),
    status: r.status,
  },
  score: {
    total: s.total,
    netWorth: P(s.netWorth),
    fiNumber: P(s.fiNumber),
    fiProgress: s.fiProgress,
    yearsToFreedom: s.yearsToFreedom,
    surplus: P(s.surplus),
    savingsRate: s.savingsRate,
    pillars: s.pillars.map(p => ({ key: p.key, score: p.score, max: p.max, state: p.state })),
  },
}, null, 2));
