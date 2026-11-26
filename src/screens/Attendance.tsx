import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Badge, Btn, C, Card, Empty, F, Field, Row, ScreenHeader, Search, Sheet, Sub, T, Text, initialsOf, useAction } from "../ui";
import { useAuth } from "../auth";
import { save, useData } from "../store";
import { requestDays, useSyncState } from "../sync";
import { MARK_STATUSES, attendanceAccess, attendanceIndex, attendancePeople, canMarkDay, dayEntry, mainRole, markBackDays, personName, type DayEntry, type MarkStatus } from "../rules";
import { DAY, addDays, dayKey, fmtDayKey, fmtTime, nowIso, type Row as R } from "../time";
import { roleInfo } from "../roles";

const TONE: Record<MarkStatus, [string, string]> = {
  Present: [C.okSoft, C.ok],
  "Half day": [C.amberSoft, C.amber],
  Absent: [C.redSoft, C.red],
  Leave: [C.blueSoft, C.blue],
  Off: [C.greySoft, C.sub],
};
const SHORT: Record<MarkStatus, string> = { Present: "Present", "Half day": "Half", Absent: "Absent", Leave: "Leave", Off: "Off" };

/** The day's attendance. It fills itself from the gate; a Supervisor, Manager or the Owner marks or corrects it. */
export default function Attendance() {
  const nav = useNavigation<any>();
  const route = useRoute();
  const { session, roles } = useAuth();
  const D = useData();
  const sync = useSyncState();
  const { busy, run } = useAction();
  const me = session!.person.id;
  const name = session!.person.full_name;
  const inTab = route.name === "AttendanceHome";

  // Who may see or mark is set by the Owner on the laptop.
  const access = attendanceAccess(D, me, roles);
  const today = dayKey();
  const [day, setDay] = useState(today);
  const [q, setQ] = useState("");
  const [ask, setAsk] = useState<{ p: R; status: MarkStatus } | null>(null);
  const [note, setNote] = useState("");

  const oldest = addDays(today, -Math.min(markBackDays(roles), 365));
  const ago = Math.round((Date.parse(today) - Date.parse(day)) / DAY);
  const need = ago + 2;
  useEffect(() => requestDays(need), [need]);
  const loaded = ago <= 1 || sync.loadedDays >= need;

  const ix = useMemo(() => attendanceIndex(D), [D.attendance, D.attendance_mark]);
  const list = useMemo(
    () => attendancePeople(D, ix, [day]).map((p) => ({ p, e: dayEntry(ix, p, day) })),
    [D.person, D.person_role, ix, day],
  );
  const count = (s: string) => list.filter((x) => x.e.status === s).length;
  const canEdit = canMarkDay(access, roles, day, today);
  const shown = list.filter((x) => x.p.full_name.toLowerCase().includes(q.trim().toLowerCase()));

  const write = (p: R, status: MarkStatus, why: string | null) =>
    run(() => save({ table: "attendance_mark", row: { person_id: p.id, day, status, note: why, marked_by: me, marked_at: nowIso() } }));

  const tap = (p: R, e: DayEntry, status: MarkStatus) => {
    // Tapping the mark again removes it, and the day goes back to what the gate recorded.
    if (e.mark?.status === status) return run(() => save({ table: "attendance_mark", op: "delete", row: { person_id: p.id, day } }));
    if (!e.mark && e.status === status) return;
    if (e.gate && status !== "Present") {
      setNote(e.mark?.note ?? "");
      setAsk({ p, status });
      return;
    }
    write(p, status, null);
  };

  const fig = (label: string, n: number, color: string = C.ink) => (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ fontFamily: F.head, fontSize: 26, color }}>{n}</Text>
      <Sub>{label}</Sub>
    </View>
  );

  if (access === "none") {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        {inTab ? <ScreenHeader title="Attendance" subtitle={name} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} /> : null}
        <Empty text="You do not have access to the attendance sheet. Ask the Owner." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {inTab ? <ScreenHeader title="Attendance" subtitle={name} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} /> : null}
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Row>
          <Btn small kind="ghost" title="‹ Back" disabled={day <= oldest} onPress={() => setDay(addDays(day, -1))} />
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontFamily: F.head, fontSize: 24, color: C.ink }}>{fmtDayKey(day)}</Text>
            <Sub>{day === today ? "Today" : day === addDays(today, -1) ? "Yesterday" : `${ago} days ago`}</Sub>
          </View>
          <Btn small kind="ghost" title="Next ›" disabled={day >= today} onPress={() => setDay(addDays(day, 1))} />
        </Row>

        <Card>
          <Row>
            {fig("Present", count("Present"), C.ok)}
            {fig("Half", count("Half day"), C.amber)}
            {fig("Not marked", count("Not marked"))}
            {fig("Absent", count("Absent"), C.red)}
            {fig("Leave", count("Leave"), C.blue)}
            {fig("Off", count("Off"), C.sub)}
          </Row>
        </Card>

        {!loaded ? <Sub>Loading this day's records...</Sub> : null}
        <Search value={q} onChangeText={setQ} placeholder="Search name" />
        {shown.length === 0 ? <Empty text="Nobody to show." /> : null}

        {shown.map(({ p, e }) => {
          const status = e.status;
          const role = mainRole(D, p.id);
          const gateLine = e.gate
            ? `Gate in ${fmtTime(e.gate.gate_in)}${e.lastGate?.gate_out ? ` · out ${fmtTime(e.lastGate.gate_out)}` : e.noCheckout ? " · no check-out" : " · on site"}`
            : "No gate entry";
          return (
            <Card key={p.id} style={{ gap: 8 }}>
              <Row>
                <View style={{ flex: 1 }}>
                  <T bold>{p.full_name}</T>
                  <Sub>{role ? roleInfo(role).label : "No role"} · {gateLine}</Sub>
                </View>
                {status === "Not marked" ? <Badge text="Not marked" /> : status ? <Badge text={status} tone={status === "Present" ? "good" : status === "Absent" ? "bad" : status === "Half day" ? "warn" : status === "Leave" ? "info" : "mute"} /> : null}
              </Row>
              {e.mark ? <Sub>Marked by {personName(D, e.mark.marked_by)}{e.mark.note ? `: ${e.mark.note}` : ""}</Sub> : null}
              {canEdit ? (
                <View style={{ flexDirection: "row", gap: 5 }}>
                  {MARK_STATUSES.map((s) => {
                    const on = status === s;
                    return (
                      <Pressable
                        key={s}
                        disabled={busy}
                        onPress={() => tap(p, e, s)}
                        accessibilityRole="button"
                        accessibilityLabel={`${p.full_name}: ${s}`}
                        accessibilityState={{ selected: on }}
                        style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, borderWidth: 1, backgroundColor: on ? TONE[s][0] : "#fff", borderColor: on ? TONE[s][1] : C.line }}
                      >
                        <Text style={{ fontSize: 12, fontFamily: F.bodyBold, color: on ? TONE[s][1] : C.sub }}>{SHORT[s]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>

      <Sheet
        visible={!!ask}
        title={ask ? `${ask.status}: ${ask.p.full_name}` : ""}
        subtitle="The gate shows this person came in. Why is it being changed?"
        onClose={() => setAsk(null)}
        footer={
          <>
            <View style={{ flex: 1 }}><Btn title="Cancel" kind="ghost" onPress={() => setAsk(null)} /></View>
            <View style={{ flex: 1 }}>
              <Btn
                title="Save"
                busy={busy}
                disabled={!note.trim()}
                onPress={() => {
                  if (ask) write(ask.p, ask.status, note.trim());
                  setAsk(null);
                }}
              />
            </View>
          </>
        }
      >
        <Field label="Reason" value={note} onChangeText={setNote} placeholder="Left early, sent home" maxLength={200} />
      </Sheet>
    </View>
  );
}
