import type { Snapshot } from '../../engine/view';
import { COST_LABELS, pln, plnSigned } from '../format';

/** Wykresy w czystym SVG: gotówka (linia) i wynik dnia (słupki). */
export function CashChart({ snap }: { snap: Snapshot }) {
  const points = [...snap.days.map((d) => ({ cash: d.cash, profit: d.revenue - d.costs, label: d.day })), { cash: snap.cash, profit: snap.today.revenue - snap.today.costs, label: -1 }];
  const W = 420;
  const H = 200;
  const padL = 46;
  const padB = 18;
  const top = 10;
  const midH = 120; // linia gotówki
  const barTop = top + midH + 12;
  const barH = H - padB - barTop;

  const cashVals = points.map((p) => p.cash);
  let lo = Math.min(0, ...cashVals);
  let hi = Math.max(...cashVals);
  if (hi - lo < 1000) hi = lo + 1000;
  const n = points.length;
  const x = (i: number) => padL + (n <= 1 ? 0 : (i * (W - padL - 6)) / (n - 1));
  const y = (v: number) => top + midH - ((v - lo) / (hi - lo)) * midH;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.cash).toFixed(1)}`).join('');
  const area = `${line}L${x(n - 1)},${y(lo)}L${x(0)},${y(lo)}Z`;
  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.profit)));
  const bw = Math.max(2, Math.min(14, (W - padL) / Math.max(1, n) - 2));
  const zeroY = barTop + barH / 2;

  return (
    <section className="panel area-cash">
      <div className="panel-head">
        <span className="panel-title">Gotówka i wynik dzienny</span>
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          ostatnie {snap.days.length} dni
        </span>
      </div>
      <div className="panel-body chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Wykres gotówki">
          <line x1={padL} x2={W} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" strokeDasharray="3 3" />
          <text x={padL - 6} y={y(hi) + 4} textAnchor="end">
            {Math.round(hi / 1000)}k
          </text>
          <text x={padL - 6} y={y(lo) + 4} textAnchor="end">
            {Math.round(lo / 1000)}k
          </text>
          <path d={area} fill="var(--accent)" opacity={0.12} />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
          <circle cx={x(n - 1)} cy={y(snap.cash)} r={3.5} fill="var(--accent)" />
          <line x1={padL} x2={W} y1={zeroY} y2={zeroY} stroke="var(--line-strong)" />
          <text x={padL - 6} y={zeroY + 4} textAnchor="end">
            wynik
          </text>
          {points.map((p, i) => {
            const h = (Math.abs(p.profit) / maxAbs) * (barH / 2);
            return (
              <rect
                key={i}
                x={x(i) - bw / 2}
                y={p.profit >= 0 ? zeroY - h : zeroY}
                width={bw}
                height={Math.max(1, h)}
                fill={p.profit >= 0 ? 'var(--good)' : 'var(--bad)'}
                opacity={p.label === -1 ? 0.5 : 0.9}
              >
                <title>{`${p.label === -1 ? 'Dziś (w toku)' : `Dzień ${p.label + 1}`}: ${plnSigned(p.profit)}, gotówka ${pln(p.cash)}`}</title>
              </rect>
            );
          })}
        </svg>
        {snap.days.length === 0 && <div className="empty">Wykres zapełni się po pierwszej dobie gry.</div>}
      </div>
    </section>
  );
}

export function CostBreakdown({ snap }: { snap: Snapshot }) {
  const rows = Object.entries(snap.costsByCategory)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  const { revenue, costs } = snap.totals;
  return (
    <section className="panel area-costs">
      <div className="panel-head">
        <span className="panel-title">Struktura kosztów</span>
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          marża {revenue > 0 ? `${Math.round(((revenue - costs) / revenue) * 100)}%` : '—'}
        </span>
      </div>
      <div className="panel-body">
        {rows.length === 0 && <div className="empty">Jeszcze nic nie wydaliśmy. Podejrzane.</div>}
        {rows.map(([k, v]) => (
          <div className="cost-row" key={k}>
            <span>{COST_LABELS[k] ?? k}</span>
            <div className="track">
              <div style={{ width: `${(v / max) * 100}%` }} />
            </div>
            <span className="num" style={{ textAlign: 'right', fontSize: 12 }}>
              {pln(v)}
            </span>
          </div>
        ))}
        <div className="cost-row" style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 8 }}>
          <span className="muted">Przychody</span>
          <span />
          <span className="num good" style={{ textAlign: 'right', fontSize: 12 }}>
            {pln(revenue)}
          </span>
        </div>
        {snap.totals.penalties > 0 && (
          <div className="cost-row">
            <span className="muted">w tym kary</span>
            <span />
            <span className="num bad" style={{ textAlign: 'right', fontSize: 12 }}>
              −{pln(snap.totals.penalties)}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
