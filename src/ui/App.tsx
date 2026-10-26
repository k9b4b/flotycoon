import { useEffect, useRef, useState } from 'react';
import type { CatchUpReport } from '../engine/sim';
import { SPEED_PRESETS, formatDuration, formatGameTime } from '../engine/time';
import { CashChart, CostBreakdown } from './components/Charts';
import { CompanyPanel } from './components/CompanyPanel';
import { DecisionModal } from './components/DecisionModal';
import { Coach, HelpSheet } from './components/Tutorial';
import { FleetPanel } from './components/FleetPanel';
import { LogPanel } from './components/LogPanel';
import { MapPanel } from './components/MapPanel';
import { MarketPanel } from './components/MarketPanel';
import type { MapFocus, MapPreview } from './map/FleetMap';
import { TabBar, useIsMobile, type Tab } from './components/TabBar';
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
  const mobile = useIsMobile();
  const [tab, setTab] = useState<Tab>('map');
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [logSeenAt, setLogSeenAt] = useState(0);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    sim.init().then((r) => {
      setReport(r.report);
      setSaving(r.saving);
    });
  }, []);

  const notify = (text: string, bad = false, ms = 4500) => {
    setToast({ text, bad });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), ms);
  };

  const run = async (p: Promise<{ ok: true; message: string } | { ok: false; error: string }>) => {
    const r = await p;
    notify(r.ok ? r.message : r.error, !r.ok);
  };

  // Dziennik oglądany na bieżąco: wszystko, co do niego wpada, jest już „przeczytane”.
  const latestLog = snap?.log[snap.log.length - 1]?.t ?? 0;
  useEffect(() => {
    if (mobile && tab === 'log') setLogSeenAt(latestLog);
  }, [mobile, tab, latestLog]);

  if (!snap) return <div className="loading">Rozgrzewanie silnika…</div>;

  const showTruckOnMap = (id: string) => {
    setSelected(id);
    setTab('map');
    setFocus({ kind: 'truck', id, n: (focus?.n ?? 0) + 1 });
  };
  const showJobOnMap = (p: MapPreview) => {
    setPreview(p);
    setTab('map');
    setFocus({ kind: 'preview', n: (focus?.n ?? 0) + 1 });
  };
  const switchTab = (t: Tab) => {
    // Podgląd zlecenia z giełdy znika, chyba że właśnie przechodzimy na mapę.
    if (t !== 'map') setPreview(null);
    setTab(t);
    window.scrollTo({ top: 0 });
  };
  const freeIds = new Set(snap.fleet.filter((t) => t.status === 'idle').map((t) => t.truck.id));
  const badges = {
    market: snap.market.filter((j) => j.previews.some((p) => freeIds.has(p.truckId) && p.onTime && !p.tooFar)).length,
    fleet: snap.fleet.filter((t) => t.status === 'idle' || t.status === 'nodriver').length,
    log: snap.log.filter((e) => e.t > logSeenAt && e.tone !== 'info').length,
  };

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
        <div className={`topbar-cash num ${snap.cash < 0 ? 'bad' : ''}`}>{pln(snap.cash)}</div>
        <div className="clock">
          <div className="time">{formatGameTime(snap.now, true)}</div>
          <div className={`label${snap.decisions.length ? ' warn' : ''}`}>{snap.decisions.length ? 'czeka na decyzję' : 'czas gry'}</div>
        </div>
        <button className="help-btn" onClick={() => setHelp(true)} aria-label="Ściągawka i samouczek" title="Ściągawka i samouczek">
          ?
        </button>
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

      <main className="grid" data-tab={mobile ? tab : undefined}>
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
            <div className="label">Ranga</div>
            <div className="value kpi-rank">{snap.company.rankName}</div>
            <div className="sub">reputacja {snap.company.reputation}</div>
          </div>
          <div className="kpi">
            <div className="label">Przebieg</div>
            <div className="value">{km(snap.totals.km)}</div>
            <div className="sub">łącznie flota</div>
          </div>
        </div>

        <MapPanel
          snap={snap}
          pace={pace}
          selectedId={selectedId}
          onSelect={setSelected}
          preview={preview}
          visible={!mobile || tab === 'map'}
          focus={focus}
          onAcceptPreview={(j, t) => {
            setPreview(null);
            setSelected(t);
            void run(sim.acceptJob(j, t));
          }}
          onClosePreview={() => setPreview(null)}
        />
        <MarketPanel
          snap={snap}
          truckId={selectedId}
          onTruck={setSelected}
          onAccept={(j, t) => run(sim.acceptJob(j, t))}
          onPreview={mobile ? () => {} : setPreview}
          onShowOnMap={showJobOnMap}
          onSign={(id) => run(sim.signContract(id))}
        />
        <FleetPanel
          snap={snap}
          selectedId={selectedId}
          a={{
            select: (id) => {
              setSelected(id);
              // Na komputerze mapa jest obok, więc od razu pokazujemy na niej zestaw.
              if (!mobile) setFocus({ kind: 'truck', id, n: (focus?.n ?? 0) + 1 });
            },
            findJob: (id) => {
              setSelected(id);
              if (mobile) switchTab('market');
            },
            showOnMap: showTruckOnMap,
            service: (id) => run(sim.serviceTruck(id)),
            bonus: (id) => run(sim.giveBonus(id)),
            hire: (id) => run(sim.hireDriver(id)),
            fire: (id) => run(sim.fireDriver(id)),
            assign: (truckId, driverId) => run(sim.assignDriver(truckId, driverId)),
            lease: (id) => run(sim.leaseOffer(id)),
            returnTruck: (id) => run(sim.returnTruck(id)),
            train: (driverId, courseId) => run(sim.trainDriver(driverId, courseId)),
          }}
        />
        <CompanyPanel
          snap={snap}
          onYard={() => run(sim.upgradeYard())}
          onUpgrade={(id) => run(sim.buyUpgrade(id))}
          onAutoDispatch={(on) => run(sim.setAutoDispatch(on))}
          onAskDecisions={(on) => run(sim.setAskDecisions(on))}
        />
        <CashChart snap={snap} />
        <CostBreakdown snap={snap} />
        <LogPanel snap={snap} />
      </main>

      {mobile && <TabBar tab={tab} onTab={switchTab} badges={badges} />}
      <Coach snap={snap} pace={pace} mobile={mobile} onTab={switchTab} />
      {help && <HelpSheet onClose={() => setHelp(false)} />}
      {snap.decisions[0] && (
        <DecisionModal
          d={snap.decisions[0]}
          more={snap.decisions.length - 1}
          onChoose={(opt) => {
            const id = snap.decisions[0].id;
            void sim.resolveDecision(id, opt).then((r) => notify(r.ok ? r.message : r.error, !r.ok, 9000));
          }}
          onShow={() => showTruckOnMap(snap.decisions[0].truckId)}
        />
      )}
      {toast && !snap.decisions.length && <div className={`toast${toast.bad ? ' bad' : ''}`}>{toast.text}</div>}
    </div>
  );
}
