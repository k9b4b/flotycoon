import { CITY_BY_ID } from '../data/cities';

export const pln = (v: number) => `${Math.round(v).toLocaleString('pl-PL')} zł`;
export const plnSigned = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v)).toLocaleString('pl-PL')} zł`;
export const km = (v: number) => `${Math.round(v).toLocaleString('pl-PL')} km`;
export const city = (id: string) => CITY_BY_ID[id]?.name ?? id;
export const pct = (v: number) => `${Math.round(v * 100)}%`;

export const COST_LABELS: Record<string, string> = {
  fuel: 'Paliwo',
  toll: 'Myto',
  salaries: 'Pensje',
  lease: 'Leasing',
  repairs: 'Serwis i naprawy',
  fines: 'Mandaty',
  fleet: 'Zakupy, kaucje, rekrutacja, inwestycje',
  bonuses: 'Premie',
  base: 'Baza, biuro, dyspozytor',
  training: 'Szkolenia',
};

export const STAT_LABELS: Record<string, string> = {
  experience: 'Doświadczenie',
  eco: 'Eco-driving',
  reliability: 'Niezawodność',
  stamina: 'Kondycja',
  morale: 'Morale',
};
