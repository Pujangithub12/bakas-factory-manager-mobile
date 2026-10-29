import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { api, OfflineError } from "./api";
import { kvGet, kvSet, useData } from "./store";
import { configureSync, startAutoSync, syncNow } from "./sync";
import { hasRole } from "./rules";
import { HOUR } from "./time";

export type Session = { person: { id: string; full_name: string }; token: string; roles: string[] };
type Known = { name: string; salt: string; hash: string; token: string; roles: string[] };
export type PersonOption = { id: string; full_name: string; role?: string | null; roles?: string[] };

const hashPin = (salt: string, pin: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
const knownKey = (id: string) => `known_${id}`;
const readKnown = async (id: string): Promise<Known | null> => {
  try {
    const v = await SecureStore.getItemAsync(knownKey(id));
    return v ? (JSON.parse(v) as Known) : null;
  } catch {
    return null;
  }
};

/** Names for the sign-in screen. Falls back to the last list when there is no signal. */
export async function loadPeople(): Promise<{ people: PersonOption[]; offline: boolean }> {
  try {
    const people = await api<PersonOption[]>("/auth/people", { timeoutMs: 8000 });
    await kvSet("people", JSON.stringify(people));
    return { people, offline: false };
  } catch (e) {
    if (!(e instanceof OfflineError)) throw e;
    return { people: JSON.parse((await kvGet("people")) ?? "[]"), offline: true };
  }
}

/** Is this a new install with no Owner yet? Null when there is no signal to ask. */
export async function loadStatus(): Promise<{ setup_needed: boolean; pin_length: number } | null> {
  try {
    return await api<{ setup_needed: boolean; pin_length: number }>("/auth/status", { timeoutMs: 8000 });
  } catch (e) {
    if (!(e instanceof OfflineError)) throw e;
    return null;
  }
}

export type RoleCount = { role: string; count: number };
/** The roles for the sign-in page. Falls back to the last list when there is no signal. */
export async function loadRoles(): Promise<{ roles: RoleCount[]; offline: boolean }> {
  try {
    const r = await api<{ roles: RoleCount[] }>("/auth/roles", { timeoutMs: 8000 });
    await kvSet("roles", JSON.stringify(r.roles));
    return { roles: r.roles, offline: false };
  } catch (e) {
    if (!(e instanceof OfflineError)) throw e;
    return { roles: JSON.parse((await kvGet("roles")) ?? "[]"), offline: true };
  }
}

type KnownEntry = { id: string; name: string; roles: string[] };
const readIndex = async (): Promise<KnownEntry[]> => JSON.parse((await kvGet("known_index")) ?? "[]");
/** Has someone with this role signed in on this phone before (so offline sign-in can work)? */
export async function roleKnownOnDevice(role: string) {
  return (await readIndex()).some((k) => k.roles.includes(role));
}

export async function isKnownOnDevice(id: string) {
  return !!(await readKnown(id));
}

type Ctx = {
  session: Session | null;
  roles: string[];
  signIn: (person: PersonOption, pin: string) => Promise<void>;
  /** Sign in as a role with a PIN: the person is the one holding that role whose PIN it is. */
  signInRole: (role: string, pin: string) => Promise<void>;
  /** First run: create the one Owner and sign in. */
  setupOwner: (fullName: string, pin: string) => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const D = useData();

  useEffect(() => {
    // Nobody is signed in when the app opens: the PIN is asked every time, so a phone that is lost or
    // handed to someone else never opens on the last person's screens. (Offline sign-in still works for
    // people who have signed in on this phone before: it checks the PIN against what is stored here.)
    (async () => {
      await kvSet("current_person", "");
      setReady(true);
    })();
  }, []);

  // What this person may do now: their roles from the latest sync, plus the supervisor
  // screens while they are in charge of the shift.
  const roles = useMemo(() => {
    if (!session) return [];
    const local = (D.person_role ?? []).filter((r) => r.person_id === session.person.id).map((r) => r.role as string);
    const r = local.length ? local : session.roles;
    const now = Date.now();
    const inCharge = (D.shift_in_charge ?? []).some((s) => s.person_id === session.person.id && now - new Date(s.shift_start).getTime() < 12 * HOUR && new Date(s.shift_start).getTime() <= now);
    return inCharge && !r.includes("Supervisor") ? [...r, "Supervisor"] : r;
  }, [session, D.person_role, D.shift_in_charge]);

  const rolesRef = useRef(roles);
  rolesRef.current = roles;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    configureSync(() => {
      const s = sessionRef.current;
      return s ? { token: s.token, days: hasRole(rolesRef.current, "Owner", "Manager") ? 30 : 3 } : null;
    });
    if (!session) return;
    return startAutoSync();
  }, [session?.person.id]);

  type Login = { token: string; person: Session["person"]; roles: string[] };
  /** Remember this sign-in (so the same person can sign in offline here later) and open the session. */
  const startSession = useCallback(async (r: Login, pin: string) => {
    const salt = Crypto.randomUUID();
    const k: Known = { name: r.person.full_name, salt, hash: await hashPin(salt, pin), token: r.token, roles: r.roles };
    await SecureStore.setItemAsync(knownKey(r.person.id), JSON.stringify(k));
    const index = (await readIndex()).filter((x) => x.id !== r.person.id);
    await kvSet("known_index", JSON.stringify([...index, { id: r.person.id, name: r.person.full_name, roles: r.roles }]));
    await kvSet("current_person", r.person.id);
    setSession({ person: r.person, token: r.token, roles: r.roles });
  }, []);

  const setupOwner = useCallback(async (fullName: string, pin: string) => {
    const r = await api<Login>("/auth/setup", { body: { full_name: fullName, pin } });
    await startSession(r, pin);
  }, [startSession]);

  const signInRole = useCallback(async (role: string, pin: string) => {
    try {
      const r = await api<Login>("/auth/login", { body: { role, pin } });
      await startSession(r, pin);
      return;
    } catch (e) {
      if (!(e instanceof OfflineError)) throw e;
    }
    // No signal: only people who signed in on this phone before can get in, checked against what is stored here.
    const candidates = (await readIndex()).filter((k) => k.roles.includes(role));
    if (candidates.length === 0) throw new Error("No signal. Sign in once with signal before using this phone offline.");
    for (const c of candidates) {
      const known = await readKnown(c.id);
      if (known && (await hashPin(known.salt, pin)) === known.hash) {
        await kvSet("current_person", c.id);
        setSession({ person: { id: c.id, full_name: known.name }, token: known.token, roles: known.roles });
        return;
      }
    }
    throw new Error("Wrong PIN");
  }, [startSession]);

  const signIn = useCallback(async (person: PersonOption, pin: string) => {
    const known = await readKnown(person.id);
    let s: Session;
    try {
      const r = await api<Login>("/auth/login", { body: { person_id: person.id, pin } });
      await startSession(r, pin);
      return;
    } catch (e) {
      if (!(e instanceof OfflineError)) throw e;
      // No signal: allowed only if this person has signed in on this phone before.
      if (!known) throw new Error("No signal. Sign in once with signal before using this phone offline.");
      if ((await hashPin(known.salt, pin)) !== known.hash) throw new Error("Wrong PIN");
      s = { person: { id: person.id, full_name: known.name }, token: known.token, roles: known.roles };
    }
    await kvSet("current_person", person.id);
    setSession(s);
  }, [startSession]);

  const signOut = useCallback(async () => {
    await kvSet("current_person", "");
    setSession(null);
  }, []);

  if (!ready) return null;
  return <AuthCtx.Provider value={{ session, roles, signIn, signInRole, setupOwner, signOut }}>{children}</AuthCtx.Provider>;
}

export { syncNow };
