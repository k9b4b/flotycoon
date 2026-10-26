import type { Driver } from '../../engine/types';
import { STAT_LABELS } from '../format';

/** Wspólne elementy kierowców: etykiety cech i paski statystyk (karta zestawu, kadry, rynek pracy). */

export interface Trait {
  text: string;
  tone: 'good' | 'bad';
  hint?: string;
}

/** Krótkie etykiety zamiast pięciu pasków: tylko skrajne wartości mają wpływ na decyzje. */
export function traits(d: Driver, max = 3): Trait[] {
  const s = d.stats;
  const out: Trait[] = [];
  if (s.morale < 40) out.push({ text: 'Morale nisko', tone: 'bad', hint: 'Częściej wpada na kontrolach. Pomaga premia i terminowe kursy.' });
  if (s.experience >= 80) out.push({ text: 'Rutyniarz', tone: 'good', hint: 'Szybciej dojeżdża.' });
  else if (s.experience < 30) out.push({ text: 'Świeżak', tone: 'bad', hint: 'Wolniej jeździ, ale uczy się z każdym kilometrem.' });
  if (s.eco >= 80) out.push({ text: 'Eco-mistrz', tone: 'good', hint: 'Pali wyraźnie mniej.' });
  else if (s.eco < 30) out.push({ text: 'Pali jak smok', tone: 'bad', hint: 'Spalanie nawet o 10% wyższe.' });
  if (s.reliability >= 80) out.push({ text: 'Solidny', tone: 'good', hint: 'Rzadko wpada na kontrolach.' });
  else if (s.reliability < 30) out.push({ text: 'Ryzykant', tone: 'bad', hint: 'Częste mandaty z ITD.' });
  if (s.stamina >= 80) out.push({ text: 'Żelazna kondycja', tone: 'good', hint: 'Nie zasypia na MOP-ach.' });
  else if (s.stamina < 30) out.push({ text: 'Śpioch', tone: 'bad', hint: 'Lubi przedłużyć odpoczynek.' });
  return out.slice(0, max);
}

export function statColor(v: number) {
  if (v >= 70) return 'var(--good)';
  if (v >= 45) return 'var(--accent)';
  return 'var(--bad)';
}

export const wearColor = (w: number) => (w > 0.5 ? 'var(--bad)' : w > 0.3 ? 'var(--accent)' : 'var(--good)');

export function TraitChips({ d, max }: { d: Driver; max?: number }) {
  return (
    <div className="fc-traits">
      {traits(d, max).map((x) => (
        <span key={x.text} className={`fc-trait ${x.tone}`} title={x.hint}>
          {x.text}
        </span>
      ))}
    </div>
  );
}

export function StatBars({ d, skipMorale = false }: { d: Driver; skipMorale?: boolean }) {
  return (
    <div className="fc-stats">
      {Object.entries(d.stats)
        .filter(([k]) => !(skipMorale && k === 'morale'))
        .map(([k, v]) => (
          <div className="fc-stat" key={k}>
            <span className="fc-stat-name">{STAT_LABELS[k]}</span>
            <span className="fc-stat-bar">
              <span style={{ width: `${v}%`, background: statColor(v) }} />
            </span>
            <span className="num fc-stat-val">{Math.round(v)}</span>
          </div>
        ))}
    </div>
  );
}
