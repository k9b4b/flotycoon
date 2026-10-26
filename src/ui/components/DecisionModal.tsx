import { formatDuration } from '../../engine/time';
import type { DecisionView } from '../../engine/view';
import { DriverAvatar } from '../avatar';
import { ScoreBadge, TraitChips } from './driverUi';

/**
 * Telefon od kierowcy: zdarzenie na trasie czeka na decyzję, zegar gry stoi.
 * Pokazujemy też, co kierowca wybrałby sam (jego charakter = perki i statystyki).
 */
export function DecisionModal({ d, more, onChoose, onShow }: { d: DecisionView; more: number; onChoose: (optionId: string) => void; onShow: () => void }) {
  const pick = d.options.find((o) => o.id === d.driverPick);
  const late = d.bufferMin < 0;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="dec-title">
      <div className="modal decision">
        <div className="dec-top">
          <span className="dec-ring" aria-hidden>
            ☎
          </span>
          <span className="muted">Dzwoni kierowca · zegar gry czeka{more > 0 ? ` · w kolejce jeszcze ${more}` : ''}</span>
        </div>
        <h2 id="dec-title">{d.title}</h2>
        <div className="dec-who">
          <span className="fc-id">
            <DriverAvatar d={d.driver} size={64} />
            <span className="fc-no num">{d.fleetNo}</span>
          </span>
          <div>
            <div className="fc-driver">
              <strong>„{d.driver.nickname}”</strong> {d.driver.firstName} {d.driver.lastName}
              <ScoreBadge d={d.driver} />
            </div>
            <div className="muted dec-route">
              {d.route} ·{' '}
              <span className={late ? 'bad' : d.bufferMin < 120 ? 'warn' : 'good'}>
                {late ? `już ${formatDuration(-d.bufferMin)} po terminie` : `zapas ${formatDuration(d.bufferMin)}`}
              </span>
            </div>
          </div>
          <button className="btn small" onClick={onShow}>
            Na mapie
          </button>
        </div>
        <TraitChips d={d.driver} />
        <p className="dec-text">{d.text}</p>
        <div className="dec-options">
          {d.options.map((o) => (
            <button key={o.id} className={`dec-opt${o.id === d.driverPick ? ' picked' : ''}`} onClick={() => onChoose(o.id)}>
              <strong>
                {o.label}
                {o.id === d.driverPick && <em className="dec-tag">wybór kierowcy</em>}
              </strong>
              <span className="muted">{o.hint}</span>
            </button>
          ))}
        </div>
        {pick && (
          <button className="btn small dec-delegate" onClick={() => onChoose(pick.id)}>
            Niech {d.driver.nickname} zdecyduje: „{pick.label}”
          </button>
        )}
      </div>
    </div>
  );
}
