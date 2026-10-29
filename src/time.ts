// Times are stored in UTC and shown in Nepal time (UTC+5:45). The device clock zone is not trusted.
export type Row = Record<string, any>;

const NPT_MS = (5 * 60 + 45) * 60_000;
const MIN = 60_000;
const HOUR = 3_600_000;
export const DAY = 86_400_000;
export { MIN, HOUR };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n: number) => String(n).padStart(2, "0");

/** A Date whose UTC fields read as Nepal wall-clock time. */
const npt = (d: Date) => new Date(d.getTime() + NPT_MS);

export const nowIso = () => new Date().toISOString();
export const toDate = (v: any): Date | null => (v ? new Date(v) : null);

export function fmtTime(v: any): string {
  const d = toDate(v);
  if (!d) return "-";
  const n = npt(d);
  return `${p2(n.getUTCHours())}:${p2(n.getUTCMinutes())}`;
}

export function fmtDateTime(v: any): string {
  const d = toDate(v);
  if (!d) return "-";
  const n = npt(d);
  return `${n.getUTCDate()} ${MONTHS[n.getUTCMonth()]} ${fmtTime(d)}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** 05:42 Wed 28 Oct */
export function fmtDayTime(v: any): string {
  const d = toDate(v);
  if (!d) return "-";
  const n = npt(d);
  return `${fmtTime(d)} ${WEEKDAYS[n.getUTCDay()]} ${n.getUTCDate()} ${MONTHS[n.getUTCMonth()]}`;
}

export function fmtDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / MIN));
  return `${Math.floor(m / 60)}h ${p2(m % 60)}m`;
}

/** Minutes since midnight of a `time` column (stored as 1970-01-01THH:MM:00Z). */
const todMinutes = (v: any) => {
  const d = new Date(v);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

export type ShiftWindow = { shift: Row; start: Date; end: Date };

/** The shift running at `at`, with its real start and end. */
export function shiftWindow(shifts: Row[], at = new Date()): ShiftWindow | null {
  const n = npt(at);
  const tod = n.getUTCHours() * 60 + n.getUTCMinutes();
  for (const shift of shifts) {
    const s = todMinutes(shift.starts);
    const e = todMinutes(shift.ends);
    const wraps = e <= s;
    const inside = wraps ? tod >= s || tod < e : tod >= s && tod < e;
    if (!inside) continue;
    const dayShift = wraps && tod < e ? -1 : 0;
    const start = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + dayShift, Math.floor(s / 60), s % 60) - NPT_MS);
    const len = (wraps ? e + 1440 - s : e - s) * MIN;
    return { shift, start, end: new Date(start.getTime() + len) };
  }
  return null;
}

export const nextShiftWindow = (shifts: Row[], w: ShiftWindow) => shiftWindow(shifts, new Date(w.end.getTime() + MIN));

/** The shift an arriving person belongs to: people come a little before the shift starts. */
export function shiftForArrival(shifts: Row[], at = new Date()): ShiftWindow | null {
  const cur = shiftWindow(shifts, at);
  if (!cur) return null;
  const next = nextShiftWindow(shifts, cur);
  return next && next.start.getTime() - at.getTime() <= HOUR ? next : cur;
}

/** The production day starts at 06:00 Nepal time. */
export function productionDayStart(at = new Date()): Date {
  const n = npt(at);
  const back = n.getUTCHours() < 6 ? 1 : 0;
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() - back, 6, 0) - NPT_MS);
}

export type PeriodKey = "today" | "yesterday" | "7d" | "30d";
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
];

export function periodRange(key: PeriodKey, at = new Date()): { from: Date; to: Date } {
  const start = productionDayStart(at);
  switch (key) {
    case "today": return { from: start, to: at };
    case "yesterday": return { from: new Date(start.getTime() - DAY), to: start };
    case "7d": return { from: new Date(start.getTime() - 6 * DAY), to: at };
    case "30d": return { from: new Date(start.getTime() - 29 * DAY), to: at };
  }
}

/** About 1 Shrawan (17 July): challan and bill numbers restart here. */
export function fiscalYearStart(at = new Date()): Date {
  const n = npt(at);
  let y = n.getUTCFullYear();
  const fy = (yy: number) => new Date(Date.UTC(yy, 6, 17) - NPT_MS);
  if (at < fy(y)) y -= 1;
  return fy(y);
}
