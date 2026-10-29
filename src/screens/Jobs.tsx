import React, { useState } from "react";
import { View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Screen, H, Sub, Card, T, Badge, Row, Btn, Field, SectionTitle, Empty, C, Spacer, say, useAction, ScreenHeader, initialsOf } from "../ui";
import { useAuth } from "../auth";
import { save, useData } from "../store";
import { hasRole, isManagement, machineOf, personName } from "../rules";
import { fmtDateTime, nowIso, type Row as R } from "../time";

const kindTone = (k: string) => (k === "breakdown" || k === "bypass" ? "bad" : k === "wear" ? "warn" : "info");

export default function Jobs() {
  const nav = useNavigation<any>();
  const route = useRoute();
  const { session } = useAuth();
  const D = useData();

  const open = D.maintenance_job.filter((j) => !j.fixed_at);
  const reported = open.filter((j) => !j.fitter_id).sort((a, b) => a.reported_at.localeCompare(b.reported_at));
  const working = open.filter((j) => j.fitter_id).sort((a, b) => a.reported_at.localeCompare(b.reported_at));
  const fixed = D.maintenance_job.filter((j) => j.fixed_at).sort((a, b) => b.fixed_at.localeCompare(a.fixed_at)).slice(0, 15);

  const card = (j: R) => (
    <Card key={j.id} onPress={() => nav.navigate("Job", { jobId: j.id })}>
      <Row>
        <T bold style={{ fontSize: 16 }}>{machineOf(D, j.machine_id)?.tag}</T>
        <Badge text={j.kind} tone={kindTone(j.kind) as any} />
        {j.machine_stopped && !j.fixed_at ? <Badge text="Machine down" tone="bad" /> : null}
      </Row>
      <T>{j.problem}</T>
      <Sub>{personName(D, j.reported_by)} · {fmtDateTime(j.reported_at)}{j.fitter_id ? ` · ${personName(D, j.fitter_id)} working` : ""}</Sub>
    </Card>
  );

  const content = (
    <Screen>
      <Btn title="Report a problem" onPress={() => nav.navigate("ReportProblem")} />
      <SectionTitle>Reported ({reported.length})</SectionTitle>
      {reported.length === 0 ? <Sub>Nothing waiting.</Sub> : reported.map(card)}
      <SectionTitle>Working on it ({working.length})</SectionTitle>
      {working.length === 0 ? <Sub>Nothing in progress.</Sub> : working.map(card)}
      <SectionTitle>Fixed recently</SectionTitle>
      {fixed.length === 0 ? <Sub>None yet.</Sub> : fixed.map(card)}
    </Screen>
  );

  // As the "Problems" tab it carries its own header; opened from a tile it uses the stack header.
  if (route.name !== "Problems") return content;
  const name = session!.person.full_name;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Problems" subtitle={`${open.length} open`} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} />
      {content}
    </View>
  );
}

export function Job() {
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const { session, roles } = useAuth();
  const D = useData();
  const me = session!.person.id;
  const j = D.maintenance_job.find((x) => x.id === params.jobId);
  const [work, setWork] = useState("");
  const [parts, setParts] = useState("");
  const { busy, run } = useAction();
  if (!j) return <Screen><Empty text="Job not found." /></Screen>;

  const fitter = hasRole(roles, "Fitter") || isManagement(roles);
  const mineOrMgmt = j.fitter_id === me || isManagement(roles);
  const status = j.fixed_at ? "Fixed" : j.fitter_id ? "Working on it" : "Reported";

  const take = () => run(() => save({ table: "maintenance_job", row: { id: j.id, fitter_id: me, started_at: nowIso() } }));

  const fix = () =>
    run(async () => {
      if (!work.trim()) throw new Error("Write the work done");
      const now = nowIso();
      const writes: Parameters<typeof save> = [{ table: "maintenance_job", row: { id: j.id, fixed_at: now, work_done: work.trim(), parts_used: parts.trim() || null } }];
      // The machine stops being Down when its job is fixed.
      const dt = j.downtime_id ? D.downtime.find((d) => d.id === j.downtime_id) : null;
      if (dt && !dt.ended_at) writes.push({ table: "downtime", row: { id: dt.id, ended_at: now } });
      await save(...writes);
      say("Fixed", j.machine_stopped ? `${machineOf(D, j.machine_id)?.tag} can be restarted.` : undefined);
      nav.goBack();
    });

  return (
    <Screen>
      <Row><H>{machineOf(D, j.machine_id)?.tag}</H><Badge text={j.kind} tone={kindTone(j.kind) as any} /><Spacer /><Badge text={status} tone={j.fixed_at ? "good" : j.fitter_id ? "info" : "warn"} /></Row>
      <Card>
        <T bold style={{ fontSize: 17 }}>{j.problem}</T>
        {j.note ? <T>{j.note}</T> : null}
        {j.when_needed ? <Sub>Needed: {j.when_needed}</Sub> : null}
        <Sub>Reported by {personName(D, j.reported_by)} · {fmtDateTime(j.reported_at)}</Sub>
        {j.machine_stopped && !j.fixed_at ? <T style={{ color: C.red }}>The machine stays Down until this is fixed.</T> : null}
        {j.fitter_id ? <Sub>{personName(D, j.fitter_id)} took it {fmtDateTime(j.started_at)}</Sub> : null}
        {j.fixed_at ? <Sub>Fixed {fmtDateTime(j.fixed_at)}</Sub> : null}
      </Card>
      {j.fixed_at ? (
        <Card>
          <Sub>Work done</Sub><T>{j.work_done}</T>
          {j.parts_used ? <><Sub>Parts used</Sub><T>{j.parts_used}</T></> : null}
        </Card>
      ) : !j.fitter_id ? (
        fitter ? <Btn title="Take this job" onPress={take} busy={busy} /> : <Sub>Only a fitter can take this job.</Sub>
      ) : mineOrMgmt ? (
        <View style={{ gap: 10 }}>
          <Field label="Work done" value={work} onChangeText={setWork} multiline />
          <Field label="Parts used (optional)" value={parts} onChangeText={setParts} multiline />
          <Btn title="Mark fixed" onPress={fix} busy={busy} />
        </View>
      ) : (
        <Sub>{personName(D, j.fitter_id)} is working on it.</Sub>
      )}
    </Screen>
  );
}
