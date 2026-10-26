import { formatClock, formatDuration, formatGameTime } from '../../engine/time';
import { PHASE_LABEL, type Snapshot, type TruckView } from '../../engine/view';
import { city } from '../format';
import { FleetMap, type MapPreview } from '../map/FleetMap';

const STATUS_COLOR: Record<string, string> = {
  idle: 'var(--good)',
  service: 'var(--muted)',
  drive_empty: 'var(--info)',
  drive: 'var(--accent)',
  load: 'var(--info)',
  unload: 'var(--info)',
  break: 'var(--funny)',
  rest: 'var(--funny)',
  incident: 'var(--bad)',
};

export function MapPanel({
  snap,
  pace,
  selectedId,
  onSelect,
  preview,
}: {
  snap: Snapshot;
  pace: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  preview: MapPreview | null;
}) {
  return (
    <section className="panel area-map">
      <div className="panel-head">
        <span className="panel-title">Mapa floty</span>
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          {snap.fleet.filter((t) => t.trip).length} w trasie · {snap.fleet.filter((t) => t.status === 'idle').length} wolnych
        </span>
      </div>
      <FleetMap snap={snap} pace={pace} selectedId={selectedId} onSelect={onSelect} preview={preview} />
      <div className="map-legend">
        <span><i style={{ background: 'var(--accent)' }} />z ładunkiem</span>
        <span><i style={{ background: 'var(--info)' }} />na pusto / załadunek</span>
        <span><i style={{ background: 'var(--funny)' }} />pauza / odpoczynek</span>
        <span><i style={{ background: 'var(--bad)' }} />zdarzenie</span>
        <span><i style={{ background: 'var(--good)' }} />wolny</span>
        <span><i className="legend-dash" />podgląd zlecenia</span>
      </div>
      <TripTimeline t={snap.fleet.find((f) => f.truck.id === selectedId)} now={snap.now} />
    </section>
  );
}

/** Harmonogram kursu: widać, jak przepisy czasu jazdy dzielą trasę na fazy. */
function TripTimeline({ t, now }: { t?: TruckView; now: number }) {
  if (!t) return null;
  const head = (
    <div className="panel-title" style={{ marginBottom: 8 }}>
      Plan kursu · {t.driver.nickname}
    </div>
  );
  if (!t.trip) {
    return (
      <div className="panel-body" style={{ borderTop: '1px solid var(--line)' }}>
        {head}
        <div className="muted" style={{ fontSize: 13 }}>
          {t.status === 'service' ? 'Ciągnik w serwisie.' : `Zestaw czeka w: ${city(t.truck.cityId)}. Wybierz zlecenie na giełdzie.`}
        </div>
      </div>
    );
  }
  const { phases, startedAt, eta, deadline } = t.trip;
  const end = Math.max(eta, deadline);
  const span = Math.max(1, end - startedAt);
  const pos = (v: number) => `${((v - startedAt) / span) * 100}%`;
  const totals = new Map<string, number>();
  for (const p of phases) totals.set(p.kind, (totals.get(p.kind) ?? 0) + (p.end - p.start));
  return (
    <div className="panel-body" style={{ borderTop: '1px solid var(--line)' }}>
      {head}
      <div style={{ position: 'relative', height: 22, background: 'var(--panel-2)', borderRadius: 4, overflow: 'hidden' }}>
        {phases.map((p, i) => (
          <div
            key={i}
            title={`${PHASE_LABEL[p.kind]} ${formatClock(p.start)}–${formatClock(p.end)} (${formatDuration(p.end - p.start)})`}
            style={{
              position: 'absolute',
              left: pos(p.start),
              width: `calc(${((p.end - p.start) / span) * 100}% - 1px)`,
              top: 0,
              bottom: 0,
              background: STATUS_COLOR[p.kind],
              opacity: p.end <= now ? 0.35 : 0.9,
            }}
          />
        ))}
        <div style={{ position: 'absolute', left: pos(now), top: 0, bottom: 0, width: 2, background: 'var(--text)' }} />
        <div title="Termin dostawy" style={{ position: 'absolute', left: pos(deadline), top: 0, bottom: 0, width: 2, background: 'var(--bad)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }} className="muted num">
        <span>start {formatGameTime(startedAt)}</span>
        <span className={eta > deadline ? 'bad' : ''}>ETA {formatGameTime(eta)}</span>
        <span className="bad">termin {formatGameTime(deadline)}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, marginTop: 8 }} className="muted">
        {[...totals].map(([k, v]) => (
          <span key={k}>
            {PHASE_LABEL[k as keyof typeof PHASE_LABEL]}: <span className="num">{formatDuration(v)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
