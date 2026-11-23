// Works out what a pull from the server changes on the phone, so only those rows are written. Pure: no storage, easy to test.
import type { Row } from "./time";

/** The same row written with its keys in any order gives the same text. */
const sorted = (_k: string, v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((x) => [x, (v as Row)[x]])) : v;
export const sameRow = (a: Row, b: Row) => a === b || JSON.stringify(a, sorted) === JSON.stringify(b, sorted);

export type PullPlan = { put: [string, Row][]; del: string[] };

/**
 * `cur` is the table on the phone, `list` what the server sent. `isDirty(key)` says a change on this phone has not reached the
 * server yet: that row stays as it is here (and a row deleted here is not brought back by the server's older copy).
 * Returns the rows to write and the keys to remove. Both empty means nothing changed.
 */
export function planPull(cur: Map<string, Row>, list: Row[], keyOf: (r: Row) => string, isDirty: (key: string) => boolean): PullPlan {
  const keep = new Map<string, Row>();
  for (const r of list) {
    const k = keyOf(r);
    if (isDirty(k) && !cur.has(k)) continue;
    keep.set(k, r);
  }
  for (const [k, r] of cur) if (isDirty(k)) keep.set(k, r);

  const put: [string, Row][] = [];
  for (const [k, r] of keep) {
    const old = cur.get(k);
    if (!old || !sameRow(old, r)) put.push([k, r]);
  }
  const del: string[] = [];
  for (const k of cur.keys()) if (!keep.has(k)) del.push(k);
  return { put, del };
}
