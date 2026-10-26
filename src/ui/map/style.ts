import countries from '../../data/geo/countries.json';
import roads from '../../data/geo/roads.json';
import { CITIES } from '../../data/cities';

/**
 * Styl „dyspozytorski” MapLibre: bez kafelków, bez serwera, bez fontów glifowych.
 * Dane z Natural Earth są w paczce gry (tools/build-geo.mjs).
 * Kolory odpowiadają tokenom z styles.css (MapLibre nie czyta zmiennych CSS).
 */
export const MAP_COLORS = {
  sea: '#0a0d12',
  land: '#141920',
  landActive: '#1d2430',
  border: '#2c3543',
  borderActive: '#4a5568',
  trunk: '#3d3628',
  motorway: '#a87420',
  night: '#000000',
  accent: '#f5a524',
  info: '#5aa9ff',
  preview: '#e7e9ee',
  city: '#8b93a3',
} as const;

/** Kraje, w których firma już działa (reszta przygaszona). */
export const ACTIVE_COUNTRIES = ['POL'];

const empty = { type: 'FeatureCollection', features: [] } as const;

export const PL_BOUNDS: [[number, number], [number, number]] = [
  [14.0, 48.9],
  [24.2, 54.9],
];
export const EU_BOUNDS: [[number, number], [number, number]] = [
  [-11, 35],
  [32, 63],
];

export function buildStyle() {
  return {
    version: 8 as const,
    sources: {
      countries: { type: 'geojson' as const, data: countries as any },
      roads: { type: 'geojson' as const, data: roads as any },
      night: { type: 'geojson' as const, data: empty as any },
      trips: { type: 'geojson' as const, data: empty as any },
      preview: { type: 'geojson' as const, data: empty as any },
      cities: {
        type: 'geojson' as const,
        data: {
          type: 'FeatureCollection',
          features: CITIES.map((c) => ({ type: 'Feature', properties: { id: c.id, weight: c.weight }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } })),
        } as any,
      },
    },
    layers: [
      { id: 'sea', type: 'background' as const, paint: { 'background-color': MAP_COLORS.sea } },
      {
        id: 'land',
        type: 'fill' as const,
        source: 'countries',
        paint: {
          'fill-color': ['case', ['in', ['get', 'code'], ['literal', ACTIVE_COUNTRIES]], MAP_COLORS.landActive, MAP_COLORS.land],
        },
      },
      {
        id: 'borders',
        type: 'line' as const,
        source: 'countries',
        paint: {
          'line-color': ['case', ['in', ['get', 'code'], ['literal', ACTIVE_COUNTRIES]], MAP_COLORS.borderActive, MAP_COLORS.border],
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 8, 1.4],
        },
      },
      {
        id: 'roads-trunk',
        type: 'line' as const,
        source: 'roads',
        filter: ['==', ['get', 'cls'], 'trunk'],
        layout: { 'line-join': 'round' as const, 'line-cap': 'round' as const },
        paint: { 'line-color': MAP_COLORS.trunk, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 9, 1.6] },
      },
      {
        id: 'roads-motorway',
        type: 'line' as const,
        source: 'roads',
        filter: ['==', ['get', 'cls'], 'motorway'],
        layout: { 'line-join': 'round' as const, 'line-cap': 'round' as const },
        paint: { 'line-color': MAP_COLORS.motorway, 'line-opacity': 0.75, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.7, 9, 2.6] },
      },
      { id: 'night', type: 'fill' as const, source: 'night', paint: { 'fill-color': MAP_COLORS.night, 'fill-opacity': 0.3 } },
      {
        id: 'trip-done',
        type: 'line' as const,
        source: 'trips',
        filter: ['==', ['get', 'part'], 'done'],
        layout: { 'line-join': 'round' as const, 'line-cap': 'round' as const },
        paint: { 'line-color': MAP_COLORS.accent, 'line-opacity': ['case', ['==', ['get', 'selected'], true], 0.35, 0.15], 'line-width': 2 },
      },
      {
        id: 'trip-empty',
        type: 'line' as const,
        source: 'trips',
        filter: ['==', ['get', 'part'], 'empty'],
        layout: { 'line-join': 'round' as const },
        paint: { 'line-color': MAP_COLORS.info, 'line-opacity': ['case', ['==', ['get', 'selected'], true], 1, 0.6], 'line-width': 2, 'line-dasharray': [2, 2] },
      },
      {
        id: 'trip-loaded',
        type: 'line' as const,
        source: 'trips',
        filter: ['==', ['get', 'part'], 'loaded'],
        layout: { 'line-join': 'round' as const, 'line-cap': 'round' as const },
        paint: { 'line-color': MAP_COLORS.accent, 'line-opacity': ['case', ['==', ['get', 'selected'], true], 1, 0.6], 'line-width': ['case', ['==', ['get', 'selected'], true], 3.5, 2.2] },
      },
      {
        id: 'preview',
        type: 'line' as const,
        source: 'preview',
        layout: { 'line-join': 'round' as const },
        paint: { 'line-color': MAP_COLORS.preview, 'line-width': 2.5, 'line-dasharray': [1.5, 1.5] },
      },
      {
        id: 'cities',
        type: 'circle' as const,
        source: 'cities',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'weight'], 3, 3, 10, 6],
          'circle-color': MAP_COLORS.sea,
          'circle-stroke-color': MAP_COLORS.city,
          'circle-stroke-width': 1.5,
        },
      },
    ],
  };
}
