import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Screen, H, Sub, Text, Btn, Field, Chips, SectionTitle, Icon, ScreenHeader, Search, C, F, say, useAction, initialsOf, Card, Badge, Row, Spacer, Empty } from "../ui";
import { useAuth } from "../auth";
import { newId, save, useData } from "../store";
import { busyPeople, machineOf, onSiteMap, rolesOf } from "../rules";
import { fmtTime, nowIso, productionDayStart, shiftForArrival, shiftWindow, type Row as R } from "../time";
import { ROLE_LIST, grantableRoles, roleInfo } from "../roles";

const GROUPS: Record<string, string> = {
  Owner: "OWNER", Manager: "MANAGERS", Supervisor: "SUPERVISORS", Operator: "OPERATORS", Driver: "DRIVERS", Security: "SECURITY",
  Fitter: "FITTERS", Store: "STORE", Weighbridge: "WEIGHBRIDGE", Helper: "HELPERS",
};
const mainRoleOf = (D: ReturnType<typeof useData>, id: string) => {
  const rs = D.person_role.filter((r) => r.person_id === id);
  return (rs.find((r) => r.is_main) ?? rs[0])?.role as string | undefined;
};

/** The gate register: who is on site, search, In and Out one at a time or as a group, and registering new workers. */
export default function Gate() {
  const nav = useNavigation<any>();
  const route = useRoute();
  const { session } = useAuth();
  const D = useData();
  const me = session!.person.id;
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const { busy: saving, run } = useAction();
  const inTab = route.name === "GateHome";

  const site = useMemo(() => onSiteMap(D), [D.attendance]);
  const running = useMemo(() => busyPeople(D), [D.machine_run, D.run_helper]);
  const dayStart = productionDayStart().getTime();

  // Latest gate record of each person
  const last = useMemo(() => {
    const m = new Map<string, R>();
    for (const a of D.attendance) {
      const cur = m.get(a.person_id);
      if (!cur || a.gate_in > cur.gate_in) m.set(a.person_id, a);
    }
    return m;
  }, [D.attendance]);

  const cameToday = new Set(D.attendance.filter((a) => a.gate_in && new Date(a.gate_in).getTime() >= dayStart).map((a) => a.person_id)).size;
  const leftToday = D.attendance.filter((a) => a.gate_out && new Date(a.gate_out).getTime() >= dayStart).length;

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const people = D.person
      .filter((p) => p.active)
      .filter((p) => !needle || p.full_name.toLowerCase().includes(needle) || (p.mobile ?? "").includes(needle))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
    const by = new Map<string, R[]>();
    for (const p of people) {
      const key = GROUPS[mainRoleOf(D, p.id) ?? ""] ?? "NO ROLE";
      by.set(key, [...(by.get(key) ?? []), p]);
    }
    const order = [...Object.values(GROUPS), "NO ROLE"];
    return [...by.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [D.person, D.person_role, q]);

  const checkIn = (ids: string[]) =>
    run(async () => {
      const w = shiftForArrival(D.shift);
      if (!w) throw new Error("No shifts are set up yet.");
      const writes = ids.filter((id) => !site.has(id)).map((id) => ({
        table: "attendance",
        row: { id: newId(), person_id: id, shift_id: w.shift.id, shift_start: w.start.toISOString(), gate_in: nowIso(), gate_out: null, gate_by: me, on_duty_at: null, on_duty_by: null },
      }));
      if (writes.length) await save(...writes);
      setSel((s) => s.filter((id) => !ids.includes(id)));
    });

  const checkOut = (ids: string[]) =>
    run(async () => {
      const blocked: string[] = [];
      const done: string[] = [];
      const writes = [];
      for (const id of ids) {
        const a = site.get(id);
        if (!a) continue;
        const r = running.get(id);
        if (r) {
          blocked.push(`${D.person.find((p) => p.id === id)?.full_name} (${machineOf(D, r.machine_id)?.tag})`);
          continue;
        }
        writes.push({ table: "attendance", row: { id: a.id, gate_out: nowIso() } });
        done.push(id);
      }
      if (writes.length) await save(...writes);
      setSel((s) => s.filter((id) => !done.includes(id))); // anyone refused stays selected
      if (blocked.length) say("Still running a machine", `${blocked.join(", ")} cannot be checked out until the run is stopped.`);
    });

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const name = session!.person.full_name;
  const w = shiftWindow(D.shift);

  const stat = (value: number, label: string) => (
    <View key={label} style={{ flex: 1, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 12 }}>
      <Text style={{ fontFamily: F.head, fontSize: 34, lineHeight: 38, color: C.ink }}>{value}</Text>
      <Text style={{ color: C.sub, fontSize: 14 }}>{label}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {inTab ? <ScreenHeader title="Gate register" subtitle={`${name}${w ? ` · ${w.shift.name} shift` : ""}`} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} /> : null}
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 12 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", gap: 10 }}>
          {stat(site.size, "On site")}
          {stat(cameToday, "Came today")}
          {stat(leftToday, "Left")}
        </View>

        <Search value={q} onChangeText={setQ} placeholder="Search name or phone" />

        <Pressable onPress={() => nav.navigate("Register")} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 16 }, pressed && { opacity: 0.7 }]}>
          <Icon name="person-add-outline" size={22} color={C.ink} />
          <Text style={{ fontSize: 17, fontWeight: "700", color: C.ink }}>Register a new worker</Text>
        </Pressable>

        {sel.length ? (
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Text style={{ color: C.sub, fontWeight: "600" }}>{sel.length} selected</Text>
            <Spacer />
            <Btn small title={`Check in (${sel.filter((id) => !site.has(id)).length})`} onPress={() => checkIn(sel)} disabled={!sel.some((id) => !site.has(id))} busy={saving} />
            <Btn small kind="ghost" title={`Check out (${sel.filter((id) => site.has(id)).length})`} onPress={() => checkOut(sel)} disabled={!sel.some((id) => site.has(id))} busy={saving} />
            <Btn small kind="ghost" title="Clear" onPress={() => setSel([])} />
          </View>
        ) : null}

        {groups.length === 0 ? <Empty text={q ? "No one found. Use Register a new worker." : "No people yet."} /> : null}
        {groups.map(([title, people]) => (
          <View key={title} style={{ gap: 8 }}>
            <SectionTitle>{title}</SectionTitle>
            {people.map((p) => {
              const inside = site.get(p.id);
              const prev = last.get(p.id);
              const sub = inside
                ? `In since ${fmtTime(inside.gate_in)}`
                : prev?.gate_out
                  ? `Left at ${fmtTime(prev.gate_out)}${new Date(prev.gate_out).getTime() < dayStart ? " (earlier)" : ""}`
                  : "Not in yet";
              const checked = sel.includes(p.id);
              return (
                <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: inside ? C.okSoft : C.card, borderRadius: 16, borderWidth: 1, borderColor: inside ? C.ok : C.line, padding: 12, paddingRight: 12 }}>
                  <Pressable onPress={() => toggle(p.id)} hitSlop={8} style={{ width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: checked ? C.green : C.grey, backgroundColor: checked ? C.green : "#fff", alignItems: "center", justifyContent: "center" }}>
                    {checked ? <Icon name="checkmark" size={18} color="#fff" /> : null}
                  </Pressable>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Row style={{ gap: 8, flexWrap: "wrap" }}>
                      <Text style={{ fontSize: 17, fontWeight: "700", color: C.ink }}>{p.full_name}</Text>
                      {!p.checked ? <View style={{ backgroundColor: "#fdf0d8", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ color: C.amber, fontWeight: "700", fontSize: 13 }}>New</Text></View> : null}
                    </Row>
                    <Text style={{ color: C.sub, fontSize: 14 }}>{sub}{running.get(p.id) ? ` · running ${machineOf(D, running.get(p.id)!.machine_id)?.tag ?? ""}` : ""}</Text>
                  </View>
                  {inside ? (
                    <Pressable disabled={saving} onPress={() => checkOut([p.id])} style={({ pressed }) => [{ minWidth: 80, height: 48, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }, pressed && { opacity: 0.7 }]}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: C.ink }}>Out</Text>
                    </Pressable>
                  ) : (
                    <Pressable disabled={saving} onPress={() => checkIn([p.id])} style={({ pressed }) => [{ minWidth: 80, height: 48, borderRadius: 12, backgroundColor: C.green, alignItems: "center", justifyContent: "center" }, pressed && { opacity: 0.8 }]}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff" }}>In</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** Today's gate log: everyone who came in or went out since the production day started at 06:00. */
export function GateToday() {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const D = useData();
  const name = session!.person.full_name;
  const dayStart = productionDayStart().getTime();
  const rows = D.attendance
    .filter((a) => (a.gate_in && new Date(a.gate_in).getTime() >= dayStart) || (a.gate_out && new Date(a.gate_out).getTime() >= dayStart))
    .sort((a, b) => b.gate_in.localeCompare(a.gate_in));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Today" subtitle={`${rows.length} gate records since 06:00`} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32, gap: 10 }}>
        {rows.length === 0 ? <Empty text="No one has come through the gate yet today." /> : null}
        {rows.map((a) => {
          const p = D.person.find((x) => x.id === a.person_id);
          const role = mainRoleOf(D, a.person_id);
          return (
            <Card key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Row style={{ gap: 8, flexWrap: "wrap" }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: C.ink }}>{p?.full_name ?? "-"}</Text>
                  {p && !p.checked ? <Badge text="New" tone="warn" /> : null}
                </Row>
                <Text style={{ color: C.sub, fontSize: 14 }}>{role ? roleInfo(role).label : "No role"} · gate in {fmtTime(a.gate_in)}{a.on_duty_at ? ` · on duty ${fmtTime(a.on_duty_at)}` : ""}</Text>
              </View>
              {a.gate_out ? <Badge text={`Out ${fmtTime(a.gate_out)}`} /> : <Badge text="On site" tone="good" />}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Roles a new worker can be registered as. What is allowed depends on who is registering (Manager only by the Owner,
// Supervisor by an admin); the server checks it too.
const WORKS_AS = ["Helper", "Operator", "Driver", "Security", "Fitter", "Store", "Weighbridge", "Supervisor", "Manager"];

export function Register() {
  const nav = useNavigation<any>();
  const { session, roles } = useAuth();
  const D = useData();
  const me = session!.person.id;
  const mgmt = roles.some((r) => ["Owner", "Manager", "Supervisor"].includes(r));
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [idNo, setIdNo] = useState("");
  const [worksAs, setWorksAs] = useState<string | null>(null);
  const { busy, run } = useAction();

  const can = grantableRoles(roles);
  const options = WORKS_AS.filter((r) => can.includes(r) && (ROLE_LIST as readonly string[]).includes(r)).map((r) => ({ key: r, label: roleInfo(r).label }));

  const submit = () =>
    run(async () => {
      const full = name.trim().replace(/\s+/g, " ");
      if (!full) throw new Error("Enter the name");
      if (!/^\d{10}$/.test(mobile)) throw new Error("Mobile must be 10 digits");
      if (!address.trim()) throw new Error("Enter the address");
      if (!worksAs) throw new Error("Choose what the person works as");
      if (D.person.some((p) => p.full_name.trim().toLowerCase() === full.toLowerCase())) throw new Error("A person with this name is already registered. Search for them at the gate.");
      if (D.person.some((p) => p.mobile === mobile)) throw new Error("This mobile number is already registered.");
      const w = shiftForArrival(D.shift);
      if (!w) throw new Error("No shifts are set up yet.");
      const id = newId();
      const now = nowIso();
      // Management confirms on the spot; a guard's registration shows as "New" until the supervisor confirms.
      await save(
        {
          table: "person",
          row: {
            id, full_name: full, mobile, address: address.trim(), id_no: idNo.trim() || null, active: true,
            checked: mgmt, registered_by: me, registered_at: now, checked_by: mgmt ? me : null, checked_at: mgmt ? now : null,
          },
        },
        { table: "person_role", row: { person_id: id, role: worksAs, is_main: true } },
        { table: "attendance", row: { id: newId(), person_id: id, shift_id: w.shift.id, shift_start: w.start.toISOString(), gate_in: now, gate_out: null, gate_by: me, on_duty_at: null, on_duty_by: null } }
      );
      nav.goBack();
    });

  return (
    <Screen>
      <H>Register a new worker</H>
      <Sub>They are checked in when you save. They show as "New" until the supervisor confirms their details.</Sub>
      <Field label="NAME AS ON THE ID" value={name} onChangeText={setName} autoCapitalize="words" />
      <Field label="MOBILE (10 DIGITS)" value={mobile} onChangeText={(v) => setMobile(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={10} />
      <Field label="ADDRESS" value={address} onChangeText={setAddress} />
      <Field label="ID NO. (IF THEY HAVE ONE)" value={idNo} onChangeText={setIdNo} />
      <SectionTitle>Works as</SectionTitle>
      <Chips options={options} value={worksAs} onChange={setWorksAs} />
      <Btn title="Register and check in" onPress={submit} busy={busy} />
    </Screen>
  );
}
