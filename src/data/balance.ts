/**
 * Wszystkie liczby balansu w jednym miejscu. Zmieniaj tutaj, nie w logice,
 * i sprawdzaj efekt skryptem `npm run sim:year`.
 * Wartości rynkowe (paliwo, myto, stawki) to robocze przybliżenia do kalibracji.
 */
export const BALANCE = {
  startCash: 60_000,
  companyName: 'FloTrans Sp. z o.o.',

  // Drogi i jazda
  roadFactor: 1.15, // dystans drogowy ≈ linia prosta × współczynnik (do czasu macierzy GraphHoppera)
  baseSpeedKmh: 64, // średnia ciężarówki z miastami, rondami i wiecznym remontem
  loadMin: 60,
  unloadMin: 45,
  maxEmptyRunKm: 450,

  // Koszty
  fuelPricePerL: 6.4, // PLN, diesel
  tollPerKm: 0.62, // PLN/km, ciągnik >12 t, uśrednione e-TOLL
  tollEuro5Mul: 1.15,
  emptyFuelMul: 0.82, // na pusto pali mniej
  wearPerKm: 1 / 380_000,
  serviceMin: 8 * 60,

  // Rynek zleceń
  marketSize: 12,
  marketRefreshMin: 180,
  rateMinPerKm: 3.9,
  rateMaxPerKm: 5.4,
  minJobKm: 90,
  jobLifetimeMin: [6 * 60, 30 * 60] as [number, number],

  // Flota i ludzie
  hireFee: 2_500,
  leaseDeposit: 6_000,
  maxFleet: 25,
  lateMoraleHit: 5,
  onTimeMoraleGain: 2,
  idleMoraleDrift: -1,

  // Postęp offline
  offlineCapMin: 7 * 24 * 60,
} as const;
