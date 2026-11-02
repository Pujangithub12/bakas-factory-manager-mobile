// Vehicles and diesel: pure functions over the local tables (vehicle, vehicle_session, diesel_fill).
// Written once here, copied to the laptop by web/scripts/copy-shared.cjs.
import type { Data } from "./store";
import { num } from "./rules";
import type { Row } from "./time";

const ms = (v: any) => new Date(v).getTime();
const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((n, x) => n + f(x), 0);

/** The work session this vehicle has open right now (started, not stopped). */
export const openSession = (D: Data, vehicleId: string): Row | null => D.vehicle_session.find((x) => x.vehicle_id === vehicleId && !x.stopped_at) ?? null;

/** The last hour meter reading of a vehicle: from its work sessions or its diesel fills, whichever is newest. */
export function lastMeter(D: Data, vehicleId: string): number | null {
  let best: { at: number; v: number } | null = null;
  for (const x of D.vehicle_session) {
    if (x.vehicle_id !== vehicleId) continue;
    const raw = x.meter_end ?? x.meter_start;
    const v = raw == null ? NaN : Number(raw);
    const at = ms(x.stopped_at ?? x.started_at);
    if (!Number.isNaN(v) && (!best || at > best.at)) best = { at, v };
  }
  for (const f of D.diesel_fill) {
    if (f.vehicle_id !== vehicleId || f.meter == null) continue;
    const at = ms(f.at);
    if (!best || at > best.at) best = { at, v: Number(f.meter) };
  }
  return best ? best.v : null;
}

export type VehStats = { hrs: number; lit: number; used: number; dm: number; lph: number | null; n: number; last: Row | null };

/**
 * One vehicle between a and b (ms). Hours worked = hour meter of the finished sessions. Litres per hour = diesel put in
 * after the first fill, over the hour meter between the first and the last fill.
 */
export function vehStats(D: Data, vehicleId: string, a: number, b: number): VehStats {
  const ses = D.vehicle_session.filter((x) => x.vehicle_id === vehicleId && ms(x.started_at) >= a && ms(x.started_at) < b);
  const hrs = sum(ses.filter((x) => x.meter_end != null && x.meter_start != null), (x) => num(x.meter_end) - num(x.meter_start));
  const fills = D.diesel_fill.filter((f) => f.vehicle_id === vehicleId && ms(f.at) >= a && ms(f.at) < b).sort((x, y) => ms(x.at) - ms(y.at));
  const lit = sum(fills, (f) => num(f.litres));
  let used = 0, dm = 0;
  if (fills.length >= 2) {
    used = sum(fills.slice(1), (f) => num(f.litres));
    dm = num(fills[fills.length - 1].meter) - num(fills[0].meter);
  }
  return { hrs, lit, used, dm, lph: dm > 0 ? used / dm : null, n: ses.length, last: fills[fills.length - 1] ?? null };
}
