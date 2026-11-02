// Phase 1 rules, worked out from the local tables. Pure functions: no screens, no storage.
import type { Data } from "./store";
import { fiscalYearStart, MIN, HOUR, DAY, type Row } from "./time";

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

export const READING_DUE_MIN = 60;
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
  }
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

// ------------------------------------------------------------ store ----

export const KINDS: [string, string][] = [["Tool", "Tools and tackles"], ["Spare", "Spare parts"], ["Lubricant", "Lubricants"], ["Consumable", "Consumables"]];
export const itemName = (D: Data, id: string | null | undefined) => D.store_item.find((i) => i.id === id)?.name ?? "?";

/** Tools issued and not yet back: a movement with a "back by" time and no return. */
export const toolsOut = (D: Data) => D.store_movement.filter((m) => m.type === "issue" && m.due_back && !m.returned_at);
export const outCount = (D: Data, itemId: string) => toolsOut(D).filter((m) => m.item_id === itemId).reduce((n, m) => n + num(m.qty), 0);
/** What can be handed out now: tools not already out, other items in store. */
export const freeQty = (D: Data, it: Row) => (it.kind === "Tool" ? num(it.qty) - outCount(D, it.id) : num(it.qty));
export const belowMin = (D: Data) => D.store_item.filter((i) => num(i.qty) < num(i.min_qty));
export const round2 = (n: number) => Math.round(n * 100) / 100;

export const prLines = (D: Data, prId: string) => D.purchase_request_line.filter((l) => l.pr_id === prId);
export const prText = (D: Data, p: Row) =>
  prLines(D, p.id).map((l) => `${l.description || itemName(D, l.item_id)} x ${num(l.qty)} ${l.unit ?? ""}`.trim()).join(", ");
export const PR_TONE: Record<string, "warn" | "info" | "good" | "bad"> = { Requested: "warn", Approved: "info", Ordered: "info", Received: "good", Rejected: "bad" };
export const nextPrNo = (D: Data) => `PR-${pad(D.purchase_request.reduce((n, p) => Math.max(n, Number(/(\d+)$/.exec(p.pr_no)?.[1] ?? 0)), 0) + 1, 4)}`;
export const nextPassNo = (D: Data) => `VP-${pad(D.visitor.reduce((n, p) => Math.max(n, Number(/(\d+)$/.exec(p.pass_no)?.[1] ?? 100)), 100) + 1, 4)}`;

// ------------------------------------------------- maintenance plan ----

/** Hour meter now: the last reading plus the hours run since it (or the start value set in Setup). */
export function meterNow(D: Data, machineId: string, now = Date.now()): number {
  const last = D.hour_meter_reading.filter((r) => r.machine_id === machineId).sort(byTime("at")).pop();
  const m = D.machine.find((x) => x.id === machineId);
  const base = last ? num(last.hours) : num(m?.hour_meter_start);
  const from = last ? ms(last.at) : m?.hour_meter_start_at ? ms(m.hour_meter_start_at) : now;
  let runMs = 0;
  for (const r of D.machine_run) {
    if (r.machine_id !== machineId) continue;
    const s = Math.max(ms(r.started_at), from);
    const e = Math.min(r.stopped_at ? ms(r.stopped_at) : now, now);
    if (e > s) runMs += e - s;
  }
  return base + runMs / HOUR;
}

export const isDaily = (t: Row) => num(t.every_days) === 1 && !num(t.every_hours);
export const lastDone = (D: Data, taskId: string) => D.pm_done.filter((d) => d.task_id === taskId).sort(byTime("done_at")).pop();

export type PmState = { st: "over" | "soon" | "ok" | "new"; f: number; usedH: number | null; days: number | null; last?: Row };

/** How far through its interval a task is. A task never done is "new": it starts counting from the first record. */
export function pmState(D: Data, t: Row, now = Date.now()): PmState {
  const last = lastDone(D, t.id);
  if (!last) return { st: "new", f: 0, usedH: null, days: null };
  const days = (now - ms(last.done_at)) / DAY;
  let usedH: number | null = null;
  let fh = 0;
  if (num(t.every_hours)) {
    usedH = t.counts === "tons"
      ? briquetteKg(D, new Date(last.done_at), new Date(now), t.machine_id, new Date(now)) / 1000
      : meterNow(D, t.machine_id, now) - num(last.hour_meter);
    fh = usedH / num(t.every_hours);
  }
  const fd = num(t.every_days) ? days / num(t.every_days) : 0;
  const f = Math.max(fh, fd);
  return { st: f >= 1 ? "over" : f >= 0.85 ? "soon" : "ok", f, usedH, days, last };
}

const intf = (n: number) => Math.round(n).toLocaleString("en-US");
const DAYS: Record<number, string> = { 1: "every day", 7: "every week", 30: "every month", 91: "every 3 months", 182: "every 6 months", 365: "every year", 730: "every 2 years" };
export function pmEvery(t: Row): string {
  const p: string[] = [];
  if (num(t.every_hours)) p.push(t.counts === "tons" ? `${intf(num(t.every_hours))} t made` : `${intf(num(t.every_hours))} running hours`);
  if (num(t.every_days)) p.push(DAYS[num(t.every_days)] ?? `every ${num(t.every_days)} days`);
  return p.join(" or ");
}
export function pmDueText(t: Row, s: PmState): string {
  const p: string[] = [];
  if (s.st === "new") return "Not done yet: mark it done once to start counting";
  if (num(t.every_hours) && s.usedH != null) {
    const left = num(t.every_hours) - s.usedH;
    const u = t.counts === "tons" ? "t" : "h";
    p.push(left >= 0 ? `${intf(left)} ${u} left` : `${intf(-left)} ${u} over`);
  }
  if (num(t.every_days) > 1 && s.days != null) {
    const left = num(t.every_days) - s.days;
    p.push(left >= 0 ? `${Math.ceil(left)} days left` : `${Math.floor(-left)} days over`);
  }
  return p.join(" · ");
}

/** Plan tasks to show first: overdue, then due soon (never-done tasks wait for their first record). */
export function dueTasks(D: Data, filter: (t: Row) => boolean = () => true) {
  return D.pm_task
    .filter((t) => !isDaily(t) && filter(t))
    .map((t) => ({ t, s: pmState(D, t) }))
    .filter((x) => x.s.st === "over" || x.s.st === "soon")
    .sort((a, b) => b.s.f - a.s.f);
}


// ------------------------------------------------------------ alerts ----

export type AppAlert = { key: string; tone: "bad" | "warn" | "info"; title: string; detail: string; area: string; at: number; go?: { screen: string; params?: object } };

const dur = (msv: number) => {
  const m = Math.max(0, Math.round(msv / MIN));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

/** What needs a look: down machines, bypasses, late readings, trucks waiting too long, new workers. Worst first, then newest. */
const productionDayStartMs = (at: number) => {
  const n = new Date(at + 5.75 * HOUR);
  let d = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 6, 0) - 5.75 * HOUR;
  if (d > at) d -= DAY;
  return d;
};

export function alertsAll(D: Data, now = Date.now()): AppAlert[] {
  const out: AppAlert[] = [];
  for (const m of D.machine) {
    const down = D.downtime.find((d) => d.machine_id === m.id && !d.ended_at);
    const reason = D.stop_reason.find((r) => r.id === down?.stop_reason_id);
    if (down && reason?.type !== "Planned" && now - ms(down.started_at) > 30 * MIN) {
      const job = down.job_id ? D.maintenance_job.find((j) => j.id === down.job_id) : blockingJob(D, m.id);
      out.push({
        key: `down-${m.id}`, tone: "bad", title: `${m.tag} has been down for ${dur(now - ms(down.started_at))}`, area: "Machines", at: ms(down.started_at), go: { screen: "MachineDrill", params: { machineId: m.id } },
        detail: `${reason?.name ?? "Down"} · ${job?.fitter_id ? `${personName(D, job.fitter_id)} working on it` : "no fitter has taken it"}`,
      });
    }
    const st = machineStatus(D, m);
    if (st.run && onBypass(D, st.run)) {
      const no = D.prestart_answer.filter((a) => a.run_id === st.run!.id && a.answer === false).map((a) => D.log_field.find((f) => f.id === a.field_id)?.label ?? "a check");
      const b = D.run_bypass.find((x) => x.run_id === st.run!.id);
      out.push({ key: `bypass-${m.id}`, tone: "bad", title: `${m.tag} running on bypass`, area: "Machines", at: ms(st.run.started_at), go: { screen: "MachineDrill", params: { machineId: m.id } }, detail: `${no.join(", ")} marked No${b ? `: “${b.remark}”` : ""}` });
    }
    if (st.run && machineAlerts(D, m, new Date(now)).some((a) => a.key === "late")) {
      const lastRd = lastReading(D, m.id);
      const due = Math.max(lastRd ? ms(lastRd.at) : 0, ms(st.run.started_at)) + READING_DUE_MIN * MIN;
      out.push({ key: `late-${m.id}`, tone: "warn", title: `${m.tag} hourly reading is late`, area: "Log sheets", at: due, go: { screen: "MachineDrill", params: { machineId: m.id } }, detail: `It was due at ${new Date(due + 5.75 * HOUR).toISOString().slice(11, 16)} · ${st.operator?.full_name ?? ""}` });
    }
  }
  for (const t of D.weigh_ticket) {
    if (t.second_kg == null && now - ms(t.first_at) > 60 * MIN) {
      const party = (t.direction === "in" ? D.supplier : D.buyer).find((p) => p.id === (t.direction === "in" ? t.supplier_id : t.buyer_id))?.name ?? "";
      out.push({ key: `wb-${t.id}`, tone: "warn", title: `${t.vehicle_no} has been at the weighbridge for ${dur(now - ms(t.first_at))}`, area: "Weighbridge", at: ms(t.first_at), go: { screen: "TruckDrill", params: { ticketId: t.id } }, detail: `${party} · ${D.material.find((m) => m.id === t.material_id)?.name ?? ""}` });
    }
  }
  // Electricity: the hourly meter reading is late, or kWh per ton is over target.
  const lastPw = D.power_reading.reduce((x, p) => Math.max(x, ms(p.at)), 0);
  if (lastPw && now - lastPw > 75 * MIN) {
    out.push({ key: "power-late", tone: "warn", title: "Electricity meter reading is late", detail: `Last reading at ${new Date(lastPw + 5.75 * HOUR).toISOString().slice(11, 16)}`, area: "Electricity", at: lastPw + HOUR, go: { screen: "PowerReading" } });
  }
  // Maintenance plan: overdue and due soon, and the daily round.
  const day0 = productionDayStartMs(now);
  for (const t of D.pm_task) {
    if (isDaily(t)) continue;
    const s = pmState(D, t, now);
    if (s.st === "over") out.push({ key: `pm-${t.id}`, tone: "bad", title: `Overdue: ${t.equipment}, ${String(t.task).toLowerCase()}`, detail: pmDueText(t, s), area: "Maintenance plan", at: now });
    else if (s.st === "soon") out.push({ key: `pm-${t.id}`, tone: "warn", title: `Due soon: ${t.equipment}, ${String(t.task).toLowerCase()}`, detail: pmDueText(t, s), area: "Maintenance plan", at: now });
  }
  const rounds = D.pm_task.filter((t) => isDaily(t) && !D.pm_done.some((d) => d.task_id === t.id && ms(d.done_at) >= day0));
  if (rounds.length && D.pm_task.some(isDaily) && now > day0 + 4 * HOUR) {
    out.push({ key: "pm-round", tone: "warn", title: `Daily round: ${rounds.length} checks not done today`, detail: [...new Set(rounds.map((t) => t.equipment))].join(", "), area: "Maintenance plan", at: day0 });
  }
  // Store: low stock, tools not returned, tools returned damaged.
  for (const it of D.store_item) {
    if (num(it.qty) < num(it.min_qty)) out.push({ key: `low-${it.id}`, tone: "warn", title: `Low stock: ${it.name}`, detail: `${num(it.qty)} ${it.unit} in store, keep at least ${num(it.min_qty)}`, area: "Store", at: now });
  }
  for (const mv of D.store_movement) {
    const it = D.store_item.find((i) => i.id === mv.item_id);
    if (mv.type === "issue" && mv.due_back && !mv.returned_at && now > ms(mv.due_back)) {
      out.push({ key: `out-${mv.id}`, tone: "warn", title: `Not returned: ${it?.name ?? "a tool"}`, detail: `With ${personName(D, mv.to_person_id)}`, area: "Store", at: ms(mv.due_back) });
    }
    if (mv.returned_at && mv.condition && mv.condition !== "OK" && now - ms(mv.returned_at) < 3 * DAY) {
      out.push({ key: `bad-${mv.id}`, tone: "warn", title: `${it?.name ?? "A tool"} came back ${String(mv.condition).toLowerCase()}`, detail: `From ${personName(D, mv.to_person_id)}${mv.note ? `: ${mv.note}` : ""}`, area: "Store", at: ms(mv.returned_at) });
    }
  }
  // Lab: a sales truck that left without a report; very wet raw material.
  for (const t of D.weigh_ticket) {
    if (t.second_kg == null) continue;
    if (t.direction === "out" && now - ms(t.second_at) < DAY && !D.lab_test.some((l) => l.ticket_id === t.id)) {
      out.push({ key: `lab-${t.id}`, tone: "warn", title: `No lab report: ${t.vehicle_no}`, detail: `${D.material.find((m) => m.id === t.material_id)?.name ?? ""} to ${D.buyer.find((b) => b.id === t.buyer_id)?.name ?? ""}`, area: "Lab", at: ms(t.second_at), go: { screen: "TruckDrill", params: { ticketId: t.id } } });
    }
    if (t.direction === "in" && ms(t.second_at) >= day0) {
      const v = [t.moisture_1, t.moisture_2, t.moisture_3].filter((x) => x != null).map(Number);
      const lab = D.lab_test.find((l) => l.ticket_id === t.id);
      const m = lab?.moisture_pct != null ? num(lab.moisture_pct) : v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
      const std = num(D.moisture_standard.find((s) => s.material_id === t.material_id)?.standard_pct) || 45;
      if (m != null && m > std + 10) {
        out.push({ key: `wet-${t.id}`, tone: "info", title: `Wet truck: ${m.toFixed(1)}% moisture`, detail: `${t.vehicle_no} · ${D.supplier.find((s) => s.id === t.supplier_id)?.name ?? ""} (standard ${std}%)`, area: "Raw material", at: ms(t.second_at), go: { screen: "TruckDrill", params: { ticketId: t.id } } });
      }
    }
  }
  // Bills: only where this device holds the owner's money records.
  if (D.raw_price.length || D.sale_price.length) {
    const nb = D.weigh_ticket.filter((t) => t.direction === "out" && t.second_kg != null && now - ms(t.second_at) > DAY && !D.sales_bill.some((b) => b.ticket_id === t.id)).length;
    if (nb) out.push({ key: "bills", tone: "warn", title: `${nb} sales truck${nb > 1 ? "s" : ""} without a bill entry`, detail: "Enter the bill no., rate and payment from the bill book", area: "Bills", at: now });
  }
  // Gate and purchase requests.
  for (const v of D.visitor) {
    if (!v.time_out && now - ms(v.time_in) > 4 * HOUR) out.push({ key: `vis-${v.id}`, tone: "info", title: `Visitor on site for ${dur(now - ms(v.time_in))}: ${v.name}`, detail: `${v.purpose} · to meet ${personName(D, v.meet_person_id)}`, area: "Gate", at: ms(v.time_in) });
  }
  for (const p of D.purchase_request) {
    if (p.status === "Requested") {
      const text = D.purchase_request_line.filter((l) => l.pr_id === p.id).map((l) => `${l.description ?? ""} x ${num(l.qty)} ${l.unit ?? ""}`.trim()).join(", ");
      out.push({ key: `pr-${p.id}`, tone: "info", title: `${p.pr_no} is waiting for approval`, detail: `${text} · ${personName(D, p.requested_by)}`, area: "Purchase requests", at: ms(p.requested_at) });
    }
  }
  const fresh = D.person.filter((p) => p.active && !p.checked);
  if (fresh.length) out.push({ key: "new-workers", tone: "info", title: `${fresh.length} new worker${fresh.length > 1 ? "s" : ""} to check`, area: "People", at: now, detail: fresh.map((p) => p.full_name).join(", ") });
  const rank = { bad: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.tone] - rank[b.tone] || b.at - a.at);
}

const ALERT_AREAS: Record<string, string[] | null> = {
  Owner: null, Manager: null,
  Supervisor: ["Machines", "Log sheets", "Electricity", "People", "Gate", "Maintenance plan"],
  Operator: ["Machines", "Log sheets", "Electricity"], Security: ["Gate", "People"], Weighbridge: ["Weighbridge", "Raw material", "Lab"],
  Fitter: ["Machines", "Maintenance plan", "Store"], Store: ["Store", "Purchase requests"], Driver: [],
};
/** The alerts one person sees: management everything, others only their own areas. */
export function alertsFor(D: Data, roles: string[], now = Date.now()): AppAlert[] {
  const all = alertsAll(D, now);
  if (roles.some((r) => ALERT_AREAS[r] === null)) return all;
  const areas = new Set(roles.flatMap((r) => ALERT_AREAS[r] ?? []));
  return all.filter((a) => areas.has(a.area));
}

// ------------------------------------------------------------ buckets ----

export type Bucket = { a: number; b: number; label: string };
/** Hours for one day, days up to 46 days, weeks beyond: the steps of the dashboard charts. */
export function bucketsOf(from: Date, to: Date): Bucket[] {
  const span = to.getTime() - from.getTime();
  const step = span <= DAY + HOUR ? HOUR : span <= 46 * DAY ? DAY : 7 * DAY;
  const out: Bucket[] = [];
  for (let t = from.getTime(); t < to.getTime(); t += step) {
    const d = new Date(t + 5.75 * HOUR);
    const label = step === HOUR ? `${String(d.getUTCHours()).padStart(2, "0")}h` : `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
    out.push({ a: t, b: Math.min(t + step, to.getTime()), label });
  }
  return out;
}
