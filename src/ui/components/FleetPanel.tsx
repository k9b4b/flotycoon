import { BALANCE } from '../../data/balance';
import { dutyAfterIdle } from '../../engine/drivingRules';
import { formatDuration, formatGameTime } from '../../engine/time';
import type { Snapshot, TruckView } from '../../engine/view';
import { city, km, pct, pln, STAT_LABELS } from '../format';

function statColor(v: number) {
  if (v >= 70) return 'var(--good)';
  if (v >= 45) return 'var(--accent)';
  return 'var(--bad)';
}

function TruckCard({
  t,
  now,
  selected,
  onSelect,
  onService,
  onShowOnMap,
}: {
  t: TruckView;
  now: number;
  selected: boolean;
  onSelect: () => void;
  onService: () => void;
  onShowOnMap: () => void;
}) {
  const { truck, driver, trip } = t;
  const wearColor = truck.wear > 0.5 ? 'var(--bad)' : truck.wear > 0.3 ? 'var(--accent)' : 'var(--good)';
  return (
    <div className={`truck-card${selected ? ' selected' : ''}`} onClick={onSelect}>
      <div className="truck-row">
        <span className="plate">{truck.plate}</span>
        <strong>
          {truck.brand} {truck.model}
        </strong>
        <span className="muted" style={{ fontSize: 12 }}>
          Euro {truck.euro} · {km(truck.odometerKm)}
        </span>
        <span style={{ flex: 1 }} />
        <span className="badge" style={{ color: wearColor }} title="Zużycie: wpływa na awarie i spalanie">
          zużycie {pct(truck.wear)}
        </span>
      </div>

      <div className="truck-row" style={{ marginTop: 6, fontSize: 13 }}>
        <span>
          {driver.firstName} „<strong>{driver.nickname}</strong>” {driver.lastName}
        </span>
        <span className="muted">· {pln(driver.salaryPerDay)}/dzień</span>
        <span style={{ flex: 1 }} />
        <span className="muted">{t.statusLabel}</span>
        <button
          className="btn small mobile-only"
          onClick={(e) => {
            e.stopPropagation();
            onShowOnMap();
          }}
        >
          Na mapie
        </button>
      </div>

      {trip ? (
        <>
          <div className="progress">
            <div style={{ width: pct(trip.progress) }} />
          </div>
          <div className="truck-row" style={{ fontSize: 12 }}>
            <span>
              {city(trip.fromId)} → {city(trip.toId)}
            </span>
            <span className="muted">· {trip.cargo}</span>
            <span style={{ flex: 1 }} />
            <span className={trip.late ? 'bad' : 'muted'}>
              ETA {formatGameTime(trip.eta)} {trip.late ? '· spóźni się' : ''}
            </span>
          </div>
          {t.status === 'incident' && trip.incidentText && <div className="quirk bad">{trip.incidentText}</div>}
        </>
      ) : (
        <div className="truck-row" style={{ fontSize: 12, marginTop: 6 }}>
          <span className="muted">
            {t.status === 'service' ? `W serwisie do ${formatGameTime(t.serviceUntil!)}` : `Stoi w: ${city(truck.cityId)}`}
          </span>
          <span style={{ flex: 1 }} />
          {t.status === 'idle' && truck.wear > 0.15 && (
            <button
              className="btn small"
              onClick={(e) => {
                e.stopPropagation();
                onService();
              }}
              title={`Zużycie spadnie do ${pct(t.serviceQuote.wearAfter)}`}
            >
              Serwis {pln(t.serviceQuote.cost)} · {formatDuration(t.serviceQuote.durationMin)}
            </button>
          )}
        </div>
      )}

      <div className="stats">
        {Object.entries(driver.stats).map(([k, v]) => (
          <div className="stat" key={k} title={`${STAT_LABELS[k]}: ${Math.round(v)}`}>
            <div className="name">{STAT_LABELS[k]}</div>
            <div className="bar">
              <div style={{ width: `${v}%`, background: statColor(v) }} />
            </div>
          </div>
        ))}
      </div>
      {selected && (
        <div className="quirk">
          {driver.quirk} Kursy: {driver.jobsDone} ({driver.lateJobs} spóźnionych), {km(driver.kmDriven)}.
          {!t.trip && ` Jazda od ostatniego odpoczynku dobowego: ${formatDuration(dutyAfterIdle(driver.duty, now).today)}.`}
        </div>
      )}
    </div>
  );
}

export function FleetPanel({
  snap,
  selectedId,
  onSelect,
  onLease,
  onService,
  onShowOnMap,
}: {
  snap: Snapshot;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onLease: () => void;
  onService: (truckId: string) => void;
  onShowOnMap: (truckId: string) => void;
}) {
  const leaseCost = BALANCE.hireFee + BALANCE.leaseDeposit;
  return (
    <section className="panel area-fleet">
      <div className="panel-head">
        <span className="panel-title">Flota i kierowcy</span>
        <span className="muted" style={{ fontSize: 12 }}>
          {snap.fleet.length} zestaw{snap.fleet.length === 1 ? '' : snap.fleet.length < 5 ? 'y' : 'ów'}
        </span>
        <span className="spacer" />
        <button className="btn small" onClick={onLease} disabled={snap.cash < leaseCost} title="Kaucja leasingowa + rekrutacja kierowcy">
          + Zestaw w leasing ({pln(leaseCost)})
        </button>
      </div>
      <div className="panel-body scroll">
        {snap.fleet.map((t) => (
          <TruckCard
            key={t.truck.id}
            t={t}
            now={snap.now}
            selected={t.truck.id === selectedId}
            onSelect={() => onSelect(t.truck.id)}
            onService={() => onService(t.truck.id)}
            onShowOnMap={() => onShowOnMap(t.truck.id)}
          />
        ))}
      </div>
    </section>
  );
}
