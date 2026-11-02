import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Screen, H, Sub, Card, T, Text, Badge, Row, Btn, Field, SectionTitle, Chips, Select, Search, Empty, C, F, Spacer, say, useAction } from "../ui";
import { useAuth } from "../auth";
import { newId, save, useData } from "../store";
import { TabScreen } from "../tabs";
import { isDaily, itemName, machineOf, meterNow, num, pmDueText, pmEvery, pmState, personName, round2, dueTasks, type PmState } from "../rules";
import { groupByDay, pmEvents } from "../plan";
import { fmtDateTime, fmtTime, nowIso, productionDayStart, DAY, type Row as R } from "../time";

const kindTone = (k: string) => (k === "breakdown" || k === "bypass" ? "bad" : k === "wear" ? "warn" : "info");

// ---------------------------------------------------------------- jobs ----

function JobCard({ j, action }: { j: R; action?: React.ReactNode }) {
  const nav = useNavigation<any>();
  const D = useData();
  return (
    <Card onPress={() => nav.navigate("Job", { jobId: j.id })} style={{ gap: 6, padding: 14, borderRadius: 16 }}>
      <Row>
        <Text style={{ fontFamily: F.bodyBold, fontSize: 17, color: C.ink }}>{machineOf(D, j.machine_id)?.tag}</Text>
        <Badge text={j.kind} tone={kindTone(j.kind) as any} />
        {j.machine_stopped && !j.fixed_at ? <Badge text="Machine down" tone="bad" /> : null}
      </Row>
      <T>{j.problem}</T>
      <Sub>{personName(D, j.reported_by)} · {fmtDateTime(j.reported_at)}{j.fitter_id && !j.fixed_at ? ` · ${personName(D, j.fitter_id)} working` : ""}</Sub>
      {j.fixed_at ? <Sub>Fixed {fmtDateTime(j.fixed_at)}{j.work_done ? ` · ${j.work_done}` : ""}</Sub> : null}
      {action}
    </Card>
  );
}

/** The fitter's Jobs tab: what is in hand, what waits, what the others are on. */
export function FitterJobs() {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const { busy, run } = useAction();
  const D = useData();
  const me = session!.person.id;
  const open = D.maintenance_job.filter((j) => !j.fixed_at);
  const waiting = open.filter((j) => !j.fitter_id).sort((a, b) => Number(!!b.machine_stopped) - Number(!!a.machine_stopped) || a.reported_at.localeCompare(b.reported_at));
  const mine = open.filter((j) => j.fitter_id === me);
  const others = open.filter((j) => j.fitter_id && j.fitter_id !== me);
  return (
    <TabScreen title="Maintenance jobs">
      <SectionTitle>{`In your hands · ${mine.length}`}</SectionTitle>
      {mine.length === 0 ? <Empty text="No job in hand. Take one below." /> : null}
      {mine.map((j) => <JobCard key={j.id} j={j} action={<Btn small title="Mark fixed" onPress={() => nav.navigate("Job", { jobId: j.id })} />} />)}
      <SectionTitle>{`Waiting for a fitter · ${waiting.length}`}</SectionTitle>
      {waiting.length === 0 ? <Empty text="Nothing waiting." /> : null}
      {waiting.map((j) => <JobCard key={j.id} j={j} action={<Btn small title="Take this job" busy={busy} onPress={() => run(() => save({ table: "maintenance_job", row: { id: j.id, fitter_id: me, started_at: nowIso() } }))} />} />)}
      {others.length ? <SectionTitle>{`Other fitters · ${others.length}`}</SectionTitle> : null}
      {others.map((j) => <JobCard key={j.id} j={j} />)}
      <Btn title="Report a problem" kind="ghost" onPress={() => nav.navigate("ReportProblem")} />
    </TabScreen>
  );
}

/** Jobs this fitter fixed in the last 7 days. */
export function FitterDone() {
  const { session } = useAuth();
  const D = useData();
  const list = D.maintenance_job.filter((j) => j.fixed_at && j.fitter_id === session!.person.id && Date.now() - new Date(j.fixed_at).getTime() < 7 * DAY).sort((a, b) => b.fixed_at.localeCompare(a.fixed_at));
  return (
    <TabScreen title="Fixed this week">
      <Sub>Jobs you fixed in the last 7 days: {list.length}.</Sub>
      {list.length === 0 ? <Empty text="Nothing fixed this week." /> : null}
      {list.map((j) => <JobCard key={j.id} j={j} />)}
    </TabScreen>
  );
}

// ---------------------------------------------------------------- plan ----

const pill = (s: PmState) =>
  s.st === "over" ? <Badge text="Overdue" tone="bad" /> : s.st === "soon" ? <Badge text="Due soon" tone="warn" /> : s.st === "new" ? <Badge text="No record" /> : <Badge text="OK" />;

/** The maintenance plan: the daily round, what is due, and every task. */
export function FitterPlan() {
  const nav = useNavigation<any>();
  const D = useData();
  const [q, setQ] = useState("");
  const [view, setView] = useState<string | null>("due");
  const t0 = productionDayStart().getTime();
  const daily = D.pm_task.filter(isDaily);
  const doneToday = daily.filter((t) => D.pm_done.some((d) => d.task_id === t.id && new Date(d.done_at).getTime() >= t0)).length;
  const needle = q.trim().toLowerCase();
  const match = (t: R) => !needle || `${t.component} ${t.task} ${t.equipment} ${t.lubricant ?? ""}`.toLowerCase().includes(needle);
  const due = dueTasks(D, match);
  const all = D.pm_task.filter((t) => !isDaily(t) && match(t)).map((t) => ({ t, s: pmState(D, t) })).sort((a, b) => b.s.f - a.s.f);
  const list = due;
  const agenda = view === "cal" ? groupByDay(pmEvents(D, t0, t0 + 30 * DAY, match)) : [];

  return (
    <TabScreen title="Maintenance plan">
      <Card onPress={() => nav.navigate("DailyRound")} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, backgroundColor: doneToday < daily.length ? C.amberSoft : C.card }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.ink }}>Daily round</Text>
          <Sub>{doneToday} of {daily.length} checks done today</Sub>
        </View>
      </Card>
      <Search value={q} onChangeText={setQ} placeholder="Search a part, task or oil" />
      <Chips value={view} onChange={(v) => setView(v ?? "due")} options={[{ key: "due", label: "Due now" }, { key: "cal", label: "Next 30 days" }]} />
      {view === "cal" ? (
        <Card style={{ gap: 8 }}>
          {agenda.length === 0 ? <Sub>Nothing in this period.</Sub> : null}
          {agenda.map((g) => (
            <View key={g.at} style={{ gap: 4, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.line }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 14, color: C.ink }}>{new Date(g.at + 5.75 * 3_600_000).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}</Text>
              {g.list.map((e, i) => (
                <Pressable key={i} onPress={() => nav.navigate("PmDone", { taskId: e.t.id })} style={{ borderLeftWidth: 3, borderLeftColor: e.k === "over" ? C.red : e.k === "soon" ? C.amber : e.k === "done" ? C.ok : C.line, backgroundColor: C.greySoft, borderRadius: 4, padding: 6 }}>
                  <Text style={{ fontSize: 13, color: C.ink }}><Text style={{ fontWeight: "700" }}>{D.machine.find((m) => m.id === e.t.machine_id)?.tag} </Text>{e.t.component}: {e.t.task}{e.k === "done" ? ` · done by ${personName(D, e.by)}` : e.k === "over" ? " · overdue" : ""}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </Card>
      ) : (
        <>
      <SectionTitle>{`Overdue and due soon · ${due.length}`}</SectionTitle>
      {list.length === 0 ? <Empty text="Nothing is due." /> : null}
      {list.map(({ t, s }) => (
        <Card key={t.id} style={{ gap: 6, padding: 14, borderRadius: 16 }}>
          <Row>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 15, color: C.ink }}>{t.component}: {t.task}</Text>
              <Sub>{t.equipment} · {pmEvery(t)}</Sub>
            </View>
            {pill(s)}
          </Row>
          <Sub>{pmDueText(t, s)}{t.lubricant ? ` · ${t.lubricant}` : ""}</Sub>
          <Btn small title="Mark done" onPress={() => nav.navigate("PmDone", { taskId: t.id })} />
        </Card>
      ))}
        </>
      )}
    </TabScreen>
  );
}

/** Take a lubricant amount out of the store and write the task as done. */
export function PmDone() {
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const { session } = useAuth();
  const D = useData();
  const t = D.pm_task.find((x) => x.id === params.taskId);
  // The plan names the oil and amount, e.g. "Mobil XHP 222, 20 g": suggest the store item and the quantity in its unit.
  const lubes = D.store_item.filter((i) => i.kind !== "Tool");
  const m = /(\d+(?:\.\d+)?)\s*(g|kg|L)\b/.exec(t?.lubricant ?? "");
  const guess = m ? lubes.find((i) => i.kind === "Lubricant" && String(t?.lubricant).toLowerCase().includes((String(i.name).split(" ")[1] ?? "#").toLowerCase())) : undefined;
  const [note, setNote] = useState("");
  const [itemId, setItemId] = useState<string | null>(guess?.id ?? null);
  const [q, setQ] = useState(guess && m ? String(m[2] === "g" ? Number(m[1]) / 1000 : Number(m[1])) : "");
  const { busy, run } = useAction();
  if (!t) return <Screen><Empty text="Task not found." /></Screen>;
  const meter = meterNow(D, t.machine_id);

  const submit = () =>
    run(async () => {
      const it = lubes.find((i) => i.id === itemId);
      const n = Number(q);
      if (it && !(n > 0)) throw new Error("Enter the quantity taken from the store");
      if (it && n > num(it.qty)) throw new Error(`Only ${num(it.qty)} ${it.unit} in the store`);
      const me = session!.person.id;
      const now = nowIso();
      await save(
        { table: "pm_done", row: { id: newId(), task_id: t.id, machine_id: t.machine_id, done_at: now, by: me, hour_meter: Math.round(meter * 10) / 10, minutes: null, note: note.trim() || null } },
        ...(it ? [
          { table: "store_item", row: { id: it.id, qty: round2(num(it.qty) - n) } },
          { table: "store_movement", row: { id: newId(), item_id: it.id, type: "issue", qty: n, to_person_id: me, by: me, at: now, due_back: null, returned_at: null, condition: null, returned_by: null, note: `Maintenance plan: ${t.task}`, job_id: null, task_id: t.id, pr_id: null } },
        ] : []),
      );
      say("Done", `${t.task}. Next due ${pmEvery(t)} from now.`);
      nav.goBack();
    });

  return (
    <Screen>
      <H>Done: {t.task}</H>
      <Sub>{t.equipment} · {pmEvery(t)}</Sub>
      <Field label="Note (optional)" value={note} onChangeText={setNote} hint="What was found, readings, parts" multiline />
      <SectionTitle>Taken from the store (optional)</SectionTitle>
      <Select value={itemId} options={lubes.map((i) => ({ key: i.id, label: i.name, sub: `${num(i.qty)} ${i.unit} in store` }))} onChange={setItemId} placeholder="Nothing" title="Store item" />
      <Field label="Quantity" value={q} onChangeText={(v) => setQ(v.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" hint={guess ? "From the plan. Change it to what was used." : undefined} />
      <Card><Sub>The hour meter now reads {Math.round(meter).toLocaleString("en-US")} h on {machineOf(D, t.machine_id)?.tag}. It is saved with this record.</Sub></Card>
      <Btn title="Mark done" onPress={submit} busy={busy} />
    </Screen>
  );
}

/** Tick each daily check. Anything marked Problem goes to maintenance as a job. */
export function DailyRound() {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const D = useData();
  const t0 = productionDayStart().getTime();
  const list = D.pm_task.filter(isDaily).sort((a, b) => String(a.equipment).localeCompare(String(b.equipment)));
  const doneToday = (t: R) => D.pm_done.some((d) => d.task_id === t.id && new Date(d.done_at).getTime() >= t0);
  const [ans, setAns] = useState<Record<string, string | null>>({});
  const [note, setNote] = useState("");
  const { busy, run } = useAction();

  const submit = () =>
    run(async () => {
      const ticked = list.filter((t) => ans[t.id]);
      if (!ticked.length) throw new Error("Tick at least one check");
      const me = session!.person.id;
      const now = nowIso();
      const bad = ticked.filter((t) => ans[t.id] === "no");
      await save(
        ...ticked.map((t) => ({ table: "pm_done", row: { id: newId(), task_id: t.id, machine_id: t.machine_id, done_at: now, by: me, hour_meter: Math.round(meterNow(D, t.machine_id) * 10) / 10, minutes: null, note: ans[t.id] === "no" ? "Problem" : "OK" } })),
        ...bad.map((t) => ({ table: "maintenance_job", row: { id: newId(), kind: "problem", machine_id: t.machine_id, problem: `Daily round: ${t.task}`, note: note.trim() || null, when_needed: null, reported_by: me, reported_at: now, machine_stopped: false, downtime_id: null, fitter_id: null, started_at: null, fixed_at: null, work_done: null, parts_used: null } })),
      );
      say("Round saved", `${ticked.length} checks${bad.length ? `, ${bad.length} problem${bad.length > 1 ? "s" : ""} sent to maintenance` : ""}.`);
      nav.goBack();
    });

  return (
    <Screen>
      <H>Daily round</H>
      <Sub>Tick each check. Anything marked Problem goes to maintenance as a job.</Sub>
      {list.map((t) => (
        <Card key={t.id} style={{ gap: 6 }}>
          <T bold>{t.task}</T>
          <Sub>{t.equipment}{doneToday(t) ? " · done today" : ""}</Sub>
          <Chips value={ans[t.id] ?? null} onChange={(v) => setAns((a) => ({ ...a, [t.id]: v }))} options={[{ key: "yes", label: "OK" }, { key: "no", label: "Problem" }]} />
        </Card>
      ))}
      <Field label="Problem details (if any)" value={note} onChangeText={setNote} hint="What is wrong" />
      <Btn title="Save round" onPress={submit} busy={busy} />
    </Screen>
  );
}
