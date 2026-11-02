// Phase 3: rupees. Pure functions over the local tables, for the Owner (and a Manager's own entries).
// Written once here, copied to the laptop by web/scripts/copy-shared.cjs.
import type { Data } from "./store";
import { briquetteKg, num, pelletKg, ticketNet, trucksIn, trucksOut, mainRole } from "./rules";
import { DAY, HOUR, type Row } from "./time";

const ms = (v: any) => new Date(v).getTime();
const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((n, x) => n + f(x), 0);
const day = (at: number) => new Date(at).toISOString().slice(0, 10);

// ------------------------------------------------------------ formats ----

export const rs = (n: number | null | undefined) => (n == null || isNaN(n) ? "-" : `${n < 0 ? "-" : ""}Rs ${Math.round(Math.abs(n)).toLocaleString("en-IN")}`);
export function rsK(n: number | null | undefined) {
  if (n == null || isNaN(n)) return "-";
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1e7) return `${s}Rs ${(a / 1e7).toFixed(2)} crore`;
  if (a >= 1e5) return `${s}Rs ${(a / 1e5).toFixed(2)} lakh`;
  return rs(n);
}
export const rkg = (n: number | null | undefined) => (n == null || isNaN(n) ? "-" : `Rs ${(Math.round(n * 100) / 100).toFixed(2)}`);
export const rs2 = (n: number) => `Rs ${(Math.round(n * 100) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ------------------------------------------------------------- prices ----

/** The latest row that has started by `at`. */
const latestBy = (rows: Row[], at: number) => rows.filter((r) => String(r.valid_from).slice(0, 10) <= day(at)).sort((a, b) => String(b.valid_from).localeCompare(String(a.valid_from)))[0];

/** What we pay per kg of raw material: the supplier's own rate, else the rate for all suppliers. */
export function priceRaw(D: Data, materialId: string, supplierId: string | null, at = Date.now()): number {
  const mine = D.raw_price.filter((r) => r.material_id === materialId);
  const own = latestBy(mine.filter((r) => supplierId && r.supplier_id === supplierId), at);
  return num((own ?? latestBy(mine.filter((r) => !r.supplier_id), at))?.rate_per_kg);
}
/** What a buyer pays per kg: their own rate, else the latest rate anyone pays for the product. */
export function priceSale(D: Data, productId: string, buyerId: string | null, at = Date.now()): number {
  const mine = D.sale_price.filter((r) => r.product_id === productId);
  const own = latestBy(mine.filter((r) => r.buyer_id === buyerId), at);
  return num((own ?? latestBy(mine, at))?.rate_per_kg);
}
export const settingOf = (D: Data, key: string): any => D.setting.find((s) => s.key === key)?.value;
export const moistStd = (D: Data, materialId: string) => num(D.moisture_standard.find((m) => m.material_id === materialId)?.standard_pct) || 45;
/** For each 1% over the standard, this % of the weight is not paid. */
export const dedPct = (D: Data) => (settingOf(D, "moisture_deduction") != null ? num(settingOf(D, "moisture_deduction")) : 1);
export const vatRate = (D: Data, productId: string) => num(D.product_vat.find((v) => v.product_id === productId)?.vat_pct);
export const wage = (D: Data, role: string) => num(D.daily_wage.find((w) => w.role === role)?.rupees) || 800;
export const tariffOf = (D: Data): Row | undefined => [...D.nea_tariff].sort((a, b) => String(b.valid_from).localeCompare(String(a.valid_from)))[0];
export const targetsOf = (D: Data) => ({ pellets_t: 30, briquettes_t: 20, kwh_per_t: 220, cover_days: 7, ...(settingOf(D, "targets") ?? {}) }) as { pellets_t: number; briquettes_t: number; kwh_per_t: number; cover_days: number };

export const pelletId = (D: Data) => D.material.find((m) => m.kind !== "Raw" && m.bag_kg != null)?.id as string | undefined;
export const briquetteId = (D: Data) => D.material.find((m) => m.kind !== "Raw" && /briquette/i.test(m.name) && !/dust/i.test(m.name))?.id as string | undefined;

// ---------------------------------------------------- trucks and bills ----

export const tMoist = (t: Row): number | null => {
  const v = [t.moisture_1, t.moisture_2, t.moisture_3].filter((x) => x != null && x !== "").map(Number);
  return v.length ? sum(v, (x) => x) / v.length : null;
};
export const labOf = (D: Data, ticketId: string) => D.lab_test.find((l) => l.ticket_id === ticketId);
export const billOf = (D: Data, ticketId: string) => D.sales_bill.find((b) => b.ticket_id === ticketId);
/** The moisture the supplier is paid on: the lab result when there is one, else the pins. */
export const moistPay = (D: Data, t: Row): number | null => {
  const l = t.direction === "in" ? labOf(D, t.id) : undefined;
  return l?.moisture_pct != null ? num(l.moisture_pct) : tMoist(t);
};

/** Net kg after the moisture deduction: for each 1% over the standard, 1% (setting) of the weight is not paid. */
export function payKg(D: Data, t: Row): number {
  const kg = ticketNet(t) ?? 0;
  const m = moistPay(D, t);
  if (m == null) return kg;
  return kg * Math.max(0, 1 - (Math.max(0, m - moistStd(D, t.material_id)) * dedPct(D)) / 100);
}
export const rawAmt = (D: Data, t: Row) => payKg(D, t) * priceRaw(D, t.material_id, t.supplier_id, ms(t.first_at));
export const saleRate = (D: Data, t: Row) => { const b = billOf(D, t.id); return b?.rate != null ? num(b.rate) : priceSale(D, t.material_id, t.buyer_id, ms(t.first_at)); };
export const saleAmt = (D: Data, t: Row) => (ticketNet(t) ?? 0) * saleRate(D, t);
export const vatPctOf = (D: Data, t: Row) => { const b = billOf(D, t.id); return b?.vat_pct != null ? num(b.vat_pct) : vatRate(D, t.material_id); };
export const vatOf = (D: Data, t: Row) => (saleAmt(D, t) * vatPctOf(D, t)) / 100;

// -------------------------------------------------------- electricity ----

const NPT_MS = (5 * 60 + 45) * 60_000;
/** NEA time-of-day band of an instant: peak 17-23, off-peak 23-05 (normal rate in the dry months), normal 05-17. */
export function todBand(at: number, T: { peak: number; off: number; normal: number }) {
  const d = new Date(at + NPT_MS), h = d.getUTCHours(), mo = d.getUTCMonth(), dd = d.getUTCDate();
  const three = (mo > 3 || (mo === 3 && dd >= 14)) && (mo < 11 || (mo === 11 && dd < 16));
  if (h >= 17 && h < 23) return { b: "T1" as const, r: T.peak };
  if (h >= 23 || h < 5) return { b: "T2" as const, r: three ? T.off : T.normal };
  return { b: "T3" as const, r: T.normal };
}
export const BANDS: [string, string][] = [["T1", "Peak, 17:00-23:00"], ["T2", "Off-peak, 23:00-05:00"], ["T3", "Normal, 05:00-17:00"]];

export const lastPower = (D: Data) => [...D.power_reading].sort((a, b) => ms(b.at) - ms(a.at))[0];
/** kWh used between consecutive readings less than 6 hours apart. */
export function powerSeg(D: Data) {
  const r = [...D.power_reading].sort((a, b) => ms(a.at) - ms(b.at));
  const out: { a: number; b: number; kwh: number }[] = [];
  for (let i = 1; i < r.length; i++) {
    const k = num(r[i].kwh_meter) - num(r[i - 1].kwh_meter);
    if (k >= 0 && ms(r[i].at) - ms(r[i - 1].at) < 6 * HOUR) out.push({ a: ms(r[i - 1].at), b: ms(r[i].at), kwh: k });
  }
  return out;
}
export type Power = { kwh: number; T1: number; T2: number; T3: number; energy: number; demand: number; cost: number };
export function powerIn(D: Data, a: number, b: number): Power {
  const t = tariffOf(D);
  const T = { peak: num(t?.peak_rate), off: num(t?.offpeak_rate), normal: num(t?.normal_rate) };
  const R: Power = { kwh: 0, T1: 0, T2: 0, T3: 0, energy: 0, demand: 0, cost: 0 };
  for (const s of powerSeg(D)) {
    const o = Math.min(b, s.b) - Math.max(a, s.a);
    if (o <= 0) continue;
    const k = (s.kwh * o) / (s.b - s.a);
    const bd = todBand((Math.max(s.a, a) + Math.min(s.b, b)) / 2, T);
    R.kwh += k; R[bd.b] += k; R.energy += k * bd.r;
  }
  R.demand = (num(t?.demand_per_kva) * num(t?.billed_kva) * (Math.min(b, Date.now()) - a)) / DAY / 30;
  R.cost = R.energy + R.demand;
  return R;
}

// --------------------------------------------------------------- costs ----

const overlap = (s: number, e: number, a: number, b: number) => Math.max(0, Math.min(e, b) - Math.max(s, a));
export const runHours = (D: Data, machineId: string, a: number, b: number) =>
  sum(D.machine_run.filter((r) => r.machine_id === machineId), (r) => overlap(ms(r.started_at), r.stopped_at ? ms(r.stopped_at) : Date.now(), a, b)) / HOUR;

export function labourIn(D: Data, a: number, b: number) {
  let c = 0;
  for (const x of D.attendance) {
    const t = ms(x.gate_in);
    if (t < a || t >= b) continue;
    const role = mainRole(D, x.person_id);
    if (role && role !== "Owner") c += wage(D, role);
  }
  return c;
}
export const sparesIn = (D: Data, a: number, b: number) =>
  sum(D.store_movement.filter((m) => m.type === "issue" && ms(m.at) >= a && ms(m.at) < b), (m) => {
    const it = D.store_item.find((i) => i.id === m.item_id);
    return it && it.kind !== "Tool" ? num(m.qty) * num(it.rate) : 0;
  });
export const dieselL = (D: Data, a: number, b: number) => sum(D.diesel_fill.filter((f) => ms(f.at) >= a && ms(f.at) < b), (f) => num(f.litres));

/** Output per kg of raw material, learned from the last 30 days; 50% until there is something to learn from. */
export function avgYield(D: Data, now = new Date()): number {
  const from = new Date(now.getTime() - 30 * DAY);
  const raw = sum(trucksIn(D, from, now), (t) => ticketNet(t) ?? 0);
  const made = pelletKg(D, from, now) + briquetteKg(D, from, now, undefined, now);
  return raw > 0 && made > 0 ? Math.min(0.9, Math.max(0.2, made / raw)) : 0.5;
}
/** Raw material price per wet kg: what was paid for the trucks of the 30 days before `b`. */
export function rawPx(D: Data, b: number): number {
  const l = trucksIn(D, new Date(b - 30 * DAY), new Date(b));
  const kg = sum(l, (t) => ticketNet(t) ?? 0);
  return kg > 0 ? sum(l, (t) => rawAmt(D, t)) / kg : 6;
}

export type Money = {
  raw: Row[]; sold: Row[]; rev: number; rawC: number; ded: number; elec: number; kwh: number; pw: Power; dsl: number; dslC: number; lab: number; spares: number;
  pel: number; bri: number; yield: number; rawUseT: number; px: number; rawUse: number; cost: number; cpel: number | null; cbri: number | null; cogs: number; margin: number;
};

export function moneyIn(D: Data, a: number, b: number): Money {
  const from = new Date(a), to = new Date(b), now = new Date();
  const raw = trucksIn(D, from, to), sold = trucksOut(D, from, to);
  const pw = powerIn(D, a, b), dsl = dieselL(D, a, b);
  const pel = pelletKg(D, from, to) / 1000, bri = briquetteKg(D, from, to, undefined, now) / 1000;
  const M = {
    raw, sold, rev: sum(sold, (t) => saleAmt(D, t)), rawC: sum(raw, (t) => rawAmt(D, t)), ded: sum(raw, (t) => (ticketNet(t) ?? 0) - payKg(D, t)),
    elec: pw.cost, kwh: pw.kwh, pw, dsl, dslC: dsl * num(settingOf(D, "diesel_rate")), lab: labourIn(D, a, b), spares: sparesIn(D, a, b), pel, bri,
  } as Money;
  // Production cost uses the raw material that went into what was made (made / yield x price), not what was bought in the period.
  M.yield = avgYield(D, now);
  M.rawUseT = (pel + bri) / (M.yield || 0.5);
  M.px = rawPx(D, b);
  M.rawUse = M.rawUseT * 1000 * M.px;
  M.cost = M.rawUse + M.elec + M.dslC + M.lab + M.spares;
  // Electricity follows the machines (pellet line, briquette machine, shared front end); the rest is shared by tons made.
  const kw: Record<string, number> = {};
  for (const m of D.machine) kw[m.id] = num(m.motor_kw) * runHours(D, m.id, a, b);
  const tagOf = (id: string) => D.machine.find((m) => m.id === id)?.stage as string;
  const pelOnly = sum(Object.keys(kw).filter((id) => tagOf(id) === "mill" || tagOf(id) === "pellet"), (id) => kw[id]);
  const briOnly = sum(Object.keys(kw).filter((id) => tagOf(id) === "briquette"), (id) => kw[id]);
  const shared = sum(Object.keys(kw).filter((id) => !["mill", "pellet", "briquette"].includes(tagOf(id))), (id) => kw[id]);
  const tot = pelOnly + briOnly + shared || 1;
  const T = pel + bri || 1, fp = pel / T, fb = bri / T, other = M.rawUse + M.dslC + M.lab + M.spares;
  M.cpel = pel > 0 ? (M.elec * (pelOnly + shared * fp) / tot + other * fp) / (pel * 1000) : null;
  M.cbri = bri > 0 ? (M.elec * (briOnly + shared * fb) / tot + other * fb) / (bri * 1000) : null;
  const soldKg = (id?: string) => sum(sold.filter((t) => t.material_id === id), (t) => ticketNet(t) ?? 0);
  M.cogs = soldKg(pelletId(D)) * (M.cpel ?? 0) + soldKg(briquetteId(D)) * (M.cbri ?? 0);
  M.margin = M.rev - M.cogs;
  return M;
}

/** Average selling rate of a product in a period; the listed price when nothing was sold. */
export function avgRate(D: Data, productId: string | undefined, a: number, b: number): number {
  if (!productId) return 0;
  const s = trucksOut(D, new Date(a), new Date(b), productId);
  const kg = sum(s, (t) => ticketNet(t) ?? 0);
  return kg > 0 ? sum(s, (t) => saleAmt(D, t)) / kg : priceSale(D, productId, null);
}

// ------------------------------------------------------------ balances ----

export type Balance = { party: Row; amt: number; paid: number; n: number; unbilled: number; bal: number };
/** What we owe suppliers (dir "in") or buyers owe us (dir "out"), from the records held on this device. */
export function balances(D: Data, dir: "in" | "out"): Record<string, Balance> {
  const list = dir === "in" ? D.supplier : D.buyer;
  const out: Record<string, Balance> = {};
  for (const p of list) out[p.id] = { party: p, amt: 0, paid: 0, n: 0, unbilled: 0, bal: 0 };
  for (const t of D.weigh_ticket) {
    if (t.second_kg == null) continue;
    if (dir === "in" && t.direction === "in" && out[t.supplier_id]) { out[t.supplier_id].amt += rawAmt(D, t); out[t.supplier_id].n++; }
    if (dir === "out" && t.direction === "out" && out[t.buyer_id]) {
      const b = billOf(D, t.id);
      if (b) {
        const a = saleAmt(D, t) + vatOf(D, t);
        out[t.buyer_id].amt += a; out[t.buyer_id].n++;
        if (b.payment_mode === "Cash") out[t.buyer_id].paid += a; // a cash bill counts as paid
      } else out[t.buyer_id].unbilled++;
    }
  }
  for (const p of D.payment) {
    const id = dir === "in" ? (p.direction === "paid" ? p.supplier_id : null) : (p.direction === "received" ? p.buyer_id : null);
    if (id && out[id]) out[id].paid += num(p.amount);
  }
  for (const k in out) out[k].bal = out[k].amt - out[k].paid;
  return out;
}
