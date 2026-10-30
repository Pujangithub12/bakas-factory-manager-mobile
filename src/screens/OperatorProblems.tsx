import React from "react";
import { ScrollView, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Badge, Btn, C, Card, Empty, F, Icon, Row, ScreenHeader, Spacer, Sub, T, Text, initialsOf } from "../ui";
import { useAuth } from "../auth";
import { useData } from "../store";
import { canRun, machineOf, onSiteMap, personName } from "../rules";
import { DAY, fmtDayTime } from "../time";

const ms = (v: any) => new Date(v).getTime();

/** One step of a job: filled dot when it has happened, with the time and who. */
function Step({ label, at, who }: { label: string; at?: string | null; who?: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: at ? C.ok : C.line }} />
        <Text style={{ fontFamily: F.bodyBold, fontSize: 13, color: at ? C.ink : C.sub }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 12, color: C.sub }}>{at ? fmtDayTime(at) : "-"}</Text>
      {at && who ? <Text style={{ fontSize: 12, color: C.sub }}>{who}</Text> : null}
    </View>
  );
}

/** Problems on the operator's machines in the last 3 days, from reported to fixed. Maintenance sees them as soon as they are sent. */
export default function OperatorProblems() {
  const nav = useNavigation<any>();
  const { session, roles } = useAuth();
  const D = useData();
  const me = session!.person.id;
  const name = session!.person.full_name;
  const nowMs = Date.now();

  const mine = new Set(D.machine.filter((m) => canRun(D, me, m, roles)).map((m) => m.id as string));
  const running = D.machine_run.find((r) => !r.stopped_at && r.operator_id === me);
  const checkedIn = onSiteMap(D).has(me);

  const jobs = D.maintenance_job
    .filter((j) => (mine.has(j.machine_id) || j.reported_by === me) && (!j.fixed_at || ms(j.fixed_at) > nowMs - 3 * DAY))
    .sort((a, b) => Number(!!a.fixed_at) - Number(!!b.fixed_at) || String(b.reported_at).localeCompare(String(a.reported_at)));
  const open = jobs.filter((j) => !j.fixed_at).length;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Problems" subtitle={`${open} open`} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}>
        {checkedIn ? (
          <Btn title="Report a problem" onPress={() => nav.navigate("ReportProblem", running ? { machineId: running.machine_id } : undefined)} />
        ) : (
          <Badge text="You are not checked in at the gate" tone="warn" />
        )}
        <Sub>Problems on your machines in the last 3 days. Maintenance sees them as soon as you send.</Sub>

        {jobs.length === 0 ? <Empty text="No problems reported." /> : null}

        {jobs.map((j) => {
          const m = machineOf(D, j.machine_id);
          const status = j.fixed_at ? { text: "Fixed", tone: "good" } : j.started_at ? { text: "Working", tone: "warn" } : { text: "Waiting", tone: "bad" };
          return (
            <Card key={j.id}>
              <Row>
                <View style={{ backgroundColor: C.greySoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 13, color: C.sub, fontWeight: "600" }}>{m?.tag ?? "?"}</Text>
                </View>
                <T bold style={{ fontSize: 16, marginLeft: 8 }}>{m?.name ?? ""}</T>
                <Spacer />
                <Badge text={status.text} tone={status.tone as any} />
              </Row>
              <T>
                <T bold>{j.problem}</T>
                {j.note ? ` · ${j.note}` : ""}
                {j.when_needed ? ` (needed ${j.when_needed})` : ""}
              </T>
              {j.machine_stopped && !j.fixed_at ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Icon name="warning-outline" size={18} color={C.red} />
                  <Text style={{ flex: 1, color: C.red, fontSize: 14 }}>The machine is stopped until this is fixed.</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                <Step label="Reported" at={j.reported_at} who={personName(D, j.reported_by)} />
                <Step label="Fitter on it" at={j.started_at} who={j.fitter_id ? personName(D, j.fitter_id) : ""} />
                <Step label="Fixed" at={j.fixed_at} />
              </View>
              {j.work_done ? <Sub>{j.work_done}{j.parts_used ? ` · parts: ${j.parts_used}` : ""}</Sub> : null}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}