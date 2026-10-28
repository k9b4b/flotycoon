import { useState } from 'react';
import { formatDuration, formatGameTime } from '../../engine/time';
import type { Snapshot } from '../../engine/view';
import { city, km, pln, plnSigned } from '../format';
import type { MapPreview } from '../map/FleetMap';
import { ContractsView } from './Contracts';
import { RANKS } from '../../data/progression';
import { TRAILERS } from '../../data/trailers';

export function MarketPanel({
  snap,
  truckId,
  onTruck,
  onAccept,
  onPreview,
  onShowOnMap,
  onSign,
}: {
  snap: Snapshot;
  truckId: string | null;
  onTruck: (id: string) => void;
  onAccept: (jobId: string, truckId: string) => void;
  onPreview: (p: MapPreview | null) => void;
  onShowOnMap: (p: MapPreview) => void;
  onSign: (offerId: string) => void;
}) {
  const [view, setView] = useState<'market' | 'contracts'>('market');
  // Rozwinięte zlecenie: dopiero wtedy pokazujemy przyciski, żeby lista była czytelna.
  const [openId, setOpenId] = useState<string | null>(null);
  const free = snap.fleet.filter((t) => t.status === 'idle');
  const active = free.find((t) => t.truck.id === truckId) ?? free[0];
  // Kursy z kontraktów zawsze na górze: przepadnięcie kosztuje.
  const pinned = (j: (typeof snap.market)[number]) => (j.contractId ? 1e7 : 0);
  const jobs = [...snap.market].sort((a, b) => {
    if (!active) return pinned(b) - pinned(a) || b.payment - a.payment;
    const pa = a.previews.find((p) => p.truckId === active.truck.id);
    const pb = b.previews.find((p) => p.truckId === active.truck.id);
    // Najpierw bezpieczne, potem „na styk”, na końcu niewykonalne; w grupie wg zysku na godzinę.
    const score = (p?: (typeof a.previews)[number]) =>
      p ? (p.onTime && !p.tooFar && !p.blocked ? (p.tight ? 1e6 : 2e6) : 0) + p.profit / Math.max(60, p.durationMin) : 0;
    return pinned(b) + score(pb) - (pinned(a) + score(pa));
  });
  const activeContracts = snap.contracts.filter((c) => c.status === 'active').length;

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
                {t.driver?.nickname} · #{t.fleetNo} · {city(t.truck.cityId)}
              </option>
            ))}
          </select>
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>
            Wszyscy w trasie
          </span>
        )}
      </div>
      <div className="subtabs" role="tablist" aria-label="Widok giełdy">
        <button role="tab" aria-selected={view === 'market'} className={view === 'market' ? 'on' : ''} onClick={() => setView('market')}>
          Zlecenia <span className="num muted">{snap.market.length}</span>
        </button>
        <button role="tab" aria-selected={view === 'contracts'} className={view === 'contracts' ? 'on' : ''} onClick={() => setView('contracts')}>
          Kontrakty{' '}
          <span className="num muted">
            {activeContracts}/{snap.contractLimit}
          </span>
        </button>
      </div>
      <div className="panel-body scroll">
        {view === 'contracts' && <ContractsView snap={snap} onSign={onSign} />}
        {view === 'market' && jobs.length === 0 && <div className="empty">Giełda pusta. Spedytorzy poszli na kawę.</div>}
        {view === 'market' && jobs.map((j) => {
          const p = active ? j.previews.find((x) => x.truckId === active.truck.id) : undefined;
          const timeLeft = j.deadline - snap.now;
          const open = openId === j.id;
          const toggle = () => {
            setOpenId(open ? null : j.id);
            onPreview({ job: j, originId: active?.truck.cityId ?? j.fromId });
          };
          return (
            <div
              className={`job${open ? ' open' : ''}${j.contractId ? ' is-contract' : ''}`}
              key={j.id}
              role="button"
              tabIndex={0}
              aria-expanded={open}
              onMouseEnter={() => onPreview({ job: j, originId: active?.truck.cityId ?? j.fromId })}
              onMouseLeave={() => onPreview(null)}
              onClick={toggle}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  toggle();
                }
              }}
            >
              <div>
                <div className="route">
                  {city(j.fromId)} → {city(j.toId)} <span className="muted num" style={{ fontSize: 12 }}>{km(j.km)}</span>
                </div>
                <div className="meta">
                  {j.contractId && <span className="badge contract">kontrakt</span>}
                  {j.trailer && (
                    <span className={`badge trailer t-${j.trailer}`} title={TRAILERS[j.trailer].desc}>
                      {TRAILERS[j.trailer].short}
                      {snap.company.rank < TRAILERS[j.trailer].rank ? ` · od rangi „${RANKS[TRAILERS[j.trailer].rank].name}”` : ''}
                    </span>
                  )}{' '}
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
                <span className="muted" title={`Termin dostawy: ${formatGameTime(j.deadline)}`}>
                  ⏱ {formatDuration(timeLeft)}
                </span>
                {j.contractId && (
                  <span className="contract-left" title="Po tym czasie kurs przepada, a klient liczy karę">
                    przyjąć w {formatDuration(Math.max(0, j.expiresAt - snap.now))}
                  </span>
                )}
                {p && (
                  <>
                    {p.emptyKm > 0 && <span className="muted">dojazd {km(p.emptyKm)}</span>}
                    <span className="muted" title={`Czas kursu z dojazdem i przerwami. Dostawa ${formatGameTime(p.eta)}`}>
                      🚚 {formatDuration(p.durationMin)}
                    </span>
                    {p.restMin > 0 && (
                      <span className="muted" title="Kierowca wyczerpał dzienny limit jazdy i musi odpocząć (tachograf)">
                        w tym odpoczynek {formatDuration(p.restMin)}
                      </span>
                    )}
                    <span className={p.profit >= 0 ? 'good num' : 'bad num'} title={`Paliwo ${pln(p.fuelCost)}, myto ${pln(p.tollCost)}, bez zdarzeń losowych`}>
                      {plnSigned(p.profit)}
                    </span>
                    {p.blocked ? (
                      <span className="badge bad">{p.blocked}</span>
                    ) : p.tooFar ? (
                      <span className="badge bad">za daleko</span>
                    ) : !p.onTime ? (
                      <span className="badge bad">nie zdąży</span>
                    ) : p.tight ? (
                      <span className="badge warn" title="Mały zapas: korek albo kontrola mogą spowodować spóźnienie">
                        na styk · zapas {formatDuration(p.bufferMin)}
                      </span>
                    ) : (
                      <span className="badge good">zapas {formatDuration(p.bufferMin)}</span>
                    )}
                  </>
                )}
              </div>
              {open && (
                <div className="job-actions">
                  {!active && <span className="muted">Wszystkie zestawy w trasie. Przyjąć zlecenie można, gdy któryś się zwolni.</span>}
                  <span className="muted">
                    {p && `dostawa ${formatGameTime(p.eta)} · `}termin {formatGameTime(j.deadline)}
                  </span>
                  <span style={{ flex: 1 }} />
                  <button
                    className="btn small mobile-only"
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowOnMap({ job: j, originId: active?.truck.cityId ?? j.fromId, truckId: active?.truck.id, pinned: true });
                    }}
                  >
                    Na mapie
                  </button>
                  <button
                    className="btn small primary"
                    disabled={!p || p.tooFar || !!p.blocked}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreview(null);
                      setOpenId(null);
                      if (active) onAccept(j.id, active.truck.id);
                    }}
                  >
                    Bierzemy
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
