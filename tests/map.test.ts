import { describe, expect, it } from 'vitest';
import { CITY_BY_ID } from '../src/data/cities';
import { buildTripPath, pointAtKm, slicePath } from '../src/engine/paths';
import { isNight, nightPolygon } from '../src/ui/map/night';

describe('ścieżka kursu', () => {
  // Tolerancja 0,05°: trasy z GraphHoppera zaczynają się w punkcie przyciągniętym do drogi.
  it('kilometry z harmonogramu trafiają w miasta na końcach odcinków', () => {
    const p = buildTripPath('WAW', 'LDZ', 'POZ', 130, 210);
    const [lon0, lat0] = pointAtKm(p, 0);
    expect(lon0).toBeCloseTo(CITY_BY_ID.WAW.lon, 1);
    expect(lat0).toBeCloseTo(CITY_BY_ID.WAW.lat, 1);
    const [lon1, lat1] = pointAtKm(p, 130);
    expect(lon1).toBeCloseTo(CITY_BY_ID.LDZ.lon, 1);
    expect(lat1).toBeCloseTo(CITY_BY_ID.LDZ.lat, 1);
    const [lon2] = pointAtKm(p, 340);
    expect(lon2).toBeCloseTo(CITY_BY_ID.POZ.lon, 1);
  });

  it('bez dojazdu na pusto ścieżka zaczyna się w miejscu załadunku', () => {
    const p = buildTripPath('KRK', 'KRK', 'GDN', 0, 580);
    expect(p.coords[0][0]).toBeCloseTo(CITY_BY_ID.KRK.lon, 1);
    expect(slicePath(p, 100, 200).length).toBeGreaterThanOrEqual(2);
  });
});

describe('cień nocy', () => {
  it('w styczniu o 12:00 w Warszawie jest dzień, o 23:00 noc', () => {
    const noon = 12 * 60; // pn 4.01.2027, 12:00 czasu polskiego
    expect(isNight(noon, 21, 52.2)).toBe(false);
    expect(isNight(23 * 60, 21, 52.2)).toBe(true);
  });

  it('wielokąt nocy jest zamknięty', () => {
    const ring = nightPolygon(6 * 60);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring.length).toBeGreaterThan(100);
  });
});
