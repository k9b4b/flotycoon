import { useEffect, useState, type ReactNode } from 'react';
import { BALANCE } from '../../data/balance';
import { CITIES } from '../../data/cities';
import type { SetupOptions } from '../../engine/sim';
import { DriverAvatar, TruckSprite } from '../avatar';
import { km, pct, pln } from '../format';
import { sim } from '../simClient';
import { PerkList, ScoreBadge, StatBars, driverScore, wearColor } from './driverUi';

/**
 * Kreator firmy przy pierwszym uruchomieniu: nazwa, siedziba, pierwszy ciągnik i pierwszy kierowca.
 * Propozycje aut i ludzi przychodzą z silnika (setupOptions), więc są takie jak w reszcie gry.
 */

const CITY_BLURB: Record<string, string> = {
  WAW: 'Stolica: najwięcej zleceń w kraju. I najwięcej korków.',
  KRK: 'Południe, blisko Śląska i gór. Smok gratis.',
  LDZ: 'Sam środek Polski, A1 i A2 pod nosem.',
  STR: 'Węzeł A1/A2 i magazyny po horyzont. To nie miejsce, to stan umysłu.',
  WRO: 'Zachód blisko, Niemcy za miedzą (kiedyś się przyda).',
  POZ: 'A2 na zachód, porządek i rogale świętomarcińskie.',
  GDN: 'Port i kontenery, ale do południa daleko.',
  SZZ: 'Róg mapy: do Berlina bliżej niż do Warszawy.',
  BYD: 'Kujawy: spokojnie, sporo średnich zleceń.',
  LUB: 'Wschód: mniej konkurencji, ale daleko do wszystkiego.',
  KTW: 'Śląsk: przemysł, węgiel i ładunki na każdą okazję.',
  BIA: 'Podlasie: cisza, żubry i długie dojazdy na pusto.',
  RZE: 'Podkarpacie: A4 na wschód, mało kto tu konkuruje.',
};

const TRUCK_TAGS = ['Najtańsza rata', 'Środek stawki', 'Najwyższa rata'];
const DRIVER_TAGS = ['Najtańszy, do wychowania', 'Złoty środek', 'Najlepszy z ogłoszeń'];

const STEPS = ['Nazwa', 'Siedziba', 'Ciągnik', 'Kierowca'];

/** Kafelek wyboru: div z rolą radio, bo w środku bywają inne przyciski (np. „i” przy statystykach). */
function Option({ on, onPick, children }: { on: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <div
      className={`setup-option${on ? ' on' : ''}`}
      role="radio"
      aria-checked={on}
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onPick();
        }
      }}
    >
      {children}
    </div>
  );
}

export function SetupWizard({ onDone }: { onDone: () => void }) {
  const [opts, setOpts] = useState<SetupOptions | null>(null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [hq, setHq] = useState('WAW');
  const [truckIdx, setTruckIdx] = useState(1);
  const [driverIdx, setDriverIdx] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void sim.setupOptions().then((o) => {
      setOpts(o);
      setName(o.names[0]);
    });
  }, []);

  if (!opts) return <div className="loading">Zdzisiek szuka długopisu…</div>;
  const truck = opts.trucks[truckIdx];
  const driver = opts.drivers[driverIdx];
  const validName = name.trim().length >= 2;
  const daily = truck.leasePerDay + driver.salaryPerDay;

  const start = async () => {
    setBusy(true);
    await sim.startGame({ seed: opts.seed, companyName: name.trim(), hqCityId: hq, truck, driver });
    onDone();
  };

  return (
    <div className="setup">
      <div className="setup-card">
        <header className="setup-head">
          <span className="logo">
            Flo<b>Tycoon</b>
          </span>
          <h1>Zakładamy firmę</h1>
          <ol className="setup-steps" aria-label="Kroki kreatora">
            {STEPS.map((s, i) => (
              <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>
                <span className="num">{i + 1}</span> {s}
              </li>
            ))}
          </ol>
        </header>

        <div className="setup-body">
          {step === 0 && (
            <>
              <p className="muted">Każda wielka spedycja zaczynała od jednego auta i dobrej nazwy na plandece. Twoja też.</p>
              <label className="setup-field">
                <span>Nazwa firmy</span>
                <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="np. Trans-Pol-Ex Sp. z o.o." autoFocus />
              </label>
              <div className="setup-chips">
                {opts.names.map((n) => (
                  <button key={n} className={`chip${n === name ? ' on' : ''}`} onClick={() => setName(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="muted">
                W siedzibie odbierasz auta z salonu i stąd częściej startują zlecenia, bo miejscowi klienci Cię znają. Kropki pokazują, ile jest
                zleceń w okolicy.
              </p>
              <div className="setup-grid cities" role="radiogroup" aria-label="Siedziba">
                {CITIES.map((c) => (
                  <Option key={c.id} on={hq === c.id} onPick={() => setHq(c.id)}>
                    <span className="opt-title">
                      {c.name}
                      <span className="dots" aria-label={`Zleceń: ${c.weight} na 10`}>
                        {Array.from({ length: 5 }, (_, i) => (
                          <span key={i} className={i < Math.round(c.weight / 2) ? 'on' : ''} />
                        ))}
                      </span>
                    </span>
                    <span className="muted opt-desc">{CITY_BLURB[c.id]}</span>
                  </Option>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="muted">Pierwszy ciągnik bierzesz w leasing bez kaucji. Tańsza rata to zwykle większe zużycie i spalanie, a to koszt przy każdym kursie.</p>
              <div className="setup-grid" role="radiogroup" aria-label="Pierwszy ciągnik">
                {opts.trucks.map((t, i) => (
                  <Option key={t.id} on={truckIdx === i} onPick={() => setTruckIdx(i)}>
                    <span className="opt-tag">{TRUCK_TAGS[i]}</span>
                    <TruckSprite t={t} scale={3} />
                    <span className="opt-title">
                      {t.brand} {t.model}
                    </span>
                    <span className="opt-specs num">
                      {km(t.odometerKm)} · Euro {t.euro} · {t.fuelL100} l/100
                    </span>
                    <span className="wear-label">
                      zużycie
                      <span className="fc-wear">
                        <span style={{ width: pct(t.wear), background: wearColor(t.wear) }} />
                      </span>
                      <span style={{ color: wearColor(t.wear) }}>{pct(t.wear)}</span>
                    </span>
                    <span className="opt-price num">{pln(t.leasePerDay)}/dzień</span>
                  </Option>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="muted">Pierwszy kierowca. Lepszy jeździ szybciej, pali mniej i rzadziej wpada na kontrolach, ale wie, ile jest wart.</p>
              <div className="setup-grid" role="radiogroup" aria-label="Pierwszy kierowca">
                {opts.drivers.map((d, i) => (
                  <Option key={d.id} on={driverIdx === i} onPick={() => setDriverIdx(i)}>
                    <span className="opt-tag">{DRIVER_TAGS[i]}</span>
                    <span className="opt-driver">
                      <DriverAvatar d={d} size={64} />
                      <span className="fc-driver">
                        <strong>„{d.nickname}”</strong>
                        {d.firstName} {d.lastName} <ScoreBadge d={d} />
                      </span>
                    </span>
                    <StatBars d={d} skipMorale />
                    <PerkList d={d} />
                    <span className="opt-price num">{pln(d.salaryPerDay)}/dzień</span>
                  </Option>
                ))}
              </div>
              <p className="setup-summary">
                <strong>{name.trim()}</strong>, siedziba: {CITIES.find((c) => c.id === hq)?.name}. Start z <strong className="num">{pln(BALANCE.startCash)}</strong>,
                koszty stałe <strong className="num">{pln(daily)}</strong> na dobę (rata {pln(truck.leasePerDay)} + pensja {pln(driver.salaryPerDay)}).
                {driverScore(driver) >= 70 && ' Rutyniarz kosztuje, ale szybko się zwraca.'}
              </p>
            </>
          )}
        </div>

        <footer className="setup-foot">
          {step > 0 ? (
            <button className="btn" onClick={() => setStep(step - 1)}>
              Wstecz
            </button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn primary" disabled={step === 0 && !validName} onClick={() => setStep(step + 1)}>
              Dalej
            </button>
          ) : (
            <button className="btn primary" disabled={busy || !validName} onClick={start}>
              Zakładamy firmę!
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
