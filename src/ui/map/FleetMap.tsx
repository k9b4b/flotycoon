import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { CITIES } from '../../data/cities';
import { kmAt, phaseAt } from '../../engine/drivingRules';
import { buildTripPath, pointAtKm, slicePath, type TripPath } from '../../engine/paths';
import type { LngLat } from '../../engine/routes';
import type { JobView, Snapshot, TruckView } from '../../engine/view';
import { nightPolygon } from './night';
import { buildStyle, EU_BOUNDS, PL_BOUNDS } from './style';

export interface MapPreview {
  job: JobView;
  originId: string;
}

interface Props {
  snap: Snapshot;
  pace: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  preview: MapPreview | null;
  /** Na telefonie mapa jest w zakładce: ukryta nie animuje się, po pokazaniu przelicza rozmiar. */
  visible?: boolean;
  /** Prośba o przesunięcie widoku; `n` rośnie przy każdej nowej prośbie. */
  focus?: MapFocus | null;
}

export type MapFocus = { kind: 'truck'; id: string; n: number } | { kind: 'preview'; n: number };

/** Maks. czas (ms) ekstrapolacji między widokami z workera. */
const MAX_EXTRAPOLATE_MS = 600;

function tripPathFor(t: TruckView, cache: Map<string, TripPath>): TripPath | null {
  if (!t.trip) return null;
  const key = `${t.truck.tripId}`;
  let p = cache.get(key);
  if (!p) {
    p = buildTripPath(t.trip.originId, t.trip.fromId, t.trip.toId, t.trip.emptyKm, t.trip.jobKm);
    cache.set(key, p);
  }
  return p;
}

const line = (coords: LngLat[], props: Record<string, unknown>) => ({
  type: 'Feature' as const,
  properties: props,
  geometry: { type: 'LineString' as const, coordinates: coords },
});

export function FleetMap({ snap, pace, selectedId, onSelect, preview, visible = true, focus = null }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const ready = useRef(false);
  const markers = useRef(new Map<string, { m: Marker; el: HTMLDivElement }>());
  const paths = useRef(new Map<string, TripPath>());
  // Najnowsze dane dla pętli animacji (bez restartowania efektu przy każdym widoku).
  const live = useRef({ snap, pace, selectedId, visible, at: performance.now() });
  live.current = { ...live.current, snap, pace, selectedId, visible };
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    live.current.at = performance.now();
  }, [snap]);

  // ── Inicjalizacja mapy ──────────────────────────────────────────────────
  useEffect(() => {
    if (!box.current) return;
    if (!maplibregl) {
      setError('Nie udało się wczytać biblioteki mapy. Sprawdź połączenie i odśwież stronę.');
      return;
    }
    let m: MapLibreMap;
    try {
      m = new maplibregl.Map({
      container: box.current,
      style: buildStyle() as any,
      bounds: PL_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      maxBounds: [
        [-35, 25],
        [55, 75],
      ],
      minZoom: 3,
      maxZoom: 10,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false,
      });
    } catch (e) {
      // Najczęściej: brak WebGL (stara przeglądarka, wyłączona akceleracja).
      setError(`Mapa nie wystartowała: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    m.on('error', (e: { error?: Error }) => console.error('[mapa]', e.error ?? e));
    m.touchZoomRotate.disableRotation();
    map.current = m;

    // Podpisy miast jako lekkie znaczniki HTML (styl nie potrzebuje fontów glifowych).
    for (const c of CITIES) {
      const el = document.createElement('div');
      el.className = 'city-label';
      el.textContent = c.name;
      new maplibregl.Marker({ element: el, anchor: 'left', offset: [8, 0] }).setLngLat([c.lon, c.lat]).addTo(m);
    }

    m.on('load', () => {
      ready.current = true;
    });

    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const { snap: s, pace: p, at, visible: shown } = live.current;
      if (!shown) return;
      // Szacowany czas gry między widokami: płynny ruch w 60 klatkach.
      const gameNow = s.now + (Math.min(performance.now() - at, MAX_EXTRAPOLATE_MS) / 1000) * p;
      for (const t of s.fleet) {
        const mk = markers.current.get(t.truck.id);
        if (!mk) continue;
        const path = tripPathFor(t, paths.current);
        if (path && t.trip) {
          const km = kmAt(t.trip.phases, Math.min(gameNow, t.trip.eta));
          mk.m.setLngLat(pointAtKm(path, km));
          const ph = phaseAt(t.trip.phases, gameNow);
          if (ph) mk.el.dataset.status = ph.kind;
        }
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      markers.current.clear();
      ready.current = false;
      m.remove();
      map.current = null;
    };
  }, []);

  // ── Znaczniki ciężarówek ────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    const stacked = new Map<string, number>();
    for (const t of snap.fleet) {
      seen.add(t.truck.id);
      let mk = markers.current.get(t.truck.id);
      if (!mk) {
        const el = document.createElement('div');
        el.className = 'truck-pin';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectRef.current(t.truck.id);
        });
        mk = { m: new maplibregl.Marker({ element: el }).setLngLat([t.lon, t.lat]).addTo(m), el };
        markers.current.set(t.truck.id, mk);
      }
      mk.el.textContent = t.driver.nickname[0];
      mk.el.title = `${t.truck.plate} · ${t.driver.nickname} · ${t.statusLabel}`;
      mk.el.dataset.status = t.status;
      mk.el.classList.toggle('selected', t.truck.id === selectedId);
      if (!t.trip) {
        // Postój: kilka zestawów w jednym mieście rozsuwamy obok siebie.
        const n = stacked.get(t.truck.cityId) ?? 0;
        stacked.set(t.truck.cityId, n + 1);
        mk.m.setOffset([n * 22 - 10, -16]).setLngLat([t.lon, t.lat]);
      } else {
        mk.m.setOffset([0, 0]);
      }
    }
    for (const [id, mk] of markers.current) {
      if (!seen.has(id)) {
        mk.m.remove();
        markers.current.delete(id);
      }
    }
    // Ścieżki zakończonych kursów nie są już potrzebne.
    const activeTrips = new Set(snap.fleet.map((t) => t.truck.tripId).filter(Boolean));
    for (const key of paths.current.keys()) if (!activeTrips.has(key)) paths.current.delete(key);
  }, [snap, selectedId]);

  // ── Linie kursów, podgląd zlecenia, noc ─────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    const features = [];
    for (const t of snap.fleet) {
      const path = tripPathFor(t, paths.current);
      if (!path || !t.trip) continue;
      const km = kmAt(t.trip.phases, snap.now);
      const total = t.trip.emptyKm + t.trip.jobKm;
      const selected = t.truck.id === selectedId;
      features.push(line(slicePath(path, 0, km), { part: 'done', selected }));
      if (km < t.trip.emptyKm) features.push(line(slicePath(path, km, t.trip.emptyKm), { part: 'empty', selected }));
      features.push(line(slicePath(path, Math.max(km, t.trip.emptyKm), total), { part: 'loaded', selected }));
    }
    (m.getSource('trips') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features } as any);

    const pv = preview ? buildTripPath(preview.originId, preview.job.fromId, preview.job.toId, preview.originId === preview.job.fromId ? 0 : 1, preview.job.km) : null;
    (m.getSource('preview') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: pv ? [line(pv.coords, {})] : [],
    } as any);

    (m.getSource('night') as GeoJSONSource | undefined)?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [nightPolygon(snap.now)] },
    } as any);
  }, [snap, selectedId, preview]);

  // ── Widoczność i przesuwanie widoku ─────────────────────────────────────
  useEffect(() => {
    if (visible) requestAnimationFrame(() => map.current?.resize());
  }, [visible]);

  useEffect(() => {
    const m = map.current;
    if (!m || !focus) return;
    // Po przełączeniu zakładki kontener dopiero dostaje rozmiar, więc czekamy klatkę.
    requestAnimationFrame(() => {
      m.resize();
      if (focus.kind === 'truck') {
        const mk = markers.current.get(focus.id);
        if (mk) m.easeTo({ center: mk.m.getLngLat(), zoom: Math.max(m.getZoom(), 6.5), duration: 700 });
      } else if (preview) {
        const p = buildTripPath(preview.originId, preview.job.fromId, preview.job.toId, preview.originId === preview.job.fromId ? 0 : 1, preview.job.km);
        const lons = p.coords.map((c) => c[0]);
        const lats = p.coords.map((c) => c[1]);
        m.fitBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          { padding: 48, duration: 700, maxZoom: 8 },
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);

  const fit = (b: typeof PL_BOUNDS) => map.current?.fitBounds(b, { padding: 24, duration: 800 });

  return (
    <div className="fleet-map">
      <div ref={box} className="fleet-map-canvas" />
      {error && <div className="map-error">{error}</div>}
      <div className="map-buttons">
        <button className="btn small" onClick={() => fit(PL_BOUNDS)}>
          Polska
        </button>
        <button className="btn small" onClick={() => fit(EU_BOUNDS)}>
          Europa
        </button>
      </div>
      <div className="map-credit">Mapa: Natural Earth · Trasy: © OpenStreetMap, GraphHopper</div>
    </div>
  );
}
