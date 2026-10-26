import { RANKS, type UpgradeId } from '../../data/progression';
import type { Snapshot } from '../../engine/view';
import { pln } from '../format';

/** Rozwój firmy: ranga z reputacji, plac (limit floty), ulepszenia bazy i dyspozytor. */
export function CompanyPanel({
  snap,
  onYard,
  onUpgrade,
  onAutoDispatch,
  onAskDecisions,
}: {
  snap: Snapshot;
  onYard: () => void;
  onUpgrade: (id: UpgradeId) => void;
  onAutoDispatch: (on: boolean) => void;
  onAskDecisions: (on: boolean) => void;
}) {
  const c = snap.company;
  const span = c.repTo !== null ? c.repTo - c.repFrom : 1;
  const progress = c.repTo !== null ? Math.min(1, (c.reputation - c.repFrom) / span) : 1;
  return (
    <section className="panel area-growth">
      <div className="panel-head">
        <span className="panel-title">Rozwój firmy</span>
        <span className="spacer" />
        {c.upkeepPerDay > 0 && (
          <span className="muted" style={{ fontSize: 12 }}>
            utrzymanie bazy {pln(c.upkeepPerDay)}/dzień
          </span>
        )}
      </div>
      <div className="panel-body growth">
        <div className="rank">
          <div className="rank-label">Ranga</div>
          <div className="rank-name">{c.rankName}</div>
          <div className="rank-bar" role="progressbar" aria-valuemin={c.repFrom} aria-valuemax={c.repTo ?? c.reputation} aria-valuenow={c.reputation}>
            <span style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="rank-meta">
            <span className="num">
              Reputacja {c.reputation}
              {c.repTo !== null && ` / ${c.repTo}`}
            </span>
            {c.nextRankName && <span className="muted">dalej: {c.nextRankName}</span>}
          </div>
          <p className="muted rank-perk">
            {c.nextRankPerk ? `Następna ranga: ${c.nextRankPerk}` : c.perk} Reputację budują terminowe kursy (pilne liczą się podwójnie), a niszczą spóźnienia i
            mandaty.
          </p>
        </div>

        <div className="growth-grid">
          <article className="up-card">
            <div className="up-head">
              <strong>Plac</strong>
              <span className="badge good">{c.fleetCap} aut</span>
            </div>
            <div className="muted up-desc">
              {c.yardName}. Kierowców może być {c.driverCap}.
            </div>
            {c.nextYard ? (
              <button className={`btn small ${c.nextYard.unlocked ? 'primary' : 'locked'}`} disabled={!c.nextYard.unlocked || snap.cash < c.nextYard.cost} onClick={onYard}>
                {c.nextYard.unlocked ? `${c.nextYard.name} · ${c.nextYard.cap} aut · ${pln(c.nextYard.cost)}` : `${c.nextYard.name}: od rangi „${c.nextYard.rankName}”`}
              </button>
            ) : (
              <span className="muted up-desc">Największy plac w okolicy.</span>
            )}
          </article>

          {c.upgrades.map((u) => (
            <article key={u.id} className={`up-card${u.owned ? ' owned' : ''}`}>
              <div className="up-head">
                <strong>{u.name}</strong>
                {u.owned && <span className="badge good">jest</span>}
              </div>
              <div className="muted up-desc">{u.description}</div>
              {u.owned ? (
                u.id === 'dispatcher' ? (
                  <label className="switch">
                    <input type="checkbox" checked={c.base.autoDispatch} onChange={(e) => onAutoDispatch(e.target.checked)} />
                    <span>{c.base.autoDispatch ? 'Halina przydziela ładunki' : 'Halina wstrzymana'}</span>
                  </label>
                ) : (
                  <span className="muted up-desc">Utrzymanie {pln(u.perDay)}/dzień</span>
                )
              ) : (
                <button className={`btn small ${u.unlocked ? 'primary' : 'locked'}`} disabled={!u.unlocked || snap.cash < u.cost} onClick={() => onUpgrade(u.id)}>
                  {u.unlocked ? `${pln(u.cost)} + ${pln(u.perDay)}/dzień` : `Od rangi „${rankName(u.rank)}”`}
                </button>
              )}
            </article>
          ))}

          <article className="up-card">
            <div className="up-head">
              <strong>Telefon od kierowców</strong>
            </div>
            <div className="muted up-desc">
              Gdy na trasie coś się dzieje, kierowca dzwoni po decyzję, a zegar gry czeka. Wyłączone: kierowcy decydują sami, zgodnie ze swoim
              charakterem. Gdy gra działa w tle, i tak decydują sami.
            </div>
            <label className="switch">
              <input type="checkbox" checked={snap.settings.askDecisions} onChange={(e) => onAskDecisions(e.target.checked)} />
              <span>{snap.settings.askDecisions ? 'Pytają mnie o decyzje' : 'Decydują sami'}</span>
            </label>
          </article>
        </div>
      </div>
    </section>
  );
}

const rankName = (i: number) => RANKS[i].name;
