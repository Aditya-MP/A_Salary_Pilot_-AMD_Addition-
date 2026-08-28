import { useEffect, useState } from 'react';
import {
    TrendingUp, TrendingDown, Info, AlertTriangle, CloudOff, Loader2,
    ExternalLink,
} from 'lucide-react';
import { PageHeader } from '../components/primitives/PageHeader';
import { Card, CardHead, CardBody } from '../components/primitives/Card';
import { Badge } from '../components/primitives/Badge';
import { Stat } from '../components/primitives/Stat';
import { getScreen, type ScreenerResponse } from '../lib/screener';
import { pct, share } from '../lib/format';

/* ═══════════════════════════════════════════════════════════════════
   Screener — M8, the real-data momentum/low-volatility ranking.

   WHAT THIS IS
   ------------
   A ranked view of REAL, currently-listed Nifty 500 companies, scored by
   a price-based factor model (12-month momentum excluding the most
   recent month, and trailing volatility). Both factors have decades of
   published, replicated research behind them — this is not invented.

   WHAT THIS IS NOT
   -----------------
   A recommendation to buy any specific company. There is no "buy" button
   on this page and there will not be one: everywhere else in this app,
   automatic investing goes into a diversified basket, never a single
   name, because concentrating money in one company is a risk this app
   is built to help people avoid, not add to. This page is research, not
   an order ticket — if the underlying evaluation ever gets wired into
   automatic execution, it will size in through the same diversified,
   capped-basket mechanism as everything else, never as isolated
   single-stock bets.

   RESPONSIBLE FOR ITS OWN HONESTY
   ---------------------------------
   The server tells this page whether the model is even enabled — it
   only ships if its own walk-forward test beat the real Nifty 500
   index. This page renders whichever answer comes back; it does not
   assume a "yes".
   ═══════════════════════════════════════════════════════════════════ */

export default function Screener() {
    const [data, setData] = useState<ScreenerResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [offline, setOffline] = useState(false);

    useEffect(() => {
        let alive = true;
        void (async () => {
            const res = await getScreen();
            if (!alive) return;
            if (res.ok) setData(res.data);
            else setOffline(res.offline);
            setLoading(false);
        })();
        return () => {
            alive = false;
        };
    }, []);

    if (loading) {
        return (
            <div>
                <PageHeader eyebrow="Screener" title="Company screener" />
                <div className="surface p-12 grid place-items-center">
                    <Loader2 size={22} className="animate-spin text-faint" />
                </div>
            </div>
        );
    }

    if (offline || !data) {
        return (
            <div>
                <PageHeader eyebrow="Screener" title="Company screener" />
                <Card>
                    <CardBody className="text-center py-12">
                        <CloudOff size={26} className="mx-auto mb-3 text-faint" />
                        <p className="text-[14px] text-hi font-semibold">The API is not running</p>
                    </CardBody>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Screener"
                title="Company screener"
                description="Real, currently-listed companies, ranked by real price history — not a promise about any of them."
            />

            {/* ─── the boundary, stated before anything else ─── */}
            <div
                className="flex items-start gap-2.5 p-3.5 rounded-[var(--r-md)]"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--line-subtle)' }}
            >
                <Info size={15} className="shrink-0 mt-px" style={{ color: 'var(--info)' }} />
                <p className="text-[12px] text-lo leading-relaxed">
                    This ranks companies by how their real price has behaved — nothing about
                    earnings, debt, or the business itself. There is no buy button here on
                    purpose: everywhere this app invests automatically, it spreads money across
                    dozens of holdings, never one company. This page is for looking, not ordering.
                </p>
            </div>

            {!data.enabled ? (
                <Card>
                    <CardBody className="py-10 text-center">
                        <AlertTriangle size={24} className="mx-auto mb-3" style={{ color: 'var(--warn)' }} />
                        <p className="text-[14px] font-semibold text-hi">Not enabled</p>
                        <p className="text-[12.5px] text-lo mt-2 max-w-md mx-auto leading-relaxed">
                            {data.reason}
                        </p>
                        {data.evaluation && (
                            <p className="text-[11.5px] text-faint mt-4">
                                Tested basket: {pct(data.evaluation.top_quintile.annual_return * 100)} / yr
                                vs the real index at {pct(data.evaluation.nifty500_index.annual_return * 100)} / yr —
                                {' '}it did not clear the bar.
                            </p>
                        )}
                    </CardBody>
                </Card>
            ) : (
                <>
                    <div className="grid gap-4 sm:grid-cols-4">
                        <Stat
                            label="Historical hit rate"
                            value={share(data.evaluation.hit_rate * 100)}
                            hint={`beat the index in ${Math.round(data.evaluation.hit_rate * data.evaluation.n_quarters_tested)} of ${data.evaluation.n_quarters_tested} quarters`}
                            icon={TrendingUp}
                            tone="accent"
                        />
                        <Stat
                            label="Basket (backtest)"
                            value={pct(data.evaluation.top_quintile.annual_return * 100)}
                            hint={`Sharpe ${data.evaluation.top_quintile.sharpe.toFixed(2)}`}
                        />
                        <Stat
                            label="Real Nifty 500"
                            value={pct(data.evaluation.nifty500_index.annual_return * 100)}
                            hint={`Sharpe ${data.evaluation.nifty500_index.sharpe.toFixed(2)}`}
                        />
                        <Stat
                            label="Universe"
                            value={String(data.universe_size)}
                            hint="real companies scored"
                        />
                    </div>

                    <div
                        className="flex items-start gap-2.5 p-3.5 rounded-[var(--r-md)]"
                        style={{ background: 'rgba(255,184,0,0.07)', border: '1px solid rgba(255,184,0,0.2)' }}
                    >
                        <AlertTriangle size={15} className="shrink-0 mt-px" style={{ color: 'var(--warn)' }} />
                        <p className="text-[12px] text-lo leading-relaxed">{data.caveat}</p>
                    </div>

                    <Card>
                        <CardHead
                            icon={TrendingUp}
                            title={`Top-ranked, as of ${data.as_of_date}`}
                            subtitle={data.data_source}
                            action={<Badge tone="neutral">{data.model_version}</Badge>}
                        />
                        <CardBody>
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12.5px]">
                                    <thead>
                                        <tr className="text-left">
                                            <th className="label pb-2 font-normal">Company</th>
                                            <th className="label pb-2 font-normal">Sector</th>
                                            <th className="label pb-2 font-normal text-right">12m momentum</th>
                                            <th className="label pb-2 font-normal text-right">Volatility</th>
                                            <th className="label pb-2 font-normal text-right">Score</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.picks.map((p) => (
                                            <tr key={p.ticker} className="border-t border-[var(--line-subtle)]">
                                                <td className="py-2.5">
                                                    <p className="text-hi font-medium">{p.name}</p>
                                                    <p className="text-[10.5px] text-faint">{p.ticker}</p>
                                                </td>
                                                <td className="py-2.5 text-faint">{p.industry}</td>
                                                <td
                                                    className="py-2.5 text-right tabular-nums font-medium"
                                                    style={{ color: p.momentum_12m_ex_1m >= 0 ? 'var(--gain)' : 'var(--loss)' }}
                                                >
                                                    <span className="inline-flex items-center gap-1 justify-end">
                                                        {p.momentum_12m_ex_1m >= 0
                                                            ? <TrendingUp size={11} />
                                                            : <TrendingDown size={11} />}
                                                        {pct(p.momentum_12m_ex_1m * 100)}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 text-right tabular-nums text-lo">
                                                    {pct(p.annualised_volatility * 100)}
                                                </td>
                                                <td className="py-2.5 text-right tabular-nums text-hi font-semibold">
                                                    {p.composite_score.toFixed(2)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardBody>
                    </Card>

                    <p className="text-[11px] text-faint flex items-center gap-1.5">
                        <ExternalLink size={11} />
                        NSE Nifty 500 constituent list and Yahoo Finance daily closes — both fetched
                        directly, no data invented for this page.
                    </p>
                </>
            )}
        </div>
    );
}
