import { BALANCE } from '../../data/balance';
import { MARKETS, RANKS } from '../../data/progression';
import type { Snapshot } from '../../engine/view';
import { km, pct, pln } from '../format';
import { StatBars, TraitChips, wearColor } from './driverUi';
import type { FleetActions } from './FleetPanel';

/** Kadry, rynek pracy i salon aut: trzy widoki panelu floty. */

export function DriversList({ snap, a, onHire }: { snap: Snapshot; a: FleetActions; onHire: () => void }) {
  // Auta bez kierowcy, które można obsadzić teraz (stoją na placu).
  const emptyTrucks = snap.fleet.filter((t) => t.status === 'nodriver');
  const drivers = [...snap.drivers].sort((x, y) => Number(!!x.truckId) - Number(!!y.truckId));
  return (
    <>
      <p className="staff-note muted">
        Kierowców może być o kilku więcej niż aut (zmiennicy). Kierowca bez auta kosztuje pensję i nudzi się, więc spada mu morale.
      </p>
      {drivers.map(({ driver: d, truckId, truckLabel, onTrip }) => (
        <article key={d.id} className={`staff-card${truckId ? '' : ' is-free'}`}>
          <div className="staff-head">
            <div className="fc-driver">
              <strong>„{d.nickname}”</strong>
              {d.firstName} {d.lastName}
            </div>
            <span className="num">{pln(d.salaryPerDay)}/dzień</span>
          </div>
          <div className="staff-line">
            {truckLabel ? (
              <span className="muted">
                {truckLabel}
                {onTrip ? ' · w trasie' : ''}
              </span>
            ) : (
              <span className="fs-idle">Bez auta</span>
            )}
            <TraitChips d={d} />
          </div>
          <div className="fc-actions">
            {!truckId && emptyTrucks.length > 0 && (
              <select defaultValue="" aria-label={`Przydziel auto dla ${d.nickname}`} onChange={(e) => e.target.value && a.assign(e.target.value, d.id)}>
                <option value="" disabled>
                  Przydziel auto…
                </option>
                {emptyTrucks.map((t) => (
                  <option key={t.truck.id} value={t.truck.id}>
                    #{t.fleetNo} {t.truck.brand} {t.truck.model}
                  </option>
                ))}
              </select>
            )}
            <button className="btn small danger" disabled={onTrip} onClick={() => a.fire(d.id)} title={onTrip ? 'Zwolnić można po rozładunku' : undefined}>
              Zwolnij (odprawa {pln(d.salaryPerDay * MARKETS.severanceDays)})
            </button>
          </div>
        </article>
      ))}
      <button className="btn" onClick={onHire}>
        Zobacz kandydatów na rynku pracy
      </button>
    </>
  );
}

export function CandidatesList({ snap, a }: { snap: Snapshot; a: FleetActions }) {
  const full = snap.drivers.length >= snap.company.driverCap;
  const broke = snap.cash < BALANCE.hireFee;
  const next = RANKS[snap.company.rank + 1];
  return (
    <>
      <p className="staff-note muted">
        Nowi kandydaci co 2 dni. Im wyższa ranga firmy, tym lepsi ludzie się zgłaszają{next ? ` (następna: „${next.name}”)` : ''}. Lepsi kierowcy
        chcą więcej zarabiać.
        {full && <strong className="bad"> Limit kierowców osiągnięty: rozbuduj plac.</strong>}
      </p>
      {snap.candidates.length === 0 && <div className="empty">Nikt nie dzwoni. Może jutro.</div>}
      {snap.candidates.map((c) => (
        <article key={c.id} className="staff-card">
          <div className="staff-head">
            <div className="fc-driver">
              <strong>„{c.nickname}”</strong>
              {c.firstName} {c.lastName}
            </div>
            <span className="num" title="Oczekiwana pensja">
              {pln(c.salaryPerDay)}/dzień
            </span>
          </div>
          <TraitChips d={c} max={4} />
          <StatBars d={c} skipMorale />
          <p className="quirk">{c.quirk}</p>
          <div className="fc-actions">
            <button className="btn small primary" disabled={full || broke} onClick={() => a.hire(c.id)}>
              Zatrudnij · {pln(BALANCE.hireFee)}
            </button>
          </div>
        </article>
      ))}
    </>
  );
}

export function Showroom({ snap, a }: { snap: Snapshot; a: FleetActions }) {
  const full = snap.fleet.length >= snap.company.fleetCap;
  const hasNew = snap.company.rank >= MARKETS.newTrucksRank;
  return (
    <>
      <p className="staff-note muted">
        Leasing: kaucja na start, potem rata codziennie. Nowe auta palą mniej i się nie psują, ale rata jest dwa razy wyższa.
        {!hasNew && ` Nowe auta od rangi „${RANKS[MARKETS.newTrucksRank].name}”.`} Oferty zmieniają się co 3 dni.
        {full && <strong className="bad"> Plac pełny: rozbuduj go w zakładce Firma.</strong>}
      </p>
      {snap.truckOffers.length === 0 && <div className="empty">Handlarz pojechał po nowe auta do Niemiec.</div>}
      {snap.truckOffers.map((o) => (
        <article key={o.id} className="staff-card">
          <div className="staff-head">
            <div className="fc-driver">
              <strong>
                {o.brand} {o.model}
              </strong>
            </div>
            <span className={`badge ${o.condition === 'new' ? 'good' : 'warn'}`}>{o.condition === 'new' ? 'nowy' : 'używany'}</span>
          </div>
          <div className="staff-specs num">
            <span>{km(o.odometerKm)}</span>
            <span>Euro {o.euro}</span>
            <span>{o.fuelL100} l/100</span>
            <span className="wear-label" title="Zużycie: im wyższe, tym częstsze awarie i wyższe spalanie. Serwis je obniża, ale nie poniżej poziomu wynikającego z przebiegu.">
              zużycie
              <span className="fc-wear">
                <span style={{ width: pct(o.wear), background: wearColor(o.wear) }} />
              </span>
              <span style={{ color: wearColor(o.wear) }}>{pct(o.wear)}</span>
            </span>
          </div>
          <div className="staff-line">
            <span>
              <strong className="num">{pln(o.leasePerDay)}</strong>
              <span className="muted">/dzień</span>
            </span>
            <span className="muted num">kaucja {pln(o.deposit)}</span>
          </div>
          <div className="fc-actions">
            <button className="btn small primary" disabled={full || snap.cash < o.deposit} onClick={() => a.lease(o.id)}>
              Bierzemy w leasing
            </button>
          </div>
        </article>
      ))}
    </>
  );
}
