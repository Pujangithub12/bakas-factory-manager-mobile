// Local, offline-first store. Every table lives in memory and in SQLite on the phone.
// Each change is also queued in the outbox and sent to the server when there is signal.
import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";
import { useSyncExternalStore } from "react";
import meta from "./meta.json";
import type { Row } from "./time";
import { planPull } from "./pulldiff";

type Meta = Record<string, { pk: string[]; cols: Record<string, { type: string; opt: boolean }> }>;
const M = meta as unknown as Meta;
export const TABLE_NAMES = Object.keys(M);

export type Op = { seq: number; table: string; op: "upsert" | "delete"; data: Row };
export type Rejected = { id: number; table: string; op: string; data: Row; error: string; at: string };
export type Data = Record<string, Row[]>;

let db: SQLite.SQLiteDatabase;
const mem = new Map<string, Map<string, Row>>();
const snaps: Record<string, Row[]> = {};
let dataSnap: Data = {};
let counts = { pending: 0, rejected: 0 };
const subs = new Set<() => void>();
let onWrite: (() => void) | null = null;
let persistChain: Promise<unknown> = Promise.resolve();
/** Rows changed on this phone whose outbox entry is not written yet. */
const inflight = new Map<string, number>();

export const newId = () => Crypto.randomUUID();
export const setOnWrite = (fn: () => void) => { onWrite = fn; };
/** Told which tables were just saved (used to note where the phone was). */
let onSave: ((tables: string[]) => void) | null = null;
export const setOnSave = (fn: (tables: string[]) => void) => { onSave = fn; };

const keyOf = (table: string, row: Row) => M[table].pk.map((c) => String(row[c])).join("|");

function touch(tables: string[]) {
  for (const t of tables) snaps[t] = [...(mem.get(t)?.values() ?? [])];
  dataSnap = { ...dataSnap, ...Object.fromEntries(tables.map((t) => [t, snaps[t]])) };
  subs.forEach((f) => f());
}

const persist = <T,>(fn: () => Promise<T>) => (persistChain = persistChain.then(fn, fn)) as Promise<T>;

async function refreshCounts() {
  const p = await db.getFirstAsync<{ n: number }>("SELECT count(*) AS n FROM outbox");
  const r = await db.getFirstAsync<{ n: number }>("SELECT count(*) AS n FROM rejected");
  counts = { pending: p?.n ?? 0, rejected: r?.n ?? 0 };
  subs.forEach((f) => f());
}

export async function initStore() {
  db = await SQLite.openDatabaseAsync("bakas.db");
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS docs (t TEXT NOT NULL, k TEXT NOT NULL, j TEXT NOT NULL, PRIMARY KEY (t, k));
    CREATE TABLE IF NOT EXISTS outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT NOT NULL, op TEXT NOT NULL, j TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rejected (id INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT, op TEXT, j TEXT, err TEXT, at TEXT);
    CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
  `);
  for (const t of TABLE_NAMES) mem.set(t, new Map());
  const all = await db.getAllAsync<{ t: string; k: string; j: string }>("SELECT t, k, j FROM docs");
  for (const d of all) mem.get(d.t)?.set(d.k, JSON.parse(d.j));
  touch(TABLE_NAMES);
  await refreshCounts();
}

// ---- reading ----
export const rows = (table: string): Row[] => snaps[table] ?? [];
export const getRow = (table: string, key: string) => mem.get(table)?.get(key);

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useRows = (table: string) => useSyncExternalStore(subscribe, () => snaps[table] ?? EMPTY);
/** Every table at once. Changes identity only when some table changes. */
export const useData = () => useSyncExternalStore(subscribe, () => dataSnap);
export const useOutboxCounts = () => useSyncExternalStore(subscribe, () => counts);
const EMPTY: Row[] = [];

// ---- writing (works without signal) ----
export type Write = { table: string; row: Row; op?: "upsert" | "delete" };

/** Save one or more rows together and queue them for the server. */
export async function save(...writes: Write[]): Promise<void> {
  const touched = new Set<string>();
  const marks = writes.map((w) => `${w.table}#${keyOf(w.table, w.row)}`);
  for (const m of marks) inflight.set(m, (inflight.get(m) ?? 0) + 1);
  for (const w of writes) {
    const k = keyOf(w.table, w.row);
    const tbl = mem.get(w.table)!;
    if (w.op === "delete") tbl.delete(k);
    else tbl.set(k, { ...tbl.get(k), ...w.row });
    touched.add(w.table);
  }
  touch([...touched]);
  await persist(async () => {
    await db.withTransactionAsync(async () => {
      for (const w of writes) {
        const k = keyOf(w.table, w.row);
        if (w.op === "delete") await db.runAsync("DELETE FROM docs WHERE t = ? AND k = ?", w.table, k);
        else await db.runAsync("INSERT OR REPLACE INTO docs (t, k, j) VALUES (?, ?, ?)", w.table, k, JSON.stringify(mem.get(w.table)!.get(k)));
        const sent = w.op === "delete" ? w.row : mem.get(w.table)!.get(k);
        await db.runAsync("INSERT INTO outbox (t, op, j) VALUES (?, ?, ?)", w.table, w.op ?? "upsert", JSON.stringify(sent));
      }
    });
    await refreshCounts();
  }).finally(() => {
    for (const m of marks) {
      const n = (inflight.get(m) ?? 1) - 1;
      if (n <= 0) inflight.delete(m);
      else inflight.set(m, n);
    }
  });
  onWrite?.();
  try { onSave?.(writes.map((w) => w.table)); } catch { /* never stops a save */ }
}

// ---- outbox (used by sync) ----
export async function pendingOps(limit = 100): Promise<Op[]> {
  const r = await db.getAllAsync<{ seq: number; t: string; op: string; j: string }>("SELECT seq, t, op, j FROM outbox ORDER BY seq LIMIT ?", limit);
  return r.map((x) => ({ seq: x.seq, table: x.t, op: x.op as Op["op"], data: JSON.parse(x.j) }));
}

/** Remove sent ops. Rejected ones are kept in a list so the person can see why. */
export async function finishOps(done: Op[], rejected: { op: Op; error: string }[]) {
  await persist(async () => {
    await db.withTransactionAsync(async () => {
      for (const r of rejected) {
        await db.runAsync("INSERT INTO rejected (t, op, j, err, at) VALUES (?, ?, ?, ?, ?)", r.op.table, r.op.op, JSON.stringify(r.op.data), r.error, new Date().toISOString());
      }
      for (const o of [...done, ...rejected.map((r) => r.op)]) await db.runAsync("DELETE FROM outbox WHERE seq = ?", o.seq);
    });
    await refreshCounts();
  });
}

export async function rejectedList(): Promise<Rejected[]> {
  const r = await db.getAllAsync<{ id: number; t: string; op: string; j: string; err: string; at: string }>("SELECT * FROM rejected ORDER BY id DESC");
  return r.map((x) => ({ id: x.id, table: x.t, op: x.op, data: JSON.parse(x.j), error: x.err, at: x.at }));
}
export async function clearRejected() {
  await persist(async () => { await db.runAsync("DELETE FROM rejected"); await refreshCounts(); });
}

/** Bring the local tables in line with what the server sent. Only rows that are new, changed or gone are written, and only
 *  the tables that changed tell the screens. Rows still waiting to be sent are kept as they are on this phone. */
export async function applyPull(tables: Record<string, Row[]>) {
  const touched: string[] = [];
  try {
    await persist(async () => {
      const waiting = await db.getAllAsync<{ t: string; j: string }>("SELECT t, j FROM outbox");
      // From here to the writes nothing waits, so no entry made on this phone can slip in between working out the changes and making them.
      const dirty = new Set([...waiting.map((w) => `${w.t}#${keyOf(w.t, JSON.parse(w.j))}`), ...inflight.keys()]);
      const writes: { t: string; put: [string, Row][]; del: string[] }[] = [];
      for (const [t, list] of Object.entries(tables)) {
        if (!M[t]) continue;
        const cur = mem.get(t)!;
        const { put, del } = planPull(cur, list, (r) => keyOf(t, r), (k) => dirty.has(`${t}#${k}`));
        if (!put.length && !del.length) continue;
        for (const [k, r] of put) cur.set(k, r);
        for (const k of del) cur.delete(k);
        writes.push({ t, put, del });
        touched.push(t);
      }
      if (!writes.length) return;
      await db.withTransactionAsync(async () => {
        for (const w of writes) {
          for (const k of w.del) await db.runAsync("DELETE FROM docs WHERE t = ? AND k = ?", w.t, k);
          for (const [k, r] of w.put) await db.runAsync("INSERT OR REPLACE INTO docs (t, k, j) VALUES (?, ?, ?)", w.t, k, JSON.stringify(r));
        }
      });
    });
  } finally {
    if (touched.length) touch(touched);
  }
}

// ---- small key/value (settings, last sync) ----
export async function kvGet(k: string): Promise<string | null> {
  return (await db.getFirstAsync<{ v: string }>("SELECT v FROM kv WHERE k = ?", k))?.v ?? null;
}
export async function kvSet(k: string, v: string) {
  await db.runAsync("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)", k, v);
}
