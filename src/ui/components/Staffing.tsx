import { useState } from 'react';
import { BALANCE } from '../../data/balance';
import { COURSES, COURSE_BY_ID } from '../../data/development';
import { courseGain, maxRepeats, timesTaken } from '../../engine/training';
import { formatGameTime } from '../../engine/time';
import type { Driver } from '../../engine/types';
import { MARKETS, RANKS } from '../../data/progression';
import type { Snapshot } from '../../engine/view';
import { km, pct, pln } from '../format';
import { PerkList, ScoreBadge, StatBars, TraitChips, wearColor } from './driverUi';
import { TruckPicker } from './Pairing';
import { DriverAvatar, TruckSprite } from '../avatar';
import type { FleetActions } from './FleetPanel';

/** Kadry, rynek pracy i salon aut: trzy widoki panelu floty. */

export function DriversList({ snap, a, onHire }: { snap: Snapshot; a: FleetActions; onHire: () => void }) {
  const drivers = [...snap.drivers].sort((x, y) => Number(!!x.truckId) - Number(!!y.truckId));
  return (
    <>
      <p className="staff-note muted">
        Kto czym jeździ, decydujesz sam. Przesadzenie do zajętego auta zamienia kierowców miejscami (o ile żaden nie jest w trasie). Liczba przy
        nazwisku to ocena: średnia umiejętności. Kierowców może być o kilku więcej niż aut (zmiennicy), ale kierowca bez auta kosztuje pensję i
        nudzi się, więc spada mu morale.
      </p>
      {drivers.map((dv) => {
        const { driver: d, truckId, truckLabel, onTrip } = dv;
        return (
        <article key={d.id} className={`staff-card${truckId ? '' : ' is-free'}`}>
          <div className="staff-head with-avatar">
            <DriverAvatar d={d} size={48} />
            <div className="fc-driver">
              <strong>„{d.nickname}”</strong>
              {d.firstName} {d.lastName}
              <ScoreBadge d={d} />
            </div>
            <span className="num">{pln(d.salaryPerDay)}/dzień</span>
          </div>
          <div className="staff-line">
            {d.training ? (
              <span className="training-on">
                Na szkoleniu: {COURSE_BY_ID[d.training.course].name} · do {formatGameTime(d.training.until)}
              </span>
            ) : truckLabel ? (
              <span className="muted">
                {truckLabel}
                {onTrip ? ' · w trasie' : ''}
              </span>
            ) : (
              <span className="fs-idle">Bez auta</span>
            )}
            {(d.certs ?? []).includes('adr') && <span className="badge trailer t-adr">ADR</span>}
            <TraitChips d={d} />
          </div>
          <Training d={d} onTrip={onTrip} cash={snap.cash} rank={snap.company.rank} a={a} />
          <div className="fc-actions">
            <TruckPicker snap={snap} dv={dv} a={a} />
            <button className="btn small danger" disabled={onTrip} onClick={() => a.fire(d.id)} title={onTrip ? 'Zwolnić można po rozładunku' : undefined}>
              Zwolnij (odprawa {pln(d.salaryPerDay * MARKETS.severanceDays)})
            </button>
          </div>
        </article>
        );
      })}
      <button className="btn" onClick={onHire}>
        Zobacz kandydatów na rynku pracy
      </button>
    </>
  );
}

const STAT_SHORT = { experience: 'doświadczenie', eco: 'eco-driving', reliability: 'niezawodność', stamina: 'kondycja' } as const;

/** Szkolenia kierowcy: rozwijane, żeby nie zaśmiecać listy. */
function Training({ d, onTrip, cash, rank, a }: { d: Driver; onTrip: boolean; cash: number; rank: number; a: FleetActions }) {
  const [open, setOpen] = useState(false);
  const busy = onTrip || !!d.training;
  return (
    <div className="training">
      <button className="btn small" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Zwiń szkolenia' : 'Szkolenia'}
      </button>
      {open && (
        <div className="course-list">
          {busy && <p className="muted course-note">{d.training ? 'Już na szkoleniu.' : 'Szkolenie można zacząć po rozładunku.'}</p>}
          {COURSES.map((c) => {
            const n = timesTaken(d, c.id);
            const gain = courseGain(d, c.id);
            const maxed = n >= maxRepeats(c.id);
            const locked = !!c.rank && rank < c.rank;
            const fix = c.fixes && d.perks.includes(c.fixes);
            const conv = c.converts && d.perks.includes(c.converts[0]);
            return (
              <div key={c.id} className="course">
                <div className="course-head">
                  <strong>{c.name}</strong>
                  <span className="num muted">
                    {pln(c.cost)} · {c.days} {c.days === 1 ? 'dzień' : 'dni'}
                  </span>
                </div>
                <div className="muted course-desc">{c.desc}</div>
                <div className="course-foot">
                  <span className={maxed || locked ? 'muted' : 'good'}>
                    {locked
                      ? 'Dostępny od wyższej rangi'
                      : maxed
                        ? c.cert
                          ? 'Uprawnienia już są'
                          : 'Kurs zaliczony do oporu'
                        : c.cert
                          ? `uprawnienia ${c.cert.toUpperCase()} · ${STAT_SHORT[c.stat]} +${gain}`
                          : `${STAT_SHORT[c.stat]} +${gain}`}
                    {(fix || conv) && !maxed ? ' · może pomóc na cechę!' : ''}
                  </span>
                  <span className="muted num">
                    {n}/{maxRepeats(c.id)}
                  </span>
                  <button className="btn small primary" disabled={busy || maxed || locked || cash < c.cost} onClick={() => a.train(d.id, c.id)}>
                    Zapisz
                  </button>
                </div>
              </div>
            );
          })}
          <p className="muted course-note">Na czas szkolenia auto zostaje bez kierowcy: posadź w nim zmiennika. Po kursie kierowca wraca do swojego auta.</p>
        </div>
      )}
    </div>
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
        mają więcej cech specjalnych, częściej pozytywnych, i chcą więcej zarabiać.
        {full && <strong className="bad"> Limit kierowców osiągnięty: rozbuduj plac.</strong>}
      </p>
      {snap.candidates.length === 0 && <div className="empty">Nikt nie dzwoni. Może jutro.</div>}
      {snap.candidates.map((c) => (
        <article key={c.id} className="staff-card">
          <div className="staff-head with-avatar">
            <DriverAvatar d={c} size={64} />
            <div className="fc-driver">
              <strong>„{c.nickname}”</strong>
              {c.firstName} {c.lastName}
              <ScoreBadge d={c} />
            </div>
            <span className="num" title="Oczekiwana pensja">
              {pln(c.salaryPerDay)}/dzień
            </span>
          </div>
          <StatBars d={c} skipMorale />
          <PerkList d={c} />
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
          <div className="staff-head with-avatar">
            <TruckSprite t={o} scale={3} />
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
