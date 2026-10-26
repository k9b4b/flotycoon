import type { DriverView, Snapshot, TruckView } from '../../engine/view';
import { pct } from '../format';
import { PERK_BY_ID } from '../../data/perks';
import { driverScore } from './driverUi';
import type { FleetActions } from './FleetPanel';

/**
 * Ręczne łączenie kierowców z autami. Gra nie paruje ich sama:
 * najlepszego kierowcę można posadzić w najlepszym aucie, a zamiana działa w obie strony.
 */

const s1 = (n: number) => n.toFixed(1).replace('.', ',');

function driverOption(dv: DriverView, target: TruckView) {
  const d = dv.driver;
  const s = d.stats;
  const top = (d.perks ?? []).map((id) => PERK_BY_ID[id].name).join(', ');
  let where = 'wolny';
  if (dv.truckLabel) where = target.driver ? `zamiana z ${dv.truckLabel.split(' ')[0]}` : `z ${dv.truckLabel.split(' ')[0]}`;
  return `„${d.nickname}” · ocena ${driverScore(d)} (D${s.experience} E${s.eco} N${s.reliability} K${s.stamina})${top ? ` · ${top}` : ''} · ${where}`;
}

/** Wybór kierowcy dla auta: wszyscy, którzy nie są w trasie, najlepsi na górze. */
export function DriverPicker({ snap, t, a, placeholder }: { snap: Snapshot; t: TruckView; a: FleetActions; placeholder: string }) {
  const options = snap.drivers
    .filter((dv) => !dv.onTrip && dv.driver.id !== t.driver?.id)
    .sort((x, y) => Number(!!x.truckId) - Number(!!y.truckId) || driverScore(y.driver) - driverScore(x.driver));
  if (options.length === 0) return null;
  return (
    <select className="pair-select" value="" aria-label={placeholder} onChange={(e) => e.target.value && a.assign(t.truck.id, e.target.value)}>
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((dv) => (
        <option key={dv.driver.id} value={dv.driver.id}>
          {driverOption(dv, t)}
        </option>
      ))}
    </select>
  );
}

function truckOption(t: TruckView, movingFrom: boolean) {
  const tr = t.truck;
  const who = t.driver ? (movingFrom ? `zamiana z „${t.driver.nickname}”` : `wypycha „${t.driver.nickname}”`) : 'bez kierowcy';
  return `#${t.fleetNo} ${tr.brand} ${tr.model} · ${s1(tr.fuelL100)} l/100 · zużycie ${pct(tr.wear)} · Euro ${tr.euro}${tr.condition === 'new' ? ' · nowe' : ''} · ${who}`;
}

/** Wybór auta dla kierowcy: każde, które nie jest w trasie, najoszczędniejsze na górze. */
export function TruckPicker({ snap, dv, a }: { snap: Snapshot; dv: DriverView; a: FleetActions }) {
  if (dv.onTrip) return null;
  const options = snap.fleet
    .filter((t) => !t.trip && t.truck.id !== dv.truckId)
    .sort((x, y) => Number(!!x.driver) - Number(!!y.driver) || x.truck.fuelL100 * (1 + x.truck.wear) - y.truck.fuelL100 * (1 + y.truck.wear));
  if (options.length === 0) return null;
  const label = dv.truckId ? 'Przesadź do…' : 'Przydziel auto…';
  return (
    <select className="pair-select" value="" aria-label={`${label} ${dv.driver.nickname}`} onChange={(e) => e.target.value && a.assign(e.target.value, dv.driver.id)}>
      <option value="" disabled>
        {label}
      </option>
      {options.map((t) => (
        <option key={t.truck.id} value={t.truck.id}>
          {truckOption(t, !!dv.truckId)}
        </option>
      ))}
    </select>
  );
}
