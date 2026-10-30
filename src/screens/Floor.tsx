import React from "react";
import { useNavigation, useRoute } from "@react-navigation/native";
import { View } from "react-native";
import { Screen, H, Sub, Card, T, Text, Badge, Row, SectionTitle, StatusDot, Icon, C, F, Spacer, ScreenHeader, initialsOf } from "../ui";
import { useAuth } from "../auth";
import { useData } from "../store";
import { activeBatch, batchCode, batchMaterial, batchTickets, lastReading, machineAlerts, machineStatus, onSiteMap, openJobs, personName } from "../rules";
import { fmtDayTime, fmtTime, MIN } from "../time";

type Flag = { tone: "bad" | "warn"; icon: "warning-outline" | "construct-outline" | "time-outline"; text: string };

function Stat({ value, label, alert }: { value: number; label: string; alert?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: alert ? C.amberSoft : C.card, borderRadius: 16, borderWidth: 1, borderColor: alert ? C.amber : C.line, padding: 14, gap: 2 }}>
      <Text style={{ fontFamily: F.head, fontSize: 36, lineHeight: 40, color: alert ? C.red : C.ink }}>{value}</Text>
      <Text style={{ color: C.sub, fontSize: 14 }}>{label}</Text>
    </View>
  );
}

/** All machines on one screen: how many are running or down, and what needs a look on each. */
export default function Floor() {
  const nav = useNavigation<any>();
  const route = useRoute();
  const { session } = useAuth();
  const D = useData();
  const nowMs = Date.now();

  const machines = [...D.machine].sort((a, b) => a.tag.localeCompare(b.tag)).map((m) => {
    const st = machineStatus(D, m);
    const alerts = machineAlerts(D, m);
    const flags: Flag[] = [];

    if (st.run && st.bypass) {
      const b = D.run_bypass.find((x) => x.run_id === st.run!.id);
      const no = D.prestart_answer.filter((a) => a.run_id === st.run!.id && a.answer === false).map((a) => D.log_field.find((f) => f.id === a.field_id)?.label ?? "?");
      flags.push({ tone: "bad", icon: "warning-outline", text: `Bypass${no.length ? `: ${no.join(", ")} marked No` : ""}${b?.remark ? `. "${b.remark}"` : ""}` });
    }
    if (st.run && alerts.some((a) => a.key === "late")) {
      const started = new Date(st.run.started_at).getTime();
      const last = lastReading(D, m.id);
      const due = Math.max(last ? new Date(last.at).getTime() : 0, started) + 60 * MIN;
      flags.push({ tone: "warn", icon: "time-outline", text: `Hourly reading late since ${fmtTime(new Date(due))}` });
    }
    const jobs = openJobs(D, m.id).sort((a, b) => Number(!!b.machine_stopped) - Number(!!a.machine_stopped));
    if (jobs.length) {
      const j = jobs[0];
      flags.push({
        tone: j.machine_stopped ? "bad" : "warn",
        icon: "construct-outline",
        text: `${j.problem}${j.fitter_id ? ` · ${personName(D, j.fitter_id)} on it` : " · waiting for a fitter"}${jobs.length > 1 ? ` (+${jobs.length - 1} more open)` : ""}`,
      });
    }
    const long = alerts.find((a) => a.key === "long");
    if (long) flags.push({ tone: "warn", icon: "warning-outline", text: `${long.text}. Was the stop missed?` });

    const openDown = D.downtime.find((d) => d.machine_id === m.id && !d.ended_at);
    const planned = st.state === "down" && D.stop_reason.find((r) => r.id === openDown?.stop_reason_id)?.type === "Planned";
    const lastRun = D.machine_run.filter((r) => r.machine_id === m.id && r.stopped_at).sort((a, b) => String(b.stopped_at).localeCompare(String(a.stopped_at)))[0];
    const line = st.run
      ? `${st.operator?.full_name ?? "?"} · since ${fmtTime(st.run.started_at)}`
      : st.state === "down"
        ? `${st.reason ?? "Down"}${openDown ? ` since ${fmtTime(openDown.started_at)}` : ""}`
        : lastRun ? `Last stop ${fmtDayTime(lastRun.stopped_at)}` : "-";
    const color = st.run ? C.ok : st.state === "down" ? (planned ? C.amber : C.red) : C.grey;
    const word = st.run ? (st.bypass ? "On bypass" : "Running") : st.state === "down" ? (planned ? "Stopped" : "Down") : "Idle";
    return { m, st, flags, line, color, word };
  });

  const running = machines.filter((x) => x.st.state === "running").length;
  const down = machines.filter((x) => x.st.state === "down").length;
  const need = machines.filter((x) => x.flags.length > 0).length;
  const batches = D.yard.map((y) => ({ y, b: activeBatch(D, y.id) })).filter((x) => x.b);

  const body = (
    <Screen>
      {route.name === "Machines" || route.name === "FloorHome" ? null : <H>Floor</H>}
      <Sub>{running} of {machines.length} machines running · {onSiteMap(D).size} people on site</Sub>

      <Row style={{ gap: 12, alignItems: "stretch" }}>
        <Stat value={running} label="Running" />
        <Stat value={down} label="Down" alert={down > 0} />
        <Stat value={need} label="Need a look" alert={need > 0} />
      </Row>

      {machines.map(({ m, flags, line, color, word }) => (
        <Card key={m.id} onPress={() => nav.navigate("Machine", { machineId: m.id })} style={{ borderTopWidth: 5, borderTopColor: color, gap: 6 }}>
          <Row>
            <View style={{ backgroundColor: C.greySoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 13, color: C.sub, fontWeight: "600" }}>{m.tag}</Text>
            </View>
            <T bold style={{ fontSize: 17, marginLeft: 8 }}>{m.name}</T>
            <Spacer />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.greySoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
              <StatusDot color={color} size={9} />
              <Text style={{ fontSize: 14, color: C.ink, fontWeight: "600" }}>{word}</Text>
            </View>
          </Row>
          <Sub>{line}</Sub>
          {flags.map((f, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <Icon name={f.icon} size={18} color={f.tone === "bad" ? C.red : C.amber} />
              <Text style={{ flex: 1, fontSize: 14, color: f.tone === "bad" ? C.red : C.amber }}>{f.text}</Text>
            </View>
          ))}
        </Card>
      ))}

      <SectionTitle>Yards</SectionTitle>
      {batches.length === 0 ? <Sub>All yards are empty.</Sub> : null}
      {batches.map(({ y, b }) => (
        <Card key={y.id}>
          <Row><T bold>{batchCode(D, b!)}</T><Sub>{batchMaterial(D, b!)?.name ?? "no truck yet"}</Sub><Spacer />
            <Badge text={b!.started_at ? "Feeding" : b!.closed_at ? "Closed" : "Filling"} tone={b!.started_at ? "info" : b!.closed_at ? "warn" : "good"} /></Row>
          <Sub>{batchTickets(D, b!.id).length}/{y.holds_trucks ?? "-"} trucks</Sub>
        </Card>
      ))}
    </Screen>
  );

  // As the Machines tab it carries its own header.
  if (route.name !== "Machines" && route.name !== "FloorHome") return body;
  const name = session!.person.full_name;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title={route.name === "FloorHome" ? "Floor" : "Machines"} subtitle={`${running} of ${machines.length} running`} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} />
      {body}
    </View>
  );
}