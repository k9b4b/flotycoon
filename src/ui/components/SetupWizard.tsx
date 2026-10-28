import { useEffect, useState, type ReactNode } from 'react';
import { BALANCE } from '../../data/balance';
import { CITIES } from '../../data/cities';
import { hqProfile } from '../../data/hq';
import type { SetupOptions } from '../../engine/sim';
import type { Ownership } from '../../engine/types';
import { DriverAvatar, TruckSprite } from '../avatar';
import { km, pct, pln } from '../format';
import { sim } from '../simClient';
import { PerkList, ScoreBadge, StatBars, driverScore, wearColor } from './driverUi';

/**
 * Kreator firmy przy pierwszym uruchomieniu: nazwa, siedziba, pierwszy ciągnik i pierwszy kierowca.
 * Propozycje aut i ludzi przychodzą z silnika (setupOptions), więc są takie jak w reszcie gry.
 */

/** Plusy i minusy siedziby jako krótkie etykiety (liczby z data/hq.ts). */
function hqTraits(id: string): { text: string; good: boolean }[] {
  const h = hqProfile(id);
  const pctf = (m: number) => `${m > 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)}%`;
  const out: { text: string; good: boolean }[] = [];
  if (h.market !== 0) out.push({ text: `oferty na giełdzie ${h.market > 0 ? '+' : '−'}${Math.abs(h.market)}`, good: h.market > 0 });
  if (Math.abs(h.localRate - 1) >= 0.01) out.push({ text: `stawki z siedziby ${pctf(h.localRate)}`, good: h.localRate > 1 });
  if (Math.abs(h.salaryMul - 1) >= 0.01) out.push({ text: `pensje ${pctf(h.salaryMul)}`, good: h.salaryMul < 1 });
  if (Math.abs(h.landMul - 1) >= 0.01) out.push({ text: `rozbudowa bazy ${pctf(h.landMul)}`, good: h.landMul < 1 });
  if (h.grant > 0) out.push({ text: `dotacja ${pln(h.grant)}`, good: true });
  return out;
}

const TRUCK_TAGS = ['Tani i wyjeżdżony', 'Złoty środek', 'Prawie jak nowy'];
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
  const [mode, setMode] = useState<Ownership>('lease');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void sim.setupOptions(undefined, 'WAW').then((o) => {
      setOpts(o);
      setName(o.names[0]);
    });
  }, []);
  // Pensje kandydatów zależą od lokalnego rynku pracy: po zmianie siedziby przeliczamy propozycje.
  useEffect(() => {
    if (!opts) return;
    void sim.setupOptions(opts.seed, hq).then((o) => setOpts((prev) => (prev ? { ...o, names: prev.names } : o)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hq]);

  if (!opts) return <div className="loading">Zdzisiek szuka długopisu…</div>;
  const truck = opts.trucks[truckIdx];
  const driver = opts.drivers[driverIdx];
  const validName = name.trim().length >= 2;
  const startCash = BALANCE.startCash + (opts ? hqProfile(hq).grant : 0);
  const canBuy = startCash >= truck.buyPrice;
  const buying = mode === 'own' && canBuy;
  const rate = buying ? 0 : truck.leasePerDay;
  const daily = rate + driver.salaryPerDay;

  const start = async () => {
    setBusy(true);
    await sim.startGame({ seed: opts.seed, companyName: name.trim(), hqCityId: hq, truck, truckMode: buying ? 'own' : 'lease', driver });
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
                W siedzibie odbierasz kupiony sprzęt i stąd częściej startują zlecenia, bo miejscowi klienci Cię znają. Kropki pokazują ruch w
                regionie. Duże miasto to więcej ofert, ale też droższa baza, wyższe pensje i konkurencja. Na prowincji odwrotnie.
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
                    <span className="muted opt-desc">{hqProfile(c.id).blurb}</span>
                    <span className="hq-traits">
                      {hqTraits(c.id).map((t) => (
                        <span key={t.text} className={`fc-trait ${t.good ? 'good' : 'bad'}`}>
                          {t.text}
                        </span>
                      ))}
                    </span>
                  </Option>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="muted">
                Wybierz ciągnik i sposób finansowania. Leasing (na start bez kaucji) zostawia gotówkę w kasie, zakup oznacza zero rat, ale mniej
                pieniędzy na pierwsze tygodnie. Bardziej zużyte auto pali więcej i częściej się psuje.
              </p>
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
                    <span className="opt-price num">
                      {pln(t.leasePerDay)}/dzień <span className="muted">albo {pln(t.buyPrice)}</span>
                    </span>
                  </Option>
                ))}
              </div>
              <div className="buy-lease setup-mode" role="radiogroup" aria-label="Finansowanie">
                <button role="radio" aria-checked={!buying} className={`deal deal-lease${!buying ? ' on' : ''}`} onClick={() => setMode('lease')}>
                  <span className="deal-kind">Leasing</span>
                  <strong className="num">{pln(truck.leasePerDay)}/dzień</strong>
                  <span className="deal-sub num">w kasie zostaje {pln(startCash)}</span>
                </button>
                <button role="radio" aria-checked={buying} disabled={!canBuy} className={`deal deal-buy${buying ? ' on' : ''}`} onClick={() => setMode('own')}>
                  <span className="deal-kind">Kupno</span>
                  <strong className="num">{pln(truck.buyPrice)}</strong>
                  <span className="deal-sub num">{canBuy ? `w kasie zostaje ${pln(startCash - truck.buyPrice)}` : `brakuje ${pln(truck.buyPrice - startCash)}`}</span>
                </button>
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
                <strong>{name.trim()}</strong>, siedziba: {CITIES.find((c) => c.id === hq)?.name}. Start z <strong className="num">{pln(BALANCE.startCash + hqProfile(hq).grant)}</strong>
                {hqProfile(hq).grant > 0 ? ' (z dotacją)' : ''},
                {buying ? (
                  <>
                    po zakupie auta zostaje <strong className="num">{pln(startCash - truck.buyPrice)}</strong>. Koszty stałe{' '}
                    <strong className="num">{pln(daily)}</strong> na dobę (sama pensja).
                  </>
                ) : (
                  <>
                    koszty stałe <strong className="num">{pln(daily)}</strong> na dobę (rata {pln(rate)} + pensja {pln(driver.salaryPerDay)}).
                  </>
                )}{' '}
                Plandekę dostajesz po wujku, za darmo.
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
