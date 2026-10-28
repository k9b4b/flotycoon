import { CITY_BY_ID } from '../data/cities';
import type { PerkId } from '../data/perks';
import { fmtPLN } from './core';
import { clamp, hasPerk } from './effects';
import { chance, randInt, type RngState } from './rng';
import type { CostCategory, Driver, GameState, LogTone, Trip, Truck } from './types';

/**
 * Zdarzenia na trasie, które wymagają decyzji.
 * W trakcie gry zatrzymują zegar i pytają gracza. W tle i podczas nieobecności decyduje kierowca,
 * zgodnie ze swoimi statystykami i perkami (funkcja `auto`).
 */

export interface EventCtx {
  s: GameState;
  r: RngState;
  d: Driver;
  t: Truck;
  trip: Trip;
  /** Liczby wylosowane przy zdarzeniu: opis, podpowiedź i wynik operują na tych samych wartościach. */
  vars: Record<string, number | string>;
  has(id: PerkId): boolean;
  /** Zapas czasu do terminu (min), według aktualnego harmonogramu. */
  buffer: number;
  fill(text: string): string;
}

export interface Outcome {
  text: string;
  tone: LogTone;
  /** Opóźnienie kursu (min), dopisane do harmonogramu w chwili zdarzenia. */
  delayMin?: number;
  cost?: number;
  costCat?: CostCategory;
  /** Zmiana frachtu (dopłata albo potrącenie przy rozładunku). */
  payment?: number;
  /** Mniejszy koszt paliwa na tym kursie. */
  fuelSaving?: number;
  /** Przesunięcie terminu dostawy (min). */
  deadline?: number;
  morale?: number;
  rep?: number;
  wear?: number;
}

export interface RoadEventOption {
  id: string;
  label: string | ((c: EventCtx) => string);
  hint: string | ((c: EventCtx) => string);
  resolve(c: EventCtx): Outcome;
}

export interface RoadEventDef {
  id: string;
  title: string;
  weight: number;
  init?(c: EventCtx): Record<string, number | string>;
  text(c: EventCtx): string;
  options: RoadEventOption[];
  /** Co wybrałby kierowca sam. */
  auto(c: EventCtx): string;
}

const ri = (c: EventCtx, a: number, b: number) => randInt(c.r, a, b);
/** Szansa powodzenia z poprawką na charakter: stoik ma szczęście do ryzyka, narwany pecha. */
const luck = (c: EventCtx, p: number) => clamp(p + (c.has('stoik') ? 0.1 : 0) - (c.has('narwany') ? 0.1 : 0), 0.02, 0.98);
const n = (c: EventCtx, k: string) => Number(c.vars[k]);
/** Towary, którym grzechot w naczepie szkodzi najbardziej. */
const fragile = (trip: Trip) => /Bombki|Piwo|Lodówki|Leki/.test(trip.job.cargo);

export const ROAD_EVENTS: readonly RoadEventDef[] = [
  {
    id: 'blockade',
    title: 'Karambol, autostrada stoi',
    weight: 3,
    text: (c) =>
      c.fill('{nick} melduje: przed nami karambol, autostrada stoi w obu kierunkach. Nawigacja proponuje objazd przez wsie, a na CB radzą: „czekaj, zaraz puszczą”.'),
    options: [
      {
        id: 'wait',
        label: 'Czekamy, aż puszczą',
        hint: 'Pewne, ale 1,5–3 h w plecy.',
        resolve: (c) => ({ text: c.fill('{nick} odstał{a} swoje w korku. Kawa z termosu, pogaduszki na CB.'), tone: 'funny', delayMin: ri(c, 90, 180) }),
      },
      {
        id: 'detour',
        label: 'Objazd bocznymi drogami',
        hint: (c) => `Ok. 35–60 min i ~200 zł paliwa. Ryzyko pobłądzenia${c.has('zna_skroty') ? ' (zna skróty: małe)' : ''}.`,
        resolve: (c) => {
          const base = ri(c, 35, 60);
          const fuel = ri(c, 150, 260);
          const pFail = c.has('zna_skroty') ? 0.05 : clamp(0.35 - (c.d.stats.experience / 100) * 0.25 + (c.has('pechowiec') ? 0.15 : 0), 0.05, 0.6);
          if (chance(c.r, pFail)) {
            return {
              text: c.fill('Objazd skończył się pod wiaduktem 3,5 m. Naczepa ma 4. {nick} cofał{a} przez pół wsi przy aplauzie miejscowych.'),
              tone: 'bad',
              delayMin: base + ri(c, 60, 120),
              cost: fuel,
              costCat: 'fuel',
            };
          }
          return { text: c.fill('{nick} przejechał{a} bocznymi drogami i wrócił{a} na trasę przed korkiem.'), tone: 'good', delayMin: base, cost: fuel, costCat: 'fuel' };
        },
      },
      {
        id: 'call',
        label: 'Dzwonimy do klienta o nowy termin',
        hint: (c) => `Czekamy jak wszyscy, ale może przesuną termin. Szansa ${c.has('ulubieniec') ? 'duża' : c.has('narwany') ? 'mała' : 'pół na pół'}.`,
        resolve: (c) => {
          const delay = ri(c, 90, 180);
          const p = luck(c, 0.5 + (c.has('ulubieniec') ? 0.3 : 0));
          if (chance(c.r, p)) {
            return { text: `Klient: „Widzimy w radiu, spokojnie”. Termin przesunięty o ${Math.round(delay / 60)} h.`, tone: 'good', delayMin: delay, deadline: delay };
          }
          return { text: 'Klient: „Umowa to umowa”. Termin bez zmian, czekamy w korku.', tone: 'bad', delayMin: delay };
        },
      },
    ],
    auto: (c) => (c.has('zna_skroty') || c.d.stats.experience > 70 ? 'detour' : c.has('ulubieniec') ? 'call' : c.buffer > 200 ? 'wait' : 'call'),
  },
  {
    id: 'docs',
    title: 'Kontrola ITD: gdzie te papiery?',
    weight: 1,
    text: (c) => c.fill('Inspektor ITD prosi o wypis z licencji, a {nick} od kwadransa przekopuje schowek, kieszenie drzwi i pudełko po kanapkach.'),
    options: [
      {
        id: 'search',
        label: 'Szukaj dalej',
        hint: (c) => `30–50 min. Jak nie znajdzie, mandat 1000–2000 zł${c.has('teczka') ? ' (teczka z papierami: prawie na pewno znajdzie)' : ''}.`,
        resolve: (c) => {
          const delay = ri(c, 30, 50);
          const p = c.has('teczka') ? 0.95 : clamp(0.35 + (c.d.stats.reliability / 100) * 0.5 - (c.has('zapominalski') ? 0.3 : 0), 0.05, 0.9);
          if (chance(c.r, p)) return { text: c.fill('Wypis był w instrukcji obsługi radia. Inspektor kiwa głową i puszcza zestaw dalej.'), tone: 'good', delayMin: delay };
          return { text: 'Papierów nie ma. Mandat i wpis do protokołu.', tone: 'bad', delayMin: delay, cost: ri(c, 10, 20) * 100, costCat: 'fines', rep: -1 };
        },
      },
      {
        id: 'admit',
        label: 'Przyznaj się, zapłać mandat',
        hint: 'Szybko: 15 min i 500–900 zł.',
        resolve: (c) => ({ text: c.fill('{nick} rozkłada ręce. Mandat na miejscu, bez dyskusji.'), tone: 'bad', delayMin: 15, cost: ri(c, 5, 9) * 100, costCat: 'fines' }),
      },
      {
        id: 'office',
        label: (c) => (c.s.base.office ? 'Biuro wyśle skan' : 'Niech ktoś w domu poszuka skanu'),
        hint: (c) => (c.s.base.office ? 'Biuro spedycji: 20 min, prawie pewne.' : '45–75 min, szansa ok. 60%.'),
        resolve: (c) => {
          if (c.s.base.office) return { text: 'Biuro wysłało skan w 5 minut. Inspektor: „No proszę, jaka nowoczesność”.', tone: 'good', delayMin: 20 };
          const delay = ri(c, 45, 75);
          if (chance(c.r, 0.6)) return { text: 'Szwagier znalazł skan na pendrivie od wesela. Działa.', tone: 'funny', delayMin: delay };
          return { text: 'Szwagier znalazł tylko zdjęcia z wesela. Mandat.', tone: 'bad', delayMin: delay, cost: 800, costCat: 'fines', rep: -1 };
        },
      },
    ],
    auto: (c) => (c.has('teczka') || c.d.stats.reliability > 70 ? 'search' : c.s.base.office ? 'office' : 'admit'),
  },
  {
    id: 'engine_light',
    title: 'Kontrolka silnika',
    weight: 2,
    text: (c) => c.fill(`Na desce ${c.t.brand} ${c.t.model} zapaliła się żółta kontrolka. {nick} twierdzi, że silnik brzmi „raczej normalnie”.`),
    options: [
      {
        id: 'ignore',
        label: 'Jedziemy dalej',
        hint: (c) => `Bez straty czasu, ale ryzyko awarii (zużycie auta ${Math.round(c.t.wear * 100)}%).`,
        resolve: (c) => {
          if (chance(c.r, clamp((0.05 + c.t.wear * 0.45) * (c.has('pechowiec') ? 1.4 : 1), 0, 0.8))) {
            return { text: c.fill('Kontrolka zrobiła się czerwona, a potem zrobiło się cicho. Laweta i warsztat przy trasie.'), tone: 'bad', delayMin: ri(c, 150, 300), cost: ri(c, 15, 35) * 100, costCat: 'repairs', wear: 0.03 };
          }
          return { text: 'Kontrolka zgasła sama po 20 km. Cud techniki.', tone: 'funny' };
        },
      },
      {
        id: 'roadside',
        label: 'Serwis przy trasie',
        hint: '1,5–2,5 h i 400–800 zł. Zużycie auta spadnie o kilka punktów.',
        resolve: (c) => ({ text: 'Mechanik przy trasie wymienił czujnik i coś jeszcze „przy okazji”.', tone: 'info', delayMin: ri(c, 90, 150), cost: ri(c, 4, 8) * 100, costCat: 'repairs', wear: -0.06 }),
      },
      {
        id: 'self',
        label: (c) => c.fill('Niech {nick} sam{a} zajrzy'),
        hint: (c) => (c.has('zlota_raczka') ? 'Złota rączka: 30–50 min, prawie pewne.' : '30–50 min. Bez smykałki do mechaniki może pogorszyć sprawę.'),
        resolve: (c) => {
          const delay = ri(c, 30, 50);
          const p = c.has('zlota_raczka') ? 0.9 : luck(c, 0.25 + (c.d.stats.experience / 100) * 0.3);
          if (chance(c.r, p)) return { text: c.fill('{nick} poprawił{a} wtyczkę czujnika i przeczyścił{a} styki. Kontrolka zgasła.'), tone: 'good', delayMin: delay, wear: -0.02 };
          return { text: c.fill('Po grzebaniu kontrolka mruga na czerwono. Laweta.'), tone: 'bad', delayMin: delay + ri(c, 150, 300), cost: ri(c, 20, 40) * 100, costCat: 'repairs', wear: 0.03 };
        },
      },
    ],
    auto: (c) => (c.has('zlota_raczka') ? 'self' : c.t.wear > 0.3 ? 'roadside' : 'ignore'),
  },
  {
    id: 'tired',
    title: 'Oczy się kleją',
    weight: 2,
    text: (c) => c.fill('{nick} dzwoni: „Szefie, oczy mi się kleją, a do parkingu jeszcze godzinka. Co robimy?”'),
    options: [
      {
        id: 'push',
        label: 'Jedź, dasz radę',
        hint: (c) => `Bez straty czasu, ale ryzyko kolizji (kondycja ${Math.round(c.d.stats.stamina)}). Morale spadnie.`,
        resolve: (c) => {
          const p = clamp(0.3 * (1 - c.d.stats.stamina / 100) + (c.has('mop') ? 0.15 : 0) - (c.has('nocny_marek') ? 0.1 : 0), 0.02, 0.6);
          if (chance(c.r, p)) {
            return { text: c.fill('Na sekundę opadły powieki i {nick} zahaczył{a} lusterkiem o barierkę. Nikomu nic, ale lusterko i lakier do wymiany.'), tone: 'bad', delayMin: ri(c, 60, 120), cost: ri(c, 15, 30) * 100, costCat: 'repairs', morale: -10, rep: -2 };
          }
          return { text: c.fill('{nick} dojechał{a}, ale na CB odzywa się już tylko półsłówkami.'), tone: 'info', morale: -6 };
        },
      },
      {
        id: 'nap',
        label: 'Drzemka na najbliższej zatoczce',
        hint: '40–70 min straty, morale w górę.',
        resolve: (c) => ({ text: c.fill('{nick} zrobił{a} sobie drzemkę i jedzie dalej jak nowo narodzon{y}.'), tone: 'good', delayMin: ri(c, 40, 70), morale: 4 }),
      },
      {
        id: 'coffee',
        label: 'Podwójne espresso z automatu',
        hint: 'Tylko 15 min, ryzyko o połowę mniejsze niż bez przerwy.',
        resolve: (c) => {
          const p = clamp(0.15 * (1 - c.d.stats.stamina / 100) + (c.has('mop') ? 0.08 : 0), 0.01, 0.3);
          if (chance(c.r, p)) {
            return { text: c.fill('Espresso nie pomogło. {nick} otarł{a} się o słupek na zjeździe.'), tone: 'bad', delayMin: ri(c, 45, 90), cost: ri(c, 10, 20) * 100, costCat: 'repairs', morale: -6, rep: -1 };
          }
          return { text: c.fill('Espresso z automatu smakuje jak paliwo, ale działa. {nick} jedzie dalej.'), tone: 'funny', delayMin: 15, morale: -1 };
        },
      },
    ],
    auto: (c) => (c.d.stats.stamina > 70 || c.has('nocny_marek') ? 'coffee' : c.has('narwany') ? 'push' : 'nap'),
  },
  {
    id: 'extra_drop',
    title: 'Dodatkowy rozładunek po drodze',
    weight: 3,
    init: (c) => ({ pay: ri(c, 6, 15) * 100, city: CITY_BY_ID[c.trip.job.toId].gen }),
    text: (c) => c.fill(`Klient dzwoni: „A może {pan} po drodze zostawi dwie palety u szwagra w okolicach ${c.vars.city}? Dopłacimy ${fmtPLN(n(c, 'pay'))}”.`),
    options: [
      {
        id: 'accept',
        label: (c) => `Bierzemy, +${fmtPLN(n(c, 'pay'))}`,
        hint: '1–2 h dłużej. Uważaj na termin.',
        resolve: (c) => ({ text: c.fill(`Palety u szwagra. Szwagier poczęstował kawą i bigosem. +${fmtPLN(n(c, 'pay'))} do frachtu.`), tone: 'good', delayMin: ri(c, 60, 120), payment: n(c, 'pay') }),
      },
      {
        id: 'haggle',
        label: 'Negocjuj wyższą dopłatę',
        hint: (c) => `Może wyjść prawie dwa razy więcej, może nic (i foch klienta). Szansa ${c.has('ulubieniec') ? 'duża' : c.has('narwany') ? 'mała' : 'średnia'}.`,
        resolve: (c) => {
          const p = luck(c, 0.45 + (c.has('ulubieniec') ? 0.3 : 0));
          if (chance(c.r, p)) {
            const pay = Math.round((n(c, 'pay') * 1.8) / 100) * 100;
            return { text: `Klient westchnął i dorzucił. +${fmtPLN(pay)} do frachtu.`, tone: 'good', delayMin: ri(c, 60, 120), payment: pay };
          }
          return { text: 'Klient się obraził. Szwagier też. Palety pojadą kimś innym.', tone: 'bad', rep: -1 };
        },
      },
      {
        id: 'decline',
        label: 'Grzecznie odmów',
        hint: 'Nic nie tracimy, nic nie zyskujemy.',
        resolve: () => ({ text: 'Klient: „Rozumiem, następnym razem”. Jedziemy według planu.', tone: 'info' }),
      },
    ],
    auto: (c) => (c.has('ulubieniec') ? 'haggle' : c.buffer > 180 ? 'accept' : 'decline'),
  },
  {
    id: 'rattle',
    title: 'Coś grzechocze w naczepie',
    weight: 1,
    text: (c) => c.fill(`Na wybojach coś zagrzechotało z tyłu. W naczepie: ${c.trip.job.cargo.charAt(0).toLowerCase() + c.trip.job.cargo.slice(1)}.`),
    options: [
      {
        id: 'check',
        label: 'Stań i sprawdź',
        hint: '25–45 min, ale towar bezpieczny.',
        resolve: (c) => ({ text: c.fill('Pas mocujący się poluzował. {nick} poprawił{a} mocowanie i jedziemy dalej.'), tone: 'good', delayMin: ri(c, 25, 45) }),
      },
      {
        id: 'go',
        label: 'Jedziemy, pewnie nic',
        hint: (c) => `Bez straty czasu. Ryzyko szkody w ładunku${fragile(c.trip) ? ' (towar delikatny: spore!)' : ''}.`,
        resolve: (c) => {
          if (chance(c.r, fragile(c.trip) ? 0.5 : 0.2)) {
            const cut = Math.round(c.trip.job.payment * (ri(c, 15, 30) / 100));
            return { text: `Na rozładunku protokół szkód. Klient potrąca ${fmtPLN(cut)} z frachtu.`, tone: 'bad', payment: -cut, rep: -2 };
          }
          return { text: 'Grzechotało do końca trasy, ale towar cały. Szczęście głupiego.', tone: 'funny' };
        },
      },
    ],
    auto: (c) => (c.has('narwany') || c.has('pirat') ? 'go' : c.d.stats.reliability > 50 || fragile(c.trip) ? 'check' : 'go'),
  },
  {
    id: 'cheap_fuel',
    title: 'Tania stacja w bok',
    weight: 2,
    init: (c) => ({ saving: Math.max(150, Math.round((c.trip.fuelL * 0.45 * 0.4) / 10) * 10) }),
    text: (c) => c.fill(`Grupa kierowców na Facebooku krzyczy: stacja 15 km w bok, diesel 40 gr taniej! {nick} pyta, czy zjechać. Oszczędność ok. ${fmtPLN(n(c, 'saving'))}.`),
    options: [
      {
        id: 'go',
        label: (c) => `Zjedź zatankować (−${fmtPLN(n(c, 'saving'))} na paliwie)`,
        hint: '30–45 min dłużej.',
        resolve: (c) => ({ text: c.fill(`Zatankowane do pełna. Na stacji kolejka takich samych mądrych z Facebooka. Oszczędność ${fmtPLN(n(c, 'saving'))}.`), tone: 'good', delayMin: ri(c, 30, 45), fuelSaving: n(c, 'saving') }),
      },
      {
        id: 'skip',
        label: 'Szkoda czasu',
        hint: 'Jedziemy według planu.',
        resolve: (c) => ({ text: c.fill('{nick} macha ręką na tanią stację. Czas to pieniądz.'), tone: 'info' }),
      },
    ],
    auto: (c) => (c.has('skapiec') || c.buffer > 150 ? 'go' : 'skip'),
  },
  {
    id: 'dog',
    title: 'Pies na MOP-ie',
    weight: 1,
    text: (c) => c.fill('Na MOP-ie przybłąkał się kundel, siedzi przy kabinie i patrzy, jakby czekał właśnie na tę ciężarówkę. {nick} mięknie.'),
    options: [
      {
        id: 'adopt',
        label: 'Zabierz go, będzie pies firmowy',
        hint: '10 min. Morale kierowcy wyraźnie w górę.',
        resolve: (c) => ({ text: c.fill('Pies dostał miejsce na fotelu pasażera i imię „Tachograf”. {nick} promienieje.'), tone: 'good', delayMin: 10, morale: 12 }),
      },
      {
        id: 'shelter',
        label: 'Zadzwoń do schroniska i poczekaj',
        hint: '40–60 min. Lokalne radio lubi takie historie (reputacja +1).',
        resolve: (c) => ({ text: c.fill('Schronisko przyjechało, a lokalne radio wspomniało o „kierowcy z sercem”.'), tone: 'good', delayMin: ri(c, 40, 60), rep: 1, morale: 4 }),
      },
      {
        id: 'leave',
        label: 'Zostaw kanapkę i jedź',
        hint: 'Bez straty czasu.',
        resolve: () => ({ text: 'Pies zjadł kanapkę i poszedł do następnego TIR-a. Bez sentymentów.', tone: 'funny', morale: -2 }),
      },
    ],
    auto: (c) => (c.d.stats.morale < 50 ? 'adopt' : c.buffer > 120 ? 'shelter' : 'leave'),
  },
];


// ─── Zdarzenia z życia trasy (awizacje, palety, autostopowicze) ─────────────

const MORE_EVENTS: readonly RoadEventDef[] = [
  {
    id: 'ramp_slot',
    title: 'Awizacja na 6:00, rozładunek o 14:00',
    weight: 3,
    init: (c) => ({ city: CITY_BY_ID[c.trip.job.toId].name }),
    text: (c) =>
      c.fill(`{nick} dzwoni: „Szefie, napisali z magazynu w ${c.vars.city}, że rampy zajęte i mam stanąć w kolejce. Awizacja niby jest, ale magazynier mówi, że »awizacja to tylko propozycja«”.`),
    options: [
      {
        id: 'queue',
        label: 'Stań w kolejce, nic nie poradzimy',
        hint: '2–4 h czekania. Pewne.',
        resolve: (c) => ({ text: c.fill('{nick} odstał{a} swoje pod rampą. Kawa z termosu się skończyła, cierpliwość też.'), tone: 'info', delayMin: ri(c, 120, 240), morale: -3 }),
      },
      {
        id: 'argue',
        label: 'Niech wywalczy wcześniejszą rampę',
        hint: (c) => `Może skończyć się w godzinę, może kłótnią i jeszcze dłuższym czekaniem. Szansa ${c.has('ulubieniec') ? 'duża' : c.has('narwany') ? 'mała' : 'średnia'}.`,
        resolve: (c) => {
          if (chance(c.r, luck(c, 0.45 + (c.has('ulubieniec') ? 0.3 : 0)))) {
            return { text: c.fill('{nick} pogadał{a} z magazynierem o wędkowaniu. Rampa numer 3 nagle się zwolniła.'), tone: 'good', delayMin: ri(c, 40, 70), morale: 3 };
          }
          return { text: 'Magazynier się obraził i „zgubił” awizację. Kolejka od nowa.', tone: 'bad', delayMin: ri(c, 200, 320), morale: -6, rep: -1 };
        },
      },
      {
        id: 'office',
        label: (c) => (c.s.base.office ? 'Biuro dzwoni do klienta' : 'Sam dzwonisz do klienta'),
        hint: (c) => (c.s.base.office ? 'Biuro spedycji ma kontakty: ok. 1 h.' : 'Ok. 1,5–2,5 h. Klient nie zawsze odbiera.'),
        resolve: (c) => {
          if (c.s.base.office || chance(c.r, 0.5)) return { text: 'Telefon do klienta, klient do magazynu, magazyn do rampy. Działa.', tone: 'good', delayMin: c.s.base.office ? ri(c, 50, 70) : ri(c, 90, 150) };
          return { text: 'Klient: „Pani Bożena jest na urlopie, proszę dzwonić w poniedziałek”. Kolejka.', tone: 'bad', delayMin: ri(c, 150, 240) };
        },
      },
    ],
    auto: (c) => (c.has('ulubieniec') ? 'argue' : c.s.base.office ? 'office' : c.has('stoik') || c.buffer > 300 ? 'queue' : c.has('narwany') ? 'argue' : 'office'),
  },
  {
    id: 'pallets',
    title: 'Wymiana palet',
    weight: 2,
    init: (c) => ({ n: ri(c, 20, 33), cost: ri(c, 6, 14) * 100 }),
    text: (c) => c.fill(`Na załadunku miało być ${c.vars.n} palet EPAL na wymianę. Magazyn rozkłada ręce: „Palet nie ma, będą w czwartek”. {nick} pyta, co robić.`),
    options: [
      {
        id: 'cmr',
        label: 'Wpisz do CMR i jedziemy',
        hint: (c) => `Bez straty czasu. Może się uda odzyskać, a może zapłacimy za palety (ok. ${fmtPLN(n(c, 'cost'))}).`,
        resolve: (c) => {
          if (chance(c.r, 0.5 + (c.d.stats.reliability / 100) * 0.3)) return { text: 'Adnotacja w CMR zrobiła swoje. Klient oddał palety przy następnym kursie.', tone: 'good' };
          return { text: 'Adnotacja była, ale nieczytelna. Klient twierdzi, że palety „wróciły”. Płacimy.', tone: 'bad', cost: n(c, 'cost'), costCat: 'fleet' };
        },
      },
      {
        id: 'wait',
        label: 'Bez palet nie ruszamy',
        hint: '1–2,5 h przepychanki. Często pomaga, czasem psuje relacje.',
        resolve: (c) => {
          if (chance(c.r, luck(c, 0.6))) return { text: 'Po godzinie palety „znalazły się” za halą. Wszyscy udają zdziwienie.', tone: 'good', delayMin: ri(c, 60, 120) };
          return { text: 'Palet nie było. Klient zapamiętał nas jako „tych upartych”.', tone: 'bad', delayMin: ri(c, 90, 150), rep: -1, cost: n(c, 'cost'), costCat: 'fleet' };
        },
      },
      {
        id: 'pay',
        label: (c) => `Odpuść i dopłać za palety (${fmtPLN(n(c, 'cost'))})`,
        hint: 'Szybko i bez nerwów. Spedytor płacze w środku.',
        resolve: (c) => ({ text: 'Palety spisane na straty. W biurze minuta ciszy.', tone: 'info', cost: n(c, 'cost'), costCat: 'fleet' }),
      },
    ],
    auto: (c) => (c.has('narwany') ? 'wait' : c.d.stats.reliability > 60 || c.has('teczka') ? 'cmr' : c.buffer > 200 ? 'wait' : 'cmr'),
  },
  {
    id: 'hitchhiker',
    title: 'Muchomor na wylocie',
    weight: 1,
    init: (c) => ({ city: CITY_BY_ID[c.trip.job.toId].gen }),
    text: (c) => c.fill(`Na wylocie z MOP-u stoi muchomor (autostopowicz) z tekturą „DO ${String(c.vars.city).toUpperCase()}”. {nick} pyta przez telefon, czy można zabrać.`),
    options: [
      {
        id: 'take',
        label: 'Zabierz, raźniej we dwóch',
        hint: 'Morale w górę. Firmowe ubezpieczenie wolałoby nie wiedzieć.',
        resolve: (c) => {
          if (chance(c.r, 0.2)) return { text: c.fill('Autostopowicz zjadł kanapki, wypił kawę i całą drogę opowiadał o kryptowalutach. {nick} żałuje.'), tone: 'funny', morale: -3 };
          return { text: c.fill('Autostopowicz okazał się byłym kierowcą. Dwie godziny opowieści, {nick} w świetnym humorze.'), tone: 'good', morale: 8 };
        },
      },
      {
        id: 'no',
        label: 'Regulamin to regulamin',
        hint: 'Nic się nie dzieje.',
        resolve: (c) => ({ text: c.fill('{nick} macha ręką na przeprosiny i jedzie dalej.'), tone: 'info' }),
      },
    ],
    auto: (c) => (c.d.stats.morale < 55 || c.has('optymista') ? 'take' : 'no'),
  },
];

export const ALL_ROAD_EVENTS: readonly RoadEventDef[] = [...ROAD_EVENTS, ...MORE_EVENTS];
export const ROAD_EVENT_BY_ID: Record<string, RoadEventDef> = Object.fromEntries(ALL_ROAD_EVENTS.map((e) => [e.id, e]));

export const optionLabel = (o: RoadEventOption, c: EventCtx) => (typeof o.label === 'function' ? o.label(c) : o.label);
export const optionHint = (o: RoadEventOption, c: EventCtx) => (typeof o.hint === 'function' ? o.hint(c) : o.hint);

/** Kontekst zdarzenia dla danego kierowcy i kursu. */
export function eventCtx(s: GameState, trip: Trip, d: Driver, t: Truck, vars: Record<string, number | string>): EventCtx {
  return {
    s,
    r: s.rng,
    d,
    t,
    trip,
    vars,
    has: (id) => hasPerk(d, id),
    buffer: trip.job.deadline - trip.eta,
    fill: (text) =>
      text
        .replaceAll('{nick}', d.nickname)
        .replaceAll('{a}', d.female ? 'a' : '')
        .replaceAll('{y}', d.female ? 'a' : 'y')
        .replaceAll('{pan}', d.female ? 'pani' : 'pan'),
  };
}
