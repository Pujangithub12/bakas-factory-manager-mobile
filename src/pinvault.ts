import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

/**
 * The PIN is checked by the server (bcrypt). This file is only for signing in with no signal: the phone keeps a
 * salted, repeated SHA-256 of the PIN, in the device's secure storage (iOS Keychain / Android Keystore) and nowhere
 * else, and refuses after repeated wrong tries.
 *
 * It is not bcrypt on purpose. bcrypt in JavaScript takes several seconds on a phone and freezes the screen, right
 * after the PIN is entered. Each round here is one native SHA-256 call that is awaited, so the screen keeps drawing.
 * A 6-digit PIN cannot stand up to a determined offline attack whatever the hash; what protects it is the secure
 * storage (this device only) and the lockout below.
 */

/** Only this device, and only while it is unlocked. Not copied by backups or moved to a new phone. */
export const SECURE: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

const ROUNDS = 1000;
const sha = (s: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);
async function derive(pin: string, salt: string, rounds: number) {
  let h = await sha(`${salt}:${pin}`);
  for (let i = 0; i < rounds; i++) h = await sha(`${h}:${salt}:${pin}`);
  return h;
}

/** "v2$rounds$salt$hash" */
export async function hashPin(pin: string): Promise<string> {
  const salt = Crypto.randomUUID();
  return `v2$${ROUNDS}$${salt}$${await derive(pin, salt, ROUNDS)}`;
}
export async function checkPin(pin: string, stored: string): Promise<boolean> {
  const [v, rounds, salt, hash] = stored.split("$");
  // An entry from the earlier bcrypt build cannot be checked here. Signing in once with signal saves a new one.
  if (v !== "v2" || !rounds || !salt || !hash) throw new Error("Sign in once with signal to update this phone.");
  const got = await derive(pin, salt, Number(rounds));
  let diff = got.length ^ hash.length;
  for (let i = 0; i < got.length && i < hash.length; i++) diff |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

// Wrong tries with no signal: 5, then locked for 15 minutes. Kept in secure storage so closing the app does not reset it.
const MAX_TRIES = 5;
const LOCK_MS = 15 * 60_000;
type Tries = { n: number; until: number };
const triesKey = (who: string) => `pin_tries_${who}`;
const readTries = async (who: string): Promise<Tries> => {
  try {
    const v = await SecureStore.getItemAsync(triesKey(who), SECURE);
    return v ? (JSON.parse(v) as Tries) : { n: 0, until: 0 };
  } catch {
    return { n: 0, until: 0 };
  }
};

/** Throws while this person (or role) is locked out. */
export async function assertNotLocked(who: string) {
  const t = await readTries(who);
  if (t.until > Date.now()) throw new Error(`Too many wrong tries. Wait ${Math.ceil((t.until - Date.now()) / 60_000)} minutes, or sign in with signal.`);
}
export async function pinFailed(who: string) {
  const t = await readTries(who);
  const n = (t.until && t.until <= Date.now() ? 0 : t.n) + 1;
  await SecureStore.setItemAsync(triesKey(who), JSON.stringify({ n, until: n >= MAX_TRIES ? Date.now() + LOCK_MS : 0 }), SECURE).catch(() => {});
}
export const pinOk = (who: string) => SecureStore.deleteItemAsync(triesKey(who), SECURE).catch(() => {});
