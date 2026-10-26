import { useEffect, useRef, useState } from 'react';
import type { CatchUpReport } from '../engine/sim';
import { SPEED_PRESETS, formatDuration, formatGameTime } from '../engine/time';
import { CashChart, CostBreakdown } from './components/Charts';
import { FleetPanel } from './components/FleetPanel';
import { LogPanel } from './components/LogPanel';
import { MapPanel } from './components/MapPanel';
import { MarketPanel } from './components/MarketPanel';
import type { MapPreview } from './map/FleetMap';
import { km, pln, plnSigned } from './format';
import { sim, useSim } from './simClient';

type Toast = { text: string; bad: boolean } | null;

export function App() {
  const { snap, pace } = useSim();
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [report, setReport] = useState<CatchUpReport | null>(null);
  const [saving, setSaving] = useState(true);
  const [preview, setPreview] = useState<MapPreview | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    sim.init().then((r) => {
      setReport(r.report);
      setSaving(r.saving);
    });
  }, []);

  const notify = (text: string, bad = false) => {
    setToast({ text, bad });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 4500);
  };

  const run = async (p: Promise<{ ok: true; message: string } | { ok: false; error: string }>) => {
    const r = await p;
    notify(r.ok ? r.message : r.error, !r.ok);
  };

  if (!snap) return <div className="loading">Rozgrzewanie silnika…</div>;

  const selectedId = selected ?? snap.fleet[0]?.truck.id ?? null;
  const todayNet = snap.today.revenue - snap.today.costs;
  const inTrip = snap.fleet.filter((t) => t.trip).length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">
            Flo<b>Tycoon</b>
          </span>
          <span className="company">{snap.companyName}</span>
        </div>
        <div className="clock">
          <div className="time">{formatGameTime(snap.now, true)}</div>
          <div className="label">czas gry</div>
        </div>
        <div className="speed" role="group" aria-label="Tempo gry">
          {SPEED_PRESETS.map((s) => (
            <button key={s.id} className={pace === s.pace ? 'on' : ''} onClick={() => void sim.setPace(s.pace)} title={s.pace === 0 ? 'Pauza' : `${s.pace} min gry na sekundę`}>
              {s.label}
            </button>
          ))}
        </div>
      </header>

      {report && (
        <div className="banner">
          <span>
            Pod Twoją nieobecność minęło <strong>{formatDuration(report.gameMinutes)}</strong> czasu gry
            {report.capped ? ' (limit nadrabiania)' : ''}. Zamknięte kursy: <strong>{report.jobsDone}</strong>, zmiana gotówki:{' '}
            <strong className={report.cashDelta >= 0 ? 'good' : 'bad'}>{plnSigned(report.cashDelta)}</strong>.
          </span>
          <span className="spacer" />
          <button className="btn small" onClick={() => setReport(null)}>
            OK, do roboty
          </button>
        </div>
      )}

      <main className="grid">
        <div className="kpis area-kpis">
          <div className="kpi">
            <div className="label">Gotówka</div>
            <div className={`value ${snap.cash < 0 ? 'bad' : ''}`}>{pln(snap.cash)}</div>
            <div className="sub">{saving ? 'zapis automatyczny' : 'bez zapisu w tej przeglądarce'}</div>
          </div>
          <div className="kpi">
            <div className="label">Wynik dziś</div>
            <div className={`value ${todayNet >= 0 ? 'good' : 'bad'}`}>{plnSigned(todayNet)}</div>
            <div className="sub">przychód {pln(snap.today.revenue)}</div>
          </div>
          <div className="kpi">
            <div className="label">Koszty stałe</div>
            <div className="value">{pln(snap.dailyFixedCosts)}</div>
            <div className="sub">na dobę: pensje + leasing</div>
          </div>
          <div className="kpi">
            <div className="label">Flota</div>
            <div className="value">
              {inTrip}/{snap.fleet.length}
            </div>
            <div className="sub">w trasie / wszystkie</div>
          </div>
          <div className="kpi">
            <div className="label">Kursy</div>
            <div className="value">{snap.totals.jobsDone}</div>
            <div className="sub">{snap.totals.lateJobs} spóźnionych</div>
          </div>
          <div className="kpi">
            <div className="label">Przebieg</div>
            <div className="value">{km(snap.totals.km)}</div>
            <div className="sub">łącznie flota</div>
          </div>
        </div>

        <MapPanel snap={snap} pace={pace} selectedId={selectedId} onSelect={setSelected} preview={preview} />
        <MarketPanel snap={snap} truckId={selectedId} onTruck={setSelected} onAccept={(j, t) => run(sim.acceptJob(j, t))} onPreview={setPreview} />
        <FleetPanel snap={snap} selectedId={selectedId} onSelect={setSelected} onLease={() => run(sim.leaseTruck())} onService={(id) => run(sim.serviceTruck(id))} />
        <CashChart snap={snap} />
        <CostBreakdown snap={snap} />
        <LogPanel snap={snap} />
      </main>

      {toast && <div className={`toast${toast.bad ? ' bad' : ''}`}>{toast.text}</div>}
    </div>
  );
}
