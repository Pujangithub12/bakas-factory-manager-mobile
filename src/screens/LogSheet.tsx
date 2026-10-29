import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Card, Empty, Pill, Row, ScreenHeader, SectionTitle, Spacer, Sub, T, Text, Badge, C, F, initialsOf } from "../ui";
import { useAuth } from "../auth";
import { useData } from "../store";
import { canRun, fieldsFor, machineStatus, num, pelletKg, briquetteKg, personName } from "../rules";
import { fmtDuration, fmtTime, productionDayStart, shiftWindow } from "../time";

const DOT = { running: C.ok, down: C.red, idle: C.grey } as const;

/** Today's log sheet for the operator's machines: runs, readings and counts. Management corrects entries on the laptop. */
export default function LogSheet() {
  const nav = useNavigation<any>();
  const { session, roles } = useAuth();
  const D = useData();
  const me = session!.person.id;
  const [sel, setSel] = useState<string | null>(null);
  const machines = D.machine.filter((m) => canRun(D, me, m, roles)).sort((a, b) => a.tag.localeCompare(b.tag));
  const m = machines.find((x) => x.id === sel) ?? machines[0];
  const name = session!.person.full_name;
  const w = shiftWindow(D.shift);

  const dayStart = productionDayStart();
  const now = new Date();
  const runs = m ? D.machine_run.filter((r) => r.machine_id === m.id && new Date(r.stopped_at ?? now).getTime() > dayStart.getTime()).sort((a, b) => a.started_at.localeCompare(b.started_at)) : [];
  const runMs = runs.reduce((n, r) => n + (new Date(r.stopped_at ?? now).getTime() - Math.max(new Date(r.started_at).getTime(), dayStart.getTime())), 0);
  const fields = m ? fieldsFor(D, m.stage, "reading") : [];
  const readings = m ? D.log_reading.filter((r) => r.machine_id === m.id && new Date(r.at) >= dayStart).sort((a, b) => b.at.localeCompare(a.at)) : [];
  const made = !m ? null : m.stage === "pellet" ? pelletKg(D, dayStart, now) : m.stage === "briquette" ? briquetteKg(D, dayStart, now, m.id) : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Log sheet" subtitle={`${name}${w ? ` · ${w.shift.name} shift` : ""}`} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}>
        {machines.length === 0 ? <Empty text="No machine is ticked for you yet." /> : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {machines.map((x) => <Pill key={x.id} label={x.tag} dot={DOT[machineStatus(D, x).state]} selected={x.id === m?.id} onPress={() => setSel(x.id)} />)}
            </ScrollView>
            <Card>
              <Text style={{ fontFamily: F.head, fontSize: 28, color: C.ink }}>{m?.name}</Text>
              <Sub>Production day from 06:00</Sub>
              <Row style={{ gap: 24, marginTop: 6 }}>
                <View><Text style={{ fontFamily: F.head, fontSize: 30, color: C.ink }}>{fmtDuration(runMs)}</Text><Sub>Run time</Sub></View>
                <View><Text style={{ fontFamily: F.head, fontSize: 30, color: C.ink }}>{readings.length}</Text><Sub>Readings</Sub></View>
                {made != null ? <View><Text style={{ fontFamily: F.head, fontSize: 30, color: C.ink }}>{(made / 1000).toFixed(1)} t</Text><Sub>{m!.stage === "pellet" ? "Pellets" : "Briquettes"}</Sub></View> : null}
              </Row>
            </Card>

            <SectionTitle>Runs today</SectionTitle>
            {runs.length === 0 ? <Sub>No runs yet today.</Sub> : runs.map((r) => (
              <Card key={r.id}>
                <Row><T bold>{fmtTime(r.started_at)} – {r.stopped_at ? fmtTime(r.stopped_at) : "now"}</T><Spacer />{r.stopped_at ? null : <Badge text="Running" tone="good" />}</Row>
                <Sub>{personName(D, r.operator_id)}{D.stop_reason.find((s) => s.id === r.stop_reason_id) ? ` · ${D.stop_reason.find((s) => s.id === r.stop_reason_id)!.name}` : ""}</Sub>
              </Card>
            ))}

            <SectionTitle>Hourly readings</SectionTitle>
            {readings.length === 0 ? <Sub>No readings yet today.</Sub> : readings.map((r) => (
              <Card key={r.id}>
                <Row><T bold>{fmtTime(r.at)}</T><Spacer /><Sub>{personName(D, r.by)}</Sub></Row>
                <Sub>
                  {fields.length ? fields.map((f) => `${f.label}: ${r.vals?.[f.field_key] ?? "-"}${f.unit ? ` ${f.unit}` : ""}`).join("   ") : null}
                  {m?.stage === "briquette" && !fields.some((f) => f.field_key === "oneMin") ? `1-minute weight: ${num(r.one_min_kg)} kg` : ""}
                </Sub>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
