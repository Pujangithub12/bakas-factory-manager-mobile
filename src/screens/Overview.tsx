import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Btn, Card, C, F, Icon, Row, ScreenHeader, SectionTitle, Spacer, Sub, T, Text, initialsOf } from "../ui";
import { useAuth } from "../auth";
import { useData } from "../store";
import { requestDays } from "../sync";
import { LineChart, ColumnChart, SERIES_COLORS } from "../charts";
import {
  activeBatch, alertsFor, batchCode, batchMaterial, batchTickets, briquetteKg, bucketsOf, kgToTons, num, onSiteMap, openRuns, pelletKg, sumNet, ticketNet, trucksIn, trucksOut, yardUsedPct,
} from "../rules";
import { avgRate, briquetteId, dieselL, moneyIn, pelletId, powerIn, rkg, rsK, targetsOf } from "../money";
import { DAY, dayStartOf, fiscalYearStart, fmtTime, periodRange, shiftWindow, type PeriodKey } from "../time";

type Key = PeriodKey | "year" | "custom";
export const PERIODS: { key: Key; label: string; vs: string }[] = [
  { key: "today", label: "Today", vs: "vs yesterday by now" },
  { key: "yesterday", label: "Yesterday", vs: "vs the day before" },
  { key: "7d", label: "7 days", vs: "vs the 7 days before" },
  { key: "30d", label: "30 days", vs: "vs the 30 days before" },
  { key: "year", label: "This year", vs: "" },
  { key: "custom", label: "Pick dates", vs: "" },
];
// How many days of history each choice needs (the period and the one before it, for the comparison).
const NEED: Record<string, number> = { today: 3, yesterday: 4, "7d": 15, "30d": 62 };
const SHIFT_BACK: Record<string, number> = { today: 1, yesterday: 1, "7d": 7, "30d": 30 };

// The period and material are shared by the Overview, Machines and People tabs.
type Filter = { period: Key; materialId: string | null; fromText: string; toText: string };
let filter: Filter = { period: "today", materialId: null, fromText: "", toText: "" };
const subs = new Set<() => void>();
const setFilter = (f: Partial<Filter>) => { filter = { ...filter, ...f }; subs.forEach((s) => s()); };
export function useFilter() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  const range = useMemo(() => {
    if (filter.period === "year") return { from: fiscalYearStart(), to: new Date() };
    if (filter.period === "custom") {
      const a = /^\d{4}-\d{2}-\d{2}$/.test(filter.fromText) ? dayStartOf(filter.fromText) : periodRange("7d").from;
      const b = /^\d{4}-\d{2}-\d{2}$/.test(filter.toText) ? new Date(dayStartOf(filter.toText).getTime() + DAY) : new Date();
      return { from: a, to: b };
    }
    return periodRange(filter.period);
  }, [filter.period, filter.fromText, filter.toText]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...filter, ...range, setFilter };
}

/** Period chips, the material box and a line that says what is shown. */
export function FilterBar({ withMaterial = true }: { withMaterial?: boolean }) {
  const D = useData();
  const f = useFilter();
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    requestDays(f.period === "year" || f.period === "custom" ? Math.ceil((Date.now() - f.from.getTime()) / DAY) + 2 : NEED[f.period]);
  }, [f.period, f.from.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = PERIODS.find((p) => p.key === f.period)!.label;
  return (
    <>
      <View style={{ backgroundColor: C.greySoft, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 5 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
          {PERIODS.map((p) => (
            <Pressable key={p.key} onPress={() => setFilter({ period: p.key })} style={[{ paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14 }, f.period === p.key && { backgroundColor: "#fff", elevation: 2 }]}>
              <Text style={{ fontSize: 16, color: f.period === p.key ? C.ink : C.sub, fontWeight: f.period === p.key ? "700" : "600" }}>{p.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      {f.period === "custom" ? (
        <Row style={{ gap: 10 }}>
          <View style={{ flex: 1 }}><Sub>From (YYYY-MM-DD)</Sub><TextInput value={f.fromText} onChangeText={(v) => setFilter({ fromText: v })} placeholder="2026-10-01" style={box} /></View>
          <View style={{ flex: 1 }}><Sub>To (YYYY-MM-DD)</Sub><TextInput value={f.toText} onChangeText={(v) => setFilter({ toText: v })} placeholder="2026-10-31" style={box} /></View>
        </Row>
      ) : null}
      {withMaterial ? (
        <Row style={{ gap: 12 }}>
          <Text style={{ fontSize: 16, color: C.sub }}>Material</Text>
          <Pressable onPress={() => setPicking(true)} style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text style={{ flex: 1, fontSize: 17, color: C.ink }}>{D.material.find((m) => m.id === f.materialId)?.name ?? "All materials"}</Text>
            <Icon name="chevron-down" size={18} color={C.ink} />
          </Pressable>
        </Row>
      ) : null}
      <Sub>{label}{withMaterial && f.materialId ? ` · ${D.material.find((m) => m.id === f.materialId)?.name}` : ""}</Sub>

      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        <Pressable onPress={() => setPicking(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: C.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28, maxHeight: "70%" }}>
            <Text style={{ fontFamily: F.head, fontSize: 26, color: C.ink, marginBottom: 8 }}>Material</Text>
            <ScrollView>
              {[{ id: null as string | null, name: "All materials" }, ...D.material.map((m) => ({ id: m.id as string | null, name: m.name as string }))].map((o) => (
                <Pressable key={o.id ?? "all"} onPress={() => { setFilter({ materialId: o.id }); setPicking(false); }} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line }}>
                  <Text style={{ flex: 1, fontSize: 17, color: C.ink, fontWeight: o.id === f.materialId ? "700" : "400" }}>{o.name}</Text>
                  {o.id === f.materialId ? <Icon name="checkmark" size={20} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
const box = { backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: C.ink } as const;

/** Red when something needs action, otherwise amber for warnings. Tap to see the list. */
export function AlertsBanner() {
  const nav = useNavigation<any>();
  const D = useData();
  const { roles } = useAuth();
  const list = alertsFor(D, roles).filter((a) => a.tone !== "info");
  if (!list.length) return null;
  const bad = list.some((a) => a.tone === "bad");
  const nBad = list.filter((a) => a.tone === "bad").length;
  const col = bad ? C.red : C.amber;
  return (
    <Pressable onPress={() => nav.navigate("Alerts")} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: bad ? C.redSoft : C.amberSoft, borderWidth: 1, borderColor: bad ? "#efb4ad" : "#ecd29a", borderRadius: 16, padding: 14 }}>
      <Icon name="warning-outline" size={22} color={col} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 17, fontWeight: "700", color: col }}>{bad ? `${nBad} need action` : `${list.length} warning${list.length > 1 ? "s" : ""}`}</Text>
        <Text numberOfLines={1} style={{ color: col, fontSize: 14 }}>{list[0].title}</Text>
      </View>
      <Icon name="chevron-forward" size={20} color={col} />
    </Pressable>
  );
}

/** The Owner's landing page: production at a glance, what needs action, trucks, yards and sales. */
export default function Overview() {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const D = useData();
  const f = useFilter();
  const name = session!.person.full_name;
  const w = shiftWindow(D.shift);
  const now = new Date();
  const { from, to, period, materialId } = f;
  const mat = materialId ?? undefined;
  const pelletMat = D.material.find((m) => m.kind !== "Raw" && m.bag_kg != null);
  const briqMat = D.material.find((m) => /briquette/i.test(m.name) && !/dust/i.test(m.name));
  const bagKg = num(pelletMat?.bag_kg) || 25;

  const figures = (a: Date, b: Date) => {
    const raw = trucksIn(D, a, b, mat);
    const sold = trucksOut(D, a, b, mat);
    return {
      rawKg: sumNet(raw), rawTrucks: raw.length,
      pelletKg: !mat || mat === pelletMat?.id ? pelletKg(D, a, b) : 0,
      briqKg: !mat || mat === briqMat?.id ? briquetteKg(D, a, b, undefined, now) : 0,
      soldKg: sumNet(sold), soldTrucks: sold.length,
    };
  };
  const cur = figures(from, to);
  const back = period === "year" || period === "custom" ? to.getTime() - from.getTime() : SHIFT_BACK[period] * DAY;
  const prev = back ? figures(new Date(from.getTime() - back), new Date(to.getTime() - back)) : null;
  const vs = PERIODS.find((p) => p.key === period)!.vs || "vs the same length before";

  const delta = (a: number, b: number | undefined) => {
    if (b == null || (a === 0 && b === 0)) return null;
    if (b === 0) return { text: "↑ new", color: C.ok };
    const pct = Math.round(((a - b) / b) * 100);
    if (pct === 0) return { text: "Same as before", color: C.sub };
    return { text: `${pct > 0 ? "↑" : "↓"}${Math.abs(pct)}%`, color: pct > 0 ? C.ok : C.red };
  };
  const go = (kind: string) => nav.navigate("Detail", { kind, from: from.toISOString(), to: to.toISOString(), materialId });

  const stat = (label: string, kg: number, sub: string, prevKg: number | undefined, kind: string) => {
    const d = delta(kg, prevKg);
    return (
      <Pressable key={kind} onPress={() => go(kind)} style={({ pressed }) => [tile, pressed && { opacity: 0.7 }]}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: C.ink }}>{label}</Text>
        <Text style={{ fontFamily: F.head, fontSize: 44, lineHeight: 48, color: C.ink }}>{kgToTons(kg)} t</Text>
        <Text style={{ color: C.sub, fontSize: 14 }}>{sub}</Text>
        {d ? <Text style={{ fontSize: 14, color: d.color }}>{d.text} <Text style={{ color: C.sub, fontSize: 14 }}>{vs}</Text></Text> : null}
      </Pressable>
    );
  };

  // Machines running now, people on site, maintenance open.
  const nowMs = Date.now();
  const runHours = D.machine_run.reduce((n, r) => n + Math.max(0, Math.min(r.stopped_at ? new Date(r.stopped_at).getTime() : nowMs, to.getTime()) - Math.max(new Date(r.started_at).getTime(), from.getTime())), 0) / 3_600_000;
  const downNow = D.machine.filter((m) => D.downtime.some((d) => d.machine_id === m.id && !d.ended_at)).length;
  const site = onSiteMap(D).size;
  const cameIn = new Set(D.attendance.filter((a) => new Date(a.gate_in) >= from && new Date(a.gate_in) < to).map((a) => a.person_id)).size;
  const newPeople = D.person.filter((p) => p.active && !p.checked).length;
  const openJobs = D.maintenance_job.filter((j) => !j.fixed_at);
  const fixedIn = D.maintenance_job.filter((j) => j.fixed_at && new Date(j.fixed_at) >= from && new Date(j.fixed_at) < to).length;
  const bypassOpen = D.run_bypass.filter((b) => { const r = D.machine_run.find((x) => x.id === b.run_id); const j = D.maintenance_job.find((x) => x.id === b.job_id); return r && !r.stopped_at && !(j && j.fixed_at); }).length;
  const jobAlert = bypassOpen > 0 || openJobs.some((j) => j.machine_stopped);

  const small = (label: string, value: string, sub: string, onPress: () => void, alert = false) => (
    <Pressable key={label} onPress={onPress} style={({ pressed }) => [tile, pressed && { opacity: 0.7 }]}>
      <Text style={{ fontSize: 15, fontWeight: "700", color: C.ink }}>{label}</Text>
      <Text style={{ fontFamily: F.head, fontSize: 44, lineHeight: 48, color: alert ? C.red : C.ink }}>{value}</Text>
      <Text style={{ color: C.sub, fontSize: 14 }}>{sub}</Text>
    </Pressable>
  );

  // Money (rupees) is for the Owner only.
  const isOwner = (session?.roles ?? []).includes("Owner");
  const mon = isOwner ? moneyIn(D, from.getTime(), to.getTime()) : null;
  const pw = powerIn(D, from.getTime(), to.getTime());
  const dsl = dieselL(D, from.getTime(), to.getTime());
  const madeT = (cur.pelletKg + cur.briqKg) / 1000;
  const kwhPerTon = madeT > 0 ? pw.kwh / madeT : null;
  // Store now = the opening count + made - sold since then (dust is only known when it is sold).
  const storeKg = (productId?: string) => {
    const o = D.opening_stock.filter((x) => x.product_id === productId).sort((a, b) => String(b.as_of).localeCompare(String(a.as_of)))[0];
    if (!o || !productId) return null;
    const a0 = new Date(o.as_of);
    const made = productId === pelletId(D) ? pelletKg(D, a0, now) : briquetteKg(D, a0, now, undefined, now);
    return num(o.kg) + made - sumNet(trucksOut(D, a0, now, productId));
  };
  const pelletStore = storeKg(pelletId(D));
  const briqStore = storeKg(briquetteId(D));

  // Charts: tons by hour, day or week.
  const buckets = useMemo(() => bucketsOf(from, to), [from.getTime(), to.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const rawMats = D.material.filter((m) => m.kind === "Raw" && (!mat || m.id === mat));
  const rawTrucks = trucksIn(D, from, to, mat);
  const rawSeries = rawMats
    .map((m, i) => ({ name: m.name as string, color: SERIES_COLORS[i % SERIES_COLORS.length], kg: sumNet(rawTrucks.filter((t) => t.material_id === m.id)), values: buckets.map((b) => sumNet(rawTrucks.filter((t) => t.material_id === m.id && new Date(t.second_at).getTime() >= b.a && new Date(t.second_at).getTime() < b.b)) / 1000) }))
    .filter((s) => s.kg > 0);
  const prodSeries = [
    { name: "Pellets", color: SERIES_COLORS[0], values: buckets.map((b) => pelletKg(D, new Date(b.a), new Date(b.b)) / 1000) },
    { name: "Briquettes", color: SERIES_COLORS[1], values: buckets.map((b) => briquetteKg(D, new Date(b.a), new Date(b.b), undefined, now) / 1000) },
  ].filter((s) => (!mat || (s.name === "Pellets" ? mat === pelletMat?.id : mat === briqMat?.id)));
  const totalRaw = rawSeries.reduce((n, s) => n + s.kg, 0);
  const sold = trucksOut(D, from, to);
  const soldBy = D.material.filter((m) => m.kind !== "Raw").map((m) => ({ m, list: sold.filter((t) => t.material_id === m.id) })).filter((x) => x.list.length);
  const bags = Math.round(cur.pelletKg / bagKg);
  const allRaw = [...D.weigh_ticket.filter((t) => t.direction === "in" && (!mat || t.material_id === mat) && (t.second_kg == null ? new Date(t.first_at) < to : new Date(t.second_at) >= from && new Date(t.second_at) < to))]
    .sort((a, b) => String(b.second_at ?? b.first_at).localeCompare(String(a.second_at ?? a.first_at)));
  const atScale = allRaw.filter((t) => t.second_kg == null).length;
  const yards = [...D.yard].sort((a, b) => a.letter.localeCompare(b.letter));
  const waiting = D.yard_batch.filter((b) => !b.finished_at).reduce((n, b) => n + sumNet(batchTickets(D, b.id).filter((t) => t.second_kg != null)), 0);
  const card = { padding: 16, borderRadius: 18, gap: 10 } as const;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Dashboard" subtitle={`${name} · ${w ? `${w.shift.name} shift` : "Off-shift"}`} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32, gap: 14 }}>
        <FilterBar />
        <AlertsBanner />

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {stat("Raw material in", cur.rawKg, `${cur.rawTrucks} trucks`, prev?.rawKg, "raw")}
          {stat("Pellets made", cur.pelletKg, `about ${bags} bags of ${bagKg} kg`, prev?.pelletKg, "pellets")}
          {stat("Briquettes made", cur.briqKg, "from the hourly 1-minute weighing", prev?.briqKg, "briquettes")}
          {stat("Sold", cur.soldKg, `${cur.soldTrucks} trucks out`, prev?.soldKg, "sales")}
          {small("Machines running now", `${openRuns(D).length} of ${D.machine.length}`, `${runHours.toFixed(1)} h run in the period · ${downNow} down`, () => nav.navigate("Machines"))}
          {small("People on site now", String(site), `${cameIn} came in${newPeople ? ` · ${newPeople} new to check` : ""}`, () => nav.navigate("People"))}
          {small("Electricity and diesel", `${Math.round(pw.kwh).toLocaleString("en-US")} kWh`, `${kwhPerTon ? `${Math.round(kwhPerTon)} kWh per ton · ` : ""}${Math.round(dsl).toLocaleString("en-US")} L diesel`, () => nav.navigate("PowerReading"), !!kwhPerTon && kwhPerTon > targetsOf(D).kwh_per_t * 1.1)}
          {small("Maintenance open", String(openJobs.length), `${fixedIn} fixed in the period · ${bypassOpen} on bypass`, () => nav.navigate("Jobs"), jobAlert)}
        </View>

        {mon ? (
          <>
            <SectionTitle>Money · owner only</SectionTitle>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {small("Sales", rsK(mon.rev), `${mon.sold.length} trucks · excluding VAT`, () => nav.navigate("Money"))}
              {small("Production cost", rsK(mon.cost), `${(mon.pel + mon.bri).toFixed(0)} t made · raw material ${Math.round((mon.rawUse / (mon.cost || 1)) * 100)}% of it`, () => nav.navigate("Money"))}
              {small("Margin on sales", rsK(mon.margin), mon.rev > 0 ? `${Math.round((mon.margin / mon.rev) * 100)}% of sales` : "nothing sold", () => nav.navigate("Money"))}
              {small("Cost per kg of pellet", rkg(mon.cpel), `briquette ${rkg(mon.cbri)} a kg · selling at ${rkg(avgRate(D, pelletId(D), from.getTime(), to.getTime()))}`, () => nav.navigate("Money"))}
            </View>
          </>
        ) : null}

        <Card style={card}>
          <Text style={{ fontFamily: F.head, fontSize: 24, color: C.ink }}>Raw material collection</Text>
          <Sub>Net tons by {buckets.length > 1 && buckets[0].label.endsWith("h") ? "hour" : "day"}, one line per material.</Sub>
          {rawSeries.length === 0 ? <Sub>No trucks weighed in this period.</Sub> : (
            <>
              <LineChart labels={buckets.map((b) => b.label)} series={rawSeries} />
              <Row style={{ flexWrap: "wrap", gap: 12 }}>
                {rawSeries.map((s) => (
                  <Row key={s.name} style={{ gap: 6 }}><View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: s.color }} /><Text style={{ color: C.sub, fontSize: 13 }}>{s.name} <Text style={{ color: C.ink, fontWeight: "700" }}>{kgToTons(s.kg)} t</Text></Text></Row>
                ))}
              </Row>
            </>
          )}
        </Card>

        <Card style={card}>
          <Text style={{ fontFamily: F.head, fontSize: 24, color: C.ink }}>Raw material ratio</Text>
          {rawSeries.length === 0 ? <Sub>No trucks weighed in this period.</Sub> : rawSeries.map((s) => (
            <View key={s.name} style={{ gap: 4 }}>
              <Row><View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: s.color }} /><T>{s.name}</T><Spacer /><T bold>{kgToTons(s.kg)} t · {Math.round((s.kg / (totalRaw || 1)) * 100)}%</T></Row>
              <View style={{ height: 8, backgroundColor: C.greySoft, borderRadius: 4 }}><View style={{ width: `${Math.max(2, (s.kg / (totalRaw || 1)) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: s.color }} /></View>
            </View>
          ))}
        </Card>

        <Card style={card}>
          <Text style={{ fontFamily: F.head, fontSize: 24, color: C.ink }}>{period === "today" ? "Today's raw material" : "Raw material trucks"}</Text>
          <Sub>{allRaw.length} trucks · {kgToTons(sumNet(allRaw.filter((t) => t.second_kg != null)))} t · {atScale} at the weighbridge</Sub>
          {allRaw.length === 0 ? <Sub>No raw material trucks in this period.</Sub> : null}
          {allRaw.slice(0, 40).map((t) => {
            const mi = rawMats.findIndex((m) => m.id === t.material_id);
            return (
              <Pressable key={t.id} onPress={() => nav.navigate("TruckDrill", { ticketId: t.id })} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
                <Text style={{ color: C.sub, fontSize: 13, width: 48 }}>{fmtTime(t.second_at ?? t.first_at)}</Text>
                <View style={{ flex: 1 }}>
                  <Row style={{ gap: 6 }}><View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: SERIES_COLORS[Math.max(0, mi) % SERIES_COLORS.length] }} /><T>{D.material.find((m) => m.id === t.material_id)?.name}</T></Row>
                  <Sub>{D.supplier.find((p) => p.id === t.supplier_id)?.name} · {t.vehicle_no}</Sub>
                </View>
                <Text style={{ fontWeight: "700", color: t.second_kg == null ? C.amber : C.ink }}>{t.second_kg == null ? "At the scale" : `${kgToTons(ticketNet(t) ?? 0)} t`}</Text>
              </Pressable>
            );
          })}
          {allRaw.length > 40 ? <Btn small kind="ghost" title={`See all ${allRaw.length} trucks`} onPress={() => go("raw")} /> : null}
        </Card>

        <Card style={card}>
          <Text style={{ fontFamily: F.head, fontSize: 24, color: C.ink }}>Production</Text>
          <Sub>Pellets from 25 kg bag counts, briquettes from the hourly 1-minute weighing. Tons by {buckets.length > 1 && buckets[0].label.endsWith("h") ? "hour" : "day"}.</Sub>
          <ColumnChart labels={buckets.map((b) => b.label)} series={prodSeries} />
          <Row style={{ gap: 14, flexWrap: "wrap" }}>
            {prodSeries.map((s) => <Row key={s.name} style={{ gap: 6 }}><View style={{ width: 14, height: 10, borderRadius: 2, backgroundColor: s.color }} /><Text style={{ color: C.sub, fontSize: 13 }}>{s.name} <Text style={{ color: C.ink, fontWeight: "700" }}>{s.values.reduce((n, v) => n + v, 0).toFixed(1)} t</Text></Text></Row>)}
          </Row>
        </Card>

        <Card style={card}>
          <Text style={{ fontFamily: F.head, fontSize: 24, color: C.ink }}>Store and sales</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}><Sub>Pellets in store</Sub><Text style={{ fontFamily: F.head, fontSize: 28, color: C.ink }}>{pelletStore == null ? "-" : `${kgToTons(pelletStore)} t`}</Text></View>
            <View style={{ flex: 1 }}><Sub>Briquettes in store</Sub><Text style={{ fontFamily: F.head, fontSize: 28, color: C.ink }}>{briqStore == null ? "-" : `${kgToTons(briqStore)} t`}</Text></View>
          </View>
          <Sub>Sold in the period</Sub>
          {soldBy.length === 0 ? <Sub>No sales in this period.</Sub> : soldBy.map(({ m, list }) => (
            <View key={m.id} style={{ gap: 4 }}>
              <Row><T>{m.name}</T><Spacer /><T bold>{kgToTons(sumNet(list))} t · {list.length} trucks</T></Row>
              <View style={{ height: 8, backgroundColor: C.greySoft, borderRadius: 4 }}><View style={{ width: `${Math.max(2, (sumNet(list) / (cur.soldKg || 1)) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: C.green }} /></View>
            </View>
          ))}
          <Sub>Store = opening count + made - sold by truck weight. Dust is only known when it is sold.</Sub>
        </Card>

        <Card style={card}>
          <Text style={{ fontFamily: F.head, fontSize: 24, color: C.ink }}>Yards now</Text>
          <Sub>About {kgToTons(waiting)} t of raw material waiting</Sub>
          {yards.map((y) => {
            const b = activeBatch(D, y.id);
            const trucks = b ? batchTickets(D, b.id) : [];
            const used = b?.started_at ? yardUsedPct(D, b) : null;
            const status = !b ? "Empty" : b.started_at ? "In use" : b.closed_at ? "Ready" : "Filling";
            return (
              <View key={y.id} style={{ gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line }}>
                <Row><T bold>{y.name}{b ? ` · ${batchCode(D, b)}` : ""}</T><Spacer /><Text style={{ fontSize: 13, fontWeight: "700", color: status === "In use" ? C.blue : status === "Filling" ? C.ok : C.sub }}>{status}</Text></Row>
                {b ? (
                  <>
                    <Sub>{batchMaterial(D, b)?.name ?? "no truck yet"} · {trucks.length} of {y.holds_trucks ?? "-"} trucks · {kgToTons(sumNet(trucks.filter((t) => t.second_kg != null)))} t{used != null ? ` · about ${used}% used` : ""}</Sub>
                    <View style={{ height: 8, backgroundColor: C.greySoft, borderRadius: 4 }}><View style={{ width: `${used ?? Math.min(100, (trucks.length / (num(y.holds_trucks) || 1)) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: C.green }} /></View>
                  </>
                ) : <Sub>Ready for trucks</Sub>}
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </View>
  );
}

const tile = { flexBasis: "47%", flexGrow: 1, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 16, gap: 4 } as const;

