import React, { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Avatar, Badge, Btn, C, Card, Empty, F, Icon, Row, Screen, ScreenHeader, SectionTitle, Spacer, Sub, T, Text, initialsOf } from "../ui";
import { useAuth } from "../auth";
import { useData, type Data } from "../store";
import { FilterBar, useFilter } from "./Overview";
import { alertsFor, batchCode, kgToTons, machineStatus, mainRole, num, onSiteMap, personName, rolesOf, ticketNet, briquetteKg, pelletKg, yardUsedPct } from "../rules";
import { HOUR, DAY, fmtDateTime, fmtDuration, fmtTime, shiftWindow, type Row as R } from "../time";

const ms = (v: any) => new Date(v).getTime();
const overlap = (a: number, b: number, c: number, d: number) => Math.max(0, Math.min(b, d) - Math.max(a, c));
const hrs = (msv: number) => `${(msv / HOUR).toFixed(1)} h`;

// ------------------------------------------------------------- alerts ----

export function AlertsScreen() {
  const nav = useNavigation<any>();
  const D = useData();
  const { roles } = useAuth();
  const list = alertsFor(D, roles);
  const n = (t: string) => list.filter((a) => a.tone === t).length;
  const icon = { bad: "alert-circle", warn: "warning", info: "information-circle" } as const;
  const col = { bad: C.red, warn: C.amber, info: C.blue } as const;
  return (
    <Screen>
      <Sub>{n("bad")} need action · {n("warn")} warnings · {n("info")} for information</Sub>
      {list.length === 0 ? <Empty text="Nothing needs attention." /> : null}
      {list.map((a) => (
        <Card key={a.key} onPress={a.go ? () => nav.navigate(a.go!.screen, a.go!.params) : undefined} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 14, borderRadius: 16 }}>
          <Icon name={icon[a.tone]} size={22} color={col[a.tone]} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bodyBold, fontSize: 15, color: C.ink }}>{a.title}</Text>
            <Sub>{a.detail}</Sub>
          </View>
          <Sub>{a.area}</Sub>
        </Card>
      ))}
    </Screen>
  );
}

// ------------------------------------------------------------- machines ----

const stateColor = (s: string) => (s === "running" ? C.ok : s === "down" ? C.red : C.grey);

/** One row per machine: when it ran in the period, hours, output and who ran it. */
function Strip({ D, m, from, to }: { D: Data; m: R; from: number; to: number }) {
  const nowMs = Date.now();
  const span = to - from;
  const seg = (a: number, b: number) => ({ left: `${Math.max(0, ((a - from) / span) * 100)}%` as const, width: `${Math.max(0.5, ((Math.min(b, to) - Math.max(a, from)) / span) * 100)}%` as const });
  const runs = D.machine_run.filter((r) => r.machine_id === m.id && overlap(ms(r.started_at), r.stopped_at ? ms(r.stopped_at) : nowMs, from, to) > 0);
  const downs = D.downtime.filter((d) => d.machine_id === m.id && overlap(ms(d.started_at), d.ended_at ? ms(d.ended_at) : nowMs, from, to) > 0);
  return (
    <View style={{ height: 14, backgroundColor: C.greySoft, borderRadius: 4, overflow: "hidden" }}>
      {runs.map((r) => <View key={r.id} style={{ position: "absolute", top: 0, bottom: 0, backgroundColor: C.ok, ...seg(ms(r.started_at), r.stopped_at ? ms(r.stopped_at) : nowMs) }} />)}
      {downs.map((d) => {
        const planned = D.stop_reason.find((x) => x.id === d.stop_reason_id)?.type === "Planned";
        return <View key={d.id} style={{ position: "absolute", top: 0, bottom: 0, backgroundColor: planned ? C.amber : C.red, opacity: 0.8, ...seg(ms(d.started_at), d.ended_at ? ms(d.ended_at) : nowMs) }} />;
      })}
    </View>
  );
}

export function machineFigures(D: Data, m: R, from: number, to: number) {
  const nowMs = Date.now();
  const runMs = D.machine_run.filter((r) => r.machine_id === m.id).reduce((n, r) => n + overlap(ms(r.started_at), r.stopped_at ? ms(r.stopped_at) : nowMs, from, to), 0);
  const downMs = D.downtime.filter((d) => d.machine_id === m.id).reduce((n, d) => n + overlap(ms(d.started_at), d.ended_at ? ms(d.ended_at) : nowMs, from, to), 0);
  const ops = [...new Set(D.machine_run.filter((r) => r.machine_id === m.id && overlap(ms(r.started_at), r.stopped_at ? ms(r.stopped_at) : nowMs, from, to) > 0).map((r) => r.operator_id as string))];
  const out = m.stage === "pellet" ? pelletKg(D, new Date(from), new Date(to)) : m.stage === "briquette" ? briquetteKg(D, new Date(from), new Date(to), m.id) : 0;
  return { runMs, downMs, ops, out };
}

/** The owner's Machines tab. */
export function OwnerMachines() {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const D = useData();
  const f = useFilter();
  const name = session!.person.full_name;
  const w = shiftWindow(D.shift);
  const from = f.from.getTime(), to = Math.min(f.to.getTime(), Date.now() + HOUR);
  const machines = [...D.machine].sort((a, b) => a.tag.localeCompare(b.tag));
  const openJobs = D.maintenance_job.filter((j) => !j.fixed_at).sort((a, b) => Number(!!b.machine_stopped) - Number(!!a.machine_stopped) || String(b.reported_at).localeCompare(String(a.reported_at)));
  const fixedIn = D.maintenance_job.filter((j) => j.fixed_at && ms(j.fixed_at) >= from && ms(j.fixed_at) < to).length;
  const byReason = D.stop_reason
    .map((r) => ({ r, h: D.downtime.filter((d) => d.stop_reason_id === r.id).reduce((n, d) => n + overlap(ms(d.started_at), d.ended_at ? ms(d.ended_at) : Date.now(), from, to), 0) }))
    .filter((x) => x.h > 0).sort((a, b) => b.h - a.h);
  const maxR = byReason[0]?.h || 1;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Machines" subtitle={`${name} · ${w ? `${w.shift.name} shift` : "Off-shift"}`} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32, gap: 14 }}>
        <FilterBar withMaterial={false} />
        <Card style={{ padding: 16, borderRadius: 18, gap: 8 }}>
          <Text style={{ fontFamily: F.head, fontSize: 24, color: C.ink }}>Machines</Text>
          <Sub>{f.period === "today" ? "When each machine ran today. Tap one for who ran it." : "How much each machine ran. Tap one for who ran it."}</Sub>
          {machines.map((m) => {
            const st = machineStatus(D, m);
            const x = machineFigures(D, m, from, to);
            return (
              <Pressable key={m.id} onPress={() => nav.navigate("MachineDrill", { machineId: m.id })} style={{ gap: 6, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line }}>
                <Row>
                  <View style={{ backgroundColor: C.greySoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ fontSize: 13, color: C.sub, fontWeight: "600" }}>{m.tag}</Text></View>
                  <T bold>{m.name}</T>
                  <Spacer />
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: stateColor(st.state) }} /><Text style={{ fontSize: 13, color: C.ink, fontWeight: "600" }}>{st.state === "running" ? "Running" : st.state === "down" ? "Down" : "Idle"}</Text></View>
                </Row>
                <Strip D={D} m={m} from={from} to={to} />
                <Row>
                  <Sub style={{ flex: 1 }}>{x.ops.length ? x.ops.slice(0, 2).map((p) => personName(D, p)).join(", ") + (x.ops.length > 2 ? ` +${x.ops.length - 2}` : "") : "-"}</Sub>
                  <Text style={{ fontWeight: "700", color: C.ink }}>{hrs(x.runMs)}</Text>
                  <Sub>{x.downMs > 0 ? ` · ${hrs(x.downMs)} down` : ""}{x.out > 0 ? ` · ${kgToTons(x.out)} t ${m.stage === "pellet" ? "pellets" : "briquettes"}` : ""}</Sub>
                </Row>
              </Pressable>
            );
          })}
          <Row style={{ gap: 14, flexWrap: "wrap" }}>
            {[[C.ok, "Running"], [C.amber, "Planned stop"], [C.red, "Breakdown or other stop"]].map(([c, l]) => <Row key={l} style={{ gap: 6 }}><View style={{ width: 14, height: 8, borderRadius: 2, backgroundColor: c }} /><Sub>{l}</Sub></Row>)}
          </Row>
        </Card>

        <Card style={{ padding: 16, borderRadius: 18, gap: 8 }}>
          <Row><Text style={{ fontFamily: F.head, fontSize: 24, color: C.ink, flex: 1 }}>Maintenance</Text><Btn small kind="ghost" title="All jobs" onPress={() => nav.navigate("Jobs")} /></Row>
          <Sub>{openJobs.length} open now · {fixedIn} fixed in the period</Sub>
          {openJobs.length === 0 ? <Sub>No open jobs.</Sub> : null}
          {openJobs.slice(0, 5).map((j) => (
            <Pressable key={j.id} onPress={() => nav.navigate("Job", { jobId: j.id })} style={{ flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
              <View style={{ backgroundColor: C.greySoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ fontSize: 13, color: C.sub, fontWeight: "600" }}>{D.machine.find((m) => m.id === j.machine_id)?.tag}</Text></View>
              <View style={{ flex: 1 }}>
                <T>{j.problem}</T>
                <Sub>{j.fitter_id ? `${personName(D, j.fitter_id)} working` : "Waiting for a fitter"} · {fmtDuration(Date.now() - ms(j.reported_at))} ago</Sub>
              </View>
              {j.machine_stopped ? <Badge text="Stopped" tone="bad" /> : null}
            </Pressable>
          ))}
          <Text style={{ fontFamily: F.head, fontSize: 20, color: C.ink, marginTop: 6 }}>Stopped time by reason</Text>
          {byReason.length === 0 ? <Sub>No stops in this period.</Sub> : byReason.map(({ r, h }) => (
            <View key={r.id} style={{ gap: 3 }}>
              <Row><T>{r.name}</T><Spacer /><Sub>{hrs(h)}</Sub></Row>
              <View style={{ height: 8, backgroundColor: C.greySoft, borderRadius: 4 }}><View style={{ width: `${Math.max(2, (h / maxR) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: C.green }} /></View>
            </View>
          ))}
        </Card>
        <Card style={{ padding: 16, borderRadius: 18, gap: 6 }}>
          <Text style={{ fontFamily: F.head, fontSize: 24, color: C.ink }}>Vehicles and diesel</Text>
          <Sub>Diesel filled and hours worked in the period.</Sub>
          {D.vehicle.length === 0 ? <Sub>No vehicles set up.</Sub> : null}
          {D.vehicle.map((v) => {
            const os = D.vehicle_session.find((x) => x.vehicle_id === v.id && !x.stopped_at);
            const litres = D.diesel_fill.filter((x) => x.vehicle_id === v.id && ms(x.at) >= from && ms(x.at) < to).reduce((n, x) => n + num(x.litres), 0);
            const h = D.vehicle_session.filter((x) => x.vehicle_id === v.id).reduce((n, x) => n + overlap(ms(x.started_at), x.stopped_at ? ms(x.stopped_at) : Date.now(), from, to), 0);
            return (
              <Row key={v.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
                <View style={{ flex: 1 }}><T bold>{v.name}</T><Sub>{os ? `Working · ${personName(D, os.driver_id)}` : "Parked"} · {hrs(h)} worked</Sub></View>
                <View style={{ alignItems: "flex-end" }}><Text style={{ fontWeight: "700", color: C.ink }}>{Math.round(litres).toLocaleString("en-US")} L</Text>{f.period !== "today" && f.period !== "yesterday" && h > 0 && litres > 0 ? <Sub>{(litres / (h / HOUR)).toFixed(1)} L/hr</Sub> : null}</View>
              </Row>
            );
          })}
        </Card>
      </ScrollView>
    </View>
  );
}

/** A machine for the owner: how it ran, who ran it, what stopped it. */
export function MachineDrill() {
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const D = useData();
  const f = useFilter();
  const m = D.machine.find((x) => x.id === params.machineId);
  if (!m) return <Screen><Empty text="Machine not found." /></Screen>;
  const nowMs = Date.now();
  const from = f.from.getTime(), to = Math.min(f.to.getTime(), nowMs + HOUR);
  const st = machineStatus(D, m);
  const x = machineFigures(D, m, from, to);
  const runs = D.machine_run.filter((r) => r.machine_id === m.id && overlap(ms(r.started_at), r.stopped_at ? ms(r.stopped_at) : nowMs, from, to) > 0).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  const downs = D.downtime.filter((d) => d.machine_id === m.id && overlap(ms(d.started_at), d.ended_at ? ms(d.ended_at) : nowMs, from, to) > 0).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  const jobs = D.maintenance_job.filter((j) => j.machine_id === m.id && (!j.fixed_at || ms(j.fixed_at) >= from)).sort((a, b) => String(b.reported_at).localeCompare(String(a.reported_at)));
  const fig = (label: string, value: string, bad = false) => (
    <View style={{ flexBasis: "47%", flexGrow: 1 }}><Sub>{label}</Sub><Text style={{ fontFamily: F.head, fontSize: 28, color: bad ? C.red : C.ink }}>{value}</Text></View>
  );
  return (
    <Screen>
      <Text style={{ fontFamily: F.head, fontSize: 30, color: C.ink }}>{m.tag} · {m.name}</Text>
      <Sub>{m.make_model || ""}{m.make_model ? " · " : ""}{f.period === "today" ? "today" : "this period"}</Sub>
      <Card>
        <Row><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: stateColor(st.state) }} /><T bold>{st.state === "running" ? `Running since ${fmtTime(st.run!.started_at)} · ${st.operator?.full_name}` : st.state === "down" ? `${st.reason ?? "Down"}` : "Idle"}</T></Row>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
          {fig("Running", hrs(x.runMs))}
          {fig("Stopped", hrs(x.downMs), x.downMs > 0.05 * HOUR)}
          {fig("Runs", String(runs.length))}
          {fig("Output", x.out > 0 ? `${kgToTons(x.out)} t` : "-")}
        </View>
      </Card>
      <SectionTitle>Runs</SectionTitle>
      <Card>
        {runs.length === 0 ? <Sub>No runs in this period.</Sub> : runs.map((r) => {
          const helpers = D.run_helper.filter((h) => h.run_id === r.id).map((h) => personName(D, h.person_id));
          const bypass = D.run_bypass.some((b) => b.run_id === r.id);
          return (
            <Pressable key={r.id} onPress={() => nav.navigate("PersonDrill", { personId: r.operator_id })} style={{ gap: 2, paddingVertical: 6 }}>
              <Row><T bold style={{ flex: 1 }}>{personName(D, r.operator_id)}{helpers.length ? ` + ${helpers.join(", ")}` : ""}</T><Text style={{ fontWeight: "700", color: C.ink }}>{fmtDuration((r.stopped_at ? ms(r.stopped_at) : nowMs) - ms(r.started_at))}</Text></Row>
              <Sub>{fmtTime(r.started_at)}–{r.stopped_at ? fmtTime(r.stopped_at) : "now"}{r.stopped_at ? ` · ${D.stop_reason.find((s) => s.id === r.stop_reason_id)?.name ?? ""}` : ""}{bypass ? " · bypass" : ""}</Sub>
            </Pressable>
          );
        })}
      </Card>
      <SectionTitle>Stops</SectionTitle>
      <Card>
        {downs.length === 0 ? <Sub>No stops in this period.</Sub> : downs.map((d) => (
          <View key={d.id} style={{ gap: 2, paddingVertical: 6 }}>
            <Row><T bold style={{ flex: 1 }}>{D.stop_reason.find((s) => s.id === d.stop_reason_id)?.name ?? "Stopped"}</T><Text style={{ fontWeight: "700", color: C.ink }}>{fmtDuration((d.ended_at ? ms(d.ended_at) : nowMs) - ms(d.started_at))}</Text></Row>
            <Sub>{fmtTime(d.started_at)}–{d.ended_at ? fmtTime(d.ended_at) : "now"}{d.notes ? ` · ${d.notes}` : ""}</Sub>
          </View>
        ))}
      </Card>
      <SectionTitle>Maintenance</SectionTitle>
      <Card>
        {jobs.length === 0 ? <Sub>No jobs.</Sub> : jobs.map((j) => (
          <Pressable key={j.id} onPress={() => nav.navigate("Job", { jobId: j.id })} style={{ flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 6 }}>
            <T style={{ flex: 1 }}>{j.problem}</T>
            <Badge text={j.fixed_at ? "Fixed" : "Open"} tone={j.fixed_at ? "good" : "warn"} />
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}

/** One truck, with both weighings. */
export function TruckDrill() {
  const { params } = useRoute<any>();
  const D = useData();
  const t = D.weigh_ticket.find((x) => x.id === params.ticketId);
  if (!t) return <Screen><Empty text="Truck not found." /></Screen>;
  const isIn = t.direction === "in";
  const batch = t.batch_id ? D.yard_batch.find((b) => b.id === t.batch_id) : null;
  const m = [t.moisture_1, t.moisture_2, t.moisture_3].filter((v) => v != null).map(Number);
  const rows: [string, string][] = [
    [isIn ? "Supplier" : "Buyer", (isIn ? D.supplier : D.buyer).find((p) => p.id === (isIn ? t.supplier_id : t.buyer_id))?.name ?? "-"],
    [isIn ? "Material" : "Product", D.material.find((x) => x.id === t.material_id)?.name ?? "-"],
    [isIn ? "First weight (gross)" : "First weight (empty)", `${num(t.first_kg).toLocaleString("en-US")} kg at ${fmtTime(t.first_at)}`],
    ["Second weight", t.second_kg != null ? `${num(t.second_kg).toLocaleString("en-US")} kg at ${fmtTime(t.second_at)}` : "Not yet weighed out"],
    ["Net", t.second_kg != null ? `${(ticketNet(t) ?? 0).toLocaleString("en-US")} kg` : "-"],
    ...(isIn ? [["Moisture (average)", m.length ? `${(m.reduce((a, b) => a + b, 0) / m.length).toFixed(1)}%` : "-"] as [string, string], ["Unloaded at", batch ? `${D.yard.find((y) => y.id === batch.yard_id)?.name} · ${batchCode(D, batch)}` : "-"] as [string, string]] : [["Challan", String(t.challan_no ?? "-")] as [string, string]]),
    ["Driver", [t.driver_name, t.driver_contact].filter(Boolean).join(" · ") || "-"],
    ["Weighed by", personName(D, t.entered_by)],
  ];
  return (
    <Screen>
      <Text style={{ fontFamily: F.head, fontSize: 30, color: C.ink }}>W.B.S.N. {t.wbsn} · {t.vehicle_no}</Text>
      <Card>
        {rows.map(([k, v]) => <View key={k} style={{ paddingVertical: 5 }}><Sub>{k}</Sub><T bold>{v}</T></View>)}
      </Card>
    </Screen>
  );
}

// -------------------------------------------------------------- people ----

const attIn = (D: Data, from: number, to: number) => D.attendance.filter((a) => ms(a.gate_in) >= from && ms(a.gate_in) < to);

/** The owner's People tab. */
export function OwnerPeople() {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const D = useData();
  const f = useFilter();
  const name = session!.person.full_name;
  const w = shiftWindow(D.shift);
  const from = f.from.getTime(), to = f.to.getTime(), nowMs = Date.now();
  const att = attIn(D, from, to);
  const came = [...new Set(att.map((a) => a.person_id as string))];
  const site = onSiteMap(D).size;
  const fresh = D.person.filter((p) => p.active && !p.checked).length;
  const byRole = new Map<string, number>();
  for (const id of came) byRole.set(mainRole(D, id) ?? "No role", (byRole.get(mainRole(D, id) ?? "No role") ?? 0) + 1);
  const roles = [...byRole.entries()].sort((a, b) => b[1] - a[1]);
  const maxRole = roles[0]?.[1] || 1;
  const ops = D.person.filter((p) => D.machine_run.some((r) => r.operator_id === p.id && overlap(ms(r.started_at), r.stopped_at ? ms(r.stopped_at) : nowMs, from, to) > 0)).map((p) => {
    const runs = D.machine_run.filter((r) => r.operator_id === p.id && overlap(ms(r.started_at), r.stopped_at ? ms(r.stopped_at) : nowMs, from, to) > 0);
    return {
      p, h: runs.reduce((n, r) => n + overlap(ms(r.started_at), r.stopped_at ? ms(r.stopped_at) : nowMs, from, to), 0),
      tags: [...new Set(runs.map((r) => D.machine.find((m) => m.id === r.machine_id)?.tag))].join(", "),
      shifts: new Set(runs.map((r) => String(r.started_at).slice(0, 13))).size,
      readings: D.log_reading.filter((r) => r.by === p.id && ms(r.at) >= from && ms(r.at) < to).length,
      bypass: D.run_bypass.filter((b) => runs.some((r) => r.id === b.run_id)).length,
    };
  }).sort((a, b) => b.h - a.h);
  const fig = (label: string, value: number, bad = false) => <View style={{ flex: 1 }}><Sub>{label}</Sub><Text style={{ fontFamily: F.head, fontSize: 30, color: bad ? C.red : C.ink }}>{value}</Text></View>;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="People" subtitle={`${name} · ${w ? `${w.shift.name} shift` : "Off-shift"}`} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32, gap: 14 }}>
        <FilterBar withMaterial={false} />
        <Card style={{ padding: 16, borderRadius: 18, gap: 8 }}>
          <Row><Text style={{ fontFamily: F.head, fontSize: 24, color: C.ink, flex: 1 }}>Attendance</Text><Btn small kind="ghost" title="Everyone" onPress={() => nav.navigate("PeopleList", {})} /></Row>
          <Sub>From the gate register (security) and on-duty marks (supervisor).</Sub>
          <Row>{fig("On site now", site)}{fig("Came in", came.length)}{fig("New, to check", fresh, fresh > 0)}</Row>
          <Text style={{ fontFamily: F.head, fontSize: 20, color: C.ink, marginTop: 4 }}>By role</Text>
          {roles.length === 0 ? <Sub>Nobody came in during this period.</Sub> : roles.map(([r, n]) => (
            <Pressable key={r} onPress={() => nav.navigate("PeopleList", { role: r })} style={{ gap: 3 }}>
              <Row><T>{r}</T><Spacer /><Sub>{n}</Sub></Row>
              <View style={{ height: 8, backgroundColor: C.greySoft, borderRadius: 4 }}><View style={{ width: `${Math.max(3, (n / maxRole) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: C.green }} /></View>
            </Pressable>
          ))}
        </Card>
        <Card style={{ padding: 16, borderRadius: 18, gap: 4 }}>
          <Text style={{ fontFamily: F.head, fontSize: 24, color: C.ink }}>Operators</Text>
          {ops.length === 0 ? <Sub>No machine runs in this period.</Sub> : null}
          {ops.map(({ p, h, tags, shifts, readings, bypass }) => (
            <Pressable key={p.id} onPress={() => nav.navigate("PersonDrill", { personId: p.id })} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
              <Avatar text={initialsOf(p.full_name)} size={40} />
              <View style={{ flex: 1 }}><T bold>{p.full_name}</T><Sub>{tags} · {shifts} shifts · {readings} readings · {bypass} bypass</Sub></View>
              <Text style={{ fontWeight: "700", color: C.ink }}>{hrs(h)}</Text>
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </View>
  );
}

/** Everyone who came in during the period, or one role. */
export function PeopleList() {
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const D = useData();
  const f = useFilter();
  const from = f.from.getTime(), to = f.to.getTime();
  const site = onSiteMap(D);
  const att = attIn(D, from, to);
  const ids = [...new Set(att.map((a) => a.person_id as string))].filter((id) => !params?.role || (mainRole(D, id) ?? "No role") === params.role);
  const lastOf = (id: string) => att.filter((a) => a.person_id === id).sort((a, b) => String(b.gate_in).localeCompare(String(a.gate_in)))[0];
  return (
    <Screen>
      <Text style={{ fontFamily: F.head, fontSize: 28, color: C.ink }}>{params?.role ? `${params.role}s` : "Everyone who came in"}</Text>
      <Sub>{ids.length} people</Sub>
      {ids.length === 0 ? <Empty text="Nobody." /> : null}
      {ids.map((id) => {
        const p = D.person.find((x) => x.id === id);
        const a = lastOf(id);
        if (!p || !a) return null;
        return (
          <Card key={id} onPress={() => nav.navigate("PersonDrill", { personId: id })} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16 }}>
            <Avatar text={initialsOf(p.full_name)} size={42} />
            <View style={{ flex: 1 }}>
              <Row><T bold>{p.full_name}</T>{!p.checked ? <Badge text="New" tone="info" /> : null}</Row>
              <Sub>{rolesOf(D, id).join(", ")} · in {fmtTime(a.gate_in)} · {a.on_duty_at ? `on duty ${fmtTime(a.on_duty_at)}` : "not marked on duty"}</Sub>
            </View>
            {site.has(id) ? <Badge text="On site" tone="good" /> : <Sub>Out {a.gate_out ? fmtTime(a.gate_out) : ""}</Sub>}
          </Card>
        );
      })}
    </Screen>
  );
}

/** One person: gate and duty, machines, and jobs, for the period. */
export function PersonDrill() {
  const { params } = useRoute<any>();
  const D = useData();
  const f = useFilter();
  const p = D.person.find((x) => x.id === params.personId);
  if (!p) return <Screen><Empty text="Person not found." /></Screen>;
  const from = f.from.getTime(), to = f.to.getTime(), nowMs = Date.now();
  const att = attIn(D, from, to).filter((a) => a.person_id === p.id).sort((a, b) => String(b.gate_in).localeCompare(String(a.gate_in)));
  const helperRuns = new Set(D.run_helper.filter((h) => h.person_id === p.id).map((h) => h.run_id as string));
  const runs = D.machine_run.filter((r) => (r.operator_id === p.id || helperRuns.has(r.id)) && overlap(ms(r.started_at), r.stopped_at ? ms(r.stopped_at) : nowMs, from, to) > 0).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  const jobs = D.maintenance_job.filter((j) => j.fitter_id === p.id && ms(j.started_at) < to && (!j.fixed_at || ms(j.fixed_at) >= from));
  const runMs = runs.reduce((n, r) => n + overlap(ms(r.started_at), r.stopped_at ? ms(r.stopped_at) : nowMs, from, to), 0);
  const fig = (label: string, value: string) => <View style={{ flex: 1 }}><Sub>{label}</Sub><Text style={{ fontFamily: F.head, fontSize: 28, color: C.ink }}>{value}</Text></View>;
  return (
    <Screen>
      <Text style={{ fontFamily: F.head, fontSize: 30, color: C.ink }}>{p.full_name}</Text>
      <Sub>{rolesOf(D, p.id).join(", ")}{p.mobile ? ` · ${p.mobile}` : ""}</Sub>
      {!p.checked ? <Card style={{ backgroundColor: C.amberSoft }}><Text style={{ color: C.amber }}>New worker, registered {fmtDateTime(p.registered_at)} by {personName(D, p.registered_by)}. The supervisor has not checked the details yet.</Text></Card> : null}
      <Card><Row>{fig("Shifts on site", String(att.length))}{fig(jobs.length ? "Jobs taken" : "On machines", jobs.length ? String(jobs.length) : hrs(runMs))}{fig("On site now", onSiteMap(D).has(p.id) ? "Yes" : "No")}</Row></Card>
      <SectionTitle>Gate and duty</SectionTitle>
      <Card>
        {att.length === 0 ? <Sub>No gate entries in this period.</Sub> : att.map((a) => (
          <View key={a.id} style={{ paddingVertical: 5 }}>
            <Row><T bold style={{ flex: 1 }}>In {fmtTime(a.gate_in)}{a.on_duty_at ? ` · on duty ${fmtTime(a.on_duty_at)}` : ""}</T>{a.gate_out ? <Sub>Out {fmtTime(a.gate_out)}</Sub> : <Badge text="On site" tone="good" />}</Row>
            <Sub>Gate: {personName(D, a.gate_by)}{a.on_duty_by ? ` · duty: ${personName(D, a.on_duty_by)}` : ""}</Sub>
          </View>
        ))}
      </Card>
      <SectionTitle>Machines</SectionTitle>
      <Card>
        {runs.length === 0 ? <Sub>No machine runs in this period.</Sub> : runs.map((r) => (
          <View key={r.id} style={{ paddingVertical: 5 }}>
            <Row><T bold style={{ flex: 1 }}>{D.machine.find((m) => m.id === r.machine_id)?.tag} · {r.operator_id === p.id ? "Operator" : "Helper"}</T><Sub>{hrs(overlap(ms(r.started_at), r.stopped_at ? ms(r.stopped_at) : nowMs, from, to))}</Sub></Row>
            <Sub>{fmtTime(r.started_at)}–{r.stopped_at ? fmtTime(r.stopped_at) : "now"}{D.run_bypass.some((b) => b.run_id === r.id) ? " · bypass" : ""}</Sub>
          </View>
        ))}
      </Card>
      {jobs.length ? (
        <>
          <SectionTitle>Maintenance jobs</SectionTitle>
          <Card>{jobs.map((j) => <Row key={j.id} style={{ paddingVertical: 4 }}><T style={{ flex: 1 }}>{D.machine.find((m) => m.id === j.machine_id)?.tag}: {j.problem}</T><Badge text={j.fixed_at ? "Fixed" : "Open"} tone={j.fixed_at ? "good" : "warn"} /></Row>)}</Card>
        </>
      ) : null}
    </Screen>
  );
}

void yardUsedPct; void DAY; void useMemo;
