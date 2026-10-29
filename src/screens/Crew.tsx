import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Screen, H, Sub, Card, Text, Badge, Row, Btn, Field, SectionTitle, Check, Chips, Select, ScreenHeader, say, useAction, Empty, C, F, initialsOf, type Option } from "../ui";
import { useAuth } from "../auth";
import { api, ApiError, OfflineError } from "../api";
import { save, useData } from "../store";
import { onSiteMap, rolesOf } from "../rules";
import { fmtDayTime, fmtTime, nextShiftWindow, nowIso, shiftWindow, type Row as R, type ShiftWindow } from "../time";
import { grantableRoles, roleInfo } from "../roles";

const IN_CHARGE_ROLES = ["Supervisor", "Manager", "Operator", "Fitter"];
const mainRole = (D: ReturnType<typeof useData>, id: string) => {
  const rs = D.person_role.filter((r) => r.person_id === id);
  return (rs.find((r) => r.is_main) ?? rs[0])?.role as string | undefined;
};
const roleLine = (role?: string) => (role === "Helper" ? "Helper / labourer" : role ? roleInfo(role).label : "No role yet");

/** The supervisor runs the shift: who is in charge, confirm new workers, who is on duty, who may run which machine. */
export default function Crew() {
  const nav = useNavigation<any>();
  const route = useRoute();
  const { session } = useAuth();
  const D = useData();
  const me = session!.person.id;
  const { busy, run } = useAction();
  const inTab = route.name === "CrewHome";

  const now = shiftWindow(D.shift);
  const next = now ? nextShiftWindow(D.shift, now) : null;
  const site = useMemo(() => onSiteMap(D), [D.attendance]);
  const name = session!.person.full_name;

  const candidates: Option[] = D.person
    .filter((p) => p.active && rolesOf(D, p.id).some((r) => IN_CHARGE_ROLES.includes(r)))
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .map((p) => ({ key: p.id, label: p.full_name, sub: rolesOf(D, p.id).map((r) => roleInfo(r).label).join(" · ") }));

  const inChargeOf = (w: ShiftWindow | null) => D.shift_in_charge.find((s) => w && new Date(s.shift_start).getTime() === w.start.getTime())?.person_id ?? null;
  const setInCharge = (w: ShiftWindow, personId: string) =>
    run(() => save({ table: "shift_in_charge", row: { shift_start: w.start.toISOString(), shift_id: w.shift.id, person_id: personId, set_by: me, set_at: nowIso() } }));

  const newWorkers = D.person.filter((p) => p.active && !p.checked).sort((a, b) => String(a.registered_at).localeCompare(String(b.registered_at)));

  // Everyone who came in during this shift (their latest gate record)
  const came = useMemo(() => {
    if (!now) return [] as R[];
    const by = new Map<string, R>();
    for (const a of D.attendance) {
      if (new Date(a.shift_start).getTime() !== now.start.getTime()) continue;
      const cur = by.get(a.person_id);
      if (!cur || a.gate_in > cur.gate_in) by.set(a.person_id, a);
    }
    return [...by.values()].sort((a, b) => b.gate_in.localeCompare(a.gate_in));
  }, [D.attendance, now?.start.getTime()]);
  const onDuty = came.filter((a) => a.on_duty_at).length;
  const notYet = came.filter((a) => !a.on_duty_at && !a.gate_out);

  const confirmWorker = (personId: string) => run(() => save({ table: "person", row: { id: personId, checked: true, checked_by: me, checked_at: nowIso() } }));
  const markOnDuty = (ids: string[]) => run(() => save(...ids.map((id) => ({ table: "attendance", row: { id, on_duty_at: nowIso(), on_duty_by: me } }))));

  const operators = D.person.filter((p) => p.active && rolesOf(D, p.id).includes("Operator")).sort((a, b) => a.full_name.localeCompare(b.full_name));

  const card = { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 16, gap: 10 } as const;
  const shiftLabel = (w: ShiftWindow | null, isNow: boolean) => (w ? `${w.shift.name} shift, ${isNow ? "now" : `from ${fmtTime(w.start.toISOString())}`}` : "No shift set up");

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {inTab ? <ScreenHeader title="Crew this shift" subtitle={`${name}${now ? ` · ${now.shift.name} shift` : ""}`} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} /> : null}
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={card}>
          <Text style={{ fontFamily: F.head, fontSize: 28, color: C.ink }}>In-charge</Text>
          <Text style={{ fontSize: 15, fontWeight: "700", color: C.ink }}>{shiftLabel(now, true)}</Text>
          <Select title="In charge now" value={inChargeOf(now)} options={candidates} onChange={(id) => now && setInCharge(now, id)} />
          <Text style={{ fontSize: 15, fontWeight: "700", color: C.ink, marginTop: 4 }}>{shiftLabel(next, false)}</Text>
          <Select title="In charge next shift" value={inChargeOf(next)} options={candidates} onChange={(id) => next && setInCharge(next, id)} />
          <Sub>Whoever is in charge gets the supervisor screens on their phone for that shift.</Sub>
        </View>

        <SectionTitle>{`New workers to check · ${newWorkers.length}`}</SectionTitle>
        {newWorkers.length === 0 ? <Sub>No new workers to check.</Sub> : null}
        {newWorkers.map((p) => {
          const a = site.get(p.id);
          const prev = D.attendance.filter((x) => x.person_id === p.id).sort((x, y) => y.gate_in.localeCompare(x.gate_in))[0];
          const rows: [string, string][] = [
            ["Phone", p.mobile ?? "-"],
            ["Address", p.address ?? "-"],
            ["ID no.", p.id_no ?? "-"],
            ["Registered", `${fmtDayTime(p.registered_at)} by ${D.person.find((x) => x.id === p.registered_by)?.full_name ?? "-"}`],
            ["Gate", a ? `In since ${fmtTime(a.gate_in)}` : prev?.gate_out ? `Left ${fmtTime(prev.gate_out)}` : "Not in yet"],
          ];
          return (
            <View key={p.id} style={card}>
              <Row style={{ alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 19, fontWeight: "700", color: C.ink }}>{p.full_name}</Text>
                  <Text style={{ color: C.sub, fontSize: 15 }}>{roleLine(mainRole(D, p.id))}</Text>
                </View>
                <View style={{ backgroundColor: "#fdf0d8", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}><Text style={{ color: C.amber, fontWeight: "700" }}>New</Text></View>
              </Row>
              <View style={{ gap: 6 }}>
                {rows.map(([k, v]) => (
                  <View key={k} style={{ flexDirection: "row", gap: 12 }}>
                    <Text style={{ width: 92, color: C.sub, fontSize: 15 }}>{k}</Text>
                    <Text style={{ flex: 1, color: C.ink, fontSize: 15 }}>{v}</Text>
                  </View>
                ))}
              </View>
              <Row style={{ gap: 10, marginTop: 4 }}>
                <View style={{ flex: 1.2 }}><Btn small title="Details are correct" onPress={() => confirmWorker(p.id)} busy={busy} /></View>
                <View style={{ flex: 1 }}><Btn small kind="ghost" title="Correct details" onPress={() => nav.navigate("CorrectWorker", { personId: p.id })} /></View>
              </Row>
            </View>
          );
        })}

        <SectionTitle>{`Came in this shift · ${came.length}`}</SectionTitle>
        <View style={card}>
          <Row>
            <Text style={{ flex: 1, fontSize: 16, color: C.ink }}>{onDuty} on duty, <Text style={{ fontWeight: "700" }}>{notYet.length} not yet</Text></Text>
            <Btn small title="Mark all on duty" onPress={() => markOnDuty(notYet.map((a) => a.id))} disabled={!notYet.length} busy={busy} />
          </Row>
          {came.length === 0 ? <Sub>No one has come in this shift yet.</Sub> : null}
          {came.map((a) => {
            const p = D.person.find((x) => x.id === a.person_id);
            if (!p) return null;
            return (
              <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Row style={{ gap: 8, flexWrap: "wrap" }}>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: C.ink }}>{p.full_name}</Text>
                    {!p.checked ? <View style={{ backgroundColor: "#fdf0d8", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}><Text style={{ color: C.amber, fontWeight: "700", fontSize: 13 }}>New</Text></View> : null}
                  </Row>
                  <Text style={{ color: C.sub, fontSize: 14 }}>{roleInfo(mainRole(D, p.id)).label} · gate {fmtTime(a.gate_in)}{a.on_duty_at ? ` · on duty ${fmtTime(a.on_duty_at)}` : ""}</Text>
                </View>
                {a.gate_out ? <Text style={{ color: C.sub, fontSize: 15 }}>Left {fmtTime(a.gate_out)}</Text>
                  : a.on_duty_at ? <Badge text="On duty" tone="good" />
                  : <Btn small kind="soft" title="On duty" onPress={() => markOnDuty([a.id])} busy={busy} />}
              </View>
            );
          })}
        </View>

        <SectionTitle>Who may run which machine</SectionTitle>
        {operators.length === 0 ? <Sub>No operators yet.</Sub> : null}
        {operators.map((p) => {
          const ticked = D.operator_machine.filter((o) => o.person_id === p.id).length;
          return (
            <Pressable key={p.id} onPress={() => nav.navigate("CrewMachines", { personId: p.id })} style={({ pressed }) => [{ ...card, flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }, pressed && { opacity: 0.7 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: "700", color: C.ink }}>{p.full_name}</Text>
                <Text style={{ color: C.sub, fontSize: 14 }}>Briquette machine and chippers, plus {ticked} ticked</Text>
              </View>
              <Text style={{ color: C.green, fontWeight: "700" }}>Edit</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** The supervisor fixes a new worker's details and confirms them in one go. */
export function CorrectWorker() {
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const { session, roles } = useAuth();
  const D = useData();
  const me = session!.person.id;
  const p = D.person.find((x) => x.id === params.personId);
  const current = p ? mainRole(D, p.id) : undefined;
  const [name, setName] = useState(p?.full_name ?? "");
  const [mobile, setMobile] = useState(p?.mobile ?? "");
  const [address, setAddress] = useState(p?.address ?? "");
  const [idNo, setIdNo] = useState(p?.id_no ?? "");
  const [role, setRole] = useState<string | null>(current ?? null);
  const { busy, run } = useAction();
  if (!p) return <Screen><Empty text="Worker not found." /></Screen>;

  const can = grantableRoles(roles);
  const options = ["Helper", "Operator", "Driver", "Security", "Fitter", "Store", "Weighbridge", "Supervisor"].filter((r) => can.includes(r) || r === current).map((r) => ({ key: r, label: roleInfo(r).label }));

  const submit = () =>
    run(async () => {
      const full = name.trim().replace(/\s+/g, " ");
      if (!full) throw new Error("Enter the name");
      if (!/^\d{10}$/.test(mobile)) throw new Error("Mobile must be 10 digits");
      if (!address.trim()) throw new Error("Enter the address");
      if (!role) throw new Error("Choose what the person works as");
      if (D.person.some((x) => x.id !== p.id && x.full_name.trim().toLowerCase() === full.toLowerCase())) throw new Error("Another person already has this name.");
      if (D.person.some((x) => x.id !== p.id && x.mobile === mobile)) throw new Error("Another person already has this mobile number.");
      const writes: Parameters<typeof save> = [
        { table: "person", row: { id: p.id, full_name: full, mobile, address: address.trim(), id_no: idNo.trim() || null, checked: true, checked_by: me, checked_at: nowIso() } },
      ];
      if (role !== current) {
        if (current) writes.push({ table: "person_role", row: { person_id: p.id, role: current }, op: "delete" });
        writes.push({ table: "person_role", row: { person_id: p.id, role, is_main: true } });
      }
      await save(...writes);
      nav.goBack();
    });

  return (
    <Screen>
      <H>Correct details</H>
      <Sub>Registered {fmtDayTime(p.registered_at)} by {D.person.find((x) => x.id === p.registered_by)?.full_name ?? "-"}. Saving also confirms them.</Sub>
      <Field label="NAME AS ON THE ID" value={name} onChangeText={setName} autoCapitalize="words" />
      <Field label="MOBILE (10 DIGITS)" value={mobile} onChangeText={(v) => setMobile(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={10} />
      <Field label="ADDRESS" value={address} onChangeText={setAddress} />
      <Field label="ID NO." value={idNo} onChangeText={setIdNo} />
      <SectionTitle>Works as</SectionTitle>
      <Chips options={options} value={role} onChange={setRole} />
      <Btn title="Save and confirm" onPress={submit} busy={busy} />
    </Screen>
  );
}

/** Tick which machines an operator may run. Every operator can run the briquette machine and both chippers. */
export function CrewMachines() {
  const { params } = useRoute<any>();
  const D = useData();
  const { busy, run } = useAction();
  const person = D.person.find((p) => p.id === params.personId);

  const toggle = (machineId: string, on: boolean) =>
    run(() => save({ table: "operator_machine", row: { person_id: params.personId, machine_id: machineId }, op: on ? "delete" : "upsert" }));

  return (
    <Screen>
      <H>{person?.full_name}</H>
      <Sub>Machines this operator may run.</Sub>
      {[...D.machine].sort((a, b) => a.tag.localeCompare(b.tag)).map((m) => {
        const always = m.stage === "briquette" || m.stage === "chip";
        const ticked = D.operator_machine.some((o) => o.person_id === params.personId && o.machine_id === m.id);
        return (
          <Card key={m.id}>
            <Check
              label={`${m.tag} · ${m.name}${always ? "  (every operator)" : ""}`}
              value={always || ticked}
              onChange={() => (always ? say("Always allowed", "Every operator can run the briquette machine and both chippers.") : toggle(m.id, ticked))}
            />
          </Card>
        );
      })}
      {busy ? <Sub>Saving...</Sub> : null}
    </Screen>
  );
}

export function SetPin() {
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const { session } = useAuth();
  const D = useData();
  const person = D.person.find((p) => p.id === params.personId);
  const [pin, setPin] = useState("");
  const { busy, run } = useAction();

  const submit = () =>
    run(async () => {
      if (!/^\d{6}$/.test(pin)) throw new Error("PIN must be 6 digits");
      try {
        await api(`/people/${params.personId}/pin`, { body: { pin }, token: session!.token });
      } catch (e) {
        if (e instanceof OfflineError) throw new Error("A PIN can only be set with signal.");
        if (e instanceof ApiError && e.status === 404) throw new Error("The server does not know this person yet. Wait for the phone to send its entries, then try again.");
        throw e;
      }
      say("PIN set", `${person?.full_name} can now sign in with it.`);
      nav.goBack();
    });

  return (
    <Screen>
      <H>PIN for {person?.full_name}</H>
      <Sub>The person signs in on the phone with this 6-digit PIN. Needs signal.</Sub>
      <Field label="New PIN" value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, ""))} keyboardType="number-pad" secure maxLength={6} />
      <Btn title="Save PIN" onPress={submit} busy={busy} disabled={pin.length !== 6} />
    </Screen>
  );
}
