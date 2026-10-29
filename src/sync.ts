import NetInfo from "@react-native-community/netinfo";
import { useSyncExternalStore } from "react";
import { api, ApiError, OfflineError } from "./api";
import { applyPull, finishOps, kvGet, kvSet, pendingOps, setOnWrite, type Op } from "./store";
import type { Row } from "./time";

export type SyncState = {
  syncing: boolean;
  online: boolean;
  lastOk: string | null;
  error: string | null;
  needsSignIn: boolean;
  challan: { last: number | null; prefix: string | null };
};

let state: SyncState = { syncing: false, online: true, lastOk: null, error: null, needsSignIn: false, challan: { last: null, prefix: null } };
const subs = new Set<() => void>();
const set = (patch: Partial<SyncState>) => { state = { ...state, ...patch }; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useSyncState = () => useSyncExternalStore(subscribe, () => state);

type Provider = () => { token: string; days: number } | null;
let provider: Provider = () => null;
export const configureSync = (p: Provider) => { provider = p; };
export const clearNeedsSignIn = () => set({ needsSignIn: false });

export async function loadSyncMemory() {
  set({
    lastOk: await kvGet("last_sync"),
    challan: JSON.parse((await kvGet("challan")) ?? '{"last":null,"prefix":null}'),
  });
}

let running = false;
let extraDays = 0;

/** A screen needs more history than usual (the dashboard asking for "This year"). Fetches it once. */
export function requestDays(n: number) {
  if (n <= extraDays) return;
  extraDays = n;
  syncNow();
}

/** Send what is waiting, then fetch the latest. Safe to call any time; does nothing offline. */
export async function syncNow(): Promise<void> {
  const session = provider();
  if (running || !session) return;
  running = true;
  set({ syncing: true });
  try {
    for (;;) {
      const ops = await pendingOps(100);
      if (!ops.length) break;
      const res = await api<{ results: { ok: boolean; error?: string }[] }>("/sync/push", {
        body: { ops: ops.map((o) => ({ table: o.table, op: o.op, data: o.data })) },
        token: session.token,
      });
      const done: Op[] = [];
      const rejected: { op: Op; error: string }[] = [];
      ops.forEach((o, i) => (res.results[i]?.ok ? done.push(o) : rejected.push({ op: o, error: res.results[i]?.error ?? "Rejected" })));
      await finishOps(done, rejected);
    }
    const pull = await api<{ tables: Record<string, Row[]>; challan: SyncState["challan"] }>(`/sync/pull?days=${Math.max(session.days, extraDays)}`, { token: session.token });
    await applyPull(pull.tables);
    const at = new Date().toISOString();
    await kvSet("last_sync", at);
    await kvSet("challan", JSON.stringify(pull.challan));
    set({ lastOk: at, error: null, needsSignIn: false, challan: pull.challan });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) set({ needsSignIn: true, error: "Sign in again to send your entries" });
    else if (e instanceof OfflineError) set({ error: "No connection. Entries are saved on this phone." });
    else set({ error: e instanceof Error ? e.message : "Sync failed" });
  } finally {
    running = false;
    set({ syncing: false });
  }
}

/** Sync when signal returns, after each change, and once a minute. Returns a stop function. */
export function startAutoSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  setOnWrite(() => {
    clearTimeout(timer);
    timer = setTimeout(syncNow, 1500);
  });
  const unsub = NetInfo.addEventListener((s) => {
    const online = !!s.isConnected && s.isInternetReachable !== false;
    set({ online });
    if (online) syncNow();
  });
  const every = setInterval(syncNow, 60_000);
  syncNow();
  return () => {
    unsub();
    clearInterval(every);
    clearTimeout(timer);
    setOnWrite(() => {});
  };
}
