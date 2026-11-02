// The maintenance calendar forecast and the planning figures. Pure functions over the local tables, no screens.
// Written once here, copied to the laptop by web/scripts/copy-shared.cjs.
import type { Data } from "./store";
import {
  batchTickets, isDaily, lastDone, num, pelletKg, briquetteKg, pmState, sumNet, trucksIn, trucksOut, yardUsedPct,
  type PmState,
} from "./rules";
import { avgYield, briquetteId, pelletId, runHours, targetsOf } from "./money";
import { DAY, productionDayStart, type Row } from "./time";

const ms = (v: any) => new Date(v).getTime();
const NPT_MS = (5 * 60 + 45) * 60_000;

// ------------------------------------------------------------ formats ----

const nfIN = (n: number, d: number) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
/** Tons with the unit: "1,250 t". */
export const tn = (n: number | null | undefined, d = 1) => (n == null || isNaN(n) ? "—" : `${nfIN(n, d)} t`);
export const tnum = (n: number | null | undefined, d = 2) => (n == null || isNaN(n) ? "—" : nfIN(n, d));
export const intf = (n: number | null | undefined) => Math.round(n || 0).toLocaleString("en-IN");
export const pctf = (x: number | null | undefined) => (x == null || isNaN(x) ? "—" : `${Math.round(x * 100)}%`);
export const fmtH = (h: number) => `${nfIN(h, 1)} h`;

// ----------------------------------------------------- dates (Nepal) ----

/** Year, month (0-11), day and weekday (0 = Sunday) of an instant in Nepal time. */
export function nptDate(at: number) {
  const d = new Date(at + NPT_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay() };
}
/** The instant of 00:00 Nepal time on a calendar day (month and day may overflow). */
export const nptMidnight = (y: number, m: number, d: number) => Date.UTC(y, m, d) - NPT_MS;
const fmtNpt = (at: number, o: Intl.DateTimeFormatOptions) => new Date(at + NPT_MS).toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });
/** "Wed 28 Oct" */
export const fmtDay = (at: number) => fmtNpt(at, { weekday: "short", day: "numeric", month: "short" });
/** "Wednesday 28 October 2026" */
export const fmtDayLong = (at: number) => fmtNpt(at, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
/** "28 Oct" */
export const dayLab = (at: number) => fmtNpt(at, { day: "numeric", month: "short" });
/** A calendar-day key, e.g. "2026-10-28". */
export const dayKey = (at: number) => { const p = nptDate(at); return `${p.y}-${p.m + 1}-${p.d}`; };

export type CalMonth = { a: number; b: number; y: number; m: number; lead: number; days: number; label: string; isCur: boolean; today: number };
/** The month holding `at`: its start and end, blank cells before day 1 (weeks start on Sunday), days in it. */
export function calMonth(at: number, now = Date.now()): CalMonth {
  const p = nptDate(at);
  const n = nptDate(now);
  return {
    a: nptMidnight(p.y, p.m, 1), b: nptMidnight(p.y, p.m + 1, 1), y: p.y, m: p.m,
    lead: new Date(Date.UTC(p.y, p.m, 1)).getUTCDay(), days: new Date(Date.UTC(p.y, p.m + 1, 0)).getUTCDate(),
    label: new Date(Date.UTC(p.y, p.m, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
    isCur: n.y === p.y && n.m === p.m, today: n.d,
  };
}
/** The start of the month `k` months from the one holding `at`. */
export const addMonths = (at: number, k: number) => { const p = nptDate(at); return nptMidnight(p.y, p.m + k, 1); };

// ---------------------------------------------------- the forecast ----

/** Running hours a day of a machine over the last 7 production days. */
export function hrsPerDay(D: Data, machineId: string, now = Date.now()): number {
  const t0 = productionDayStart(new Date(now)).getTime();
  return runHours(D, machineId, t0 - 7 * DAY, t0) / 7;
}
/** Briquette tons a day over the last 7 production days. */
export function briPerDay(D: Data, now = Date.now()): number {
  const t0 = productionDayStart(new Date(now)).getTime();
  return briquetteKg(D, new Date(t0 - 7 * DAY), new Date(t0), undefined, new Date(now)) / 1000 / 7;
}
/** How fast a task's counter runs: briquette tons a day, or the machine's running hours a day. */
const pmRate = (D: Data, t: Row, now: number) => (t.counts === "tons" ? briPerDay(D, now) : hrsPerDay(D, t.machine_id, now));

/** Days between two due dates of a task: the hours interval at last week's pace, or the calendar interval, whichever is shorter. */
export function pmPeriodD(D: Data, t: Row, now = Date.now()): number {
  const h = num(t.every_hours);
  const r = h ? pmRate(D, t, now) : 0;
  return Math.min(h && r > 0 ? h / r : Infinity, num(t.every_days) || Infinity);
}
/** Tasks that come round every shift or every day (or more often than every 2 days): listed under the calendar, not on it. */
export const pmFreq = (D: Data, t: Row, now = Date.now()) => isDaily(t) || pmPeriodD(D, t, now) < 2;

/** When a task is next due (ms): the calendar date or the forecast from the hours left, whichever is first. Null if neither can be told. */
export function pmNextAt(D: Data, t: Row, now = Date.now(), s: PmState = pmState(D, t, now)): number | null {
  const c: number[] = [];
  if (num(t.every_days)) c.push((s.last ? ms(s.last.done_at) : now) + num(t.every_days) * DAY);
  if (num(t.every_hours)) {
    const r = pmRate(D, t, now);
    if (r > 0) c.push(now + ((num(t.every_hours) - (s.usedH ?? 0)) / r) * DAY);
  }
  return c.length ? Math.min(...c) : null;
}

export type PmEvent = { at: number; t: Row; k: "done" | "over" | "soon" | "plan"; by?: string };

/** What happens in [a, b): work done (from the records) and work due (forecast from the hour meters and the calendar). */
export function pmEvents(D: Data, a: number, b: number, match: (t: Row) => boolean = () => true, now = Date.now()): PmEvent[] {
  const ev: PmEvent[] = [];
  const byId = new Map(D.pm_task.map((t) => [t.id as string, t]));
  for (const l of D.pm_done) {
    const at = ms(l.done_at);
    if (at < a || at >= b || at > now) continue;
    const t = l.task_id ? byId.get(l.task_id) : undefined;
    if (!t || pmFreq(D, t, now) || !match(t)) continue;
    ev.push({ at, t, k: "done", by: l.by });
  }
  for (const t of D.pm_task) {
    if (pmFreq(D, t, now) || !match(t)) continue;
    const s = pmState(D, t, now);
    let at = pmNextAt(D, t, now, s);
    if (at == null) continue;
    const P = pmPeriodD(D, t, now) * DAY;
    let first = true;
    let n = 0;
    if (at < now) at = now;
    while (at < b && n < 80) {
      if (at >= a) ev.push({ at, t, k: first ? (s.st === "ok" || s.st === "new" ? "plan" : s.st) : "plan" });
      first = false;
      n++;
      if (!isFinite(P)) break;
      at += P;
    }
  }
  return ev.sort((x, y) => x.at - y.at);
}

/** Events grouped by Nepal calendar day, in order: for the agenda list. */
export function groupByDay(ev: PmEvent[]): { at: number; list: PmEvent[] }[] {
  const g = new Map<string, { at: number; list: PmEvent[] }>();
  for (const e of ev) {
    const k = dayKey(e.at);
    if (!g.has(k)) g.set(k, { at: e.at, list: [] });
    g.get(k)!.list.push(e);
  }
  return [...g.values()];
}

// ----------------------------------------------------------- planning ----

const tonsOf = (list: Row[]) => sumNet(list) / 1000;

/** Tons of raw material still in the feeding yards: what the open batches received less the share already used. */
export function yardLeft(D: Data, now = Date.now()): number {
  let left = 0;
  for (const b of D.yard_batch) {
    if (b.finished_at) continue;
    const raw = tonsOf(batchTickets(D, b.id).filter((t) => t.second_kg != null));
    const used = b.started_at ? yardUsedPct(D, b, new Date(now)) : null;
    left += raw * (1 - (used ?? 0) / 100);
  }
  return left;
}
/** Tons of raw material used a day: the last 7 production days of pellets and briquettes divided by the learned yield. */
export function dailyUse(D: Data, now = Date.now()): number {
  const t0 = productionDayStart(new Date(now)).getTime();
  const a = new Date(t0 - 7 * DAY);
  const b = new Date(t0);
  return (pelletKg(D, a, b) + briquetteKg(D, a, b, undefined, new Date(now))) / 1000 / 7 / avgYield(D, new Date(now));
}
/** Days the raw material in the yards lasts at the daily use; null when nothing is being used. */
export function coverDays(D: Data, now = Date.now()): number | null {
  const u = dailyUse(D, now);
  return u > 0 ? yardLeft(D, now) / u : null;
}
/** Tons to buy in the next 7 days: (daily target / yield) x 7 less what is in the yards. */
export function needToBuy(D: Data, now = Date.now()): number {
  const T = targetsOf(D);
  return Math.max(0, ((num(T.pellets_t) + num(T.briquettes_t)) / avgYield(D, new Date(now))) * 7 - yardLeft(D, now));
}

export type BuyRow = { material_id: string; share: number; tons: number; trucks: number };
/** The tons to buy split like the finished trucks of the last 30 days, and how many trucks of the usual size that is. */
export function buyMix(D: Data, need: number, now = Date.now()): BuyRow[] {
  const t0 = productionDayStart(new Date(now)).getTime();
  const mix = new Map<string, { t: number; n: number }>();
  let total = 0;
  for (const t of trucksIn(D, new Date(t0 - 29 * DAY), new Date(now))) {
    const kg = tonsOf([t]);
    const cur = mix.get(t.material_id) ?? { t: 0, n: 0 };
    cur.t += kg;
    cur.n++;
    mix.set(t.material_id, cur);
    total += kg;
  }
  return [...mix.entries()]
    .sort((a, b) => b[1].t - a[1].t)
    .map(([material_id, v]) => {
      const tons = total > 0 ? (need * v.t) / total : 0;
      return { material_id, share: total > 0 ? v.t / total : 0, tons, trucks: v.t > 0 ? Math.ceil(tons / (v.t / v.n)) : 0 };
    });
}

/** Tons made so far this month (from 06:00 on the 1st) and the days elapsed, for the target comparison. */
export function monthSoFar(D: Data, now = Date.now()) {
  const p = nptDate(now);
  const from = productionDayStart(new Date(nptMidnight(p.y, p.m, 1) + 12 * 3_600_000)).getTime();
  const days = Math.max(1, (now - from) / DAY);
  return {
    from, days,
    pellets_t: pelletKg(D, new Date(from), new Date(now)) / 1000,
    briquettes_t: briquetteKg(D, new Date(from), new Date(now), undefined, new Date(now)) / 1000,
  };
}

/** Tons of a finished product in the store now: the latest opening stock plus what was made less what was sold since. Null without an opening stock. */
export function finishedStock(D: Data, productId: string | undefined, now = Date.now()): { t: number; asOf: number } | null {
  if (!productId) return null;
  const open = D.opening_stock.filter((o) => o.product_id === productId).sort((a, b) => ms(b.as_of) - ms(a.as_of))[0];
  if (!open) return null;
  const asOf = ms(open.as_of);
  const a = new Date(asOf);
  const b = new Date(Math.max(now, asOf));
  const made = productId === pelletId(D) ? pelletKg(D, a, b) : productId === briquetteId(D) ? briquetteKg(D, a, b, undefined, new Date(now)) : 0;
  return { t: (num(open.kg) + made - sumNet(trucksOut(D, a, b, productId))) / 1000, asOf };
}
/** Tons sold a day over the last 7 production days. */
export function soldPerDay(D: Data, productId: string | undefined, now = Date.now()): number {
  const t0 = productionDayStart(new Date(now)).getTime();
  return tonsOf(trucksOut(D, new Date(t0 - 7 * DAY), new Date(now), productId)) / 7;
}

/** Plan tasks to look at in the next 7 days: overdue or due soon, or whose hours or days run out within the week. Fullest first. */
export function pmNext7(D: Data, now = Date.now()): { t: Row; s: PmState }[] {
  return D.pm_task
    .filter((t) => !isDaily(t))
    .map((t) => ({ t, s: pmState(D, t, now) }))
    .filter(({ t, s }) => {
      if (s.st === "over" || s.st === "soon") return true;
      if (s.st === "new") return false;
      const dh = t.counts === "tons" ? 0 : hrsPerDay(D, t.machine_id, now);
      return (num(t.every_hours) > 0 && t.counts !== "tons" && num(t.every_hours) - (s.usedH ?? 0) < dh * 7) || (num(t.every_days) > 0 && num(t.every_days) - (s.days ?? 0) < 7);
    })
    .sort((a, b) => b.s.f - a.s.f);
}

/** Done today? A daily check is done when it has a record since the production day began. */
export const doneToday = (D: Data, t: Row, now = Date.now()) => {
  const l = lastDone(D, t.id);
  return !!l && ms(l.done_at) >= productionDayStart(new Date(now)).getTime();
};
