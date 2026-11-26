import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Avatar, Badge, Btn, C, Card, Chips, Empty, F, Field, Icon, Row, ScreenHeader, Search, Sheet, Sub, T, Text, confirm, initialsOf, useAction } from "../ui";
import { useAuth } from "../auth";
import { save, useData } from "../store";
import { requestDays, useSyncState } from "../sync";
import { ACCESS_LABEL, ATT_ACCESS_KEY, MARK_STATUSES, WEEKLY_OFF, accessList, attendanceAccess, attendanceIndex, attendancePeople, canMarkDay, dayCode, dayEntry, dayShare, defaultAccess, mainRole, personName, rolesOf, type AttAccess, type AttendanceIndex, type DayEntry, type MarkStatus } from "../rules";
import { DAY, addDays, dayKey, fmtDayKey, fmtTime, nowIso, weekdayOf, type Row as R } from "../time";
import { roleInfo } from "../roles";

type Status = MarkStatus | "Not marked";
const TONE: Record<Status, [string, string]> = {
  Present: [C.okSoft, C.ok],
  "Half day": [C.amberSoft, C.amber],
  Absent: [C.redSoft, C.red],
  Leave: [C.blueSoft, C.blue],
  Off: [C.greySoft, C.sub],
  "Not marked": [C.greySoft, C.grey],
};
const SHORT: Record<Status, string> = { Present: "Present", "Half day": "Half", Absent: "Absent", Leave: "Leave", Off: "Off", "Not marked": "Not marked" };
const ICON: Record<MarkStatus, React.ComponentProps<typeof Icon>["name"]> = {
  Present: "checkmark-circle", "Half day": "contrast", Absent: "close-circle", Leave: "airplane", Off: "moon",
};
const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const addMonths = (m: string, n: number) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
function monthDays(month: string) {
  const out: string[] = [];
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) out.push(d);
  return out;
}

/** The attendance sheet: a Daily tab to mark one day, and a Monthly tab with each person's month. It fills itself from the gate. */
export default function Attendance() {
  const nav = useNavigation<any>();
  const route = useRoute();
  const { session, roles } = useAuth();
  const D = useData();
  const me = session!.person.id;
  const name = session!.person.full_name;
  const inTab = route.name === "AttendanceHome";

  const access = attendanceAccess(D, me, roles);
  const isOwner = roles.includes("Owner");
  const today = dayKey();
  const [tab, setTab] = useState<"daily" | "monthly">("daily");
  const [day, setDay] = useState(today);
  const [accessOpen, setAccessOpen] = useState(false);
  // The server sends management a year of history and anyone else a month.
  const cap = roles.some((r) => r === "Owner" || r === "Manager" || r === "Supervisor") ? 400 : 31;
  const ix = useMemo(() => attendanceIndex(D), [D.attendance, D.attendance_mark]);

  const header = inTab ? <ScreenHeader title="Attendance" subtitle={name} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} /> : null;

  if (access === "none") {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        {header}
        <Empty text="You do not have access to the attendance sheet. Ask the Owner." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {header}
      <View style={{ paddingHorizontal: 14, paddingTop: 12, gap: 10 }}>
        <View style={{ flexDirection: "row", backgroundColor: C.greySoft, borderRadius: 14, padding: 4 }}>
          {(["daily", "monthly"] as const).map((k) => {
            const on = tab === k;
            return (
              <Pressable
                key={k}
                onPress={() => setTab(k)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={{ flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 11, backgroundColor: on ? C.card : "transparent", elevation: on ? 2 : 0 }}
              >
                <Text style={{ fontFamily: F.headSemi, fontSize: 19, color: on ? C.green : C.sub }}>{k === "daily" ? "Daily" : "Monthly"}</Text>
              </Pressable>
            );
          })}
        </View>
        {isOwner ? <Btn small kind="soft" title="Access: who can view or mark" onPress={() => setAccessOpen(true)} /> : null}
      </View>

      {tab === "daily" ? (
        <Daily ix={ix} access={access} cap={cap} day={day} setDay={setDay} />
      ) : (
        <Monthly ix={ix} cap={cap} onOpenDay={(d) => { setDay(d); setTab("daily"); }} />
      )}

      {accessOpen ? <AccessSheet onClose={() => setAccessOpen(false)} /> : null}
    </View>
  );
}

// ------------------------------------------------------------- daily ----

function Daily({ ix, access, cap, day, setDay }: { ix: AttendanceIndex; access: AttAccess; cap: number; day: string; setDay: (d: string) => void }) {
  const { session, roles } = useAuth();
  const D = useData();
  const sync = useSyncState();
  const me = session!.person.id;
  const today = dayKey();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Status | null>(null);
  const [open, setOpen] = useState<R | null>(null);
  const { busy, run } = useAction();

  // Any day this person receives can be looked at; marking keeps its own day limits.
  const oldest = addDays(today, -(cap - 2));
  const ago = Math.round((Date.parse(today) - Date.parse(day)) / DAY);
  const need = Math.min(cap, ago + 2);
  useEffect(() => requestDays(need), [need]);
  // Until the older records arrive, a day with nothing on it is unknown, not Absent.
  const loaded = ago <= 1 || sync.loadedDays >= need;

  const list = useMemo(
    () =>
      attendancePeople(D, ix, [day]).map((p) => {
        const e = dayEntry(ix, p, day);
        const status: Status | null = e.status;
        return { p, e, status };
      }),
    [D.person, D.person_role, ix, day, loaded],
  );
  const count = (s: Status) => list.filter((x) => x.status === s).length;
  const canEdit = canMarkDay(access, roles, day, today);
  const needle = q.trim().toLowerCase();
  const shown = list.filter((x) => (!filter || x.status === filter) && x.p.full_name.toLowerCase().includes(needle));
  const present = count("Present") + count("Half day") * 0.5;
  const expected = list.filter((x) => x.status && x.status !== "Off" && x.status !== "Leave").length;
  const pct = expected ? Math.round((present / expected) * 100) : 0;

  const stats: Status[] = ["Present", "Half day", "Not marked", "Absent", "Leave", "Off"];
  const label = day === today ? "Today" : day === addDays(today, -1) ? "Yesterday" : `${ago} days ago`;
  const openEntry = open ? list.find((x) => x.p.id === open.id) : undefined;

  // "Mark all present" fills in only the people who are Not marked among those shown.
  // Marks already made by hand, gate entries and the Saturday Off are left as they are.
  const unmarked = shown.filter((x) => x.status === "Not marked");
  const markAll = () =>
    confirm("Mark all present", `Mark ${unmarked.length} ${unmarked.length === 1 ? "person" : "people"} present for ${fmtDayKey(day)}?`, "Mark present", () =>
      run(async () => {
        const at = nowIso();
        for (const x of unmarked) await save({ table: "attendance_mark", row: { person_id: x.p.id, day, status: "Present", note: null, marked_by: me, marked_at: at } });
      }),
    );

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 12 }} keyboardShouldPersistTaps="handled">
        {access === "view" ? <Sub>You can view this sheet. Only people the Owner allows can mark it.</Sub> : null}

        <Card style={{ padding: 0, overflow: "hidden" }}>
          <Row style={{ paddingHorizontal: 6, paddingVertical: 10 }}>
            <Pressable onPress={() => setDay(addDays(day, -1))} disabled={day <= oldest} hitSlop={10} style={{ padding: 8, opacity: day <= oldest ? 0.3 : 1 }} accessibilityLabel="Previous day">
              <Icon name="chevron-back" size={26} />
            </Pressable>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 12, color: C.sub, letterSpacing: 1 }}>{WEEK[weekdayOf(day)]!.toUpperCase()} · {label.toUpperCase()}</Text>
              <Text style={{ fontFamily: F.head, fontSize: 28, color: C.ink, lineHeight: 32 }}>{fmtDayKey(day)}</Text>
            </View>
            <Pressable onPress={() => setDay(addDays(day, 1))} disabled={day >= today} hitSlop={10} style={{ padding: 8, opacity: day >= today ? 0.3 : 1 }} accessibilityLabel="Next day">
              <Icon name="chevron-forward" size={26} />
            </Pressable>
          </Row>
          <View style={{ backgroundColor: C.greenSoft, paddingHorizontal: 16, paddingVertical: 10, gap: 6 }}>
            <Row>
              <Text style={{ flex: 1, fontFamily: F.bodyBold, color: C.green, fontSize: 13 }}>{loaded ? `${present} of ${expected} at work` : "Loading this day..."}</Text>
              <Text style={{ fontFamily: F.head, color: C.green, fontSize: 22 }}>{loaded ? `${pct}%` : ""}</Text>
            </Row>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: "#fff" }}>
              <View style={{ height: 6, borderRadius: 3, width: `${loaded ? pct : 0}%`, backgroundColor: C.green }} />
            </View>
          </View>
          {day !== today ? (
            <Pressable onPress={() => setDay(today)} style={{ alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
              <Text style={{ fontFamily: F.bodyBold, color: C.green, fontSize: 13 }}>Go to today</Text>
            </Pressable>
          ) : null}
        </Card>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {stats.map((s) => {
            const on = filter === s;
            const [bg, fg] = TONE[s];
            return (
              <Pressable
                key={s}
                onPress={() => setFilter(on ? null : s)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${s}: ${count(s)}. Show only these`}
                style={{ minWidth: 72, alignItems: "center", paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14, backgroundColor: on ? fg : bg, borderWidth: 1, borderColor: on ? fg : "transparent" }}
              >
                <Text style={{ fontFamily: F.head, fontSize: 24, lineHeight: 28, color: on ? "#fff" : fg }}>{count(s)}</Text>
                <Text style={{ fontSize: 12, fontFamily: F.bodyBold, color: on ? "#fff" : fg }}>{SHORT[s]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Search value={q} onChangeText={setQ} placeholder="Search name" />
        {canEdit && loaded && unmarked.length ? <Btn title={`Mark all present (${unmarked.length})`} busy={busy} onPress={markAll} /> : null}
        {filter ? (
          <Row>
            <Sub style={{ flex: 1 }}>Showing {SHORT[filter].toLowerCase()} only</Sub>
            <Pressable onPress={() => setFilter(null)} hitSlop={8}><Text style={{ fontFamily: F.bodyBold, color: C.green }}>Show all</Text></Pressable>
          </Row>
        ) : null}

        {shown.length === 0 ? (
          <Empty text="Nobody to show." />
        ) : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            {shown.map(({ p, e, status }, i) => {
              const role = mainRole(D, p.id);
              const [, fg] = status ? TONE[status] : [C.greySoft, C.line];
              const gateLine = e.gate
                ? `In ${fmtTime(e.gate.gate_in)}${e.lastGate?.gate_out ? ` · Out ${fmtTime(e.lastGate.gate_out)}` : e.noCheckout ? " · no check-out" : " · on site"}`
                : "No gate entry";
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setOpen(p)}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.full_name}: ${status ?? "nothing recorded"}`}
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingRight: 14, paddingLeft: 10, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, backgroundColor: pressed ? C.bg : "transparent" })}
                >
                  <View style={{ width: 4, alignSelf: "stretch", borderRadius: 2, backgroundColor: fg }} />
                  <Avatar text={initialsOf(p.full_name)} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.bodyBold, fontSize: 15, color: C.ink }} numberOfLines={1}>{p.full_name}</Text>
                    <Text style={{ fontSize: 12, color: C.sub }} numberOfLines={1}>{role ? roleInfo(role).label : "No role"} · {gateLine}</Text>
                    {e.mark ? <Text style={{ fontSize: 12, color: C.sub }} numberOfLines={1}>✎ {personName(D, e.mark.marked_by)}{e.mark.note ? `: ${e.mark.note}` : ""}</Text> : null}
                  </View>
                  {status ? <StatusPill status={status} /> : null}
                  {canEdit ? <Icon name="chevron-forward" size={18} color={C.grey} /> : null}
                </Pressable>
              );
            })}
          </Card>
        )}
        {!loaded ? <Sub>Loading this day's records...</Sub> : null}
      </ScrollView>

      {open && openEntry ? <MarkSheet key={open.id} p={open} day={day} e={openEntry.e} status={openEntry.status} canEdit={canEdit} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function StatusPill({ status }: { status: Status }) {
  const [bg, fg] = TONE[status];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
      <Text style={{ color: fg, fontSize: 12, fontFamily: F.bodyBold }}>{SHORT[status]}</Text>
    </View>
  );
}

/** One person's day: what the gate recorded, and the five marks. A change against the gate needs a reason. */
function MarkSheet({ p, day, e, status, canEdit, onClose }: { p: R; day: string; e: DayEntry; status: Status | null; canEdit: boolean; onClose: () => void }) {
  const D = useData();
  const { session } = useAuth();
  const { busy, run } = useAction();
  const me = session!.person.id;
  const [pick, setPick] = useState<MarkStatus | null>(null);
  const [note, setNote] = useState(e.mark?.note ?? "");
  const askWhy = !!pick && !!e.gate && pick !== "Present";

  const write = (s: MarkStatus, why: string | null) =>
    run(async () => {
      await save({ table: "attendance_mark", row: { person_id: p.id, day, status: s, note: why, marked_by: me, marked_at: nowIso() } });
      onClose();
    });
  const clear = () =>
    run(async () => {
      await save({ table: "attendance_mark", op: "delete", row: { person_id: p.id, day } });
      onClose();
    });
  const choose = (s: MarkStatus) => {
    if (e.mark?.status === s) return onClose();
    if (!e.mark && e.status === s) return onClose();
    if (e.gate && s !== "Present") return setPick(s);
    write(s, null);
  };

  return (
    <Sheet
      visible
      title={p.full_name}
      subtitle={fmtDayKey(day)}
      onClose={onClose}
      footer={
        askWhy ? (
          <>
            <View style={{ flex: 1 }}><Btn title="Back" kind="ghost" onPress={() => setPick(null)} /></View>
            <View style={{ flex: 1 }}><Btn title={`Save ${SHORT[pick!]}`} busy={busy} disabled={!note.trim()} onPress={() => write(pick!, note.trim())} /></View>
          </>
        ) : undefined
      }
    >
      <View style={{ backgroundColor: C.bg, borderRadius: 14, padding: 12, gap: 8 }}>
        <Row>
          <Icon name="log-in-outline" size={18} color={C.sub} />
          <Text style={{ flex: 1, color: C.ink }}>{e.gate ? `Gate in ${fmtTime(e.gate.gate_in)}` : "No gate entry"}</Text>
          {status ? <StatusPill status={status} /> : null}
        </Row>
        {e.gate ? (
          <Row>
            <Icon name="log-out-outline" size={18} color={C.sub} />
            <Text style={{ flex: 1, color: C.ink }}>{e.lastGate?.gate_out ? `Gate out ${fmtTime(e.lastGate.gate_out)}` : e.noCheckout ? "No check-out recorded" : "Still on site"}</Text>
          </Row>
        ) : null}
        {e.mark ? (
          <Row>
            <Icon name="create-outline" size={18} color={C.sub} />
            <Text style={{ flex: 1, color: C.ink }}>Marked {e.mark.status} by {personName(D, e.mark.marked_by)}{e.mark.note ? `: ${e.mark.note}` : ""}</Text>
          </Row>
        ) : null}
      </View>

      {!canEdit ? (
        <Sub>You cannot change this day: it is outside the days you may mark, or you have view-only access.</Sub>
      ) : askWhy ? (
        <>
          <Sub>The gate shows {p.full_name} came in. Why is it {SHORT[pick!].toLowerCase()}?</Sub>
          <Field label="Reason" value={note} onChangeText={setNote} placeholder="Left early, sent home" maxLength={200} />
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {MARK_STATUSES.map((s) => {
              const on = status === s;
              const [bg, fg] = TONE[s];
              return (
                <Pressable
                  key={s}
                  disabled={busy}
                  onPress={() => choose(s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => ({ width: "31%", flexGrow: 1, alignItems: "center", gap: 4, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, backgroundColor: on ? fg : bg, borderColor: fg, opacity: pressed ? 0.7 : 1 })}
                >
                  <Icon name={ICON[s]} size={24} color={on ? "#fff" : fg} />
                  <Text style={{ fontFamily: F.bodyBold, fontSize: 14, color: on ? "#fff" : fg }}>{s}</Text>
                </Pressable>
              );
            })}
          </View>
          {e.mark ? <Btn kind="ghost" title={e.gate ? "Remove mark (use the gate record)" : "Remove mark"} busy={busy} onPress={clear} /> : null}
        </>
      )}
    </Sheet>
  );
}

// ----------------------------------------------------------- monthly ----

function Monthly({ ix, cap, onOpenDay }: { ix: AttendanceIndex; cap: number; onOpenDay: (d: string) => void }) {
  const D = useData();
  const sync = useSyncState();
  const today = dayKey();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const earliest = addDays(today, -(cap - 2)).slice(0, 7);
  const days = useMemo(() => monthDays(month), [month]);
  const need = Math.min(cap, Math.max(0, Math.round((Date.parse(today) - Date.parse(days[0]!)) / DAY)) + 2);
  useEffect(() => requestDays(need), [need]);
  const ready = sync.loadedDays >= need || month === today.slice(0, 7) && Number(today.slice(8)) <= 1;
  // Days older than the history this person gets are left blank rather than shown as absent.
  const firstKnown = addDays(today, -(Math.min(Math.max(sync.loadedDays, 2), cap) - 2));
  const blank: DayEntry = { status: null, source: "auto", noCheckout: false };

  const sheet = useMemo(
    () =>
      attendancePeople(D, ix, days).map((p) => {
        const cells = days.map((d) => (d < firstKnown || d > today ? blank : dayEntry(ix, p, d)));
        const n = (s: string) => cells.filter((e) => e.status === s).length;
        return { p, cells, worked: cells.reduce((t, e) => t + dayShare(e.status), 0), absent: n("Absent"), leave: n("Leave"), off: n("Off"), half: n("Half day") };
      }),
    [D.person, D.person_role, D.shift, ix, days, firstKnown],
  );
  const needle = q.trim().toLowerCase();
  const shown = sheet.filter((r) => r.p.full_name.toLowerCase().includes(needle));
  const total = (k: "worked" | "absent" | "leave") => sheet.reduce((t, r) => t + r[k], 0);

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Card style={{ gap: 10 }}>
        <Row>
          <Pressable onPress={() => setMonth(addMonths(month, -1))} disabled={month <= earliest} hitSlop={10} style={{ padding: 6, opacity: month <= earliest ? 0.3 : 1 }} accessibilityLabel="Previous month">
            <Icon name="chevron-back" size={26} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: "center", fontFamily: F.head, fontSize: 28, color: C.ink }}>{monthName(month)}</Text>
          <Pressable onPress={() => setMonth(addMonths(month, 1))} disabled={month >= today.slice(0, 7)} hitSlop={10} style={{ padding: 6, opacity: month >= today.slice(0, 7) ? 0.3 : 1 }} accessibilityLabel="Next month">
            <Icon name="chevron-forward" size={26} />
          </Pressable>
        </Row>
        <Row>
          <MonthFig label="Days worked" n={ready ? total("worked") : null} color={C.ok} />
          <MonthFig label="Absent" n={ready ? total("absent") : null} color={C.red} />
          <MonthFig label="Leave" n={ready ? total("leave") : null} color={C.blue} />
        </Row>
      </Card>

      <Search value={q} onChangeText={setQ} placeholder="Search name" />
      {!ready ? <Sub>Loading this month...</Sub> : null}
      {shown.length === 0 ? <Empty text="Nobody to show." /> : null}

      {ready
        ? shown.map((r) => {
            const isOpen = openId === r.p.id;
            const role = mainRole(D, r.p.id);
            return (
              <Card key={r.p.id} style={{ padding: 0, overflow: "hidden" }}>
                <Pressable onPress={() => setOpenId(isOpen ? null : r.p.id)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} style={{ padding: 12, gap: 8 }}>
                  <Row>
                    <Avatar text={initialsOf(r.p.full_name)} size={38} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.bodyBold, fontSize: 15, color: C.ink }} numberOfLines={1}>{r.p.full_name}</Text>
                      <Text style={{ fontSize: 12, color: C.sub }}>{role ? roleInfo(role).label : "No role"}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontFamily: F.head, fontSize: 24, lineHeight: 26, color: C.ok }}>{r.worked}</Text>
                      <Text style={{ fontSize: 11, color: C.sub }}>days worked</Text>
                    </View>
                    <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={C.grey} />
                  </Row>
                  <Row style={{ gap: 6 }}>
                    {r.half ? <Badge text={`${r.half} half`} tone="warn" /> : null}
                    <Badge text={`${r.absent} absent`} tone={r.absent ? "bad" : "mute"} />
                    {r.leave ? <Badge text={`${r.leave} leave`} tone="info" /> : null}
                    <Badge text={`${r.off} off`} />
                  </Row>
                  {/* A strip of the whole month, one block a day. */}
                  <View style={{ flexDirection: "row", gap: 1.5 }}>
                    {r.cells.map((e, i) => (
                      <View key={days[i]} style={{ flex: 1, height: 8, borderRadius: 2, backgroundColor: e.status && e.status !== "Not marked" ? TONE[e.status][1] : C.greySoft, opacity: e.status === "Off" ? 0.35 : 1 }} />
                    ))}
                  </View>
                </Pressable>
                {isOpen ? <MonthGrid D={D} days={days} cells={r.cells} today={today} onOpenDay={onOpenDay} /> : null}
              </Card>
            );
          })
        : null}

      {ready && shown.length ? <Sub>Tap a person to see their month. Tap a day to open it in Daily. D day shift · N night shift · H half · A absent · L leave.</Sub> : null}
    </ScrollView>
  );
}

const MonthFig = ({ label, n, color }: { label: string; n: number | null; color: string }) => (
  <View style={{ flex: 1, alignItems: "center" }}>
    <Text style={{ fontFamily: F.head, fontSize: 26, color }}>{n ?? "–"}</Text>
    <Sub>{label}</Sub>
  </View>
);

/** A calendar for one person's month. */
function MonthGrid({ D, days, cells, today, onOpenDay }: { D: ReturnType<typeof useData>; days: string[]; cells: DayEntry[]; today: string; onOpenDay: (d: string) => void }) {
  const lead = weekdayOf(days[0]!);
  const slots: (number | null)[] = [...Array(lead).fill(null), ...days.map((_, i) => i)];
  while (slots.length % 7) slots.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));
  return (
    <View style={{ paddingHorizontal: 10, paddingBottom: 12, gap: 4, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
      <View style={{ flexDirection: "row" }}>
        {WEEK.map((w, i) => (
          <Text key={w} style={{ flex: 1, textAlign: "center", fontSize: 11, fontFamily: F.bodyBold, color: i === WEEKLY_OFF ? C.red : C.sub }}>{w[0]}</Text>
        ))}
      </View>
      {weeks.map((w, wi) => (
        <View key={wi} style={{ flexDirection: "row", gap: 4 }}>
          {w.map((i, k) => {
            if (i === null) return <View key={k} style={{ flex: 1 }} />;
            const d = days[i]!;
            const e = cells[i]!;
            const st = e.status && e.status !== "Not marked" ? e.status : null;
            const [bg, fg] = st ? TONE[st] : ["transparent", C.sub];
            const code = dayCode(D, e);
            return (
              <Pressable
                key={k}
                disabled={d > today}
                onPress={() => onOpenDay(d)}
                accessibilityLabel={`${fmtDayKey(d)}: ${e.status ?? "nothing recorded"}`}
                style={{ flex: 1, aspectRatio: 1, borderRadius: 8, backgroundColor: bg, alignItems: "center", justifyContent: "center", borderWidth: d === today ? 1.5 : e.source === "mark" ? 1 : 0, borderColor: d === today ? C.green : fg, opacity: d > today ? 0.35 : 1 }}
              >
                <Text style={{ fontSize: 10, color: C.sub }}>{Number(d.slice(8))}</Text>
                <Text style={{ fontSize: 11, fontFamily: F.bodyBold, color: fg }}>{code}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ------------------------------------------------------------ access ----

type Choice = AttAccess | "default";

/** The Owner decides who may view or mark the sheet. People left on "Default" get their role's access. */
function AccessSheet({ onClose }: { onClose: () => void }) {
  const D = useData();
  const { session } = useAuth();
  const { busy, run } = useAction();
  const me = session!.person.id;
  const [q, setQ] = useState("");
  const [list, setList] = useState<Record<string, AttAccess>>(() => ({ ...accessList(D) }));
  const people = D.person
    .filter((p) => p.active && !rolesOf(D, p.id).includes("Owner"))
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .filter((p) => p.full_name.toLowerCase().includes(q.trim().toLowerCase()));

  const choose = (id: string, c: Choice) =>
    setList((x) => {
      const next = { ...x };
      if (c === "default") delete next[id];
      else next[id] = c;
      return next;
    });
  const saveList = () =>
    run(async () => {
      await save({ table: "setting", row: { key: ATT_ACCESS_KEY, value: list, changed_by: me, changed_at: nowIso() } });
      onClose();
    });

  return (
    <Sheet
      visible
      title="Attendance access"
      subtitle="The Owner can always view and mark. Default: Managers and Supervisors mark, others have no access."
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}><Btn title="Cancel" kind="ghost" onPress={onClose} /></View>
          <View style={{ flex: 1 }}><Btn title="Save" busy={busy} onPress={saveList} /></View>
        </>
      }
    >
      <Search value={q} onChangeText={setQ} placeholder="Search name" />
      {people.map((p) => {
        const roles = rolesOf(D, p.id);
        const def = defaultAccess(roles);
        return (
          <View key={p.id} style={{ gap: 6, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.line }}>
            <T bold>{p.full_name}</T>
            <Sub>{roles.map((r) => roleInfo(r).label).join(", ") || "No role"}</Sub>
            <Chips
              value={list[p.id] ?? "default"}
              onChange={(c) => c && choose(p.id, c)}
              options={[
                { key: "default", label: `Default: ${ACCESS_LABEL[def]}` },
                { key: "none", label: "No access" },
                { key: "view", label: "View only" },
                { key: "edit", label: "View and mark" },
              ]}
            />
          </View>
        );
      })}
    </Sheet>
  );
}
