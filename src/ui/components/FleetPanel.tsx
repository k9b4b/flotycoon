import { useState } from 'react';
import { BALANCE } from '../../data/balance';
import { CITY_BY_ID } from '../../data/cities';
import { MARKETS } from '../../data/progression';
import { dutyAfterIdle } from '../../engine/drivingRules';
import { formatClock, formatDuration, formatGameTime } from '../../engine/time';
import type { Snapshot, TruckView } from '../../engine/view';
import { city, km, pct, pln } from '../format';
import { PerkList, ScoreBadge, StatBars, TraitChips, wearColor } from './driverUi';
import { DriverPicker } from './Pairing';
import { DriverAvatar, TruckSprite } from '../avatar';
import { CandidatesList, DriversList, Showroom } from './Staffing';

/**
 * Flota w czterech widokach: zestawy (co jeździ), kierowcy (kadry), rynek pracy i salon aut.
 * Karta zestawu: najpierw kto i czym jedzie, potem co robi teraz; szczegóły zwinięte.
 */

export interface FleetActions {
  select: (truckId: string) => void;
  service: (truckId: string) => void;
  showOnMap: (truckId: string) => void;
  findJob: (truckId: string) => void;
  bonus: (driverId: string) => void;
  hire: (candidateId: string) => void;
  fire: (driverId: string) => void;
  assign: (truckId: string, driverId: string | null) => void;
  lease: (offerId: string) => void;
  returnTruck: (truckId: string) => void;
}

const stop = (fn: () => void) => (e: { stopPropagation(): void }) => {
  e.stopPropagation();
  fn();
};

function StatusBlock({ t, snap, a, onStaff }: { t: TruckView; snap: Snapshot; a: FleetActions; onStaff: () => void }) {
  const now = snap.now;
  const { trip, truck } = t;

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

  if (t.status === 'nodriver') {
    return (
      <div className="fc-status fc-idle">
        <div className="fc-status-line">
          <strong>Stoi bez kierowcy: {CITY_BY_ID[truck.cityId].name}</strong>
        </div>
        <div className="fc-idle-cost">Rata leasingu idzie dalej: {pln(truck.leasePerDay)}/dzień</div>
        <div className="fc-actions" onClick={(e) => e.stopPropagation()}>
          {snap.drivers.some((d) => !d.onTrip) ? (
            <DriverPicker snap={snap} t={t} a={a} placeholder="Przypisz kierowcę…" />
          ) : (
            <button className="btn small primary" onClick={onStaff}>
              Zatrudnij kierowcę
            </button>
          )}
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
          <button className="btn small primary" onClick={stop(() => a.findJob(truck.id))}>
            Szukaj zlecenia
          </button>
          {truck.wear > 0.3 && (
            <button className="btn small" onClick={stop(() => a.service(truck.id))} title={`Zużycie spadnie do ${pct(t.serviceQuote.wearAfter)}`}>
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
        {trip.late ? (
          <span className="badge bad">spóźni się</span>
        ) : trip.tight ? (
          <span className="badge warn" title="Po terminie, ale w godzinnej tolerancji klienta">
            lekko po terminie
          </span>
        ) : (
          <span className="badge good">na czas</span>
        )}
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

function Details({ t, snap, a }: { t: TruckView; snap: Snapshot; a: FleetActions }) {
  const now = snap.now;
  const { driver: d, truck } = t;
  const bonusAt = d?.lastBonusAt === undefined ? 0 : d.lastBonusAt + BALANCE.bonusCooldownDays * 24 * 60;
  const idle = !t.trip && t.status !== 'service';
  return (
    <div className="fc-details" onClick={(e) => e.stopPropagation()}>
      {d && (
        <>
          <StatBars d={d} />
          <PerkList d={d} />
          <div className="fc-morale">
            <button className="btn small" disabled={now < bonusAt} onClick={() => a.bonus(d.id)} title={now < bonusAt ? `Następna premia od ${formatGameTime(bonusAt)}` : undefined}>
              {now < bonusAt ? `Premia od ${formatGameTime(bonusAt)}` : `Premia ${pln(BALANCE.bonusCost)} · morale +${BALANCE.bonusMorale}`}
            </button>
          </div>
        </>
      )}
      <dl className="fc-facts">
        {d && (
          <>
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
          </>
        )}
        <dt>Auto</dt>
        <dd className="num">
          {truck.condition === 'new' ? 'Nowe · ' : ''}Euro {truck.euro} · {km(truck.odometerKm)} · {truck.fuelL100} l/100
        </dd>
        <dt>Leasing</dt>
        <dd className="num">{pln(truck.leasePerDay)}/dzień</dd>
      </dl>
      {d && <p className="quirk">{d.quirk}</p>}
      {idle && (
        <div className="fc-actions">
          {d && <DriverPicker snap={snap} t={t} a={a} placeholder="Zmień kierowcę…" />}
          {d && (
            <button className="btn small" onClick={() => a.assign(truck.id, null)} title="Kierowca zostaje w firmie bez auta">
              Zdejmij kierowcę
            </button>
          )}
          <button className="btn small danger" onClick={() => a.returnTruck(truck.id)} title="Kaucja przepada">
            Zwróć auto (kara {pln(truck.leasePerDay * MARKETS.returnPenaltyDays)})
          </button>
        </div>
      )}
    </div>
  );
}

function TruckCard({
  t,
  snap,
  selected,
  expanded,
  a,
  onToggle,
  onStaff,
}: {
  t: TruckView;
  snap: Snapshot;
  selected: boolean;
  expanded: boolean;
  a: FleetActions;
  onToggle: () => void;
  onStaff: () => void;
}) {
  const { truck, driver } = t;
  const cls = [
    'fleet-card',
    selected && 'selected',
    (t.status === 'idle' || t.status === 'nodriver') && 'is-idle',
    t.status === 'incident' && 'is-incident',
  ]
    .filter(Boolean)
    .join(' ');
  const plateWear = (
    <>
      <span className="plate">{truck.plate}</span>
      <span className="wear-label" title="Zużycie: im wyższe, tym częstsze awarie i wyższe spalanie. Serwis je obniża, ale nie poniżej poziomu wynikającego z przebiegu.">
        <span className="fc-wear">
          <span style={{ width: pct(truck.wear), background: wearColor(truck.wear) }} />
        </span>
        <span className="num" style={{ color: wearColor(truck.wear) }}>
          {pct(truck.wear)}
        </span>
      </span>
    </>
  );
  return (
    <article className={cls} onClick={() => a.select(truck.id)} data-status={t.status}>
      <header className="fc-head">
        <span className="fc-id">
          {driver ? <DriverAvatar d={driver} size={48} /> : <span className="avatar avatar-empty">?</span>}
          <span className="fc-no num" title="Numer zestawu (ten sam na mapie)">
            {t.fleetNo}
          </span>
        </span>
        <div className="fc-who">
          <div className="fc-driver">
            {driver ? (
              <>
                <strong>„{driver.nickname}”</strong>
                {driver.firstName} {driver.lastName}
                <ScoreBadge d={driver} />
              </>
            ) : (
              <strong className="muted">Brak kierowcy</strong>
            )}
          </div>
          <div className="fc-truck">
            <span>
              {truck.brand} {truck.model}
            </span>
            {plateWear}
          </div>
        </div>
        <div className="fc-right">
          <TruckSprite t={truck} />
          {t.status === 'idle' && <span className="fc-pill">Wolny</span>}
          {t.status === 'nodriver' && <span className="fc-pill">Bez kierowcy</span>}
        </div>
      </header>
      {/* Na telefonie auto ma osobny wiersz pod kierowcą, żeby nagłówek nie był ściśnięty. */}
      <div className="fc-truckrow">
        <TruckSprite t={truck} />
        <div className="fc-truckrow-info">
          <span>
            {truck.brand} {truck.model}
          </span>
          <span className="fc-truckrow-line">{plateWear}</span>
        </div>
      </div>

      <StatusBlock t={t} snap={snap} a={a} onStaff={onStaff} />

      <footer className="fc-foot">
        {driver ? <TraitChips d={driver} /> : <span style={{ flex: 1 }} />}
        <button className="btn small mobile-only" onClick={stop(() => a.showOnMap(truck.id))}>
          Na mapie
        </button>
        <button className="btn small fc-more" aria-expanded={expanded} onClick={stop(onToggle)}>
          {expanded ? 'Zwiń' : 'Szczegóły'}
        </button>
      </footer>

      {expanded && <Details t={t} snap={snap} a={a} />}
    </article>
  );
}

/** Wolni i bez kierowcy najpierw (najdłużej stojący na górze), potem zdarzenia, potem wg ETA, serwis na końcu. */
function order(t: TruckView): number {
  if (t.status === 'nodriver') return -2e9;
  if (t.status === 'idle') return -1e9 + (t.idleSince ?? 0);
  if (t.status === 'incident') return -1e8;
  if (t.status === 'service') return 1e12;
  return t.trip?.eta ?? 0;
}

type View = 'trucks' | 'drivers' | 'hire' | 'showroom';

export function FleetPanel({ snap, selectedId, a }: { snap: Snapshot; selectedId: string | null; a: FleetActions }) {
  const [view, setView] = useState<View>('trucks');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const fleet = [...snap.fleet].sort((x, y) => order(x) - order(y));
  const idle = snap.fleet.filter((t) => t.status === 'idle' || t.status === 'nodriver').length;
  const service = snap.fleet.filter((t) => t.status === 'service').length;
  const moving = snap.fleet.length - idle - service;
  const { fleetCap, driverCap } = snap.company;
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tabs: { id: View; label: string; count?: string }[] = [
    { id: 'trucks', label: 'Zestawy', count: `${snap.fleet.length}/${fleetCap}` },
    { id: 'drivers', label: 'Kierowcy', count: `${snap.drivers.length}/${driverCap}` },
    { id: 'hire', label: 'Rynek pracy', count: String(snap.candidates.length) },
    { id: 'showroom', label: 'Salon', count: String(snap.truckOffers.length) },
  ];

  return (
    <section className="panel area-fleet">
      <div className="panel-head">
        <span className="panel-title">Flota</span>
        <span className="fleet-summary">
          {idle > 0 && <span className="fs-idle">{idle} stoi</span>}
          <span>{moving} w trasie</span>
          {service > 0 && <span>{service} w serwisie</span>}
        </span>
      </div>
      <div className="subtabs" role="tablist" aria-label="Widok floty">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={view === t.id} className={view === t.id ? 'on' : ''} onClick={() => setView(t.id)}>
            {t.label} <span className="num muted">{t.count}</span>
          </button>
        ))}
      </div>
      <div className="panel-body scroll fleet-list">
        {view === 'trucks' &&
          fleet.map((t) => (
            <TruckCard
              key={t.truck.id}
              t={t}
              snap={snap}
              selected={t.truck.id === selectedId}
              expanded={expanded.has(t.truck.id)}
              a={a}
              onToggle={() => toggle(t.truck.id)}
              onStaff={() => setView('hire')}
            />
          ))}
        {view === 'drivers' && <DriversList snap={snap} a={a} onHire={() => setView('hire')} />}
        {view === 'hire' && <CandidatesList snap={snap} a={a} />}
        {view === 'showroom' && <Showroom snap={snap} a={a} />}
      </div>
    </section>
  );
}
