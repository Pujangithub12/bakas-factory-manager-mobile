import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Screen, H, Sub, Card, T, Text, Badge, Row, Btn, Field, SectionTitle, Chips, YesNo, Check, say, useAction, Empty, C, F, Spacer, ScreenHeader, Pill, Tile, StatusDot, initialsOf, Icon } from "../ui";
import { useAuth } from "../auth";
import { newId, save, useData, type Data } from "../store";
import {
  bagCounts, batchCode, batchMaterial, batchTickets, blockingJob, briquetteKg, busyPeople, canRun, fieldsFor, lastReading, machineStatus, num, onSiteMap, openJobs, pelletKg,
  personName, READING_DUE_MIN, yardUsedPct,
} from "../rules";
import { clockToDate, fmtDateTime, fmtDuration, fmtTime, nowIso, nptClock, shiftWindow, MIN, type Row as R } from "../time";
import { useOpMachine } from "../tabs";

const STATE_COLOR = { running: C.ok, down: C.red, idle: C.grey } as const;
const STATE_WORD = { running: "Running", down: "Down", idle: "Stopped" } as const;
/** Log sheet lines that hold words, not numbers. */
export const TEXT_KEYS = ["feedMat", "feedRatio", "fuel"];
const isText = (f: R) => TEXT_KEYS.includes(f.field_key);

/** "You are not checked in at the gate": the red banner every operator tab shows when the gate has no record of them on site. */
export function GateBanner() {
  const { session } = useAuth();
  const D = useData();
  const me = session!.person.id;
  if (onSiteMap(D).has(me)) return null;
  const last = D.attendance.filter((a) => a.person_id === me && a.gate_out).sort((a, b) => b.gate_out.localeCompare(a.gate_out))[0];
  return (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: C.redSoft, borderRadius: 12, padding: 12 }}>
      <Icon name="warning-outline" size={18} color={C.red} />
      <Text style={{ flex: 1, color: C.red, fontSize: 14 }}>
        You are not checked in at the gate{last ? ` (you left at ${fmtTime(last.gate_out)})` : ""}. Security must check you in before you can start work.
      </Text>
    </View>
  );
}

/** The machines this operator may run, and which one is chosen (shared by every operator tab). */
export function useMyMachines() {
  const { session, roles } = useAuth();
  const D = useData();
  const me = session!.person.id;
  const [sel, setSel] = useOpMachine();
  const machines = D.machine.filter((m) => canRun(D, me, m, roles)).sort((a, b) => a.tag.localeCompare(b.tag));
  const running = machines.find((m) => machineStatus(D, m).state === "running" && machineStatus(D, m).run?.operator_id === me);
  const current = machines.find((m) => m.id === sel) ?? running ?? machines[0];
  return { machines, current, setSel };
}

/** The machine pills; shown only when the operator has more than one machine. */
export function MachineSwitch() {
  const D = useData();
  const { machines, current, setSel } = useMyMachines();
  if (machines.length < 2) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} style={{ flexGrow: 0 }}>
      {machines.map((m) => <Pill key={m.id} label={m.tag} dot={STATE_COLOR[machineStatus(D, m).state]} selected={m.id === current?.id} onPress={() => setSel(m.id)} />)}
    </ScrollView>
  );
}

/** The operator's home: header, a pill for each machine they may run, and the chosen machine. */
export default function MyMachines() {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const D = useData();
  const { current } = useMyMachines();
  const w = shiftWindow(D.shift);
  const name = session!.person.full_name;
  // As the "Work" tab it carries its own header; opened from a tile it uses the stack header.
  const inTab = useRoute().name === "Work";

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {inTab ? <ScreenHeader title="Your machine" subtitle={`${name} · ${w ? `${w.shift.name} shift` : "Off-shift"}`} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} /> : null}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }} keyboardShouldPersistTaps="handled">
        <MachineSwitch />
        <GateBanner />
        {current ? <MachineBody machineId={current.id} /> : <Empty text="You are not set up on any machine yet. The supervisor ticks your machines." />}
      </ScrollView>
    </View>
  );
}

/** A machine opened from the Floor or a job. */
export function Machine() {
  const { params } = useRoute<any>();
  return (
    <Screen>
      <MachineBody machineId={params.machineId} />
    </Screen>
  );
}

type Panel = "start" | "stop" | "reading" | null;

export function MachineBody({ machineId }: { machineId: string }) {
  const nav = useNavigation<any>();
  const { session, roles } = useAuth();
  const D = useData();
  const me = session!.person.id;
  const m = D.machine.find((x) => x.id === machineId);
  const site = useMemo(() => onSiteMap(D), [D.attendance]);
  const [panel, setPanel] = useState<Panel>(null);
  const { busy, run } = useAction();
  const state = m ? machineStatus(D, m).state : "idle";
  useEffect(() => setPanel(null), [machineId, state]);
  if (!m) return <Empty text="Machine not found." />;

  const st = machineStatus(D, m);
  const mine = st.run?.operator_id === me;
  const blocking = blockingJob(D, m.id);
  const allowed = canRun(D, me, m, roles);
  const here = site.has(me);
  const feedStage = ["chip", "wetmill", "dry"].includes(m.stage);
  const color = STATE_COLOR[st.state];

  const lastRun = D.machine_run.filter((r) => r.machine_id === m.id && r.stopped_at).sort((a, b) => b.stopped_at.localeCompare(a.stopped_at))[0];
  const nowMs = Date.now();
  const nowD = new Date(nowMs);
  const sw = shiftWindow(D.shift);
  const shiftFrom = sw?.start ?? new Date(nowMs - 8 * 3_600_000);
  const openDown = D.downtime.find((d) => d.machine_id === m.id && !d.ended_at);
  const planned = st.state === "down" && D.stop_reason.find((r) => r.id === openDown?.stop_reason_id)?.type === "Planned";
  const heroColor = planned ? C.amber : color;
  const helperNames = st.run ? D.run_helper.filter((h) => h.run_id === st.run!.id).map((h) => personName(D, h.person_id)) : [];
  const reportedJob = openJobs(D, m.id).find((j) => !j.machine_stopped && j.kind !== "bypass");
  const lastReason = D.stop_reason.find((r) => r.id === lastRun?.stop_reason_id)?.name;
  const downJob = blocking ?? D.maintenance_job.filter((j) => j.downtime_id === openDown?.id).pop();
  const statusLine = st.run
    ? `Running since ${fmtTime(st.run.started_at)} · ${mine ? "you" : st.operator?.full_name}${helperNames.length ? ` + ${helperNames.join(", ")}` : ""}`
    : st.state === "down"
      ? `${st.reason ?? "Down"}${openDown ? ` since ${fmtTime(openDown.started_at)} · ${fmtDuration(nowMs - new Date(openDown.started_at).getTime())}` : ""}${
          downJob ? (downJob.fixed_at ? " · fixed" : downJob.fitter_id ? ` · ${personName(D, downJob.fitter_id)} is on it` : " · waiting for a fitter") : ""}`
      : lastRun ? `Last stop ${fmtTime(lastRun.stopped_at)}${lastReason ? ` · ${lastReason}` : ""}` : "Not run yet";

  // The hourly reading: due an hour after the last one (or the start); late after that.
  const lastRd = lastReading(D, m.id);
  const readingFields = fieldsFor(D, m.stage, "reading");
  const hasReadings = readingFields.length > 0 || m.stage === "briquette";
  const hasSheet = hasReadings || fieldsFor(D, m.stage, "prestart").length > 0;
  const dueBase = st.run ? Math.max(lastRd ? new Date(lastRd.at).getTime() : 0, new Date(st.run.started_at).getTime()) : 0;
  const dueAt = dueBase + READING_DUE_MIN * MIN;
  const readingLate = !!st.run && nowMs > dueAt;
  const showDue = !!st.run && mine && here && hasReadings;
  const canAct = here && !!st.run && mine;

  // Output this shift, from weights only.
  let prod: React.ReactNode = null;
  const bagsShift = bagCounts(D, shiftFrom, nowD).reduce((n, b) => n + num(b.bags), 0);
  if (m.stage === "pellet") {
    prod = <ProdStat label="Pellets this shift" value={`${bagsShift.toLocaleString("en-US")} bags · ${(pelletKg(D, shiftFrom, nowD) / 1000).toFixed(2)} t`} />;
  } else if (m.stage === "briquette") {
    const lastW = D.log_reading.filter((r) => r.machine_id === m.id && num(r.one_min_kg) > 0).sort((a, b) => String(a.at).localeCompare(String(b.at))).pop();
    prod = (
      <ProdStat
        label="Briquettes this shift"
        value={`${(briquetteKg(D, shiftFrom, nowD, m.id) / 1000).toFixed(2)} t`}
        sub={lastW ? `${(num(lastW.one_min_kg) * 0.06).toFixed(2)} t/hr from the ${fmtTime(lastW.at)} weighing` : "No 1-minute weighing yet"}
      />
    );
  }

  // Yard tile for the chipper, wet hammer mill and dryer: the batch waiting for this machine.
  const batches = feedStage
    ? D.yard_batch.filter((b) => !b.finished_at && batchTickets(D, b.id).length > 0 && batchMaterial(D, b)?.feed_stage === m.stage).sort((a, b) => (b.started_at ? 1 : 0) - (a.started_at ? 1 : 0))
    : [];
  const batch = batches[0];
  const used = batch?.started_at ? yardUsedPct(D, batch) : null;

  const tiles: React.ReactNode[] = [];
  if (m.stage === "pellet") tiles.push(<Tile key="bags" icon="cube-outline" title="Record bags" sub={`${bagsShift.toLocaleString("en-US")} bags this shift`} onPress={() => nav.navigate("BagCount")} />);
  if (feedStage) {
    tiles.push(
      batch ? (
        <Tile
          key="yard"
          icon="layers-outline"
          disabled={!canAct}
          title={`Yard ${D.yard.find((y) => y.id === batch.yard_id)?.letter ?? ""} · ${batchCode(D, batch)}`}
          sub={batch.started_at ? `${used != null ? `About ${used}% used.` : "Feeding."} Tap when empty.` : `${batchTickets(D, batch.id).length} trucks. Tap to start feeding.`}
          onPress={() => nav.navigate("YardFeed", { batchId: batch.id })}
        />
      ) : <Tile key="yard" icon="layers-outline" disabled title="No yard waiting" sub="Nothing to feed this machine yet." />
    );
  }
  if (hasReadings) tiles.push(<Tile key="rd" icon="add-circle-outline" disabled={!canAct} title="Add a reading" sub="Readings from the panel" onPress={() => setPanel(panel === "reading" ? null : "reading")} />);
  if (hasSheet) tiles.push(<Tile key="ls" icon="clipboard-outline" title="Log sheet" sub="This shift so far" onPress={() => nav.navigate("LogSheet")} />);
  if (m.stage === "pellet") tiles.push(<Tile key="pw" icon="flash-outline" title="Electricity meter" sub="Hourly reading" onPress={() => nav.navigate("PowerReading")} />);
  tiles.push(<Tile key="rp" icon="construct-outline" title="Report a problem" sub="Goes to maintenance" disabled={!here} onPress={() => nav.navigate("ReportProblem", { machineId: m.id })} />);
  const tileRows: React.ReactNode[][] = [];
  for (let k = 0; k < tiles.length; k += 2) tileRows.push(tiles.slice(k, k + 2));

  const helperRunIds = new Set(D.run_helper.filter((h) => h.person_id === me).map((h) => h.run_id as string));
  const myRuns = D.machine_run
    .filter((r) => (r.operator_id === me || helperRunIds.has(r.id)) && new Date(r.stopped_at ?? nowMs).getTime() > shiftFrom.getTime())
    .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));

  return (
    <View style={{ gap: 14 }}>
      <View style={{ backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, borderTopWidth: 5, borderTopColor: heroColor, padding: 18, gap: 8 }}>
        <Row>
          <View style={{ backgroundColor: C.greySoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 13, color: C.sub, fontWeight: "600" }}>{m.tag}</Text>
          </View>
          <Spacer />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.greySoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
            <StatusDot color={heroColor} size={9} />
            <Text style={{ fontSize: 14, color: C.ink, fontWeight: "600" }}>{planned ? "Stopped" : STATE_WORD[st.state]}</Text>
          </View>
        </Row>
        <Text style={{ fontFamily: F.head, fontSize: 36, color: C.ink, lineHeight: 40 }}>{m.name}</Text>
        {st.run ? (
          <LiveClock since={st.run.started_at} color={heroColor} />
        ) : (
          <Text style={{ fontFamily: F.head, fontSize: 72, lineHeight: 76, color: st.state === "idle" ? "#4a4f4b" : heroColor }}>{st.state === "down" && !planned ? "Down" : "Stopped"}</Text>
        )}
        <Text style={{ color: C.sub, fontSize: 15 }}>{statusLine}</Text>
        {st.run ? <BypassNote D={D} run={st.run} /> : null}
        {reportedJob ? <NoteLine tone="warn" icon="construct-outline" text={`${reportedJob.problem} reported ${fmtDuration(nowMs - new Date(reportedJob.reported_at).getTime())} ago${reportedJob.fitter_id ? ` · ${personName(D, reportedJob.fitter_id)} on it` : ""}`} /> : null}
        {st.run && !mine ? <NoteLine tone="warn" icon="lock-closed-outline" text={`In use by ${st.operator?.full_name}. Only they can stop it or fill its log sheet.`} /> : null}

        {!st.run ? (
          <View style={{ marginTop: 8, gap: 6 }}>
            <Btn title={panel === "start" ? "Close" : "Start machine"} kind={panel === "start" ? "ghost" : "primary"} disabled={!allowed || !!blocking || !here} onPress={() => setPanel(panel === "start" ? null : "start")} />
            {!allowed ? <Sub>You may not run this machine. Ask the supervisor to tick it for you.</Sub> : blocking ? <Sub style={{ color: C.red }}>Maintenance must mark it fixed first.</Sub> : null}
          </View>
        ) : mine ? (
          <View style={{ marginTop: 8 }}><Btn title={panel === "stop" ? "Close" : "Stop machine"} kind={panel === "stop" ? "ghost" : "danger"} onPress={() => setPanel(panel === "stop" ? null : "stop")} /></View>
        ) : null}
      </View>

      {panel === "start" && !st.run ? <StartForm D={D} m={m} me={me} onDone={() => setPanel(null)} /> : null}
      {panel === "stop" && st.run && mine ? <StopForm D={D} m={m} me={me} run={st.run} onDone={() => setPanel(null)} /> : null}
      {panel === "reading" && st.run && mine ? <ReadingEditor D={D} m={m} me={me} runId={st.run.id} onDone={() => setPanel(null)} /> : null}

      {showDue ? (
        <Card onPress={() => setPanel("reading")} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: readingLate ? C.amberSoft : C.card, borderColor: readingLate ? C.amber : C.line, borderRadius: 16, padding: 14 }}>
          <Icon name="time-outline" size={26} color={readingLate ? C.amber : C.green} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: readingLate ? C.amber : C.ink }}>{readingLate ? "Hourly reading is late" : "Next hourly reading"}</Text>
            <Text style={{ color: readingLate ? C.amber : C.sub, fontSize: 13 }}>
              {readingLate ? `It was due at ${fmtTime(new Date(dueAt))}` : `Due at ${fmtTime(new Date(dueAt))}`}
              {m.stage === "briquette" ? " · weigh 1 minute of output" : ""}
            </Text>
          </View>
          <Icon name="chevron-forward" size={18} color={C.grey} />
        </Card>
      ) : null}
      {prod}
      {tileRows.map((row, k) => (
        <Row key={k} style={{ alignItems: "stretch", gap: 12 }}>
          {row.map((t, j) => <View key={j} style={{ flex: 1, flexDirection: "row" }}>{t}</View>)}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </Row>
      ))}

      <Card>
        <T bold style={{ fontSize: 17 }}>Your runs this shift</T>
        {myRuns.length === 0 ? <Sub>Nothing yet this shift.</Sub> : null}
        {myRuns.map((r) => (
          <Row key={r.id} style={{ justifyContent: "space-between" }}>
            <View style={{ backgroundColor: C.greySoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 13, color: C.sub, fontWeight: "600" }}>{D.machine.find((x) => x.id === r.machine_id)?.tag ?? "?"}</Text>
            </View>
            <T>{fmtTime(r.started_at)}-{r.stopped_at ? fmtTime(r.stopped_at) : "now"}</T>
            <Sub>{r.stopped_at ? D.stop_reason.find((x) => x.id === r.stop_reason_id)?.name ?? "" : r.operator_id === me ? "running" : "helping"}</Sub>
          </Row>
        ))}
      </Card>
      {busy ? <Sub>Saving...</Sub> : null}
    </View>
  );
}

const clock2 = (n: number) => String(n).padStart(2, "0");
/** 02:14:09 */
const fmtClock = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${clock2(Math.floor(t / 3600))}:${clock2(Math.floor((t % 3600) / 60))}:${clock2(t % 60)}`;
};

/** The running time, ticking every second. It re-renders on its own so the rest of the screen stays still. */
function LiveClock({ since, color }: { since: string; color: string }) {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setT(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  return <Text style={{ fontFamily: F.head, fontSize: 64, lineHeight: 68, color }}>{fmtClock(t - new Date(since).getTime())}</Text>;
}

function NoteLine({ tone, icon, text }: { tone: "bad" | "warn"; icon: React.ComponentProps<typeof Icon>["name"]; text: string }) {
  const col = tone === "bad" ? C.red : C.amber;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
      <Icon name={icon} size={18} color={col} />
      <Text style={{ flex: 1, color: col, fontSize: 14 }}>{text}</Text>
    </View>
  );
}

/** The run's bypass, in one of three wordings: still running on it, started on it and since fixed, or started with a No but no bypass. */
function BypassNote({ D, run }: { D: Data; run: R }) {
  const no = D.prestart_answer.filter((a) => a.run_id === run.id && a.answer === false).map((a) => D.log_field.find((f) => f.id === a.field_id)?.label ?? "a check");
  const b = D.run_bypass.find((x) => x.run_id === run.id);
  if (b) {
    const job = b.job_id ? D.maintenance_job.find((j) => j.id === b.job_id) : null;
    if (job?.fixed_at) return <NoteLine tone="warn" icon="warning-outline" text={`Started on bypass (${no.join(", ")} marked No). Fixed by ${personName(D, job.fitter_id)} at ${fmtTime(job.fixed_at)}.`} />;
    return <NoteLine tone="bad" icon="warning-outline" text={`Running on bypass: ${no.join(", ")} marked No. “${b.remark}” (${personName(D, b.by)})`} />;
  }
  return no.length ? <NoteLine tone="bad" icon="warning-outline" text={`Started with checks marked No: ${no.join(", ")}`} /> : null;
}

function ProdStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <Sub>{label}</Sub>
      <Text style={{ fontFamily: F.head, fontSize: 34, color: C.ink, lineHeight: 38 }}>{value}</Text>
      {sub ? <Sub>{sub}</Sub> : null}
    </Card>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <Field label={label} value={value} onChangeText={(v) => onChange(v.replace(/[^\d:.]/g, ""))} keyboardType="numbers-and-punctuation" hint="24-hour time, Nepal, like 14:30" />;
}

function StartForm({ D, m, me, onDone }: { D: Data; m: R; me: string; onDone: () => void }) {
  const prestart = fieldsFor(D, m.stage, "prestart");
  const [answers, setAnswers] = useState<Record<string, boolean | null>>({});
  // Helpers come with the operator's last run, if they are still free.
  const busyIds = busyPeople(D);
  const crew = D.person.filter((p) => p.active && p.id !== me && onSiteMap(D).has(p.id) && !busyIds.has(p.id) && D.person_role.some((r) => r.person_id === p.id && (r.role === "Helper" || r.role === "Operator")));
  const prevRun = D.machine_run.filter((r) => r.operator_id === me && r.stopped_at).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  const prev = prevRun ? D.run_helper.filter((h) => h.run_id === prevRun.id).map((h) => h.person_id as string).filter((id) => crew.some((p) => p.id === id)) : [];
  const [helpers, setHelpers] = useState<string[]>(prev);
  const [runAnyway, setRunAnyway] = useState(false);
  const [remark, setRemark] = useState("");
  const [at, setAt] = useState(nptClock());
  const { busy, run } = useAction();

  const openDown = D.downtime.find((d) => d.machine_id === m.id && !d.ended_at);
  const downReason = D.stop_reason.find((r) => r.id === openDown?.stop_reason_id)?.name;
  const failed = prestart.filter((f) => answers[f.id] === false);
  const allAnswered = prestart.every((f) => answers[f.id] === true || answers[f.id] === false);
  const bypass = failed.length > 0 && runAnyway;

  const start = () =>
    run(async () => {
      if (D.machine_run.some((r) => r.machine_id === m.id && !r.stopped_at)) throw new Error("This machine is already running.");
      if (!allAnswered) throw new Error("Answer every check, Yes or No, before starting.");
      const when = clockToDate(at);
      if (!when) throw new Error("Enter the start time.");
      if (when.getTime() > Date.now() + 5 * MIN) throw new Error("The start time is in the future.");
      if (openDown && when.getTime() < new Date(openDown.started_at).getTime()) throw new Error(`The start must be after the machine stopped (${fmtTime(openDown.started_at)}).`);
      if (failed.length && !runAnyway) throw new Error("A check is marked No. Fix it and change the answer to Yes, or run anyway with a remark.");
      if (bypass && remark.trim().length < 8) throw new Error("Write a remark of at least 8 characters.");
      const runId = newId();
      const startIso = when.toISOString();
      const now = nowIso();
      const writes: Parameters<typeof save> = [
        { table: "machine_run", row: { id: runId, machine_id: m.id, operator_id: me, started_at: startIso, stopped_at: null, stop_reason_id: null, notes: null, entered_by: me } },
        ...helpers.map((p) => ({ table: "run_helper", row: { run_id: runId, person_id: p } })),
        ...prestart.map((f) => ({ table: "prestart_answer", row: { run_id: runId, field_id: f.id, answer: answers[f.id] === true } })),
      ];
      if (bypass) {
        const jobId = newId();
        writes.push(
          {
            table: "maintenance_job",
            row: {
              id: jobId, kind: "bypass", machine_id: m.id, problem: "Pre-start check failed", note: `${failed.map((f) => f.label).join(", ")} marked No. Bypass remark: ${remark.trim()}`,
              reported_by: me, reported_at: now, machine_stopped: false, downtime_id: null, fitter_id: null, started_at: null, fixed_at: null,
            },
          },
          { table: "run_bypass", row: { run_id: runId, remark: remark.trim(), job_id: jobId, by: me, at: now } }
        );
      }
      // Starting ends any downtime that is still open (power cut, no raw material...).
      if (openDown) writes.push({ table: "downtime", row: { id: openDown.id, ended_at: startIso } });
      await save(...writes);
      say(bypass ? `${m.tag} started on bypass` : `${m.tag} started`, bypass ? `Started at ${fmtTime(when)} on bypass (${failed.map((f) => f.label).join(", ")}). The in-charge and maintenance have been told.` : `Started at ${fmtTime(when)}.`);
      onDone();
    });

  return (
    <Card style={{ gap: 10 }}>
      <T bold style={{ fontSize: 17 }}>Start {m.tag}</T>
      <TimeField label="Started at" value={at} onChange={setAt} />
      {openDown ? <Sub>This ends the stop: {downReason ?? "Down"} since {fmtTime(openDown.started_at)}.</Sub> : null}
      {prestart.length ? <SectionTitle>Checks before starting</SectionTitle> : null}
      {prestart.map((f) => (
        <Row key={f.id} style={{ justifyContent: "space-between" }}>
          <T style={{ flex: 1 }}>{f.label}</T>
          <YesNo value={answers[f.id] ?? null} onChange={(v) => setAnswers((a) => ({ ...a, [f.id]: v }))} />
        </Row>
      ))}
      {failed.length ? (
        <View style={{ gap: 6, borderWidth: 1, borderColor: C.red, backgroundColor: C.redSoft, borderRadius: 10, padding: 10 }}>
          <Text style={{ color: C.red }}>Marked No: {failed.map((f) => f.label).join(", ")}. The machine cannot start with a No. Fix it and change the answer to Yes, or run anyway with a remark.</Text>
          <Check label="Run anyway (bypass)" value={runAnyway} onChange={setRunAnyway} />
          {runAnyway ? <Field label="Remark: what is wrong, and why it is safe to run" value={remark} onChangeText={setRemark} multiline hint="The in-charge sees this on the log sheet, and maintenance gets a job." /> : null}
        </View>
      ) : null}

      <SectionTitle>Helpers with you · only people checked in and not on another machine</SectionTitle>
      {crew.length === 0 ? <Sub>No free helpers are checked in right now.</Sub> : <Chips multi value={helpers} onChange={setHelpers} options={crew.map((p) => ({ key: p.id, label: `${p.full_name}${p.checked ? "" : " (new)"}` }))} />}
      <Btn title={bypass ? "Start on bypass" : "Start machine"} kind={bypass ? "danger" : "primary"} onPress={start} busy={busy} />
    </Card>
  );
}

function StopForm({ D, m, me, run: machineRun, onDone }: { D: Data; m: R; me: string; run: R; onDone: () => void }) {
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [at, setAt] = useState(nptClock());
  const { busy, run } = useAction();
  const reason = D.stop_reason.find((r) => r.id === reasonId);

  const stop = () =>
    run(async () => {
      if (!reason) throw new Error("Choose why it is stopping");
      const when = clockToDate(at);
      if (!when) throw new Error("Enter the stop time.");
      if (when.getTime() > Date.now() + 5 * MIN) throw new Error("The stop time is in the future.");
      if (when.getTime() <= new Date(machineRun.started_at).getTime()) throw new Error(`The stop time must be after ${fmtTime(machineRun.started_at)}.`);
      const stopIso = when.toISOString();
      const writes: Parameters<typeof save> = [
        { table: "machine_run", row: { id: machineRun.id, stopped_at: stopIso, stop_reason_id: reason.id, notes: note.trim() || null } },
      ];
      const dtId = reason.machine_down ? newId() : null;
      if (dtId) {
        writes.push({ table: "downtime", row: { id: dtId, machine_id: m.id, started_at: stopIso, ended_at: null, stop_reason_id: reason.id, notes: note.trim() || null, job_id: null, entered_by: me } });
      }
      if (reason.calls_maintenance) {
        const jobId = newId();
        writes.push({
          table: "maintenance_job",
          row: {
            id: jobId, kind: /die/i.test(reason.name) ? "wear" : "breakdown", machine_id: m.id, problem: note.trim() ? `${reason.name}: ${note.trim()}` : reason.name,
            reported_by: me, reported_at: stopIso, machine_stopped: !!reason.machine_down, downtime_id: dtId, fitter_id: null, started_at: null, fixed_at: null,
          },
        });
        if (dtId) writes.push({ table: "downtime", row: { id: dtId, job_id: jobId } });
      }
      await save(...writes);
      say(`${m.tag} stopped`, `Stopped at ${fmtTime(when)}.${reason.calls_maintenance ? " Maintenance has been told." : ""}`);
      onDone();
    });

  return (
    <Card style={{ gap: 10 }}>
      <T bold style={{ fontSize: 17 }}>Stop {m.tag} · {m.name}</T>
      <Sub>Started {fmtTime(machineRun.started_at)} by {personName(D, machineRun.operator_id)} · running {fmtDuration(Date.now() - new Date(machineRun.started_at).getTime())}</Sub>
      <SectionTitle>Why is it stopping?</SectionTitle>
      <Chips value={reasonId} onChange={setReasonId} options={D.stop_reason.map((r) => ({ key: r.id, label: r.name, sub: r.calls_maintenance ? "Maintenance is told" : r.machine_down ? "Counts as downtime" : undefined }))} />
      <TimeField label="Stopped at" value={at} onChange={setAt} />
      <Field label="Note (optional)" value={note} onChangeText={setNote} multiline hint="What happened" />
      {reason?.calls_maintenance ? (
        <View style={{ backgroundColor: C.redSoft, borderRadius: 10, padding: 10 }}>
          <Text style={{ color: C.red }}>A job goes to Maintenance.{reason.machine_down ? " The machine shows as Down until a fitter marks it fixed." : ""}</Text>
        </View>
      ) : null}
      <Btn title="Stop machine" kind="danger" disabled={!reason} busy={busy} onPress={stop} />
    </Card>
  );
}

/** Add a reading from the panel, or correct or delete one of your own. */
export function ReadingEditor({ D, m, me, runId, reading, onDone }: { D: Data; m: R; me: string; runId: string | null; reading?: R; onDone: () => void }) {
  const base = fieldsFor(D, m.stage, "reading");
  // The briquette 1-minute weight is needed every hour, even if the log sheet lines are not set up.
  const fields = m.stage === "briquette" && !base.some((f) => f.field_key === "oneMin")
    ? [{ id: "_oneMin", field_key: "oneMin", label: "1-minute output weight", unit: "kg", required: true } as R, ...base]
    : base;
  // The feed material comes from the yard being fed to this machine.
  const feeding = D.yard_batch.find((b) => b.started_at && !b.finished_at && batchMaterial(D, b)?.feed_stage === m.stage);
  const feedGuess = feeding ? batchMaterial(D, feeding)?.name ?? "" : "";
  const start: Record<string, string> = {};
  for (const f of fields) {
    const v = reading?.vals?.[f.field_key];
    start[f.field_key] = v != null ? String(v) : !reading && f.field_key === "feedMat" ? feedGuess : "";
  }
  const [vals, setVals] = useState<Record<string, string>>(start);
  const [at, setAt] = useState(nptClock(reading ? new Date(reading.at) : new Date()));
  const [confirmDel, setConfirmDel] = useState(false);
  const { busy, run } = useAction();
  if (fields.length === 0) return null;
  const oneMin = Number(vals.oneMin);

  const submit = () =>
    run(async () => {
      const when = clockToDate(at, reading ? new Date(reading.at) : new Date());
      if (!when) throw new Error("Enter the time.");
      if (when.getTime() > Date.now() + 5 * MIN) throw new Error("The time is in the future.");
      const filled = fields.filter((f) => (vals[f.field_key] ?? "").trim() !== "");
      for (const f of filled) if (!isText(f) && isNaN(Number(vals[f.field_key]))) throw new Error(`${f.label} must be a number`);
      if (m.stage === "briquette" && !(oneMin > 0)) throw new Error("Weigh one minute of briquette output and enter it.");
      if (!filled.some((f) => !["feedMat", "feedRatio"].includes(f.field_key))) throw new Error("Fill in at least one reading.");
      const clean = Object.fromEntries(filled.map((f) => [f.field_key, isText(f) ? vals[f.field_key].trim() : Number(vals[f.field_key])]));
      await save({
        table: "log_reading",
        row: { id: reading?.id ?? newId(), machine_id: m.id, run_id: reading?.run_id ?? runId, at: when.toISOString(), vals: clean, one_min_kg: typeof clean.oneMin === "number" ? clean.oneMin : null, by: reading?.by ?? me },
      });
      say(`Reading at ${fmtTime(when)} saved`, typeof clean.oneMin === "number" ? `Briquettes now counted at ${(clean.oneMin * 0.06).toFixed(2)} t/hr.` : undefined);
      onDone();
    });

  const del = () =>
    run(async () => {
      await save({ table: "log_reading", row: { id: reading!.id }, op: "delete" });
      say("Reading deleted");
      onDone();
    });

  return (
    <Card style={{ gap: 10 }}>
      <T bold style={{ fontSize: 17 }}>{reading ? "Correct the reading" : "Add a reading"} · {m.tag}</T>
      <TimeField label="Time" value={at} onChange={setAt} />
      {fields.map((f) => (
        <View key={f.id}>
          <Field
            label={`${f.label}${f.unit ? ` (${f.unit})` : ""}`}
            value={vals[f.field_key] ?? ""}
            onChangeText={(v) => setVals((x) => ({ ...x, [f.field_key]: v }))}
            keyboardType={isText(f) ? "default" : "decimal-pad"}
            hint={f.field_key === "oneMin" ? "Needed every hour: weigh what comes out of the machine in one minute." : f.field_key === "feedMat" && feedGuess && !reading ? "Filled in from the yard in use. Change it if needed." : undefined}
          />
        </View>
      ))}
      {oneMin > 0 ? <Text style={{ color: C.green, fontWeight: "600" }}>{oneMin} kg a minute = {(oneMin * 0.06).toFixed(2)} t per hour.</Text> : null}
      <Btn title={reading ? "Save changes" : "Save reading"} onPress={submit} busy={busy} />
      {reading ? (
        confirmDel ? (
          <Row><Text style={{ color: C.red, flex: 1 }}>Delete this reading?</Text><Btn small kind="danger" title="Delete" busy={busy} onPress={del} /><Btn small kind="ghost" title="Keep" onPress={() => setConfirmDel(false)} /></Row>
        ) : <Btn small kind="ghost" title="Delete this reading" onPress={() => setConfirmDel(true)} />
      ) : null}
      <Btn small kind="ghost" title="Close" onPress={onDone} />
    </Card>
  );
}

/** The greasing for this shift: filled in once, and corrected on the Log sheet as often as needed. */
export function GreasingEditor({ D, m, me }: { D: Data; m: R; me: string }) {
  const fields = fieldsFor(D, m.stage, "greasing");
  const w = shiftWindow(D.shift);
  const done = w ? D.greasing_check.find((g) => g.machine_id === m.id && new Date(g.shift_start).getTime() === w.start.getTime()) : undefined;
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.field_key, done?.vals?.[f.field_key] != null ? String(done.vals[f.field_key]) : ""])));
  const { busy, run } = useAction();
  if (fields.length === 0 || !w) return null;

  const submit = () =>
    run(async () => {
      const filled = fields.filter((f) => (vals[f.field_key] ?? "").trim() !== "");
      if (!filled.length) throw new Error("Fill in at least one line.");
      for (const f of filled) if (isNaN(Number(vals[f.field_key]))) throw new Error(`${f.label} must be a number`);
      await save({ table: "greasing_check", row: { id: done?.id ?? newId(), machine_id: m.id, shift_start: w.start.toISOString(), vals: Object.fromEntries(filled.map((f) => [f.field_key, Number(vals[f.field_key])])), by: done?.by ?? me, at: nowIso() } });
      say("Greasing saved");
    });

  return (
    <Card style={{ gap: 10 }}>
      <T bold style={{ fontSize: 17 }}>Greasing</T>
      {fields.map((f) => (
        <Field key={f.id} label={`${f.label}${f.unit ? ` (${f.unit})` : ""}`} value={vals[f.field_key] ?? ""} onChangeText={(v) => setVals((x) => ({ ...x, [f.field_key]: v }))} keyboardType="decimal-pad" />
      ))}
      <Btn title="Save greasing" onPress={submit} busy={busy} />
      <Sub>{done ? `Saved ${fmtTime(done.at)} by ${personName(D, done.by)}` : "-"}</Sub>
    </Card>
  );
}

/** Mark a yard being fed to this machine, or empty. */
export function YardFeed() {
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const { session } = useAuth();
  const D = useData();
  const { busy, run } = useAction();
  const b = D.yard_batch.find((x) => x.id === params.batchId);
  if (!b) return <Screen><Empty text="Not found." /></Screen>;
  const me = session!.person.id;
  const trucks = batchTickets(D, b.id).length;
  return (
    <Screen>
      <H>{batchCode(D, b)} · {batchMaterial(D, b)?.name}</H>
      <Sub>{trucks} trucks{b.closed_at ? " · closed" : " · filling"}{b.started_at ? ` · feeding since ${fmtTime(b.started_at)}` : ""}</Sub>
      {b.started_at ? (
        <Btn title="The yard is empty" kind="danger" busy={busy} onPress={() => run(async () => { await save({ table: "yard_batch", row: { id: b.id, finished_at: nowIso(), finished_by: me } }); nav.goBack(); })} />
      ) : (
        <Btn title="Start feeding from this yard" busy={busy} onPress={() => run(async () => { await save({ table: "yard_batch", row: { id: b.id, started_at: nowIso(), started_by: me } }); nav.goBack(); })} />
      )}
    </Screen>
  );
}

const PRESETS = ["Strange noise", "Overheating", "Jam / blockage", "Oil or grease leak", "Blunt blades", "Electrical fault", "Other"];

export function ReportProblem() {
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const { session } = useAuth();
  const D = useData();
  const fixed = params?.machineId as string | undefined;
  const [machineId, setMachineId] = useState<string | null>(fixed ?? null);
  const [preset, setPreset] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [stopped, setStopped] = useState<string | null>("no");
  const { busy, run } = useAction();
  const m = D.machine.find((x) => x.id === machineId);
  const st = m ? machineStatus(D, m) : null;
  const me = session!.person.id;

  const submit = () =>
    run(async () => {
      if (!m) throw new Error("Choose the machine");
      if (!preset) throw new Error("Choose what is wrong.");
      const now = nowIso();
      const jobId = newId();
      const writes: Parameters<typeof save> = [];
      // "I have stopped it": the run ends as a breakdown and the machine shows Down until a fitter fixes it.
      const stopRun = !!st?.run && stopped === "yes";
      let dtId: string | null = null;
      if (stopRun) {
        const breakdown = D.stop_reason.find((r) => /breakdown/i.test(r.name));
        writes.push({ table: "machine_run", row: { id: st!.run!.id, stopped_at: now, stop_reason_id: breakdown?.id ?? null, notes: preset } });
        if (breakdown) { dtId = newId(); writes.push({ table: "downtime", row: { id: dtId, machine_id: m.id, started_at: now, ended_at: null, stop_reason_id: breakdown.id, notes: preset, job_id: jobId, entered_by: me } }); }
      }
      writes.push({
        table: "maintenance_job",
        row: { id: jobId, kind: "problem", machine_id: m.id, problem: preset, note: note.trim() || null, when_needed: null, reported_by: me, reported_at: now, machine_stopped: stopRun, downtime_id: dtId, fitter_id: null, started_at: null, fixed_at: null, work_done: null, parts_used: null },
      });
      await save(...writes);
      say("Sent to maintenance", `${preset} on ${m.tag}.`);
      nav.goBack();
    });

  return (
    <Screen>
      <H>Report a problem{m ? ` · ${m.tag} ${m.name}` : ""}</H>
      <Sub>Reported by {session!.person.full_name}</Sub>
      {fixed ? null : (
        <>
          <SectionTitle>Machine</SectionTitle>
          <Chips value={machineId} onChange={setMachineId} options={[...D.machine].sort((a, b) => a.tag.localeCompare(b.tag)).map((x) => ({ key: x.id, label: x.tag, sub: x.name }))} />
        </>
      )}
      <SectionTitle>What is wrong?</SectionTitle>
      <Chips value={preset} onChange={setPreset} options={PRESETS.map((p) => ({ key: p, label: p }))} />
      <Field label="Tell the fitter more (optional)" value={note} onChangeText={setNote} multiline hint="Where, what sound, since when" />
      {st?.run ? (
        <>
          <SectionTitle>Have you stopped the machine?</SectionTitle>
          <Chips value={stopped} onChange={(v) => setStopped(v ?? "no")} options={[{ key: "no", label: "No, it is still running" }, { key: "yes", label: "Yes, I have stopped it" }]} />
        </>
      ) : null}
      <Btn title="Send to maintenance" onPress={submit} busy={busy} />
    </Screen>
  );
}
