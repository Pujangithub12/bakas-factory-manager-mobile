import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Screen, H, Sub, Card, T, Text, Badge, Row, Btn, Field, SectionTitle, Check, Chips, YesNo, confirm, say, useAction, Empty, C, F, Spacer, ScreenHeader, Pill, Tile, StatusDot, initialsOf, Icon } from "../ui";
import { useAuth } from "../auth";
import { newId, save, useData, type Data } from "../store";
import {
  bagCounts, batchCode, batchMaterial, batchTickets, blockingJob, briquetteKg, busyPeople, canRun, dieCounter, fieldsFor, isManagement, lastReading, machineAlerts,
  machineStatus, num, onSiteMap, openJobs, pelletKg, personName, READING_DUE_MIN, yardUsedPct,
} from "../rules";
import { fmtDateTime, fmtDuration, fmtTime, nowIso, shiftWindow, MIN, type Row as R } from "../time";

const STATE_COLOR = { running: C.ok, down: C.red, idle: C.grey } as const;
const STATE_WORD = { running: "Running", down: "Down", idle: "Stopped" } as const;

/** The operator's home: header, a pill for each machine they may run, and the chosen machine. */
export default function MyMachines() {
  const nav = useNavigation<any>();
  const { session, roles } = useAuth();
  const D = useData();
  const me = session!.person.id;
  const [sel, setSel] = useState<string | null>(null);

  const machines = D.machine.filter((m) => canRun(D, me, m, roles)).sort((a, b) => a.tag.localeCompare(b.tag));
  const current = machines.find((m) => m.id === sel) ?? machines[0];
  const checkedIn = onSiteMap(D).has(me);
  const w = shiftWindow(D.shift);
  const name = session!.person.full_name;
  // As the "Work" tab it carries its own header; opened from a tile it uses the stack header.
  const inTab = useRoute().name === "Work";

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {inTab ? <ScreenHeader title="Your machine" subtitle={`${name}${w ? ` · ${w.shift.name} shift` : ""}`} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} /> : null}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }} keyboardShouldPersistTaps="handled">
        {machines.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {machines.map((m) => (
              <Pill key={m.id} label={m.tag} dot={STATE_COLOR[machineStatus(D, m).state]} selected={m.id === current?.id} onPress={() => setSel(m.id)} />
            ))}
          </ScrollView>
        ) : null}
        {!checkedIn ? <Badge text="You are not checked in at the gate" tone="warn" /> : null}
        {current ? <MachineBody machineId={current.id} /> : <Empty text="The supervisor has not ticked any machine for you yet." />}
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

export function MachineBody({ machineId }: { machineId: string }) {
  const nav = useNavigation<any>();
  const { session, roles } = useAuth();
  const D = useData();
  const me = session!.person.id;
  const m = D.machine.find((x) => x.id === machineId);
  const site = useMemo(() => onSiteMap(D), [D.attendance]);
  const [panel, setPanel] = useState<"start" | "stop" | null>(null);
  const { busy, run } = useAction();
  const state = m ? machineStatus(D, m).state : "idle";
  useEffect(() => setPanel(null), [machineId, state]);
  if (!m) return <Empty text="Machine not found." />;

  const st = machineStatus(D, m);
  const mine = st.run?.operator_id === me;
  const blocking = blockingJob(D, m.id);
  const allowed = canRun(D, me, m, roles);
  const feedStage = ["chip", "wetmill", "dry"].includes(m.stage);
  const color = STATE_COLOR[st.state];

  const lastRun = D.machine_run.filter((r) => r.machine_id === m.id && r.stopped_at).sort((a, b) => b.stopped_at.localeCompare(a.stopped_at))[0];
  const detail = st.run
    ? `Started by ${mine ? "you" : st.operator?.full_name} at ${fmtTime(st.run.started_at)} · ${fmtDuration(Date.now() - new Date(st.run.started_at).getTime())}`
    : st.state === "down"
      ? st.reason ?? "Down"
      : lastRun
        ? `Last stop ${fmtTime(lastRun.stopped_at)}${D.stop_reason.find((r) => r.id === lastRun.stop_reason_id) ? ` · ${D.stop_reason.find((r) => r.id === lastRun.stop_reason_id)!.name}` : ""}`
        : "Not run yet";

  // Yard tile for the chipper, wet hammer mill and dryer: the batch waiting for this machine.
  const batches = feedStage
    ? D.yard_batch.filter((b) => !b.finished_at && batchTickets(D, b.id).length > 0 && batchMaterial(D, b)?.feed_stage === m.stage).sort((a, b) => (b.started_at ? 1 : 0) - (a.started_at ? 1 : 0))
    : [];
  const batch = batches[0];
  const used = batch?.started_at ? yardUsedPct(D, batch) : null;

  const firstTile = feedStage ? (
    batch ? (
      <Tile
        icon="layers-outline"
        title={`Yard ${D.yard.find((y) => y.id === batch.yard_id)?.letter ?? ""} · ${batchCode(D, batch)}`}
        sub={batch.started_at ? `${used != null ? `About ${used}% used.` : "Feeding."} Tap when empty.` : `${batchTickets(D, batch.id).length} trucks. Tap to start feeding.`}
        onPress={() =>
          batch.started_at
            ? confirm("Yard empty", `Mark ${batchCode(D, batch)} empty?`, "Yes, empty", () => run(() => save({ table: "yard_batch", row: { id: batch.id, finished_at: nowIso(), finished_by: me } })))
            : run(() => save({ table: "yard_batch", row: { id: batch.id, started_at: nowIso(), started_by: me } }))
        }
      />
    ) : <Tile icon="layers-outline" title="No yard waiting" sub="Nothing to feed this machine yet." />
  ) : m.stage === "pellet" ? (
    <Tile icon="cube-outline" title="Bag count" sub="Pellet bags into the store" onPress={() => nav.navigate("BagCount")} />
  ) : (
    <Tile icon="clipboard-outline" title="Log sheet" sub="Today's readings" onPress={() => nav.navigate("LogSheet")} />
  );

  const nowMs = Date.now();
  const nowD = new Date(nowMs);
  const sw = shiftWindow(D.shift);
  const shiftFrom = sw?.start ?? new Date(nowMs - 8 * 3_600_000);
  const openDown = D.downtime.find((d) => d.machine_id === m.id && !d.ended_at);
  const planned = st.state === "down" && D.stop_reason.find((r) => r.id === openDown?.stop_reason_id)?.type === "Planned";
  const heroColor = planned ? C.amber : color;
  const helperNames = st.run ? D.run_helper.filter((h) => h.run_id === st.run!.id).map((h) => personName(D, h.person_id)) : [];
  const reportedJob = openJobs(D, m.id).find((j) => !j.machine_stopped && j.kind !== "bypass");
  const statusLine = st.run
    ? `Running since ${fmtTime(st.run.started_at)} · ${mine ? "you" : st.operator?.full_name}${helperNames.length ? ` + ${helperNames.join(", ")}` : ""}`
    : st.state === "down"
      ? `${st.reason ?? "Down"}${openDown ? ` since ${fmtTime(openDown.started_at)}` : ""}${blocking ? ` · ${blocking.started_at ? `${personName(D, blocking.fitter_id)} is on it` : "waiting for a fitter"}` : ""}`
      : detail;

  // The hourly reading: due an hour after the last one (or the start), late at the alert limit.
  const lastRd = lastReading(D, m.id);
  const readingFields = fieldsFor(D, m.stage, "reading");
  const hasReadings = readingFields.length > 0 || m.stage === "briquette";
  const hasSheet = hasReadings || fieldsFor(D, m.stage, "prestart").length > 0;
  const dueBase = st.run ? Math.max(lastRd ? new Date(lastRd.at).getTime() : 0, new Date(st.run.started_at).getTime()) : 0;
  const dueAt = dueBase + 60 * MIN;
  const readingLate = !!st.run && nowMs > dueBase + READING_DUE_MIN * MIN;
  const showDue = !!st.run && mine && hasReadings;

  // Output this shift, from weights only.
  let prod: React.ReactNode = null;
  if (m.stage === "pellet") {
    const bags = bagCounts(D, shiftFrom, nowD).reduce((n, b) => n + num(b.bags), 0);
    prod = <ProdStat label="Pellets this shift" value={`${bags.toLocaleString("en-US")} bags · ${(pelletKg(D, shiftFrom, nowD) / 1000).toFixed(2)} t`} />;
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

  const tiles: React.ReactNode[] = [];
  if (feedStage || m.stage === "pellet") tiles.push(firstTile);
  if (hasSheet) tiles.push(<Tile icon="clipboard-outline" title="Log sheet" sub="This shift so far" onPress={() => nav.navigate("LogSheet")} />);
  tiles.push(<Tile icon="construct-outline" title="Report a problem" sub="Goes to maintenance" onPress={() => nav.navigate("ReportProblem", { machineId: m.id })} />);
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
            <Text style={{ fontSize: 14, color: C.ink, fontWeight: "600" }}>{st.bypass ? "On bypass" : planned ? "Stopped" : STATE_WORD[st.state]}</Text>
          </View>
        </Row>
        <Text style={{ fontFamily: F.head, fontSize: 36, color: C.ink, lineHeight: 40 }}>{m.name}</Text>
        {st.run ? (
          <LiveClock since={st.run.started_at} color={heroColor} />
        ) : (
          <Text style={{ fontFamily: F.head, fontSize: 72, lineHeight: 76, color: st.state === "idle" ? "#4a4f4b" : heroColor }}>{st.state === "down" && !planned ? "Down" : "Stopped"}</Text>
        )}
        <Text style={{ color: C.sub, fontSize: 15 }}>{statusLine}</Text>
        {st.bypass ? <NoteLine tone="bad" icon="warning-outline" text="Running on bypass. A job is open for maintenance." /> : null}
        {reportedJob ? <NoteLine tone="warn" icon="construct-outline" text={`${reportedJob.problem} reported ${fmtTime(reportedJob.reported_at)}${reportedJob.fitter_id ? ` · ${personName(D, reportedJob.fitter_id)} on it` : ""}`} /> : null}
        <Row style={{ flexWrap: "wrap" }}>
          {machineAlerts(D, m).filter((a) => !(st.bypass && /bypass/i.test(a.text))).map((a) => <Badge key={a.key} text={a.text} tone={a.tone === "bad" ? "bad" : "warn"} />)}
        </Row>

        {!st.run ? (
          !allowed ? <T style={{ marginTop: 6 }}>You may not run this machine. Ask the supervisor to tick it for you.</T>
          : blocking ? <T style={{ color: C.red, marginTop: 6 }}>Cannot restart until its maintenance job is fixed: {blocking.problem}</T>
          : !site.has(me) ? <T style={{ marginTop: 6 }}>You must be checked in at the gate before you start a machine.</T>
          : <View style={{ marginTop: 8 }}><Btn title={panel === "start" ? "Close" : "Start machine"} kind={panel === "start" ? "ghost" : "primary"} onPress={() => setPanel(panel === "start" ? null : "start")} /></View>
        ) : mine ? (
          <View style={{ marginTop: 8 }}><Btn title={panel === "stop" ? "Close" : "Stop machine"} kind={panel === "stop" ? "ghost" : "danger"} onPress={() => setPanel(panel === "stop" ? null : "stop")} /></View>
        ) : (
          <T style={{ marginTop: 6 }}>This machine belongs to {st.operator?.full_name} until they stop it. You can only report a problem on it.</T>
        )}
      </View>

      {panel === "start" && !st.run ? <StartForm D={D} m={m} me={me} /> : null}
      {panel === "stop" && st.run && mine ? <StopForm D={D} m={m} me={me} run={st.run} onDone={() => setPanel(null)} /> : null}

      {showDue ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: readingLate ? C.amberSoft : C.card, borderRadius: 16, borderWidth: 1, borderColor: readingLate ? C.amber : C.line, padding: 14 }}>
          <Icon name="time-outline" size={26} color={readingLate ? C.amber : C.green} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.ink }}>{readingLate ? "Hourly reading is late" : "Next hourly reading"}</Text>
            <Text style={{ color: C.sub, fontSize: 13 }}>
              {readingLate ? `It was due at ${fmtTime(new Date(dueAt))}` : `Due at ${fmtTime(new Date(dueAt))}`}
              {m.stage === "briquette" ? " · weigh 1 minute of output" : ""}
            </Text>
          </View>
        </View>
      ) : null}
      {prod}
      {tileRows.map((row, k) => (
        <Row key={k} style={{ alignItems: "stretch", gap: 12 }}>
          {row.map((t, j) => <View key={j} style={{ flex: 1, flexDirection: "row" }}>{t}</View>)}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </Row>
      ))}

      {m.stage === "briquette" ? <DieCard D={D} m={m} /> : null}
      {st.run && mine ? (
        <>
          <ReadingForm D={D} m={m} me={me} runId={st.run.id} />
          {m.stage === "pellet" ? <GreasingForm D={D} m={m} me={me} /> : null}
        </>
      ) : null}
      {feedStage && allowed && batches.length > 1 ? <YardsPanel D={D} m={m} me={me} /> : null}
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

function ProdStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <Sub>{label}</Sub>
      <Text style={{ fontFamily: F.head, fontSize: 34, color: C.ink, lineHeight: 38 }}>{value}</Text>
      {sub ? <Sub>{sub}</Sub> : null}
    </Card>
  );
}

function DieCard({ D, m }: { D: Data; m: R }) {
  const d = dieCounter(D, m);
  const pct = Math.min(100, Math.round((d.tons / d.limit) * 100));
  return (
    <Card>
      <Row><T bold>{m.wear_part ?? "Die set"}</T><Spacer /><Badge text={`${d.tons.toFixed(1)} / ${d.limit} t`} tone={pct >= 100 ? "bad" : pct >= 85 ? "warn" : "good"} /></Row>
      <View style={{ height: 8, backgroundColor: C.greySoft, borderRadius: 4 }}>
        <View style={{ width: `${pct}%`, height: 8, borderRadius: 4, backgroundColor: pct >= 100 ? C.red : pct >= 85 ? C.amber : C.ok }} />
      </View>
      <Sub>Tons made since {fmtDateTime(d.since)}. Counts the days held on this phone.</Sub>
    </Card>
  );
}

function StartForm({ D, m, me }: { D: Data; m: R; me: string }) {
  const prestart = fieldsFor(D, m.stage, "prestart");
  const [answers, setAnswers] = useState<Record<string, boolean | null>>({});
  const [helpers, setHelpers] = useState<string[]>([]);
  const [runAnyway, setRunAnyway] = useState(false);
  const [remark, setRemark] = useState("");
  const { busy, run } = useAction();

  const busyIds = busyPeople(D);
  const crew = [...onSiteMap(D).keys()].filter((id) => id !== me && !busyIds.has(id));
  const failed = prestart.filter((f) => answers[f.id] === false);
  const allAnswered = prestart.every((f) => answers[f.id] === true || answers[f.id] === false);
  const ready = allAnswered && (failed.length === 0 || (runAnyway && remark.trim().length > 0));

  const start = () =>
    run(async () => {
      const runId = newId();
      const now = nowIso();
      const writes: Parameters<typeof save> = [
        { table: "machine_run", row: { id: runId, machine_id: m.id, operator_id: me, started_at: now, stopped_at: null, stop_reason_id: null, notes: null, entered_by: me } },
        ...helpers.map((p) => ({ table: "run_helper", row: { run_id: runId, person_id: p } })),
        ...prestart.map((f) => ({ table: "prestart_answer", row: { run_id: runId, field_id: f.id, answer: answers[f.id] === true } })),
      ];
      if (failed.length) {
        const jobId = newId();
        writes.push(
          {
            table: "maintenance_job",
            row: {
              id: jobId, kind: "bypass", machine_id: m.id, problem: `Run anyway: ${failed.map((f) => f.label).join(", ")}`, note: remark.trim(),
              reported_by: me, reported_at: now, machine_stopped: false, downtime_id: null, fitter_id: null, started_at: null, fixed_at: null,
            },
          },
          { table: "run_bypass", row: { run_id: runId, remark: remark.trim(), job_id: jobId, by: me, at: now } }
        );
      }
      // Restarting ends any downtime that is still open (power cut, no raw material...).
      for (const d of D.downtime) if (d.machine_id === m.id && !d.ended_at) writes.push({ table: "downtime", row: { id: d.id, ended_at: now } });
      await save(...writes);
    });

  return (
    <Card>
      <T bold style={{ fontSize: 17 }}>Start {m.tag}</T>
      {prestart.length ? <SectionTitle>Checks before start</SectionTitle> : <Sub>No checks are set up for this machine.</Sub>}
      {prestart.map((f) => (
        <Row key={f.id} style={{ justifyContent: "space-between" }}>
          <T style={{ flex: 1 }}>{f.label}</T>
          <YesNo value={answers[f.id] ?? null} onChange={(v) => setAnswers((a) => ({ ...a, [f.id]: v }))} />
        </Row>
      ))}
      {failed.length ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: C.red, fontWeight: "700" }}>A "No" blocks the start.</Text>
          <Check label="Run anyway (goes to maintenance, shows as on bypass)" value={runAnyway} onChange={setRunAnyway} />
          {runAnyway ? <Field label="What is wrong and why it is safe to run" value={remark} onChangeText={setRemark} multiline /> : null}
        </View>
      ) : null}

      <SectionTitle>Helpers (checked in, not on another machine)</SectionTitle>
      {crew.length === 0 ? <Sub>No one else is free.</Sub> : <Chips multi value={helpers} onChange={setHelpers} options={crew.map((id) => ({ key: id, label: personName(D, id) }))} />}
      <Btn title="Start machine" onPress={start} busy={busy} disabled={!ready} />
    </Card>
  );
}

function StopForm({ D, m, me, run: machineRun, onDone }: { D: Data; m: R; me: string; run: R; onDone: () => void }) {
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const { busy, run } = useAction();
  const reason = D.stop_reason.find((r) => r.id === reasonId);

  const stop = () =>
    run(async () => {
      if (!reason) throw new Error("Choose why it is stopping");
      const now = nowIso();
      const writes: Parameters<typeof save> = [
        { table: "machine_run", row: { id: machineRun.id, stopped_at: now, stop_reason_id: reason.id, notes: note.trim() || null } },
      ];
      const dtId = reason.machine_down ? newId() : null;
      if (dtId) {
        writes.push({ table: "downtime", row: { id: dtId, machine_id: m.id, started_at: now, ended_at: null, stop_reason_id: reason.id, notes: note.trim() || null, job_id: null, entered_by: me } });
      }
      if (reason.calls_maintenance) {
        const jobId = newId();
        writes.push({
          table: "maintenance_job",
          row: {
            id: jobId, kind: /die/i.test(reason.name) ? "wear" : "breakdown", machine_id: m.id, problem: note.trim() ? `${reason.name}: ${note.trim()}` : reason.name,
            reported_by: me, reported_at: now, machine_stopped: !!reason.machine_down, downtime_id: dtId, fitter_id: null, started_at: null, fixed_at: null,
          },
        });
        if (dtId) writes.push({ table: "downtime", row: { id: dtId, job_id: jobId } });
      }
      await save(...writes);
      onDone();
    });

  return (
    <Card>
      <T bold style={{ fontSize: 17 }}>Stop {m.tag}</T>
      <Chips value={reasonId} onChange={setReasonId} options={D.stop_reason.map((r) => ({ key: r.id, label: r.name, sub: r.type }))} />
      {reason?.calls_maintenance ? <Text style={{ color: C.amber }}>A maintenance job will be opened. {reason.machine_down ? "The machine stays Down until it is fixed." : ""}</Text> : null}
      <Field label="Note (optional)" value={note} onChangeText={setNote} multiline />
      <Btn title="Stop machine" kind="danger" disabled={!reason} busy={busy} onPress={() => confirm("Stop machine", `Stop ${m.tag}${reason ? ` for "${reason.name}"` : ""}?`, "Stop", stop)} />
    </Card>
  );
}

function ReadingForm({ D, m, me, runId }: { D: Data; m: R; me: string; runId: string }) {
  const base = fieldsFor(D, m.stage, "reading");
  // The briquette 1-minute weight is required every hour, even if the log sheet lines are not set up.
  const fields = m.stage === "briquette" && !base.some((f) => f.field_key === "oneMin")
    ? [{ id: "_oneMin", field_key: "oneMin", label: "1-minute output weight", unit: "kg", required: true } as R, ...base]
    : base;
  const [vals, setVals] = useState<Record<string, string>>({});
  const { busy, run } = useAction();
  const last = lastReading(D, m.id);
  const dueIn = last ? READING_DUE_MIN - Math.round((Date.now() - new Date(last.at).getTime()) / MIN) : null;

  if (fields.length === 0) return null;

  const submit = () =>
    run(async () => {
      for (const f of fields) {
        const v = (vals[f.field_key] ?? "").trim();
        if (f.required && !v) throw new Error(`Enter ${f.label}`);
        if (v && isNaN(Number(v))) throw new Error(`${f.label} must be a number`);
      }
      const clean = Object.fromEntries(fields.filter((f) => (vals[f.field_key] ?? "").trim() !== "").map((f) => [f.field_key, Number(vals[f.field_key])]));
      await save({
        table: "log_reading",
        row: { id: newId(), machine_id: m.id, run_id: runId, at: nowIso(), vals: clean, one_min_kg: clean.oneMin ?? null, by: me },
      });
      setVals({});
      say("Reading saved");
    });

  return (
    <Card>
      <Row>
        <T bold style={{ fontSize: 17 }}>Hourly reading</T>
        <Spacer />
        {last ? <Badge text={dueIn! < 0 ? "Late" : `Last ${fmtTime(last.at)}`} tone={dueIn! < 0 ? "warn" : "mute"} /> : <Badge text="None yet" tone="warn" />}
      </Row>
      {fields.map((f) => (
        <Field key={f.id} label={`${f.label}${f.unit ? ` (${f.unit})` : ""}${f.required ? " *" : ""}`} value={vals[f.field_key] ?? ""} onChangeText={(v) => setVals((x) => ({ ...x, [f.field_key]: v }))} keyboardType="decimal-pad" />
      ))}
      <Btn title="Save reading" onPress={submit} busy={busy} />
    </Card>
  );
}

function GreasingForm({ D, m, me }: { D: Data; m: R; me: string }) {
  const fields = fieldsFor(D, m.stage, "greasing");
  const w = shiftWindow(D.shift);
  const [vals, setVals] = useState<Record<string, string>>({});
  const { busy, run } = useAction();
  if (fields.length === 0 || !w) return null;
  const done = D.greasing_check.find((g) => g.machine_id === m.id && new Date(g.shift_start).getTime() === w.start.getTime());

  const submit = () =>
    run(async () => {
      for (const f of fields) {
        const v = (vals[f.field_key] ?? "").trim();
        if (f.required && !v) throw new Error(`Enter ${f.label}`);
        if (v && isNaN(Number(v))) throw new Error(`${f.label} must be a number`);
      }
      const clean = Object.fromEntries(fields.filter((f) => (vals[f.field_key] ?? "").trim() !== "").map((f) => [f.field_key, Number(vals[f.field_key])]));
      await save({ table: "greasing_check", row: { id: newId(), machine_id: m.id, shift_start: w.start.toISOString(), vals: clean, by: me, at: nowIso() } });
      setVals({});
    });

  return (
    <Card>
      <Row><T bold style={{ fontSize: 17 }}>Greasing (once a shift)</T><Spacer />{done ? <Badge text={`Done ${fmtTime(done.at)}`} tone="good" /> : <Badge text="Due" tone="warn" />}</Row>
      {done ? null : (
        <>
          {fields.map((f) => (
            <Field key={f.id} label={`${f.label}${f.unit ? ` (${f.unit})` : ""}`} value={vals[f.field_key] ?? ""} onChangeText={(v) => setVals((x) => ({ ...x, [f.field_key]: v }))} keyboardType="decimal-pad" />
          ))}
          <Btn title="Save greasing" onPress={submit} busy={busy} />
        </>
      )}
    </Card>
  );
}

/** The operator at the chipper, wet hammer mill or dryer marks when he starts and empties a yard. */
function YardsPanel({ D, m, me }: { D: Data; m: R; me: string }) {
  const { busy, run } = useAction();
  const batches = D.yard_batch
    .filter((b) => !b.finished_at && batchTickets(D, b.id).length > 0 && batchMaterial(D, b)?.feed_stage === m.stage)
    .sort((a, b) => batchCode(D, a).localeCompare(batchCode(D, b)));

  return (
    <Card>
      <T bold style={{ fontSize: 17 }}>Yards for {m.name}</T>
      {batches.length === 0 ? <Sub>No yard is waiting for this machine.</Sub> : null}
      {batches.map((b) => (
        <Row key={b.id} style={{ justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <T bold>{batchCode(D, b)} · {batchMaterial(D, b)?.name}</T>
            <Sub>{batchTickets(D, b.id).length} trucks{b.closed_at ? " · closed" : " · filling"}{b.started_at ? ` · feeding since ${fmtTime(b.started_at)}` : ""}</Sub>
          </View>
          {b.started_at ? (
            <Btn small kind="danger" title="Empty" busy={busy} onPress={() => confirm("Yard empty", `Mark ${batchCode(D, b)} empty?`, "Yes, empty", () => run(() => save({ table: "yard_batch", row: { id: b.id, finished_at: nowIso(), finished_by: me } })))} />
          ) : (
            <Btn small title="Start feeding" busy={busy} onPress={() => run(() => save({ table: "yard_batch", row: { id: b.id, started_at: nowIso(), started_by: me } }))} />
          )}
        </Row>
      ))}
    </Card>
  );
}

const PRESETS = ["Strange noise", "Overheating", "Vibration", "Leak", "Electrical fault", "Blockage", "Other"];

export function ReportProblem() {
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const { session } = useAuth();
  const D = useData();
  const [machineId, setMachineId] = useState<string | null>(params?.machineId ?? null);
  const [preset, setPreset] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [stopped, setStopped] = useState(false);
  const { busy, run } = useAction();

  const submit = () =>
    run(async () => {
      if (!machineId) throw new Error("Choose the machine");
      if (!preset) throw new Error("Choose what is wrong");
      await save({
        table: "maintenance_job",
        row: {
          id: newId(), kind: "problem", machine_id: machineId, problem: preset, note: note.trim() || null, reported_by: session!.person.id, reported_at: nowIso(),
          machine_stopped: stopped, downtime_id: null, fitter_id: null, started_at: null, fixed_at: null,
        },
      });
      say("Sent to the fitters");
      nav.goBack();
    });

  return (
    <Screen>
      <H>Report a problem</H>
      <Sub>Goes straight to the fitters.</Sub>
      <SectionTitle>Machine</SectionTitle>
      <Chips value={machineId} onChange={setMachineId} options={[...D.machine].sort((a, b) => a.tag.localeCompare(b.tag)).map((m) => ({ key: m.id, label: m.tag, sub: m.name }))} />
      <SectionTitle>What is wrong</SectionTitle>
      <Chips value={preset} onChange={setPreset} options={PRESETS.map((p) => ({ key: p, label: p }))} />
      <Field label="More detail (optional)" value={note} onChangeText={setNote} multiline />
      <Check label="The machine cannot run until this is fixed" value={stopped} onChange={setStopped} />
      <Btn title="Send to fitters" onPress={submit} busy={busy} />
    </Screen>
  );
}