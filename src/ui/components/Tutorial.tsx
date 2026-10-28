import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Driver, TutorialState } from '../../engine/types';
import type { Snapshot } from '../../engine/view';
import { portraitSvg } from '../portrait';
import { sim } from '../simClient';
import type { Tab } from './TabBar';

/**
 * Samouczek z mentorem: Zdzisiek, stary spedytor, prowadzi przez pierwszy kurs krok po kroku,
 * a potem wpada z jedną radą naraz, gdy w grze dzieje się coś nowego.
 * Kroki przechodzą same, gdy gracz zrobi to, o co chodzi (warunek na migawce gry).
 */

interface Card {
  id: string;
  text: ReactNode;
  /** Element do podświetlenia (selektor CSS; bierzemy pierwszy pasujący). */
  target?: string;
  /** Zakładka na telefonie, na której jest element. */
  tab?: Tab;
  /** Przycisk „Dalej” zamiast czekania na działanie gracza. */
  next?: boolean;
  /** Krok przechodzi sam, gdy warunek jest spełniony. */
  done?: (s: Snapshot, pace: number) => boolean;
  /** Zegar stoi, dopóki gracz czyta (pierwsze kroki). */
  pause?: boolean;
}

interface Tip extends Card {
  when: (s: Snapshot) => boolean;
}

const onTrip = (s: Snapshot) => s.fleet.some((t) => t.trip);

const CORE: Card[] = [
  {
    id: 'hello',
    pause: true,
    next: true,
    text: (
      <>
        Siema, jestem Zdzisiek, trzydzieści lat na spedycji, z czego dwadzieścia przy telefonie. Masz jedno auto, jednego kierowcę i trochę kasy.
        Pokażę Ci, jak nie zbankrutować do piątku. Zegar stoi, nigdzie się nie spieszymy.
      </>
    ),
  },
  {
    id: 'market',
    pause: true,
    next: true,
    target: '.area-market',
    tab: 'market',
    text: (
      <>
        To giełda. Przy każdym zleceniu masz: <b>⏱</b> czas do terminu dostawy, <b>🚚</b> ile potrwa kurs Twoim autem (z dojazdem i przerwami),
        zysk na czysto po paliwie i mycie oraz plakietkę zapasu. <b className="good">Zielony zapas</b> to bezpiecznie, <b className="warn">„na styk”</b>{' '}
        to ryzyko spóźnienia.
      </>
    ),
  },
  {
    id: 'take',
    pause: true,
    target: '.area-market .job',
    tab: 'market',
    done: onTrip,
    text: (
      <>
        Kliknij zlecenie z zieloną plakietką, a potem <b>„Bierzemy”</b>. Na górze są najlepsze dla Twojego auta, ja bym brał pierwsze.
      </>
    ),
  },
  {
    id: 'speed',
    next: true,
    target: '.speed',
    done: (_, pace) => pace >= 30,
    text: (
      <>
        Ruszył! Teraz puść czas. Normalnie minuta to godzina w grze, a <b>30×</b> albo <b>120×</b> przewija nudne kilometry. Pauza jest pod{' '}
        <b>▮▮</b>.
      </>
    ),
  },
  {
    id: 'wait',
    target: '.area-map',
    tab: 'map',
    done: (s) => s.totals.jobsDone >= 1,
    text: (
      <>
        Na mapie widać, gdzie jest auto i jak jedzie. Kierowca robi przerwy sam, bo tachograf nie wybacza. Czekamy na rozładunek, a w dzienniku
        wszystko się zapisuje.
      </>
    ),
  },
  {
    id: 'backload',
    target: '.area-market',
    tab: 'market',
    done: (s) => s.totals.jobsDone >= 1 && onTrip(s),
    text: (
      <>
        Kasa wpadła! Auto stoi teraz w nowym mieście, a postój kosztuje (rata, pensja). Po rozładunku zawsze pojawiają się ładunki powrotne z tego
        miasta. Weź następne zlecenie.
      </>
    ),
  },
  {
    id: 'fleet',
    next: true,
    target: '.area-fleet',
    tab: 'fleet',
    text: (
      <>
        Tu jest flota. Karta pokazuje kierowcę, auto i co robi. Pasek przy tablicy to <b>zużycie</b>: im wyższe, tym częściej awarie, więc od
        30% pojawia się „Serwis”. W „Szczegółach” są statystyki kierowcy, a kółko <b>i</b> wyjaśnia, co która daje.
      </>
    ),
  },
  {
    id: 'goal',
    next: true,
    text: (
      <>
        Plan na start: terminowe kursy dają reputację, reputacja daje rangę, ranga odblokowuje lepszych ludzi, większy plac i kontrakty. Cel: trzy
        auta i ranga „Firma krzak”. Dalej już sam, ale będę wpadał z radami. Ściągawka jest zawsze pod <b>?</b> u góry.
      </>
    ),
  },
];

const TIPS: Tip[] = [
  {
    id: 'decision',
    when: (s) => s.decisions.length > 0,
    target: '.dec-options',
    next: true,
    text: (
      <>
        Kierowca dzwoni! Zegar stoi, dopóki nie wybierzesz. Opcja z dopiskiem <b>„wybór kierowcy”</b> to to, co zrobiłby sam. Nie chcesz takich
        telefonów? Wyłączysz je w zakładce Firma.
      </>
    ),
  },
  {
    id: 'late',
    when: (s) => s.totals.lateJobs >= 1,
    next: true,
    text: (
      <>
        Pierwsze spóźnienie. Klient potrącił karę, a reputacja spadła o 4. Plakietka „na styk” znaczy, że jeden korek wystarczy. Lepiej brać z
        zapasem.
      </>
    ),
  },
  {
    id: 'second_truck',
    when: (s) => s.fleet.length === 1 && s.totals.jobsDone >= 3 && s.cash >= 20_000,
    target: '.area-fleet .subtabs button:nth-child(4)',
    tab: 'fleet',
    next: true,
    text: (
      <>
        Stać Cię na drugie auto. Flota → <b>Rynek</b>: każdy ciągnik kupisz albo weźmiesz w leasing. Do nowego auta potrzebny jest jeszcze kierowca i
        naczepa (też na Rynku).
      </>
    ),
  },
  {
    id: 'nodriver',
    when: (s) => s.fleet.some((t) => t.status === 'nodriver'),
    target: '.area-fleet .subtabs button:nth-child(4)',
    tab: 'fleet',
    next: true,
    text: (
      <>
        Auto bez kierowcy zarabia zero, a koszty lecą. Flota → <b>Rynek → Kierowcy</b>: zatrudnij kogoś, a potem na karcie auta wybierz go z listy.
        Kto czym jeździ, decydujesz Ty.
      </>
    ),
  },
  {
    id: 'idle',
    when: (s) => s.fleet.some((t) => t.status === 'idle' && t.idleSince !== undefined && s.now - t.idleSince > 4 * 60) && s.totals.jobsDone >= 2,
    target: '.fleet-card.is-idle',
    tab: 'fleet',
    next: true,
    text: <>Jedno auto stoi już kilka godzin. Każda godzina postoju to koszt. Karta pokazuje ile, a „Szukaj zlecenia” od razu przenosi na giełdę.</>,
  },
  {
    id: 'service',
    when: (s) => s.fleet.some((t) => t.truck.wear > 0.45 && !t.trip),
    target: '.fleet-card',
    tab: 'fleet',
    next: true,
    text: <>To auto jest już mocno zużyte. Serwis kosztuje i trwa kilka godzin, ale awaria w trasie to laweta, spóźnienie i większy rachunek.</>,
  },
  {
    id: 'morale',
    when: (s) => s.drivers.some((d) => d.driver.stats.morale < 40),
    target: '.area-fleet',
    tab: 'fleet',
    next: true,
    text: (
      <>
        Komuś siada morale. Zdemotywowany kierowca częściej wpada na kontrolach. Pomaga premia (Szczegóły kierowcy) albo seria terminowych kursów.
        Stanie bez roboty też dołuje.
      </>
    ),
  },
  {
    id: 'rank1',
    when: (s) => s.company.rank >= 1,
    target: '.area-market .subtabs button:nth-child(2)',
    tab: 'market',
    next: true,
    text: (
      <>
        Awans! Teraz klienci proponują <b>kontrakty</b>: stała trasa co kilka dni, lepsza stawka, premia na koniec. Ale przepadnięty kurs kosztuje
        karę, a po trzech wpadkach umowa przepada. Bierz, jak masz wolne auto w zapasie.
      </>
    ),
  },
  {
    id: 'trailers',
    when: (s) => s.company.rank >= 1 && s.totals.jobsDone >= 8,
    target: '.area-market',
    tab: 'market',
    next: true,
    text: (
      <>
        Na giełdzie wiszą też ładunki na <b>chłodnię</b>: płacą lepiej. Chłodnię kupisz albo weźmiesz w leasing na Rynku, a podepniesz w zakładce
        Naczepy. Później dojdą cysterny ADR (kierowca potrzebuje kursu) i gabaryty na niskopodwoziu.
      </>
    ),
  },
  {
    id: 'yard',
    when: (s) => !!s.company.nextYard?.unlocked && s.fleet.length >= s.company.fleetCap,
    target: '.area-growth',
    tab: 'company',
    next: true,
    text: <>Plac jest pełny. W zakładce Firma rozbudujesz go i zmieścisz więcej aut. Tam są też warsztat, biuro i dyspozytorka Halina.</>,
  },
  {
    id: 'training',
    when: (s) => s.totals.jobsDone >= 15,
    target: '.area-fleet .subtabs button:nth-child(2)',
    tab: 'fleet',
    next: true,
    text: (
      <>
        Kierowców da się szkolić: Flota → Kierowcy → <b>Szkolenia</b>. Kurs podnosi statystykę, a czasem leczy złą cechę, np. ciężką nogę. Na czas
        kursu posadź w aucie zmiennika.
      </>
    ),
  },
];

const MENTOR: Driver = {
  id: 'mentor',
  firstName: 'Zdzisław',
  lastName: 'Spedycki',
  nickname: 'Zdzisiek',
  female: false,
  quirk: 'Ma trzy telefony i każdy dzwoni.',
  perks: [],
  stats: { experience: 95, eco: 60, reliability: 80, stamina: 60, morale: 85 },
  salaryPerDay: 0,
  hiredAt: 0,
  kmDriven: 0,
  jobsDone: 0,
  lateJobs: 0,
  duty: { sinceBreak: 0, today: 0, at: 0 },
};
const MENTOR_SVG = portraitSvg(MENTOR);
const MENTOR_FACE = MENTOR_SVG.replace('viewBox="0 0 32 32"', 'viewBox="4 4 24 24"');

export const CORE_STEPS = CORE.length;

export function Coach({ snap, pace, mobile, onTab }: { snap: Snapshot; pace: number; mobile: boolean; onTab: (t: Tab) => void }) {
  const t: TutorialState = snap.settings.tutorial ?? { step: 0, seen: [], off: false };
  const save = (n: TutorialState) => void sim.setTutorial(n);
  const inCore = t.step < CORE.length;
  // Telefon od kierowcy ma pierwszeństwo nawet w trakcie samouczka; inne porady dopiero po nim.
  const decisionTip = TIPS[0];
  let card: Card | null = null;
  let tip = false;
  if (!t.off) {
    if (snap.decisions.length > 0 && !t.seen.includes(decisionTip.id)) {
      card = decisionTip;
      tip = true;
    } else if (snap.decisions.length > 0) card = null; // nie zasłaniamy okna decyzji
    else if (inCore) card = CORE[t.step];
    else {
      card = TIPS.find((x) => !t.seen.includes(x.id) && x.when(snap)) ?? null;
      tip = !!card;
    }
  }

  const advance = () => {
    if (!card) return;
    if (tip) save({ ...t, seen: [...t.seen, card.id] });
    else save({ ...t, step: t.step + 1 });
  };

  // Krok przechodzi sam, gdy gracz zrobi, o co chodziło.
  const doneNow = !!card && !tip && !!card.done?.(snap, pace);
  useEffect(() => {
    if (doneNow) save({ ...t, step: t.step + 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneNow, t.step]);

  // Pierwsze kroki czyta się przy zatrzymanym zegarze.
  const paused = useRef<string | null>(null);
  useEffect(() => {
    if (card?.pause && paused.current !== card.id && pace > 0) {
      paused.current = card.id;
      void sim.setPace(0);
    }
    if (card && !card.pause && paused.current && card.id === 'speed' && pace === 0) {
      // Po pierwszym „Bierzemy” zegar rusza z powrotem.
      paused.current = null;
      void sim.setPace(1);
    }
  }, [card?.id, card?.pause, pace]);

  // Na telefonie przełączamy na zakładkę z elementem, o którym mowa.
  const lastTab = useRef<string | null>(null);
  useEffect(() => {
    if (mobile && card?.tab && lastTab.current !== card.id) {
      lastTab.current = card.id;
      onTab(card.tab);
    }
  }, [card?.id, mobile]);

  // Podświetlenie celu.
  useEffect(() => {
    if (!card?.target) return;
    const el = document.querySelector(card.target);
    if (!el) return;
    el.classList.add('tut-target');
    if (!mobile || card.tab) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return () => el.classList.remove('tut-target');
  });

  if (!card) return null;
  const stepNo = inCore && !tip ? `${t.step + 1}/${CORE.length}` : 'rada';
  return (
    <aside className={`coach${snap.decisions.length ? ' over-modal' : ''}`} role="status" aria-live="polite">
      <span className="avatar coach-face" style={{ width: 48, height: 48 }} aria-hidden dangerouslySetInnerHTML={{ __html: MENTOR_FACE }} />
      <div className="coach-body">
        <div className="coach-head">
          <strong>Zdzisiek</strong>
          <span className="muted">stary spedytor · {stepNo}</span>
        </div>
        <p className="coach-text">{card.text}</p>
        <div className="coach-actions">
          {card.next ? (
            <button className="btn small primary" onClick={advance}>
              {tip ? 'Jasne' : t.step === CORE.length - 1 ? 'Do roboty!' : 'Dalej'}
            </button>
          ) : (
            <span className="muted coach-wait">Zrób to, a pójdziemy dalej.</span>
          )}
          <button className="btn small ghost" onClick={() => save({ ...t, off: true })}>
            {inCore ? 'Pomiń samouczek' : 'Wyłącz porady'}
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Ściągawka pod „?”: krótko o wszystkim, plus ponowne uruchomienie samouczka. */
export function HelpSheet({ onClose, onNewGame }: { onClose: () => void; onNewGame: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const sections: [string, ReactNode][] = [
    ['Jak zarabiać', 'Bierz zlecenia z giełdy, dowoź na czas, od razu szukaj ładunku powrotnego. Stojące auto kosztuje ratę i pensję. Zysk przy zleceniu jest już po paliwie i mycie.'],
    ['Zapas i terminy', '⏱ to czas do terminu, 🚚 czas kursu Twoim autem z dojazdem, przerwami i odpoczynkiem. Zielony zapas = bezpiecznie, „na styk” = korek wystarczy do spóźnienia. Do godziny po terminie klient zwykle wybacza.'],
    ['Kierowcy', 'Doświadczenie to prędkość, eco-driving spalanie, niezawodność mandaty, kondycja ryzyko zaspania, morale mnoży niezawodność. Cechy (perki) dają bonusy albo kłopoty. Kółko „i” przy statystykach wyjaśnia szczegóły. Kto czym jeździ, decydujesz sam.'],
    ['Auta i serwis', 'Pasek przy tablicy to zużycie: więcej awarii i spalania. Serwis je obniża, ale nie poniżej poziomu z przebiegu. Nowe auta palą mniej i rzadko się psują.'],
    ['Kupno czy leasing', 'Flota → Rynek. Kupno: płacisz raz, nie ma rat, a sprzęt sprzedasz później za ok. 90% wartości (wartość spada z przebiegiem i zużyciem). Leasing: mała kaucja i rata co dzień, zwrot przed czasem kosztuje 5 rat. Pod ofertą widać, po ilu dniach raty zakup by się zwrócił.'],
    ['Telefony z trasy', 'Gdy coś się dzieje, kierowca dzwoni i zegar czeka na decyzję. W tle albo po wyłączeniu w Firmie decyduje sam, zgodnie ze swoim charakterem.'],
    ['Rozwój firmy', 'Terminowe kursy dają reputację, spóźnienia i mandaty ją zabierają. Ranga odblokowuje lepszych kandydatów, naczepy specjalne, większy plac, warsztat, biuro i dyspozytorkę Halinę.'],
    ['Kontrakty', 'Od rangi „Firma krzak”: stała trasa co kilka dni za lepszą stawkę. Kurs pojawia się na giełdzie dobę wcześniej. Przepadnięty kurs kosztuje karę, trzy wpadki i umowa przepada, dokończona daje premię.'],
    ['Naczepy', 'Naczepa to osobny sprzęt: bez niej ciągnik nie weźmie zlecenia. Plandeka wozi większość ładunków. Chłodnia (od rangi 1), cysterna ADR (od rangi 2, kierowca z kursem ADR) i niskopodwozie (od rangi 3, doświadczenie 55+) płacą 25–45% lepiej. Naczepy przepinasz między stojącymi ciągnikami w zakładce Naczepy; poza siedzibą podstawienie kosztuje 300 zł.'],
    ['Szkolenia', 'Flota → Kierowcy → Szkolenia. Kurs podnosi statystykę (coraz mniej przy powtórkach) i czasem leczy złą cechę. Na czas kursu auto zostaje bez kierowcy.'],
  ];
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={onClose}>
      <div className="modal help" onClick={(e) => e.stopPropagation()}>
        <div className="help-head">
          <span className="avatar" style={{ width: 48, height: 48 }} aria-hidden dangerouslySetInnerHTML={{ __html: MENTOR_FACE }} />
          <h2 id="help-title">Ściągawka od Zdziśka</h2>
          <button className="btn small" onClick={onClose} aria-label="Zamknij">
            Zamknij
          </button>
        </div>
        {sections.map(([title, body]) => (
          <details key={title}>
            <summary>{title}</summary>
            <p className="muted">{body}</p>
          </details>
        ))}
        <button
          className="btn small"
          onClick={() => {
            void sim.setTutorial({ step: 0, seen: [], off: false });
            onClose();
          }}
        >
          Przejdź samouczek od nowa
        </button>
        {confirm ? (
          <div className="help-confirm">
            <span>Na pewno? Obecna firma przepadnie.</span>
            <button className="btn small danger" onClick={onNewGame}>
              Tak, zakładam nową
            </button>
            <button className="btn small" onClick={() => setConfirm(false)}>
              Nie
            </button>
          </div>
        ) : (
          <button className="btn small ghost" onClick={() => setConfirm(true)}>
            Zacznij od nowa z inną firmą
          </button>
        )}
      </div>
    </div>
  );
}
