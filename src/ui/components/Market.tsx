import { useEffect, useState, type ReactNode } from 'react';
import { RANKS } from '../../data/progression';
import { MARKETS } from '../../data/progression';
import { TRAILERS } from '../../data/trailers';
import { paybackDays } from '../../engine/assets';
import type { Ownership, TrailerOffer, TruckOffer } from '../../engine/types';
import type { Snapshot, TrailerView } from '../../engine/view';
import { TrailerSprite, TruckSprite } from '../avatar';
import { km, pct, pln } from '../format';
import { wearColor } from './driverUi';
import { CandidatesList } from './Staffing';
import type { FleetActions } from './FleetPanel';

/**
 * Rynek: ciągniki, naczepy i kierowcy w jednym miejscu.
 * Każda oferta ma cztery parametry i dwa przyciski: „Kup” (raz, na własność) i „Leasing” (kaucja + rata).
 */

export type MarketSeg = 'trucks' | 'trailers' | 'drivers';
type Filter = 'all' | 'new' | 'used';

/** Przycisk z potwierdzeniem: pierwszy klik uzbraja, drugi wykonuje (dla sprzedaży i zwrotów). */
export function ConfirmButton({ label, confirm, onConfirm, className = 'btn small danger', disabled, title }: { label: string; confirm: string; onConfirm: () => void; className?: string; disabled?: boolean; title?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <button
      className={`${className}${armed ? ' armed' : ''}`}
      disabled={disabled}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirm : label}
    </button>
  );
}

function WearMeter({ wear }: { wear: number }) {
  return (
    <span className="wear-label">
      <span className="fc-wear">
        <span style={{ width: pct(wear), background: wearColor(wear) }} />
      </span>
      <span className="num" style={{ color: wearColor(wear) }}>
        {pct(wear)}
      </span>
    </span>
  );
}

function Spec({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="spec" title={hint}>
      <span className="spec-label">{label}</span>
      <span className="spec-value num">{children}</span>
    </div>
  );
}

/** Dwa przyciski obok siebie: kupno i leasing, z powodem blokady pod spodem. */
function BuyLease({ o, cash, blocked, onPick }: { o: { buyPrice: number; leasePerDay: number; deposit: number }; cash: number; blocked: string | null; onPick: (m: Ownership) => void }) {
  const canBuy = !blocked && cash >= o.buyPrice;
  const canLease = !blocked && cash >= o.deposit;
  return (
    <>
      <div className="buy-lease">
        <button className="deal deal-buy" disabled={!canBuy} onClick={() => onPick('own')}>
          <span className="deal-kind">Kup</span>
          <strong className="num">{pln(o.buyPrice)}</strong>
          <span className="deal-sub">raz, bez rat</span>
        </button>
        <button className="deal deal-lease" disabled={!canLease} onClick={() => onPick('lease')}>
          <span className="deal-kind">Leasing</span>
          <strong className="num">{pln(o.leasePerDay)}/dzień</strong>
          <span className="deal-sub num">kaucja {pln(o.deposit)}</span>
        </button>
      </div>
      <div className="deal-note muted">
        {blocked ? (
          <span className="bad">{blocked}</span>
        ) : (
          <>
            Zakup = <span className="num">{paybackDays(o)}</span> dni raty.
            {!canBuy && cash < o.buyPrice && <> Na zakup brakuje {pln(o.buyPrice - cash)}.</>}
          </>
        )}
      </div>
    </>
  );
}

function TruckOfferCard({ o, snap, blocked, a }: { o: TruckOffer; snap: Snapshot; blocked: string | null; a: FleetActions }) {
  return (
    <article className="staff-card offer-card">
      <div className="offer-head">
        <TruckSprite t={o} scale={2} />
        <div className="offer-title">
          <strong>
            {o.brand} {o.model}
          </strong>
          <span className={`badge ${o.condition === 'new' ? 'good' : 'warn'}`}>{o.condition === 'new' ? 'nowy' : 'używany'}</span>
        </div>
      </div>
      <div className="spec-grid">
        <Spec label="Przebieg">{km(o.odometerKm)}</Spec>
        <Spec label="Spalanie" hint="Średnio, z pustą naczepą. Ciężki ładunek i zużycie dokładają swoje.">
          {o.fuelL100} l/100
        </Spec>
        <Spec label="Norma" hint="Wyższa norma Euro = niższe myto.">
          Euro {o.euro}
        </Spec>
        <Spec label="Zużycie" hint="Im wyższe, tym częstsze awarie i większe spalanie. Serwis je obniża.">
          <WearMeter wear={o.wear} />
        </Spec>
      </div>
      <BuyLease o={o} cash={snap.cash} blocked={blocked} onPick={(m) => a.acquireTruck(o.id, m)} />
    </article>
  );
}

function trailerTraits(type: TrailerOffer['type']): string[] {
  const t = TRAILERS[type];
  const out: string[] = [];
  if (t.fuelMul > 1) out.push(`paliwo +${Math.round((t.fuelMul - 1) * 100)}%`);
  if (t.speedMul < 1) out.push(`wolniej o ${Math.round((1 - t.speedMul) * 100)}%`);
  if (t.cert === 'adr') out.push('kierowca z ADR');
  if (t.minExperience) out.push(`doświadczenie ${t.minExperience}+`);
  if (t.itdMul > 1.2) out.push('częstsze kontrole');
  return out;
}

function TrailerOfferCard({ o, snap, blocked, a }: { o: TrailerOffer; snap: Snapshot; blocked: string | null; a: FleetActions }) {
  const spec = TRAILERS[o.type];
  const locked = snap.company.rank < spec.rank;
  const traits = trailerTraits(o.type);
  return (
    <article className={`staff-card offer-card${locked ? ' is-locked' : ''}`}>
      <div className="offer-head">
        <TrailerSprite type={o.type} wear={o.wear} seed={o.id} scale={2} />
        <div className="offer-title">
          <strong>{spec.name}</strong>
          <span className={`badge ${o.condition === 'new' ? 'good' : 'warn'}`}>{o.condition === 'new' ? 'nowa' : 'używana'}</span>
          {locked && <span className="badge">od rangi „{RANKS[spec.rank].name}”</span>}
        </div>
      </div>
      <p className="offer-desc muted">{spec.desc}</p>
      <div className="spec-grid">
        <Spec label="Zużycie" hint="Zużyta naczepa dokłada się do awarii zestawu.">
          <WearMeter wear={o.wear} />
        </Spec>
        <Spec label="Wymagania">{traits.length ? traits.join(', ') : 'brak'}</Spec>
      </div>
      <BuyLease o={o} cash={snap.cash} blocked={locked ? `Dealer rozmawia dopiero z rangą „${RANKS[spec.rank].name}”.` : blocked} onPick={(m) => a.acquireTrailer(o.id, m)} />
    </article>
  );
}

export function VehicleMarket({ snap, a, seg, setSeg }: { snap: Snapshot; a: FleetActions; seg: MarketSeg; setSeg: (s: MarketSeg) => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const fleetFull = snap.fleet.length >= snap.company.fleetCap;
  const trailersFull = snap.trailers.length >= snap.trailerCap;
  const byCond = <T extends { condition: string }>(xs: T[]) => (filter === 'all' ? xs : xs.filter((x) => x.condition === filter));
  const trucks = byCond(snap.truckOffers);
  const trailers = byCond(snap.trailerOffers).sort((x, y) => TRAILERS[x.type].rank - TRAILERS[y.type].rank);
  const segs: { id: MarketSeg; label: string; n: number }[] = [
    { id: 'trucks', label: 'Ciągniki', n: snap.truckOffers.length },
    { id: 'trailers', label: 'Naczepy', n: snap.trailerOffers.length },
    { id: 'drivers', label: 'Kierowcy', n: snap.candidates.length },
  ];
  return (
    <>
      <div className="seg" role="tablist" aria-label="Rynek">
        {segs.map((s) => (
          <button key={s.id} role="tab" aria-selected={seg === s.id} className={seg === s.id ? 'on' : ''} onClick={() => setSeg(s.id)}>
            {s.label} <span className="num muted">{s.n}</span>
          </button>
        ))}
      </div>
      {seg === 'drivers' ? (
        <CandidatesList snap={snap} a={a} />
      ) : (
        <>
          <div className="market-bar">
            <div className="setup-chips">
              {(
                [
                  ['all', 'Wszystkie'],
                  ['new', 'Nowe'],
                  ['used', 'Używane'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} className={`chip${filter === id ? ' on' : ''}`} onClick={() => setFilter(id)}>
                  {label}
                </button>
              ))}
            </div>
            <span className="muted num">
              {seg === 'trucks' ? `plac ${snap.fleet.length}/${snap.company.fleetCap}` : `naczepy ${snap.trailers.length}/${snap.trailerCap}`}
            </span>
          </div>
          <p className="staff-note muted">
            <b>Kup</b>: płacisz raz, sprzęt jest Twój, sprzedasz go za ok. 90% wartości. <b>Leasing</b>: kaucja i rata codziennie, zwrot przed czasem kosztuje {MARKETS.returnPenaltyDays} rat.
            {seg === 'trucks' ? ' Nowe palą mniej i rzadko się psują.' : ' Ciągnik bez naczepy nie weźmie zlecenia.'} Oferty zmieniają się co 3 dni.
          </p>
          {seg === 'trucks' && (
            <>
              {trucks.length === 0 && <div className="empty">Handlarz pojechał po auta do Niemiec. Zajrzyj później albo zmień filtr.</div>}
              {trucks.map((o) => (
                <TruckOfferCard key={o.id} o={o} snap={snap} a={a} blocked={fleetFull ? 'Plac pełny: rozbuduj go w zakładce Firma.' : null} />
              ))}
            </>
          )}
          {seg === 'trailers' && (
            <>
              {trailers.length === 0 && <div className="empty">Brak naczep w tym filtrze.</div>}
              {trailers.map((o) => (
                <TrailerOfferCard key={o.id} o={o} snap={snap} a={a} blocked={trailersFull ? `Na placu zmieści się najwyżej ${snap.trailerCap} naczep.` : null} />
              ))}
            </>
          )}
        </>
      )}
    </>
  );
}

/** Lista naczep firmy: co jest pod którym ciągnikiem, co stoi na placu, ile kosztuje. */
export function TrailersList({ snap, a, onMarket }: { snap: Snapshot; a: FleetActions; onMarket: () => void }) {
  const list = [...snap.trailers].sort((x, y) => Number(!!x.truckId) - Number(!!y.truckId));
  const idleTrucks = snap.fleet.filter((t) => !t.trip && t.status !== 'service');
  return (
    <>
      <p className="staff-note muted">
        Naczepę przepinasz między stojącymi ciągnikami (poza siedzibą podstawienie kosztuje). Jeśli wybrany ciągnik ma już naczepę, zamienią się.
      </p>
      {list.length === 0 && <div className="empty">Nie masz żadnej naczepy.</div>}
      {list.map((v) => (
        <TrailerCard key={v.trailer.id} v={v} a={a} idleTrucks={idleTrucks} />
      ))}
      <div className="fc-actions">
        <button className="btn small primary" onClick={onMarket}>
          Kup albo weź w leasing naczepę
        </button>
      </div>
    </>
  );
}

function TrailerCard({ v, a, idleTrucks }: { v: TrailerView; a: FleetActions; idleTrucks: Snapshot['fleet'] }) {
  const tr = v.trailer;
  const spec = TRAILERS[tr.type];
  const targets = idleTrucks.filter((t) => t.truck.id !== v.truckId);
  return (
    <article className={`staff-card${v.truckId ? '' : ' is-free'}`}>
      <div className="offer-head">
        <TrailerSprite type={tr.type} wear={tr.wear} seed={tr.label} scale={2} />
        <div className="offer-title">
          <strong>
            {spec.name} <span className="plate">{tr.label}</span>
          </strong>
          <span className="muted">{v.truckLabel ? `${v.onTrip ? 'w trasie z' : 'pod'} ${v.truckLabel}` : 'stoi na placu'}</span>
        </div>
      </div>
      <div className="spec-grid">
        <Spec label="Zużycie">
          <WearMeter wear={tr.wear} />
        </Spec>
        <Spec label="Przejechane">{km(tr.km)}</Spec>
        <Spec label={tr.ownership === 'own' ? 'Własna' : 'Leasing'}>{tr.ownership === 'own' ? `wartość ${pln(v.value ?? 0)}` : `${pln(tr.leasePerDay)}/dzień`}</Spec>
      </div>
      {!v.onTrip && (
        <div className="fc-actions">
          {targets.length > 0 && (
            <select
              className="pair-select"
              value=""
              aria-label="Podepnij do ciągnika"
              onChange={(e) => e.target.value && a.attachTrailer(e.target.value, tr.id)}
            >
              <option value="">{v.truckId ? 'Przepnij do…' : 'Podepnij do…'}</option>
              {targets.map((t) => (
                <option key={t.truck.id} value={t.truck.id}>
                  #{t.fleetNo} {t.truck.brand} {t.truck.model}
                  {t.trailer ? ` (ma: ${TRAILERS[t.trailer.type].short} ${t.trailer.label})` : ' (bez naczepy)'}
                </option>
              ))}
            </select>
          )}
          {v.truckId && (
            <button className="btn small" onClick={() => a.attachTrailer(v.truckId!, null)}>
              Odepnij
            </button>
          )}
          {tr.ownership === 'own' ? (
            <ConfirmButton label={`Sprzedaj · ${pln(v.value ?? 0)}`} confirm="Na pewno sprzedać?" onConfirm={() => a.disposeTrailer(tr.id)} />
          ) : (
            <ConfirmButton label={`Zwróć · kara ${pln(tr.leasePerDay * MARKETS.returnPenaltyDays)}`} confirm="Na pewno zwrócić?" onConfirm={() => a.disposeTrailer(tr.id)} title="Kaucja przepada" />
          )}
        </div>
      )}
    </article>
  );
}
