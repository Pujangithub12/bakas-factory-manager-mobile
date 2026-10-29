// Phase 1 rules, worked out from the local tables. Pure functions: no screens, no storage.
import type { Data } from "./store";
import { fiscalYearStart, MIN, HOUR, type Row } from "./time";

export const num = (v: any): number => (v == null || v === "" ? 0 : Number(v));
const ms = (v: any) => new Date(v).getTime();
const byTime = (key: string) => (a: Row, b: Row) => ms(a[key]) - ms(b[key]);
export const pad = (n: number, w: number) => String(n).padStart(w, "0");

export const MANAGEMENT = ["Owner", "Manager", "Supervisor"];
export const isManagement = (roles: string[]) => roles.some((r) => MANAGEMENT.includes(r));
export const hasRole = (roles: string[], ...want: string[]) => roles.some((r) => want.includes(r));

export const person = (D: Data, id: string | null | undefined) => D.person.find((p) => p.id === id);
export const personName = (D: Data, id: string | null | undefined) => person(D, id)?.full_name ?? "-";
export const rolesOf = (D: Data, personId: string) => D.person_role.filter((r) => r.person_id === personId).map((r) => r.role as string);
export const mainRole = (D: Data, personId: string) => {
  const rs = D.person_role.filter((r) => r.person_id === personId);
  return (rs.find((r) => r.is_main) ?? rs[0])?.role as string | undefined;
};

// ------------------------------------------------------------ gate ----

/** People checked in right now: their open attendance row. */
export function onSiteMap(D: Data): Map<string, Row> {
  const m = new Map<string, Row>();
  for (const a of D.attendance) {
    if (!a.gate_in || a.gate_out) continue;
    const cur = m.get(a.person_id);
    if (!cur || a.gate_in > cur.gate_in) m.set(a.person_id, a);
  }
  return m;
}

export const openRuns = (D: Data) => D.machine_run.filter((r) => !r.stopped_at);

/** People running a machine or helping on a run that is still going. */
export function busyPeople(D: Data): Map<string, Row> {
  const m = new Map<string, Row>();
  for (const r of openRuns(D)) {
    m.set(r.operator_id, r);
    for (const h of D.run_helper) if (h.run_id === r.id) m.set(h.person_id, r);
  }
  return m;
}

// ----------------------------------------------------------- machines ----

export const machineOf = (D: Data, id: string) => D.machine.find((m) => m.id === id);
export const openRunOf = (D: Data, machineId: string) => D.machine_run.find((r) => r.machine_id === machineId && !r.stopped_at);
export const openJobs = (D: Data, machineId: string) => D.maintenance_job.filter((j) => j.machine_id === machineId && !j.fixed_at);
/** A machine stopped for a breakdown cannot restart until its job is fixed. */
export const blockingJob = (D: Data, machineId: string) => openJobs(D, machineId).find((j) => j.machine_stopped);

export function onBypass(D: Data, run: Row): boolean {
  const b = D.run_bypass.find((x) => x.run_id === run.id);
  if (!b) return false;
  const job = b.job_id ? D.maintenance_job.find((j) => j.id === b.job_id) : null;
  return !job || !job.fixed_at;
}

export type MachineStatus = {
  state: "running" | "idle" | "down";
  run?: Row;
  operator?: Row;
  bypass: boolean;
  reason?: string;
  openJobCount: number;
};

export function machineStatus(D: Data, m: Row): MachineStatus {
  const run = openRunOf(D, m.id);
  const jobs = openJobs(D, m.id);
  if (run) return { state: "running", run, operator: person(D, run.operator_id), bypass: onBypass(D, run), openJobCount: jobs.length };
  const blocking = jobs.find((j) => j.machine_stopped);
  const down = D.downtime.find((d) => d.machine_id === m.id && !d.ended_at);
  if (blocking || down) {
    const why = D.stop_reason.find((s) => s.id === down?.stop_reason_id)?.name;
    return { state: "down", bypass: false, reason: blocking?.problem ?? why ?? "Down", openJobCount: jobs.length };
  }
  return { state: "idle", bypass: false, openJobCount: jobs.length };
}

/** Every operator can run the briquette machine and both chippers; the rest are ticked by the supervisor. */
export function canRun(D: Data, personId: string, m: Row, roles: string[]): boolean {
  if (isManagement(roles)) return true;
  if (!roles.includes("Operator")) return false;
  if (m.stage === "briquette" || m.stage === "chip") return true;
  return D.operator_machine.some((o) => o.person_id === personId && o.machine_id === m.id);
}

export const fieldsFor = (D: Data, stage: string, kind: string) =>
  D.log_field.filter((f) => f.stage === stage && f.kind === kind).sort((a, b) => num(a.sort) - num(b.sort));

export function lastReading(D: Data, machineId: string): Row | undefined {
  return D.log_reading.filter((r) => r.machine_id === machineId).sort(byTime("at")).pop();
}

export const READING_DUE_MIN = 75;
export const LONG_RUN_HOURS = 14;

export type Alert = { key: string; text: string; tone: "bad" | "warn" };

/** What needs a look on the Floor screen. */
export function machineAlerts(D: Data, m: Row, now = new Date()): Alert[] {
  const out: Alert[] = [];
  const st = machineStatus(D, m);
  if (st.run) {
    if (st.bypass) out.push({ key: "bypass", text: "Running on bypass", tone: "bad" });
    const hasReadings = fieldsFor(D, m.stage, "reading").length > 0;
    if (hasReadings) {
      const ref = lastReading(D, m.id)?.at ?? st.run.started_at;
      const lastRef = Math.max(ms(ref), ms(st.run.started_at));
      if (now.getTime() - lastRef > READING_DUE_MIN * MIN) out.push({ key: "late", text: "Hourly reading late", tone: "warn" });
    }
    if (now.getTime() - ms(st.run.started_at) > LONG_RUN_HOURS * HOUR) out.push({ key: "long", text: `Running over ${LONG_RUN_HOURS} hours`, tone: "warn" });
  }
  if (st.openJobCount > 0) out.push({ key: "job", text: `${st.openJobCount} open job${st.openJobCount > 1 ? "s" : ""}`, tone: "warn" });
  return out;
}

// -------------------------------------------------------------- yards ----

export const ticketNet = (t: Row): number | null =>
  t.second_kg == null ? null : t.direction === "in" ? num(t.first_kg) - num(t.second_kg) : num(t.second_kg) - num(t.first_kg);

export const batchCode = (D: Data, b: Row) => `${D.yard.find((y) => y.id === b.yard_id)?.letter ?? "?"}-${pad(num(b.seq), 2)}`;
export const batchTickets = (D: Data, batchId: string) => D.weigh_ticket.filter((t) => t.batch_id === batchId);

/** The yard's current batch: filled and not yet marked empty. */
export const activeBatch = (D: Data, yardId: string) =>
  D.yard_batch.filter((b) => b.yard_id === yardId && !b.finished_at).sort((a, b) => num(b.seq) - num(a.seq))[0];
export const fillingBatch = (D: Data, yardId: string) => {
  const b = activeBatch(D, yardId);
  return b && !b.closed_at ? b : undefined;
};

/** The yard filling with this material, or an empty one. The clerk can change it. */
export function suggestYard(D: Data, materialId: string): Row | undefined {
  const yards = [...D.yard].sort((a, b) => String(a.letter).localeCompare(String(b.letter)));
  for (const y of yards) {
    const fb = fillingBatch(D, y.id);
    if (fb && batchTickets(D, fb.id).some((t) => t.material_id === materialId)) return y;
  }
  return yards.find((y) => !activeBatch(D, y.id)) ?? yards.find((y) => {
    const fb = fillingBatch(D, y.id);
    return fb && batchTickets(D, fb.id).length === 0;
  });
}

export function batchMaterial(D: Data, b: Row): Row | undefined {
  const t = batchTickets(D, b.id)[0];
  return t ? D.material.find((m) => m.id === t.material_id) : undefined;
}

export function nextChallan(D: Data, server: { last: number | null; prefix: string | null }, now = new Date()): string {
  const fy = fiscalYearStart(now).getTime();
  let max = server.last ?? 0;
  let prefix = server.prefix ?? "";
  for (const t of D.weigh_ticket) {
    if (t.direction !== "out" || !t.challan_no || ms(t.first_at) < fy) continue;
    const m = /^(.*?)(\d+)\s*$/.exec(t.challan_no);
    if (m && Number(m[2]) > max) { max = Number(m[2]); prefix = m[1]; }
  }
  return `${prefix || "BREL/"}${pad(max + 1, 3)}`;
}

// --------------------------------------------------------- production ----

const inRange = (v: any, from: Date, to: Date) => !!v && ms(v) >= from.getTime() && ms(v) < to.getTime();

/** Raw material in: finished trucks only, net weight from the two weighings. */
export const trucksIn = (D: Data, from: Date, to: Date, materialId?: string) =>
  D.weigh_ticket.filter((t) => t.direction === "in" && t.second_kg != null && inRange(t.second_at, from, to) && (!materialId || t.material_id === materialId));

export const trucksOut = (D: Data, from: Date, to: Date, materialId?: string) =>
  D.weigh_ticket.filter((t) => t.direction === "out" && t.second_kg != null && inRange(t.second_at, from, to) && (!materialId || t.material_id === materialId));

export const sumNet = (list: Row[]) => list.reduce((n, t) => n + (ticketNet(t) ?? 0), 0);

export const bagCounts = (D: Data, from: Date, to: Date) => D.bag_count.filter((b) => inRange(b.period_to, from, to));
/** Pellets = bags x kg per bag. Rated capacity is never used. */
export const pelletKg = (D: Data, from: Date, to: Date) => bagCounts(D, from, to).reduce((n, b) => n + num(b.bags) * num(b.kg_per_bag), 0);

/** Briquettes = the 1-minute weight x running minutes, from one weighing until the next. */
export function briquetteKg(D: Data, from: Date, to: Date, machineId?: string, now = new Date()): number {
  let total = 0;
  const machines = machineId ? [machineId] : D.machine.filter((m) => m.stage === "briquette").map((m) => m.id as string);
  for (const mid of machines) {
    const readings = D.log_reading.filter((r) => r.machine_id === mid && num(r.one_min_kg) > 0).sort(byTime("at"));
    const runs = D.machine_run.filter((r) => r.machine_id === mid).map((r) => [ms(r.started_at), r.stopped_at ? ms(r.stopped_at) : now.getTime()] as const);
    readings.forEach((r, i) => {
      const a = ms(r.at);
      const b = i + 1 < readings.length ? ms(readings[i + 1].at) : now.getTime();
      const lo = Math.max(a, from.getTime());
      const hi = Math.min(b, to.getTime());
      if (hi <= lo) return;
      let minutes = 0;
      for (const [s, e] of runs) {
        const x = Math.max(s, lo);
        const y = Math.min(e, hi);
        if (y > x) minutes += (y - x) / MIN;
      }
      total += num(r.one_min_kg) * minutes;
    });
  }
  return total;
}

/** Tons made since the die set was last changed. Counts only the days held on this phone. */
export function dieCounter(D: Data, m: Row, now = new Date()): { tons: number; limit: number; since: Date } {
  const changes = D.maintenance_job.filter((j) => j.machine_id === m.id && j.kind === "wear" && j.fixed_at).sort(byTime("fixed_at"));
  const lastChange = changes.length ? new Date(changes[changes.length - 1].fixed_at) : new Date(m.hour_meter_start_at ?? 0);
  const held = D.machine_run.reduce((min, r) => Math.min(min, ms(r.started_at)), now.getTime());
  const since = new Date(Math.max(lastChange.getTime(), held));
  return { tons: briquetteKg(D, since, now, m.id, now) / 1000, limit: num(m.wear_limit_t) || 300, since };
}

/** Run time (ms) of the machines at a stage between two instants. */
export function stageRunMs(D: Data, stage: string, from: number, to: number, now = Date.now()): number {
  const ids = new Set(D.machine.filter((m) => m.stage === stage).map((m) => m.id as string));
  return D.machine_run.filter((r) => ids.has(r.machine_id)).reduce((n, r) => {
    const s = ms(r.started_at);
    const e = r.stopped_at ? ms(r.stopped_at) : now;
    return n + Math.max(0, Math.min(e, to) - Math.max(s, from));
  }, 0);
}

/**
 * About how much of a feeding yard is used: the entry machines' hours x the tons per hour learned from
 * earlier finished batches. Null until there is something to learn from. Capped at 99% until marked empty.
 */
export function yardUsedPct(D: Data, b: Row, now = new Date()): number | null {
  const stage = batchMaterial(D, b)?.feed_stage;
  if (!stage || !b.started_at) return null;
  const raw = sumNet(batchTickets(D, b.id).filter((t) => t.second_kg != null));
  if (raw <= 0) return null;
  let kg = 0;
  let runMs = 0;
  for (const f of D.yard_batch) {
    if (f.id === b.id || !f.started_at || !f.finished_at || batchMaterial(D, f)?.feed_stage !== stage) continue;
    kg += sumNet(batchTickets(D, f.id));
    runMs += stageRunMs(D, stage, ms(f.started_at), ms(f.finished_at), now.getTime());
  }
  if (kg <= 0 || runMs <= 0) return null;
  const tonsPerMs = kg / runMs;
  const used = (tonsPerMs * stageRunMs(D, stage, ms(b.started_at), now.getTime(), now.getTime())) / raw;
  return Math.min(99, Math.max(0, Math.round(used * 100)));
}

export const kgToTons =(kg: number) => (kg / 1000).toFixed(kg >= 100_000 ? 0 : 1);
