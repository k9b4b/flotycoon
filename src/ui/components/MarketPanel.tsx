import { formatDuration, formatGameTime } from '../../engine/time';
import type { Snapshot } from '../../engine/view';
import { city, km, pln, plnSigned } from '../format';
import type { MapPreview } from '../map/FleetMap';

export function MarketPanel({
  snap,
  truckId,
  onTruck,
  onAccept,
  onPreview,
  onShowOnMap,
}: {
  snap: Snapshot;
  truckId: string | null;
  onTruck: (id: string) => void;
  onAccept: (jobId: string, truckId: string) => void;
  onPreview: (p: MapPreview | null) => void;
  onShowOnMap: (p: MapPreview) => void;
}) {
  const free = snap.fleet.filter((t) => t.status === 'idle');
  const active = free.find((t) => t.truck.id === truckId) ?? free[0];
  const jobs = [...snap.market].sort((a, b) => {
    if (!active) return b.payment - a.payment;
    const pa = a.previews.find((p) => p.truckId === active.truck.id);
    const pb = b.previews.find((p) => p.truckId === active.truck.id);
    // Najpierw wykonalne na czas, potem zysk na godzinę.
    const score = (p?: (typeof a.previews)[number]) => (p ? (p.onTime && !p.tooFar ? 1e6 : 0) + p.profit / Math.max(60, p.durationMin) : 0);
    return score(pb) - score(pa);
  });

  return (
    <section className="panel area-market">
      <div className="panel-head">
        <span className="panel-title">Giełda Trans.eh</span>
        <span className="muted" style={{ fontSize: 12 }}>
          {snap.market.length} ofert
        </span>
        <span className="spacer" />
        {free.length > 0 ? (
          <select value={active?.truck.id} onChange={(e) => onTruck(e.target.value)} aria-label="Zestaw do wyceny">
            {free.map((t) => (
              <option key={t.truck.id} value={t.truck.id}>
                {t.driver.nickname} · {t.truck.plate} · {city(t.truck.cityId)}
              </option>
            ))}
          </select>
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>
            Wszyscy w trasie
          </span>
        )}
      </div>
      <div className="panel-body scroll">
        {jobs.length === 0 && <div className="empty">Giełda pusta. Spedytorzy poszli na kawę.</div>}
        {jobs.map((j) => {
          const p = active ? j.previews.find((x) => x.truckId === active.truck.id) : undefined;
          const timeLeft = j.deadline - snap.now;
          return (
            <div
              className="job"
              key={j.id}
              onMouseEnter={() => onPreview({ job: j, originId: active?.truck.cityId ?? j.fromId })}
              onMouseLeave={() => onPreview(null)}
              onClick={() => onPreview({ job: j, originId: active?.truck.cityId ?? j.fromId })}
            >
              <div>
                <div className="route">
                  {city(j.fromId)} → {city(j.toId)} <span className="muted num" style={{ fontSize: 12 }}>{km(j.km)}</span>
                </div>
                <div className="meta">
                  {j.cargo} · {j.weightT} t · {j.client}
                </div>
              </div>
              <div className="money">
                <div>{pln(j.payment)}</div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {(j.payment / j.km).toFixed(2)} zł/km
                </div>
              </div>
              <div className="calc">
                <span className="muted" title="Termin dostawy">
                  ⏱ do {formatGameTime(j.deadline)} ({formatDuration(timeLeft)})
                </span>
                {p && (
                  <>
                    {p.emptyKm > 0 && <span className="muted">dojazd {km(p.emptyKm)}</span>}
                    <span className="muted">ETA {formatGameTime(p.eta)}</span>
                    <span className={p.profit >= 0 ? 'good num' : 'bad num'} title={`Paliwo ${pln(p.fuelCost)}, myto ${pln(p.tollCost)}, bez zdarzeń losowych`}>
                      {plnSigned(p.profit)}
                    </span>
                    {p.tooFar ? (
                      <span className="badge bad">za daleko</span>
                    ) : !p.onTime ? (
                      <span className="badge bad">nie zdąży</span>
                    ) : (
                      <span className="badge good">na czas</span>
                    )}
                  </>
                )}
                <span style={{ flex: 1 }} />
                <button
                  className="btn small mobile-only"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowOnMap({ job: j, originId: active?.truck.cityId ?? j.fromId });
                  }}
                >
                  Na mapie
                </button>
                <button className="btn small primary" disabled={!p || p.tooFar} onClick={(e) => {
                    e.stopPropagation();
                    onPreview(null);
                    if (active) onAccept(j.id, active.truck.id);
                  }}>
                  Bierzemy
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
