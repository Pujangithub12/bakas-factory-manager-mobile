import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Badge, C, Card, Empty, F, Pill, Row, ScreenHeader, SectionTitle, Spacer, Sub, T, Text, initialsOf } from "../ui";
import { useAuth } from "../auth";
import { useData } from "../store";
import { briquetteKg, canRun, fieldsFor, machineStatus, num, pelletKg, personName } from "../rules";
import { fmtDuration, fmtTime, HOUR, productionDayStart, shiftWindow } from "../time";

const DOT = { running: C.ok, down: C.red, idle: C.grey } as const;

const ms = (v: any) => new Date(v).getTime();
const overlap = (a: number, b: number, c: number, d: number) => Math.max(0, Math.min(b, d) - Math.max(a, c));
const tons = (kg: number, digits = 2) => `${(kg / 1000).toFixed(digits)} t`;

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexBasis: "47%", flexGrow: 1, gap: 2 }}>
      <Sub>{label}</Sub>
      <Text style={{ fontFamily: F.bodyBold, fontSize: 17, color: C.ink }}>{value}</Text>
    </View>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Sub>{label}</Sub>
      <Text style={{ fontFamily: F.head, fontSize: 26, color: C.ink, lineHeight: 30 }}>{value}</Text>
    </View>
  );
}

/** The paper log sheet for this shift, one machine at a time: header, totals, hourly readings, start checks, greasing and breakdowns. Management corrects entries on the laptop. */
export default function LogSheet() {
  const nav = useNavigation<any>();
  const { session, roles } = useAuth();
  const D = useData();
  const me = session!.person.id;
  const name = session!.person.full_name;
  const [sel, setSel] = useState<string | null>(null);
  const machines = D.machine.filter((m) => canRun(D, me, m, roles)).sort((a, b) => a.tag.localeCompare(b.tag));
  const m = machines.find((x) => x.id === sel) ?? machines[0];

  const nowMs = Date.now();
  const w = shiftWindow(D.shift);
  const from = w ? w.start : productionDayStart();
  const to = w ? w.end : new Date(from.getTime() + 24 * HOUR);
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const upto = new Date(Math.min(toMs, nowMs));

  const readingFields = m ? fieldsFor(D, m.stage, "reading") : [];
  const prestartFields = m ? fieldsFor(D, m.stage, "prestart") : [];
  const greasingFields = m ? fieldsFor(D, m.stage, "greasing") : [];
  const hasSheet = !!m && (readingFields.length > 0 || prestartFields.length > 0 || greasingFields.length > 0 || m.stage === "briquette");

  const runs = !m ? [] : D.machine_run
    .filter((r) => r.machine_id === m.id && overlap(ms(r.started_at), r.stopped_at ? ms(r.stopped_at) : nowMs, fromMs, toMs) > 0)
    .sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));
  const runMs = runs.reduce((n, r) => n + overlap(ms(r.started_at), r.stopped_at ? ms(r.stopped_at) : nowMs, fromMs, toMs), 0);
  const runHours = runMs / HOUR;
  const lastRun = runs[runs.length - 1];
  const operators = [...new Set(runs.map((r) => r.operator_id as string))];
  const inCharge = D.shift_in_charge.find((s) => ms(s.shift_start) === fromMs)?.person_id as string | undefined;

  const readings = !m ? [] : D.log_reading
    .filter((r) => r.machine_id === m.id && ms(r.at) >= fromMs && ms(r.at) < toMs)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));

  const prodKg = !m ? 0
    : m.stage === "pellet" ? pelletKg(D, from, upto)
    : m.stage === "briquette" ? briquetteKg(D, from, upto, m.id)
    : pelletKg(D, from, upto) + D.machine.filter((x) => x.stage === "briquette").reduce((n, x) => n + briquetteKg(D, from, upto, x.id), 0);

  const checkRuns = runs.map((r) => ({ r, answers: D.prestart_answer.filter((a) => a.run_id === r.id) })).filter((x) => x.answers.length > 0);
  const greased = !m ? undefined : D.greasing_check.find((g) => g.machine_id === m.id && ms(g.shift_start) === fromMs);
  const breakdowns = !m ? [] : D.downtime
    .filter((d) => d.machine_id === m.id && overlap(ms(d.started_at), d.ended_at ? ms(d.ended_at) : nowMs, fromMs, toMs) > 0)
    .sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));

  const dateLabel = from.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const endLabel = !lastRun ? "-" : !lastRun.stopped_at ? "Running" : ms(lastRun.stopped_at) <= toMs ? fmtTime(lastRun.stopped_at) : fmtTime(to);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Log sheet" subtitle={`${name}${w ? ` · ${w.shift.name} shift` : ""}`} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}>
        {machines.length === 0 ? <Empty text="No machine is ticked for you yet." /> : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {machines.map((x) => <Pill key={x.id} label={x.tag} dot={DOT[machineStatus(D, x).state]} selected={x.id === m?.id} onPress={() => setSel(x.id)} />)}
            </ScrollView>

            {!hasSheet ? (
              <Empty text={`The ${m!.name.toLowerCase()} has no log sheet. Start, stop and problems are all that is recorded for it.`} />
            ) : (
              <>
                <Card>
                  <Text style={{ fontFamily: F.head, fontSize: 28, color: C.ink }}>{m!.name}</Text>
                  <Sub>{m!.tag} · {dateLabel}{w ? ` · ${w.shift.name} shift` : ""}</Sub>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 8 }}>
                    <Kv label="Start" value={runs.length ? fmtTime(new Date(Math.max(ms(runs[0].started_at), fromMs))) : "-"} />
                    <Kv label="End" value={endLabel} />
                    <Kv label="In-charge" value={inCharge ? personName(D, inCharge) : "Not set"} />
                    <Kv label="Operator" value={operators.length ? operators.map((p) => personName(D, p)).join(", ") : "-"} />
                  </View>
                </Card>

                <Card>
                  <Row style={{ gap: 12 }}>
                    <Total label="Run hours" value={fmtDuration(runMs)} />
                    <Total label="Total prod." value={tons(prodKg)} />
                    <Total label="Avg prod." value={runHours > 0 ? `${(prodKg / 1000 / runHours).toFixed(2)} t/h` : "-"} />
                  </Row>
                </Card>

                <SectionTitle>{`Hourly readings · ${readings.length}`}</SectionTitle>
                {readings.length === 0 ? <Empty text="No readings this shift yet." /> : readings.map((r) => {
                  const cells = readingFields
                    .filter((f) => r.vals?.[f.field_key] !== "" && r.vals?.[f.field_key] != null)
                    .map((f) => ({ label: f.label as string, value: `${r.vals[f.field_key]}${f.unit ? ` ${f.unit}` : ""}` }));
                  if (m!.stage === "briquette" && num(r.one_min_kg) > 0) {
                    if (!readingFields.some((f) => f.field_key === "oneMin")) cells.push({ label: "1-minute weight", value: `${num(r.one_min_kg)} kg` });
                    cells.push({ label: "= tons per hour", value: (num(r.one_min_kg) * 0.06).toFixed(2) });
                  }
                  return (
                    <Card key={r.id}>
                      <Row><T bold>{fmtTime(r.at)}</T><Spacer /><Sub>{personName(D, r.by)}</Sub></Row>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
                        {cells.map((c, i) => (
                          <View key={i} style={{ flexBasis: "30%", flexGrow: 1 }}>
                            <Sub>{c.label}</Sub>
                            <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.ink }}>{c.value}</Text>
                          </View>
                        ))}
                      </View>
                    </Card>
                  );
                })}

                <SectionTitle>Checks before starting</SectionTitle>
                <Card>
                  {checkRuns.length === 0 ? <Sub>No start this shift yet.</Sub> : checkRuns.map(({ r, answers }) => {
                    const no = answers.filter((a) => a.answer === false).map((a) => D.log_field.find((f) => f.id === a.field_id)?.label ?? "?");
                    const remark = D.run_bypass.find((b) => b.run_id === r.id)?.remark as string | undefined;
                    return (
                      <View key={r.id} style={{ gap: 2 }}>
                        <Row style={{ gap: 10, flexWrap: "wrap" }}>
                          <T bold>{fmtTime(r.started_at)}</T>
                          <Sub>{personName(D, r.operator_id)}</Sub>
                          <Spacer />
                          {no.length ? <Badge text={`No: ${no.join(", ")}`} tone="bad" /> : <Badge text="All yes" tone="good" />}
                        </Row>
                        {remark ? <Text style={{ fontSize: 13, color: C.red }}>Bypass remark: "{remark}"</Text> : null}
                      </View>
                    );
                  })}
                </Card>

                {greasingFields.length ? (
                  <>
                    <SectionTitle>Greasing this shift</SectionTitle>
                    <Card>
                      {greased ? greasingFields.map((f) => {
                        const v = greased.vals?.[f.field_key];
                        return (
                          <Row key={f.id} style={{ justifyContent: "space-between" }}>
                            <T>{f.label}</T>
                            <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.ink }}>{v === "" || v == null ? "-" : `${v}${f.unit ? ` ${f.unit}` : ""}`}</Text>
                          </Row>
                        );
                      }) : <Sub>Not done yet this shift.</Sub>}
                      {greased ? <Sub>Saved {fmtTime(greased.at)} by {personName(D, greased.by)}</Sub> : null}
                    </Card>
                  </>
                ) : null}

                <SectionTitle>Breakdowns</SectionTitle>
                <Card>
                  {breakdowns.length === 0 ? <Sub>None this shift.</Sub> : breakdowns.map((d) => (
                    <Row key={d.id} style={{ gap: 10, flexWrap: "wrap" }}>
                      <T bold>{fmtTime(d.started_at)}-{d.ended_at ? fmtTime(d.ended_at) : "now"}</T>
                      <Sub>{D.stop_reason.find((s) => s.id === d.stop_reason_id)?.name ?? ""}</Sub>
                      <Spacer />
                      <Sub>{fmtDuration((d.ended_at ? ms(d.ended_at) : nowMs) - ms(d.started_at))}</Sub>
                    </Row>
                  ))}
                </Card>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}