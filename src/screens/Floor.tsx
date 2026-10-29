import React from "react";
import { useNavigation, useRoute } from "@react-navigation/native";
import { View } from "react-native";
import { Screen, H, Sub, Card, T, Badge, Row, SectionTitle, C, Spacer, ScreenHeader, initialsOf } from "../ui";
import { useAuth } from "../auth";
import { useData } from "../store";
import { activeBatch, batchCode, batchMaterial, batchTickets, machineAlerts, machineStatus, onSiteMap } from "../rules";
import { fmtTime } from "../time";

/** All machines on one screen, with what needs a look. */
export default function Floor() {
  const nav = useNavigation<any>();
  const route = useRoute();
  const { session } = useAuth();
  const D = useData();
  const machines = [...D.machine].sort((a, b) => a.tag.localeCompare(b.tag)).map((m) => ({ m, st: machineStatus(D, m), alerts: machineAlerts(D, m) }));
  const attention = machines.filter((x) => x.alerts.length);
  const running = machines.filter((x) => x.st.state === "running").length;
  const batches = D.yard.map((y) => ({ y, b: activeBatch(D, y.id) })).filter((x) => x.b);

  const body = (
    <Screen>
      {route.name === "Machines" || route.name === "FloorHome" ? null : <H>Floor</H>}
      <Sub>{running} of {machines.length} machines running · {onSiteMap(D).size} people on site</Sub>

      <SectionTitle>Needs a look ({attention.length})</SectionTitle>
      {attention.length === 0 ? <Sub>Nothing needs attention.</Sub> : null}
      {attention.map(({ m, alerts }) => (
        <Card key={m.id} onPress={() => nav.navigate("Machine", { machineId: m.id })}>
          <Row><T bold>{m.tag}</T><Sub>{m.name}</Sub></Row>
          <Row style={{ flexWrap: "wrap" }}>{alerts.map((a) => <Badge key={a.key} text={a.text} tone={a.tone === "bad" ? "bad" : "warn"} />)}</Row>
        </Card>
      ))}

      <SectionTitle>All machines</SectionTitle>
      {machines.map(({ m, st }) => (
        <Card key={m.id} onPress={() => nav.navigate("Machine", { machineId: m.id })}>
          <Row>
            <T bold style={{ fontSize: 16 }}>{m.tag}</T>
            <Sub>{m.name}</Sub>
            <Spacer />
            <Badge text={st.state === "running" ? "Running" : st.state === "down" ? "Down" : "Idle"} tone={st.state === "running" ? "good" : st.state === "down" ? "bad" : "mute"} />
          </Row>
          {st.run ? <Sub>{st.operator?.full_name} since {fmtTime(st.run.started_at)}</Sub> : null}
          {st.state === "down" ? <Sub style={{ color: C.red }}>{st.reason}</Sub> : null}
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
