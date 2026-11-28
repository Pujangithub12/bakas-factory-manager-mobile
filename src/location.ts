// Where the phone was when its user did something: signing in, a gate check-in, starting a machine.
// Taken only at those moments, never in the background. Kept on the phone until it can be sent, then sent
// with the next sync. The server files each one under the signed-in person; only the Owner sees them, on the laptop.
import * as Location from "expo-location";
import { api } from "./api";
import { kvGet, kvSet, newId, setOnSave } from "./store";

type Ping = { id: string; person_id: string; at: string; action: string; lat: number | null; lng: number | null; accuracy_m: number | null; note: string | null };

const QUEUE = "loc_queue";
const MAX_QUEUE = 300;
const SAME_ACTION_GAP = 3 * 60_000; // the same action again within 3 minutes is not recorded twice

/** What a save on each table means, as shown on the laptop. Tables not listed are not recorded. */
const ACTION: Record<string, string> = {
  attendance: "Gate check-in / out",
  attendance_mark: "Attendance marked",
  person: "Worker registered",
  visitor: "Visitor entry",
  machine_run: "Machine start / stop",
  downtime: "Machine stopped / restarted",
  log_reading: "Machine reading",
  greasing_check: "Greasing check",
  bag_count: "Bag count",
  weigh_ticket: "Weighbridge entry",
  yard_batch: "Yard batch",
  vehicle_session: "Vehicle start / stop",
  diesel_fill: "Diesel fill",
  hour_meter_reading: "Hour meter reading",
  maintenance_job: "Maintenance job",
  pm_done: "Maintenance done",
  store_movement: "Store issue / return",
  purchase_request: "Purchase request",
  power_reading: "Power reading",
  lab_test: "Lab test",
};

let person: string | null = null;
const last = new Map<string, number>();

// One change to the queue at a time, so two quick actions do not overwrite each other.
let chain: Promise<unknown> = Promise.resolve();
const serial = <T>(f: () => Promise<T>) => { const p = chain.then(f, f); chain = p.catch(() => {}); return p; };
const readQueue = async (): Promise<Ping[]> => { try { return JSON.parse((await kvGet(QUEUE)) ?? "[]"); } catch { return []; } };

const timeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

async function reading(): Promise<Pick<Ping, "lat" | "lng" | "accuracy_m" | "note">> {
  const none = (note: string) => ({ lat: null, lng: null, accuracy_m: null, note });
  try {
    if (!(await Location.getForegroundPermissionsAsync()).granted) return none("Location permission off");
    if (!(await Location.hasServicesEnabledAsync())) return none("Location turned off on the phone");
    // A recent reading is instant; otherwise ask for a fresh one, waiting at most 20 seconds.
    const pos = (await Location.getLastKnownPositionAsync({ maxAge: 2 * 60_000, requiredAccuracy: 200 }))
      ?? (await timeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 20_000));
    if (!pos) return none("No location fix");
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy_m: pos.coords.accuracy ?? null, note: null };
  } catch {
    return none("No location fix");
  }
}

/** Notes where the phone is now for this action. Never holds up the screen and never fails. */
export function noteLocation(action: string) {
  const who = person;
  if (!who) return;
  const now = Date.now();
  if (now - (last.get(action) ?? 0) < SAME_ACTION_GAP) return;
  last.set(action, now);
  const at = new Date(now).toISOString();
  void (async () => {
    const r = await reading();
    await serial(async () => {
      const q = await readQueue();
      q.push({ id: newId(), person_id: who, at, action, ...r });
      await kvSet(QUEUE, JSON.stringify(q.slice(-MAX_QUEUE)));
    });
  })().catch(() => {});
}

/** Someone signed in (or out). Asks for location the first time, then notes the sign-in. */
export async function locationSignedIn(personId: string | null) {
  person = personId;
  last.clear();
  if (!personId) return;
  try {
    const p = await Location.getForegroundPermissionsAsync();
    if (!p.granted && p.canAskAgain) await Location.requestForegroundPermissionsAsync();
  } catch { /* noted as permission off */ }
  noteLocation("Sign in");
}

// Saving on the tables above notes the location too.
setOnSave((tables) => {
  for (const t of new Set(tables)) if (ACTION[t]) noteLocation(ACTION[t]);
});

/** Sends this person's waiting readings. Readings from someone else who used this phone wait for their own sign-in. */
export async function sendLocations(token: string, personId: string) {
  const q = await serial(readQueue);
  const mine = q.filter((p) => p.person_id === personId).slice(0, 200);
  if (!mine.length) return;
  await api("/location/batch", { body: { pings: mine.map(({ person_id: _p, ...rest }) => rest) }, token });
  const sent = new Set(mine.map((p) => p.id));
  const twoWeeks = Date.now() - 14 * 86_400_000;
  await serial(async () => {
    const now = await readQueue();
    await kvSet(QUEUE, JSON.stringify(now.filter((p) => !sent.has(p.id) && Date.parse(p.at) >= twoWeeks)));
  });
}
