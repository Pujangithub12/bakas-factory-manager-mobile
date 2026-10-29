import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Card, C, F, Icon, IconTile, Row, ScreenHeader, SectionTitle, Spacer, Sub, Text, initialsOf, type IconName } from "../ui";
import { useAuth } from "../auth";
import { useData } from "../store";
import { requestDays } from "../sync";
import { activeBatch, bagCounts, briquetteKg, kgToTons, machineAlerts, num, onSiteMap, openRuns, pelletKg, sumNet, trucksIn, trucksOut } from "../rules";
import { DAY, fiscalYearStart, fmtDateTime, periodRange, shiftWindow, type PeriodKey } from "../time";
import { roleInfo } from "../roles";

type Key = PeriodKey | "year";
const PERIODS: { key: Key; label: string; vs: string }[] = [
  { key: "today", label: "Today", vs: "vs yesterday by now" },
  { key: "yesterday", label: "Yesterday", vs: "vs the day before" },
  { key: "7d", label: "7 days", vs: "vs the 7 days before" },
  { key: "30d", label: "30 days", vs: "vs the 30 days before" },
  { key: "year", label: "This year", vs: "" },
];
// How many days of history each choice needs (the period and the one before it, for the comparison).
const NEED: Record<Key, number> = { today: 3, yesterday: 4, "7d": 15, "30d": 62, year: 0 };
const SHIFT_BACK: Record<Key, number> = { today: 1, yesterday: 1, "7d": 7, "30d": 30, year: 0 };

/** The Owner's landing page: production at a glance, what needs action, and shortcuts. */
export default function Overview() {
  const nav = useNavigation<any>();
  const { session, roles } = useAuth();
  const D = useData();
  const [period, setPeriod] = useState<Key>("today");
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const name = session!.person.full_name;
  const main = roles.includes("Owner") ? "Owner" : roles.includes("Manager") ? "Manager" : roles[0];
  const w = shiftWindow(D.shift);

  const now = new Date();
  const { from, to } = useMemo(() => (period === "year" ? { from: fiscalYearStart(), to: new Date() } : periodRange(period)), [period, D.weigh_ticket.length]);

  // Ask for enough history to cover the choice and its comparison.
  useEffect(() => {
    const need = period === "year" ? Math.ceil((Date.now() - fiscalYearStart().getTime()) / DAY) + 2 : NEED[period];
    requestDays(need);
  }, [period]);

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
  const back = SHIFT_BACK[period] * DAY;
  const prev = back ? figures(new Date(from.getTime() - back), new Date(to.getTime() - back)) : null;
  const vs = PERIODS.find((p) => p.key === period)!.vs;

  const delta = (a: number, b: number | undefined) => {
    if (b == null || (a === 0 && b === 0)) return null;
    if (b === 0) return { text: "↑ new", color: C.ok };
    const pct = Math.round(((a - b) / b) * 100);
    if (pct === 0) return { text: "no change", color: C.sub };
    return { text: `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}%`, color: pct > 0 ? C.ok : C.red };
  };

  const go = (kind: string) => nav.navigate("Detail", { kind, from: from.toISOString(), to: to.toISOString(), materialId });

  const stat = (label: string, kg: number, sub: string, prevKg: number | undefined, kind: string) => {
    const d = delta(kg, prevKg);
    return (
      <Pressable key={kind} onPress={() => go(kind)} style={({ pressed }) => [{ flexBasis: "47%", flexGrow: 1, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 16, gap: 4 }, pressed && { opacity: 0.7 }]}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: C.ink }}>{label}</Text>
        <Text style={{ fontFamily: F.head, fontSize: 44, lineHeight: 48, color: C.ink }}>{kgToTons(kg)} t</Text>
        <Text style={{ color: C.sub, fontSize: 14 }}>{sub}</Text>
        {d ? <Text style={{ fontSize: 14, color: d.color }}>{d.text} <Text style={{ color: C.sub, fontSize: 14 }}>{vs}</Text></Text> : null}
      </Pressable>
    );
  };

  const items: string[] = [];
  for (const m of D.machine) for (const a of machineAlerts(D, m)) items.push(`${m.tag} ${a.text.charAt(0).toLowerCase()}${a.text.slice(1)}`);

  const byMaterial = D.material
    .filter((m) => m.kind === "Raw")
    .map((m) => ({ m, kg: sumNet(trucksIn(D, from, to, m.id)), n: trucksIn(D, from, to, m.id).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.kg - a.kg);
  const totalRaw = byMaterial.reduce((n, x) => n + x.kg, 0);
  const bags = Math.round(cur.pelletKg / bagKg);
  const site = onSiteMap(D).size;
  const yardsInUse = D.yard.filter((y) => activeBatch(D, y.id)).length;

  const shortcuts: { title: string; sub: string; screen: string; icon: IconName }[] = [
    { title: "Gate register", sub: "Check people in and out", screen: "Gate", icon: "log-in-outline" },
    { title: "Shift & crew", sub: "In charge, on duty, who runs what", screen: "Crew", icon: "people-outline" },
    { title: "Weighbridge", sub: "Trucks in and out, yards, bags", screen: "Weighbridge", icon: "speedometer-outline" },
    { title: "Maintenance jobs", sub: "Reported, working on it, fixed", screen: "Jobs", icon: "construct-outline" },
    { title: "Report a problem", sub: "Goes straight to the fitters", screen: "ReportProblem", icon: "alert-circle-outline" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Dashboard" subtitle={`${roleInfo(main).label}${w ? ` · ${w.shift.name} shift` : ""}`} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32, gap: 14 }}>
        {/* Period */}
        <View style={{ backgroundColor: C.greySoft, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 5 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
            {PERIODS.map((p) => (
              <Pressable key={p.key} onPress={() => setPeriod(p.key)} style={[{ paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14 }, period === p.key && { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 }]}>
                <Text style={{ fontSize: 16, color: period === p.key ? C.ink : C.sub, fontWeight: period === p.key ? "700" : "600" }}>{p.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Material */}
        <Row style={{ gap: 12 }}>
          <Text style={{ fontSize: 16, color: C.sub }}>Material</Text>
          <Pressable onPress={() => setPicking(true)} style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text style={{ flex: 1, fontSize: 17, color: C.ink }}>{D.material.find((m) => m.id === materialId)?.name ?? "All materials"}</Text>
            <Icon name="chevron-down" size={18} color={C.ink} />
          </Pressable>
        </Row>
        <Sub>{PERIODS.find((p) => p.key === period)!.label} · {fmtDateTime(from.toISOString())} to {fmtDateTime(to.toISOString())}</Sub>

        {/* What needs action */}
        {items.length ? (
          <Pressable onPress={() => nav.navigate("Machines")} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.redSoft, borderWidth: 1, borderColor: "#efb4ad", borderRadius: 16, padding: 14 }}>
            <Icon name="warning-outline" size={22} color={C.red} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: C.red }}>{items.length} need action</Text>
              <Text numberOfLines={1} style={{ color: "#8a2b21", fontSize: 14 }}>{items.slice(0, 2).join(", ")}{items.length > 2 ? "…" : ""}</Text>
            </View>
            <Icon name="chevron-forward" size={20} color={C.red} />
          </Pressable>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.okSoft, borderRadius: 16, padding: 14 }}>
            <Icon name="checkmark-circle-outline" size={22} color={C.ok} />
            <Text style={{ fontSize: 16, fontWeight: "700", color: C.ok }}>Nothing needs action</Text>
          </View>
        )}

        {/* Production */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {stat("Raw material in", cur.rawKg, `${cur.rawTrucks} trucks`, prev?.rawKg, "raw")}
          {stat("Pellets made", cur.pelletKg, `about ${bags} bags of ${bagKg} kg`, prev?.pelletKg, "pellets")}
          {stat("Briquettes made", cur.briqKg, "from the hourly 1-minute weighing", prev?.briqKg, "briquettes")}
          {stat("Sold", cur.soldKg, `${cur.soldTrucks} trucks out`, prev?.soldKg, "sales")}
        </View>

        {/* Now */}
        <Row style={{ gap: 12, alignItems: "stretch" }}>
          {[
            { label: "Running", value: `${openRuns(D).length}/${D.machine.length}`, sub: "machines", go: () => nav.navigate("Machines") },
            { label: "On site", value: String(site), sub: "people", go: () => nav.navigate("People") },
            { label: "Yards", value: `${yardsInUse}/${D.yard.length}`, sub: "in use", go: () => go("yards") },
          ].map((x) => (
            <Pressable key={x.label} onPress={x.go} style={{ flex: 1, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12, gap: 2 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: C.sub }}>{x.label}</Text>
              <Text style={{ fontFamily: F.head, fontSize: 30, color: C.ink }}>{x.value}</Text>
              <Text style={{ fontSize: 13, color: C.sub }}>{x.sub}</Text>
            </Pressable>
          ))}
        </Row>

        <SectionTitle>Raw material in, by material</SectionTitle>
        {byMaterial.length === 0 ? <Sub>No finished trucks in this period.</Sub> : (
          <Card>
            {byMaterial.map(({ m, kg, n }) => {
              const share = totalRaw ? kg / totalRaw : 0;
              return (
                <View key={m.id} style={{ gap: 4, marginBottom: 8 }}>
                  <Row><Text style={{ fontWeight: "700", color: C.ink }}>{m.name}</Text><Spacer /><Text style={{ fontWeight: "700", color: C.ink }}>{kgToTons(kg)} t</Text></Row>
                  <View style={{ height: 8, backgroundColor: C.greySoft, borderRadius: 4 }}><View style={{ width: `${Math.max(2, share * 100)}%`, height: 8, borderRadius: 4, backgroundColor: C.green }} /></View>
                  <Sub>{n} trucks · {(share * 100).toFixed(0)}%</Sub>
                </View>
              );
            })}
          </Card>
        )}

        <SectionTitle>Open</SectionTitle>
        {shortcuts.map((s) => (
          <Card key={s.screen} onPress={() => nav.navigate(s.screen)} style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 12, borderRadius: 16 }}>
            <IconTile name={s.icon} size={46} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 17, color: C.ink }}>{s.title}</Text>
              <Text style={{ color: C.sub, fontSize: 13 }}>{s.sub}</Text>
            </View>
            <Icon name="chevron-forward" size={20} color={C.grey} />
          </Card>
        ))}
      </ScrollView>

      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        <Pressable onPress={() => setPicking(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: C.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28, maxHeight: "70%" }}>
            <Text style={{ fontFamily: F.head, fontSize: 26, color: C.ink, marginBottom: 8 }}>Material</Text>
            <ScrollView>
              {[{ id: null as string | null, name: "All materials" }, ...D.material.map((m) => ({ id: m.id as string | null, name: m.name as string }))].map((o) => (
                <Pressable key={o.id ?? "all"} onPress={() => { setMaterialId(o.id); setPicking(false); }} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line }}>
                  <Text style={{ flex: 1, fontSize: 17, color: C.ink, fontWeight: o.id === materialId ? "700" : "400" }}>{o.name}</Text>
                  {o.id === materialId ? <Icon name="checkmark" size={20} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
