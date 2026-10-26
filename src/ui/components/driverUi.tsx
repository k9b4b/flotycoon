import { useState } from 'react';
import { BALANCE } from '../../data/balance';
import { PERK_BY_ID } from '../../data/perks';
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

/** Krótkie etykiety na karcie: perki kierowcy (i ostrzeżenie o morale). Opisy w szczegółach. */
export function TraitChips({ d }: { d: Driver; max?: number }) {
  const items = [
    ...(d.stats.morale < 40 ? [{ text: 'Morale nisko', tone: 'bad', hint: 'Częściej wpada na kontrolach. Pomaga premia i terminowe kursy.' }] : []),
    ...(d.perks ?? []).map((id) => ({ text: PERK_BY_ID[id].name, tone: PERK_BY_ID[id].tone, hint: PERK_BY_ID[id].desc })),
  ];
  return (
    <div className="fc-traits">
      {items.map((x) => (
        <span key={x.text} className={`fc-trait ${x.tone}`} title={x.hint}>
          {x.text}
        </span>
      ))}
    </div>
  );
}

/** Perki z pełnym opisem: do szczegółów kierowcy i rynku pracy. */
export function PerkList({ d }: { d: Driver }) {
  if (!d.perks?.length) return null;
  return (
    <ul className="perk-list">
      {d.perks.map((id) => {
        const p = PERK_BY_ID[id];
        return (
          <li key={id}>
            <span className={`fc-trait ${p.tone}`}>{p.name}</span>
            <span className="muted">{p.desc}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Co daje każda statystyka. Liczby zgodne z engine/effects.ts. */
export const STAT_INFO: Record<string, string> = {
  experience: 'Średnia prędkość: od −7% do +5% względem prędkości bazowej. Rośnie z każdym przejechanym kilometrem.',
  eco: 'Spalanie: od +12% przy zerze do −10% przy setce. Paliwo to największy koszt kursu.',
  reliability: 'Szansa, że kontrola ITD skończy się mandatem (i utratą reputacji). Pomaga też, gdy na kontroli giną papiery.',
  stamina: 'Ryzyko, że kierowca zaśpi i przedłuży odpoczynek na trasach powyżej 250 km. Ważna też, gdy na trasie kleją się oczy.',
  morale: `Mnoży niezawodność: przy zerowym morale kierowca działa na 70% swojej niezawodności. Rośnie po terminowych kursach i premii, spada po spóźnieniach i bez pracy, a z czasem wraca do ok. ${BALANCE.moraleBaseline} (perki mogą to przesunąć).`,
};

export function StatBars({ d, skipMorale = false }: { d: Driver; skipMorale?: boolean }) {
  const [info, setInfo] = useState(false);
  const keys = Object.keys(d.stats).filter((k) => !(skipMorale && k === 'morale'));
  return (
    <div className="fc-stats">
      <div className="fc-stats-head">
        <span className="muted">Statystyki</span>
        <button
          type="button"
          className={`info-btn${info ? ' on' : ''}`}
          aria-expanded={info}
          aria-label="Co oznaczają statystyki"
          title="Co oznaczają statystyki"
          onClick={(e) => {
            e.stopPropagation();
            setInfo(!info);
          }}
        >
          i
        </button>
      </div>
      {info && (
        <dl className="stat-info" onClick={(e) => e.stopPropagation()}>
          {keys.map((k) => (
            <div key={k}>
              <dt>{STAT_LABELS[k]}</dt>
              <dd className="muted">{STAT_INFO[k]}</dd>
            </div>
          ))}
          <div>
            <dt>Ocena</dt>
            <dd className="muted">Liczba w kółku przy nazwisku: średnia doświadczenia, eco-drivingu, niezawodności i kondycji (bez morale, bo ono się zmienia).</dd>
          </div>
        </dl>
      )}
      {Object.entries(d.stats)
        .filter(([k]) => keys.includes(k))
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

/** Ogólna ocena kierowcy 0–100: średnia umiejętności (bez morale, które się zmienia). */
export function driverScore(d: Driver): number {
  const s = d.stats;
  return Math.round((s.experience + s.eco + s.reliability + s.stamina) / 4);
}

export function ScoreBadge({ d }: { d: Driver }) {
  const v = driverScore(d);
  return (
    <span className="score-badge num" style={{ color: statColor(v), borderColor: statColor(v) }} title="Ocena: średnia doświadczenia, eco-drivingu, niezawodności i kondycji">
      {v}
    </span>
  );
}
