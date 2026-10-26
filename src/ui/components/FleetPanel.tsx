import { useState } from 'react';
import { BALANCE } from '../../data/balance';
import { CITY_BY_ID } from '../../data/cities';
import { dutyAfterIdle } from '../../engine/drivingRules';
import { formatClock, formatDuration, formatGameTime } from '../../engine/time';
import type { Snapshot, TruckView } from '../../engine/view';
import type { Driver } from '../../engine/types';
import { city, km, pct, pln, STAT_LABELS } from '../format';

/**
 * Karta zestawu: najpierw kto i czym jedzie, potem co robi teraz.
 * Szczegóły kierowcy i auta są zwinięte; na stałe widać tylko cechy, które coś znaczą.
 */

interface Trait {
  text: string;
  tone: 'good' | 'bad';
}

/** Krótkie etykiety zamiast pięciu pasków: tylko skrajne wartości mają wpływ na decyzje. */
function traits(d: Driver): Trait[] {
  const s = d.stats;
  const out: Trait[] = [];
  if (s.morale < 40) out.push({ text: 'Morale nisko', tone: 'bad' });
  if (s.experience >= 80) out.push({ text: 'Rutyniarz', tone: 'good' });
  else if (s.experience < 30) out.push({ text: 'Świeżak', tone: 'bad' });
  if (s.eco >= 80) out.push({ text: 'Eco-mistrz', tone: 'good' });
  else if (s.eco < 30) out.push({ text: 'Pali jak smok', tone: 'bad' });
  if (s.reliability >= 80) out.push({ text: 'Solidny', tone: 'good' });
  else if (s.reliability < 30) out.push({ text: 'Ryzykant', tone: 'bad' });
  if (s.stamina >= 80) out.push({ text: 'Żelazna kondycja', tone: 'good' });
  else if (s.stamina < 30) out.push({ text: 'Śpioch', tone: 'bad' });
  return out.slice(0, 3);
}

function statColor(v: number) {
  if (v >= 70) return 'var(--good)';
  if (v >= 45) return 'var(--accent)';
  return 'var(--bad)';
}

const wearColor = (w: number) => (w > 0.5 ? 'var(--bad)' : w > 0.3 ? 'var(--accent)' : 'var(--good)');

function StatusBlock({ t, now, onFindJob, onService }: { t: TruckView; now: number; onFindJob: () => void; onService: () => void }) {
  const { trip, truck } = t;
  const stop = (fn: () => void) => (e: { stopPropagation(): void }) => {
    e.stopPropagation();
    fn();
  };

  if (t.status === 'service') {
    return (
      <div className="fc-status">
        <div className="fc-status-line">
          <strong>W serwisie</strong>
          <span className="muted">do {formatGameTime(t.serviceUntil!)}</span>
        </div>
      </div>
    );
  }

  if (!trip) {
    const idleMin = Math.max(0, now - (t.idleSince ?? now));
    const lost = (idleMin / 60) * t.costPerHour;
    return (
      <div className="fc-status fc-idle">
        <div className="fc-status-line">
          <strong>Stoi w: {CITY_BY_ID[truck.cityId].name}</strong>
          <span className="num">od {formatDuration(idleMin)}</span>
        </div>
        <div className="fc-idle-cost">
          Koszt postoju {pln(t.costPerHour)}/h{idleMin >= 60 && <>, dotąd ok. {pln(lost)}</>}
        </div>
        <div className="fc-actions">
          <button className="btn small primary" onClick={stop(onFindJob)}>
            Szukaj zlecenia
          </button>
          {truck.wear > 0.3 && (
            <button className="btn small" onClick={stop(onService)} title={`Zużycie spadnie do ${pct(t.serviceQuote.wearAfter)}`}>
              Serwis {pln(t.serviceQuote.cost)}
            </button>
          )}
        </div>
      </div>
    );
  }

  const phaseLeft = Math.max(0, trip.phaseEnd - now);
  const what =
    t.status === 'incident'
      ? trip.incidentText ?? 'Zdarzenie na trasie'
      : t.status === 'drive' || t.status === 'drive_empty'
        ? t.statusLabel
        : `${t.statusLabel} do ${formatClock(trip.phaseEnd)}`;
  return (
    <div className={`fc-status${t.status === 'incident' ? ' fc-incident' : ''}`}>
      <div className="fc-status-line">
        <strong>
          {city(trip.fromId)} → {city(trip.toId)}
        </strong>
        <span className={trip.late ? 'badge bad' : 'badge good'}>{trip.late ? 'spóźni się' : 'na czas'}</span>
      </div>
      <div className="progress">
        <div style={{ width: pct(trip.progress) }} />
      </div>
      <div className="fc-status-line fc-small">
        <span className={t.status === 'incident' ? 'bad' : 'muted'}>
          {what}
          {t.status !== 'incident' && t.status !== 'drive' && t.status !== 'drive_empty' && phaseLeft > 0 ? ` (${formatDuration(phaseLeft)})` : ''}
        </span>
        <span className="num muted">ETA {formatGameTime(trip.eta)}</span>
      </div>
      <div className="fc-small muted">{trip.cargo}</div>
    </div>
  );
}

function Details({ t, now }: { t: TruckView; now: number }) {
  const { driver: d, truck } = t;
  return (
    <div className="fc-details" onClick={(e) => e.stopPropagation()}>
      <div className="fc-stats">
        {Object.entries(d.stats).map(([k, v]) => (
          <div className="fc-stat" key={k}>
            <span className="fc-stat-name">{STAT_LABELS[k]}</span>
            <span className="fc-stat-bar">
              <span style={{ width: `${v}%`, background: statColor(v) }} />
            </span>
            <span className="num fc-stat-val">{Math.round(v)}</span>
          </div>
        ))}
      </div>
      <dl className="fc-facts">
        <dt>Pensja</dt>
        <dd className="num">{pln(d.salaryPerDay)}/dzień</dd>
        <dt>Kursy</dt>
        <dd className="num">
          {d.jobsDone} ({d.lateJobs} spóźn.) · {km(d.kmDriven)}
        </dd>
        {!t.trip && (
          <>
            <dt>Tachograf</dt>
            <dd className="num">{formatDuration(dutyAfterIdle(d.duty, now).today)} jazdy od odpoczynku</dd>
          </>
        )}
        <dt>Auto</dt>
        <dd className="num">
          Euro {truck.euro} · {km(truck.odometerKm)} · {truck.fuelL100} l/100
        </dd>
        <dt>Leasing</dt>
        <dd className="num">{pln(truck.leasePerDay)}/dzień</dd>
      </dl>
      <p className="quirk">{d.quirk}</p>
    </div>
  );
}

function TruckCard({
  t,
  now,
  selected,
  expanded,
  onSelect,
  onToggle,
  onService,
  onShowOnMap,
  onFindJob,
}: {
  t: TruckView;
  now: number;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onService: () => void;
  onShowOnMap: () => void;
  onFindJob: () => void;
}) {
  const { truck, driver } = t;
  const tr = traits(driver);
  const cls = ['fleet-card', selected && 'selected', t.status === 'idle' && 'is-idle', t.status === 'incident' && 'is-incident'].filter(Boolean).join(' ');
  return (
    <article className={cls} onClick={onSelect} data-status={t.status}>
      <header className="fc-head">
        <span className="fc-no num" title="Numer zestawu (ten sam na mapie)">
          {t.fleetNo}
        </span>
        <div className="fc-who">
          <div className="fc-driver">
            <strong>„{driver.nickname}”</strong>
            {driver.firstName} {driver.lastName}
          </div>
          <div className="fc-truck">
            <span>
              {truck.brand} {truck.model}
            </span>
            <span className="plate">{truck.plate}</span>
            <span className="fc-wear" title={`Zużycie ${pct(truck.wear)}: wpływa na awarie i spalanie`}>
              <span style={{ width: pct(truck.wear), background: wearColor(truck.wear) }} />
            </span>
          </div>
        </div>
        {t.status === 'idle' && <span className="fc-pill">Wolny</span>}
      </header>

      <StatusBlock t={t} now={now} onFindJob={onFindJob} onService={onService} />

      <footer className="fc-foot">
        <div className="fc-traits">
          {tr.map((x) => (
            <span key={x.text} className={`fc-trait ${x.tone}`}>
              {x.text}
            </span>
          ))}
        </div>
        <button
          className="btn small mobile-only"
          onClick={(e) => {
            e.stopPropagation();
            onShowOnMap();
          }}
        >
          Na mapie
        </button>
        <button
          className="btn small fc-more"
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {expanded ? 'Zwiń' : 'Szczegóły'}
        </button>
      </footer>

      {expanded && <Details t={t} now={now} />}
    </article>
  );
}

/** Wolni najpierw (najdłużej stojący na górze), potem zdarzenia, potem wg ETA, serwis na końcu. */
function order(t: TruckView): number {
  if (t.status === 'idle') return -1e9 + (t.idleSince ?? 0);
  if (t.status === 'incident') return -1e8;
  if (t.status === 'service') return 1e12;
  return t.trip?.eta ?? 0;
}

export function FleetPanel({
  snap,
  selectedId,
  onSelect,
  onLease,
  onService,
  onShowOnMap,
  onFindJob,
}: {
  snap: Snapshot;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onLease: () => void;
  onService: (truckId: string) => void;
  onShowOnMap: (truckId: string) => void;
  onFindJob: (truckId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const leaseCost = BALANCE.hireFee + BALANCE.leaseDeposit;
  const fleet = [...snap.fleet].sort((a, b) => order(a) - order(b));
  const idle = snap.fleet.filter((t) => t.status === 'idle').length;
  const service = snap.fleet.filter((t) => t.status === 'service').length;
  const moving = snap.fleet.length - idle - service;
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="panel area-fleet">
      <div className="panel-head">
        <span className="panel-title">Flota</span>
        <span className="fleet-summary">
          {idle > 0 && <span className="fs-idle">{idle} wolne</span>}
          <span>{moving} w trasie</span>
          {service > 0 && <span>{service} w serwisie</span>}
        </span>
        <span className="spacer" />
        <button className="btn small" onClick={onLease} disabled={snap.cash < leaseCost} title="Kaucja leasingowa + rekrutacja kierowcy">
          + Zestaw ({pln(leaseCost)})
        </button>
      </div>
      <div className="panel-body scroll fleet-list">
        {fleet.map((t) => (
          <TruckCard
            key={t.truck.id}
            t={t}
            now={snap.now}
            selected={t.truck.id === selectedId}
            expanded={expanded.has(t.truck.id)}
            onSelect={() => onSelect(t.truck.id)}
            onToggle={() => toggle(t.truck.id)}
            onService={() => onService(t.truck.id)}
            onShowOnMap={() => onShowOnMap(t.truck.id)}
            onFindJob={() => onFindJob(t.truck.id)}
          />
        ))}
      </div>
    </section>
  );
}
