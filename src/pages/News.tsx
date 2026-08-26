import { Newspaper, Globe, TrendingUp, TrendingDown, Scale } from 'lucide-react';
import { useFinancials } from '../hooks/useFinancials';
import { PageHeader } from '../components/primitives/PageHeader';
import { Card, CardHead, CardBody } from '../components/primitives/Card';
import { Badge } from '../components/primitives/Badge';
import { Stagger, Item } from '../components/motion/Reveal';
import { money, pct } from '../lib/format';

/* ═══════════════════════════════════════════════════════════════════
   News.

   Reordered around one principle: a headline only matters to this user
   if it moves their money. So portfolio impact is expressed in rupees,
   not sentiment badges, and the regulatory items — which used to be a
   separate "Market Rules Agent" on the AI Coach page — live here,
   because that is what they are: news.
   ═══════════════════════════════════════════════════════════════════ */

const HEADLINES: Record<string, { title: string; source: string; ago: string }> = {
    equity: { title: 'Nifty holds near record as IT and banking lead gains', source: 'Economic Times', ago: '2h ago' },
    crypto: { title: 'Bitcoin swings on ETF flows; Ethereum lags the move', source: 'CoinDesk', ago: '4h ago' },
    gold: { title: 'Gold firms as rate-cut expectations build', source: 'Mint', ago: '6h ago' },
    esg: { title: 'ESG index funds see steady domestic inflows', source: 'Bloomberg', ago: '1d ago' },
    debt: { title: 'Corporate bond yields ease after RBI hold', source: 'Reuters', ago: '1d ago' },
};

const REGULATORY = [
    {
        title: 'RBI holds repo rate at 6.5% for the eleventh consecutive meeting',
        source: 'RBI',
        ago: '5h ago',
        why: 'Floating-rate EMIs stay where they are. Liquid fund yields hold around 6.5–7%.',
    },
    {
        title: 'SEBI tightens disclosure norms for small and mid-cap schemes',
        source: 'SEBI',
        ago: '1d ago',
        why: 'Expect stress-test data in your fund factsheets. Useful if you hold mid-cap exposure.',
    },
    {
        title: 'CBDT extends the employer investment-proof submission window',
        source: 'CBDT',
        ago: '2d ago',
        why: 'A little more time to fill your 80C and 80D headroom before TDS is finalised.',
    },
    {
        title: 'New NPS partial-withdrawal rules take effect',
        source: 'PFRDA',
        ago: '3d ago',
        why: 'Withdrawals now permitted for specified purposes after three years — still not an emergency fund.',
    },
];

export default function News() {
    const { portfolio, prices } = useFinancials();

    // Group live moves by asset class so the impact is expressed as
    // "this cost you ₹X today", not as an abstract percentage.
    const byClass = new Map<string, { value: number; pnlToday: number }>();
    portfolio.holdings.forEach((h) => {
        const cls = h.holding.assetClass;
        const changePct = prices.change[h.holding.ticker] ?? 0;
        const cur = byClass.get(cls) ?? { value: 0, pnlToday: 0 };
        byClass.set(cls, {
            value: cur.value + h.current,
            pnlToday: cur.pnlToday + (h.current * changePct) / 100,
        });
    });

    const impacts = Array.from(byClass.entries())
        .filter(([cls]) => HEADLINES[cls])
        .map(([cls, v]) => ({ cls, ...v, ...HEADLINES[cls] }))
        .sort((a, b) => Math.abs(b.pnlToday) - Math.abs(a.pnlToday));

    const netToday = impacts.reduce((s, i) => s + i.pnlToday, 0);

    return (
        <>
            <PageHeader
                eyebrow="Live feed"
                title="Market News"
                description="Filtered to what touches your holdings, and priced in rupees rather than sentiment."
                metric={{
                    label: 'Your move today',
                    value: money(netToday),
                    delta: pct((netToday / (portfolio.current || 1)) * 100, 2),
                    up: netToday >= 0,
                }}
            />

            <div className="grid lg:grid-cols-2 gap-5">
                <Card>
                    <CardHead
                        icon={Newspaper}
                        title="What moved your money"
                        subtitle="Only the classes you actually hold"
                        accent="var(--accent)"
                    />
                    <CardBody className="!p-0">
                        <Stagger>
                            {impacts.map((n, i) => {
                                const up = n.pnlToday >= 0;
                                return (
                                    <Item key={n.cls}>
                                        <div
                                            className="p-4"
                                            style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line-subtle)' }}
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="min-w-0">
                                                    <Badge tone="muted">{n.cls}</Badge>
                                                    <p className="text-[13.5px] font-medium text-hi mt-2 leading-snug">
                                                        {n.title}
                                                    </p>
                                                    <p className="text-[11px] text-faint mt-1.5">
                                                        {n.source} · {n.ago}
                                                    </p>
                                                </div>

                                                <div className="text-right shrink-0">
                                                    <div className="flex items-center gap-1 justify-end">
                                                        {up ? (
                                                            <TrendingUp size={13} style={{ color: 'var(--gain)' }} />
                                                        ) : (
                                                            <TrendingDown size={13} style={{ color: 'var(--loss)' }} />
                                                        )}
                                                        <p
                                                            className="num text-[15px] font-semibold"
                                                            style={{ color: up ? 'var(--gain)' : 'var(--loss)' }}
                                                        >
                                                            {money(n.pnlToday)}
                                                        </p>
                                                    </div>
                                                    <p className="text-[10.5px] text-faint mt-0.5">
                                                        on {money(n.value)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </Item>
                                );
                            })}
                        </Stagger>
                    </CardBody>
                </Card>

                <Card>
                    <CardHead
                        icon={Scale}
                        title="Rules and regulation"
                        subtitle="What each change actually means for you"
                        accent="var(--info)"
                    />
                    <CardBody className="!p-0">
                        <Stagger>
                            {REGULATORY.map((n, i) => (
                                <Item key={n.title}>
                                    <div
                                        className="p-4"
                                        style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line-subtle)' }}
                                    >
                                        <p className="text-[13.5px] font-medium text-hi leading-snug">{n.title}</p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <Badge tone="info">{n.source}</Badge>
                                            <span className="text-[10.5px] text-faint">{n.ago}</span>
                                        </div>
                                        <div
                                            className="mt-2.5 p-2.5 rounded-[var(--r-sm)]"
                                            style={{ background: 'var(--surface-3)' }}
                                        >
                                            <p className="text-[11.5px] text-lo leading-relaxed">
                                                <span className="text-faint">Why it matters: </span>
                                                {n.why}
                                            </p>
                                        </div>
                                    </div>
                                </Item>
                            ))}
                        </Stagger>
                    </CardBody>
                </Card>
            </div>

            <Card className="mt-5">
                <CardBody className="flex items-start gap-3">
                    <Globe size={15} className="mt-0.5 shrink-0 text-faint" />
                    <p className="text-[12px] text-faint leading-relaxed">
                        Headlines in this build are representative samples, not a live wire
                        feed — but the rupee impact beside each one is computed from your real
                        holdings and the live price feed. Wiring a news API in would only
                        change the left-hand column.
                    </p>
                </CardBody>
            </Card>
        </>
    );
}
