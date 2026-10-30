import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Badge, Btn, C, Card, Chips, Empty, F, Field, Pill, Row, ScreenHeader, SectionTitle, Spacer, Sub, T, Text, initialsOf, say, useAction } from "../ui";
import { useAuth } from "../auth";
import { newId, save, useData } from "../store";
import { briquetteKg, canRun, dieCounter, machineStatus, num, pelletKg, personName, stageRunMs } from "../rules";
import { DAY, fmtDayTime, fmtTime, HOUR, nowIso, productionDayStart } from "../time";

const DOT = { running: C.ok, down: C.red, idle: C.grey } as const;
const ms = (v: any) => new Date(v).getTime();
const overlap = (a: number, b: number, c: number, d: number) => Math.max(0, Math.min(b, d) - Math.max(a, c));

const WHEN = [
  { key: "next stop", label: "At the next stop" },
  { key: "this week", label: "This week" },
  { key: "today", label: "Today, urgent" },
];

function Kv({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{ gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.line }}>
      <Sub>{label}</Sub>
      <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.ink }}>{value}</Text>
      {sub ? <Sub>{sub}</Sub> : null}
    </View>
  );
}

/** Everything about one machine for the operator: what it is, what it really makes, what is open with maintenance. */
export default function MachineDetails() {
  const nav = useNavigation<any>();
  const { session, roles } = useAuth();
  const D = useData();
  const me = session!.person.id;
  const name = session!.person.full_name;
  const [sel, setSel] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const machines = D.machine.filter((m) => canRun(D, me, m, roles)).sort((a, b) => a.tag.localeCompare(b.tag));
  const mineRunning = D.machine_run.find((r) => !r.stopped_at && r.operator_id === me)?.machine_id;
  const m = machines.find((x) => x.id === sel) ?? machines.find((x) => x.id === mineRunning) ?? machines[0];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Details" subtitle="Machine details" initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }} keyboardShouldPersistTaps="handled">
        {!m ? <Empty text="You are not set up on any machine yet." /> : (
          <>
            {machines.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {machines.map((x) => <Pill key={x.id} label={x.tag} dot={DOT[machineStatus(D, x).state]} selected={x.id === m.id} onPress={() => { setSel(x.id); setAsking(false); }} />)}
              </ScrollView>
            ) : null}
            <Body D={D} m={m} me={me} asking={asking} setAsking={setAsking} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Body({ D, m, me, asking, setAsking }: { D: ReturnType<typeof useData>; m: any; me: string; asking: boolean; setAsking: (v: boolean) => void }) {
  const nav = useNavigation<any>();
  const nowMs = Date.now();
  const t0 = productionDayStart().getTime();
  const from7 = t0 - 7 * DAY;
  const runs = D.machine_run.filter((r) => r.machine_id === m.id);

  // Hours run: the hour meter is its reading at the start of records plus every logged running hour.
  const runMs = (a: number, b: number) => runs.reduce((n, r) => n + overlap(ms(r.started_at), r.stopped_at ? ms(r.stopped_at) : nowMs, a, b), 0);
  const since = m.hour_meter_start_at ? ms(m.hour_meter_start_at) : 0;
  const meter = num(m.hour_meter_start) + runMs(since, nowMs) / HOUR;
  const h7 = runMs(from7, t0) / HOUR;

  // Output, from weights only.
  let output = "";
  if (m.stage === "pellet" || m.stage === "mill") {
    const t = pelletKg(D, new Date(from7), new Date(t0)) / 1000;
    const hh = stageRunMs(D, "pellet", from7, t0) / HOUR;
    output = `${t.toFixed(0)} t pellets in the last 7 days, counted from the bags · ${hh > 0 ? `${(t / hh).toFixed(2)} t per running hour of the pellet mill` : "-"}`;
  } else if (m.stage === "briquette") {
    const t = briquetteKg(D, new Date(from7), new Date(t0), m.id) / 1000;
    const last = D.log_reading.filter((r) => r.machine_id === m.id && num(r.one_min_kg) > 0).sort((a, b) => String(a.at).localeCompare(String(b.at))).pop();
    output = `${t.toFixed(0)} t briquettes in the last 7 days from the hourly 1-minute weighing · ${h7 > 0 ? `${(t / h7).toFixed(2)} t per running hour` : "-"}${last ? ` · last weighing ${(num(last.one_min_kg) * 0.06).toFixed(2)} t/hr at ${fmtTime(last.at)}` : ""}`;
  }

  const die = m.stage === "briquette" ? dieCounter(D, m) : null;
  const open = D.maintenance_job.filter((j) => j.machine_id === m.id && !j.fixed_at).sort((a, b) => String(b.reported_at).localeCompare(String(a.reported_at)));
  const fixed = D.maintenance_job
    .filter((j) => j.machine_id === m.id && j.fixed_at && ms(j.fixed_at) >= nowMs - 30 * DAY)
    .sort((a, b) => String(b.fixed_at).localeCompare(String(a.fixed_at)))
    .slice(0, 8);

  return (
    <>
      <Card>
        <Row>
          <View style={{ backgroundColor: C.greySoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 13, color: C.sub, fontWeight: "600" }}>{m.tag}</Text>
          </View>
          <Text style={{ fontFamily: F.head, fontSize: 26, color: C.ink, marginLeft: 8 }}>{m.name}</Text>
        </Row>
        <Kv label="Make / model" value={m.make_model || "-"} />
        <Kv label="Rated capacity" value={m.rated_capacity ? String(m.rated_capacity) : "-"} sub="The maker's figure" />
        <Kv label="Main motor" value={m.motor_kw ? `${m.motor_kw} kW` : "-"} />
        <Kv label="Hour meter" value={`${Math.round(meter).toLocaleString("en-US")} h`} sub={`Ran ${(h7 / 7).toFixed(1)} h a day last week`} />
        {output ? <Kv label="Actual output" value={output} /> : null}
        {m.notes ? <Kv label="Notes" value={String(m.notes)} /> : null}
        <Sub>The machines do not run at the rated capacity, and output changes. Output is only counted from weights: pellet bags, the briquette weighing, sales trucks and the raw material trucks into the yards.</Sub>
      </Card>

      {die ? (
        <Card>
          <Row>
            <T bold>{m.wear_part || "Wear parts"}</T>
            <Spacer />
            <Badge text={`${die.tons.toFixed(0)} of ${die.limit} t`} tone={die.tons >= die.limit ? "bad" : die.tons >= die.limit * 0.85 ? "warn" : "good"} />
          </Row>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: C.line, overflow: "hidden" }}>
            <View style={{ width: `${Math.min(100, (die.tons / die.limit) * 100)}%`, height: 8, backgroundColor: die.tons >= die.limit ? C.red : die.tons >= die.limit * 0.85 ? C.amber : C.ok }} />
          </View>
          <Sub>Tons made since the last wear-parts change.</Sub>
        </Card>
      ) : null}

      <Btn title="Report a problem" onPress={() => nav.navigate("ReportProblem", { machineId: m.id })} />
      <Btn title={asking ? "Close the request" : "Request maintenance"} kind="soft" onPress={() => setAsking(!asking)} />
      {asking ? <RequestForm D={D} m={m} me={me} onDone={() => setAsking(false)} /> : null}

      {open.length ? <SectionTitle>{`Open with maintenance · ${open.length}`}</SectionTitle> : null}
      {open.map((j) => (
        <Card key={j.id}>
          <Row>
            <T bold style={{ flex: 1 }}>{j.problem}</T>
            <Badge text={j.started_at ? "Working" : "Waiting"} tone={j.started_at ? "warn" : "bad"} />
          </Row>
          <Sub>{fmtDayTime(j.reported_at)}{j.note ? ` · ${j.note}` : ""}{j.fitter_id ? ` · ${personName(D, j.fitter_id)} on it` : " · waiting for a fitter"}</Sub>
        </Card>
      ))}

      <SectionTitle>Last 30 days of maintenance</SectionTitle>
      <Card>
        {fixed.length === 0 ? <Sub>Nothing fixed in the last 30 days.</Sub> : fixed.map((j) => (
          <View key={j.id} style={{ gap: 2 }}>
            <Row>
              <T bold style={{ flex: 1 }}>Fixed: {j.problem}</T>
              <Sub>{fmtDayTime(j.fixed_at)}</Sub>
            </Row>
            <Sub>{j.fitter_id ? personName(D, j.fitter_id) : ""}{j.work_done ? `${j.fitter_id ? " · " : ""}${j.work_done}` : ""}</Sub>
          </View>
        ))}
      </Card>
    </>
  );
}

/** For work that is needed but has not stopped the machine. For a breakdown use Report a problem. */
function RequestForm({ D, m, me, onDone }: { D: ReturnType<typeof useData>; m: any; me: string; onDone: () => void }) {
  const [part, setPart] = useState("");
  const [when, setWhen] = useState<string | null>("next stop");
  const [needed, setNeeded] = useState("");
  const { busy, run } = useAction();

  const send = () =>
    run(async () => {
      if (!part.trim()) throw new Error("Write which part");
      if (needed.trim().length < 4) throw new Error("Write what is needed");
      const w = WHEN.find((x) => x.key === when) ?? WHEN[0];
      await save({
        table: "maintenance_job",
        row: {
          id: newId(), kind: "request", machine_id: m.id, problem: `Maintenance request: ${part.trim()}`, note: needed.trim(), when_needed: w.key,
          reported_by: me, reported_at: nowIso(), machine_stopped: false, downtime_id: null, fitter_id: null, started_at: null, fixed_at: null,
        },
      });
      say("Request sent", `Maintenance will see it for ${m.tag}.`);
      setPart("");
      setNeeded("");
      onDone();
    });

  return (
    <Card>
      <T bold style={{ fontSize: 17 }}>Request maintenance · {m.tag}</T>
      <Sub>For work that is needed but has not stopped the machine.</Sub>
      <Field label="WHICH PART" value={part} onChangeText={setPart} />
      <Sub>When</Sub>
      <Chips options={WHEN} value={when} onChange={setWhen} />
      <Field label="WHAT IS NEEDED" value={needed} onChangeText={setNeeded} multiline />
      <Btn title="Send request" onPress={send} busy={busy} />
    </Card>
  );
}