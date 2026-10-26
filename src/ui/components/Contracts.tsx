import { CONTRACTS } from '../../data/development';
import { RANKS } from '../../data/progression';
import { formatGameTime } from '../../engine/time';
import type { Snapshot } from '../../engine/view';
import type { Contract } from '../../engine/types';
import { city, km, pln } from '../format';

/** Kontrakty ze stałymi klientami: aktywne umowy, oferty do podpisania i historia. */

const every = (d: number) => (d === 1 ? 'codziennie' : `co ${d} dni`);

function Strikes({ n }: { n: number }) {
  return (
    <span className="strikes" title={`Wpadki: ${n} z ${CONTRACTS.maxStrikes}. Po ${CONTRACTS.maxStrikes} klient zrywa umowę.`}>
      {Array.from({ length: CONTRACTS.maxStrikes }, (_, i) => (
        <span key={i} className={i < n ? 'on' : ''} />
      ))}
    </span>
  );
}

function ActiveCard({ c, snap }: { c: Contract; snap: Snapshot }) {
  const pending = c.pendingJobId ? snap.market.find((j) => j.id === c.pendingJobId) : null;
  const done = c.runsDone + c.missed;
  return (
    <article className={`staff-card contract-card${c.status !== 'active' ? ' ended' : ''}`}>
      <div className="staff-head">
        <div className="fc-driver">
          <strong>{c.client}</strong>
          {city(c.fromId)} → {city(c.toId)} · {km(c.km)}
        </div>
        {c.status === 'active' ? <Strikes n={c.strikes} /> : <span className={`badge ${c.status === 'done' ? 'good' : 'bad'}`}>{c.status === 'done' ? 'wykonany' : 'zerwany'}</span>}
      </div>
      <div className="contract-progress" aria-label={`Kursy ${done} z ${c.runsTotal}`}>
        {Array.from({ length: c.runsTotal }, (_, i) => (
          <span key={i} className={i < c.runsDone ? 'ok' : i < done ? 'miss' : ''} />
        ))}
      </div>
      <div className="staff-line">
        <span className="muted">
          {c.cargo} · {every(c.everyDays)} · {pln(c.paymentPerRun)}/kurs
        </span>
        {c.status === 'active' && (
          <span className="muted num">
            {pending ? <strong className="warn">kurs czeka na giełdzie</strong> : c.runsPosted < c.runsTotal ? `następny załadunek ${formatGameTime(c.nextRunAt)}` : 'ostatni kurs w drodze'}
          </span>
        )}
      </div>
    </article>
  );
}

export function ContractsView({ snap, onSign }: { snap: Snapshot; onSign: (id: string) => void }) {
  const active = snap.contracts.filter((c) => c.status === 'active');
  const ended = snap.contracts.filter((c) => c.status !== 'active');
  const full = active.length >= snap.contractLimit;
  const locked = snap.contractLimit === 0;
  return (
    <>
      <p className="staff-note muted">
        Stała trasa za lepszą stawkę niż na giełdzie. Każdy kurs pojawia się na giełdzie dobę przed załadunkiem i wisi na górze listy. Kurs, którego nikt
        nie weźmie, kosztuje karę. Spóźnienie albo przepadnięty kurs to wpadka, a po {CONTRACTS.maxStrikes} wpadkach klient zrywa umowę. Za dokończoną
        umowę jest premia i reputacja. Nowe oferty co tydzień.
        {locked && <strong className="bad"> Klienci podpisują umowy od rangi „{RANKS[CONTRACTS.minRank].name}”.</strong>}
      </p>
      {active.length > 0 && <h3 className="sub-h">Aktywne</h3>}
      {active.map((c) => (
        <ActiveCard key={c.id} c={c} snap={snap} />
      ))}
      <h3 className="sub-h">Oferty</h3>
      {snap.contractOffers.length === 0 && <div className="empty">{locked ? 'Na razie nikt nie chce podpisać umowy z „jednym gościem z Iveco”.' : 'Klienci myślą. Nowe oferty za kilka dni.'}</div>}
      {snap.contractOffers.map((o) => (
        <article key={o.id} className="staff-card contract-card">
          <div className="staff-head">
            <div className="fc-driver">
              <strong>{o.client}</strong>
              {city(o.fromId)} → {city(o.toId)} · {km(o.km)}
            </div>
            <span className="num">{pln(o.paymentPerRun)}/kurs</span>
          </div>
          <div className="staff-specs">
            <span>{o.cargo}</span>
            <span>{o.weightT} t</span>
            <span>{every(o.everyDays)}</span>
            <span>{o.runsTotal} kursów</span>
            <span className="num">{(o.paymentPerRun / o.km).toFixed(2)} zł/km</span>
          </div>
          <div className="staff-line">
            <span className="muted">
              Premia na koniec <strong className="good num">{pln(o.bonus)}</strong> · kara za przepadnięty kurs <strong className="bad num">{pln(o.penaltyPerMiss)}</strong>
            </span>
            <span className="muted">oferta do {formatGameTime(o.expiresAt)}</span>
          </div>
          <div className="fc-actions">
            <button className="btn small primary" disabled={locked || full} onClick={() => onSign(o.id)} title={full ? 'Limit kontraktów przy tej randze' : undefined}>
              {full && !locked ? `Limit ${snap.contractLimit} kontrakt${snap.contractLimit === 1 ? '' : 'ów'}` : 'Podpisz umowę'}
            </button>
          </div>
        </article>
      ))}
      {ended.length > 0 && <h3 className="sub-h">Zakończone</h3>}
      {ended.map((c) => (
        <ActiveCard key={c.id} c={c} snap={snap} />
      ))}
    </>
  );
}
