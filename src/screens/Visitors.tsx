import React, { useState } from "react";
import { View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Screen, H, Sub, Card, T, Text, Badge, Row, Btn, Field, SectionTitle, Chips, Select, Empty, C, F, say, useAction } from "../ui";
import { useAuth } from "../auth";
import { newId, save, useData } from "../store";
import { TabScreen } from "../tabs";
import { nextPassNo, personName, rolesOf } from "../rules";
import { fmtDateTime, fmtTime, nowIso, productionDayStart, type Row as R } from "../time";

const PURPOSE = ["Meeting", "Buyer", "Supplier", "Delivery", "Contractor or repair", "Government or inspection", "Other"];

/** The Visitors tab: who is on site, a new gate pass, and who left today. */
export function Visitors() {
  const nav = useNavigation<any>();
  const D = useData();
  const { session } = useAuth();
  const { busy, run } = useAction();
  const t0 = productionDayStart().getTime();
  const on = D.visitor.filter((v) => !v.time_out).sort((a, b) => b.time_in.localeCompare(a.time_in));
  const left = D.visitor.filter((v) => v.time_out && new Date(v.time_out).getTime() >= t0).sort((a, b) => b.time_out.localeCompare(a.time_out));
  return (
    <TabScreen title="Visitors">
      <Btn title="New visitor gate pass" onPress={() => nav.navigate("NewVisitor")} />
      <SectionTitle>{`On site · ${on.length}`}</SectionTitle>
      {on.length === 0 ? <Empty text="No visitors on site." /> : null}
      {on.map((v) => (
        <Card key={v.id} style={{ gap: 6, padding: 14, borderRadius: 16 }}>
          <Row>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.ink }}>{v.name}</Text>
              <Sub>{v.purpose} · to meet {personName(D, v.meet_person_id)}</Sub>
            </View>
            <Badge text={v.pass_no} />
          </Row>
          <Sub>In {fmtTime(v.time_in)}{v.vehicle_no ? ` · ${v.vehicle_no}` : ""}{(v.people_count ?? 1) > 1 ? ` · ${v.people_count} people` : ""}</Sub>
          <Row style={{ gap: 10 }}>
            <View style={{ flex: 1 }}><Btn small kind="soft" title="Pass" onPress={() => nav.navigate("VisitorPass", { id: v.id })} /></View>
            <View style={{ flex: 1 }}><Btn small title="Check out" busy={busy} onPress={() => run(() => save({ table: "visitor", row: { id: v.id, time_out: nowIso(), out_by: session!.person.id } }))} /></View>
          </Row>
        </Card>
      ))}
      {left.length ? (
        <>
          <SectionTitle>Left today</SectionTitle>
          <Card>
            {left.map((v) => (
              <Row key={v.id} style={{ paddingVertical: 5 }}>
                <Text style={{ fontWeight: "700", color: C.ink }}>{fmtTime(v.time_in)}–{fmtTime(v.time_out)}</Text>
                <T>{v.name}</T>
                <View style={{ flex: 1, alignItems: "flex-end" }}><Sub>{v.purpose}</Sub></View>
              </Row>
            ))}
          </Card>
        </>
      ) : null}
    </TabScreen>
  );
}

/** Fill in before the visitor goes in. */
export function NewVisitor() {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const D = useData();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [from, setFrom] = useState("");
  const [purpose, setPurpose] = useState<string | null>("Meeting");
  const [meet, setMeet] = useState<string | null>(null);
  const [count, setCount] = useState("1");
  const [vehicle, setVehicle] = useState("");
  const [idDoc, setIdDoc] = useState("");
  const [carrying, setCarrying] = useState("");
  const { busy, run } = useAction();
  const staff = D.person.filter((p) => p.active && !rolesOf(D, p.id).some((r) => r === "Helper" || r === "Security"));

  const submit = () =>
    run(async () => {
      const n = name.trim().replace(/\s+/g, " ");
      const ph = phone.replace(/\D/g, "");
      if (n.length < 3) throw new Error("Enter the visitor's name");
      if (ph && ph.length !== 10) throw new Error("The mobile number should have 10 digits");
      if (!meet) throw new Error("Choose who they are meeting");
      const id = newId();
      await save({ table: "visitor", row: { id, pass_no: nextPassNo(D), name: n, mobile: ph || null, from_org: from.trim() || null, purpose: purpose ?? "Other", meet_person_id: meet, people_count: Number(count) || 1, vehicle_no: vehicle.trim() || null, id_doc: idDoc.trim() || null, carrying: carrying.trim() || null, time_in: nowIso(), time_out: null, pass_by: session!.person.id, out_by: null } });
      nav.replace("VisitorPass", { id });
    });

  return (
    <Screen>
      <H>New visitor gate pass</H>
      <Sub>Fill in before the visitor goes in.</Sub>
      <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
      <Field label="Mobile" value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, ""))} keyboardType="phone-pad" maxLength={10} />
      <Field label="From (company or address)" value={from} onChangeText={setFrom} />
      <SectionTitle>Purpose</SectionTitle>
      <Chips value={purpose} onChange={setPurpose} options={PURPOSE.map((p) => ({ key: p, label: p }))} />
      <SectionTitle>To meet</SectionTitle>
      <Select value={meet} options={staff.map((p) => ({ key: p.id, label: p.full_name, sub: rolesOf(D, p.id).join(", ") }))} onChange={setMeet} placeholder="Choose" title="To meet" />
      <Field label="People" value={count} onChangeText={(v) => setCount(v.replace(/\D/g, ""))} keyboardType="number-pad" />
      <Field label="Vehicle no. (optional)" value={vehicle} onChangeText={setVehicle} autoCapitalize="characters" />
      <Field label="ID type and number" value={idDoc} onChangeText={setIdDoc} hint="Citizenship, licence..." />
      <Field label="Carrying (tools, material)" value={carrying} onChangeText={setCarrying} />
      <Btn title="Make pass" onPress={submit} busy={busy} />
    </Screen>
  );
}

/** The pass, to show on the phone. */
export function VisitorPass() {
  const { params } = useRoute<any>();
  const D = useData();
  const v: R | undefined = D.visitor.find((x) => x.id === params.id);
  if (!v) return <Screen><Empty text="Pass not found." /></Screen>;
  const row = (label: string, value: string | null | undefined) => (value ? <View key={label} style={{ flexBasis: "47%", flexGrow: 1 }}><Sub>{label}</Sub><T bold>{value}</T></View> : null);
  return (
    <Screen>
      <Card style={{ gap: 12, padding: 18, borderRadius: 18 }}>
        <Row><Text style={{ fontFamily: F.head, fontSize: 30, color: C.ink }}>Gate pass</Text><View style={{ flex: 1, alignItems: "flex-end" }}><Badge text={v.pass_no} tone="info" /></View></Row>
        <Text style={{ fontFamily: F.head, fontSize: 34, color: C.green }}>{v.name}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
          {row("Purpose", v.purpose)}
          {row("To meet", personName(D, v.meet_person_id))}
          {row("From", v.from_org)}
          {row("Mobile", v.mobile)}
          {row("People", String(v.people_count ?? 1))}
          {row("Vehicle", v.vehicle_no)}
          {row("ID", v.id_doc)}
          {row("Carrying", v.carrying)}
          {row("In", fmtDateTime(v.time_in))}
          {row("Out", v.time_out ? fmtDateTime(v.time_out) : "On site")}
          {row("Pass made by", personName(D, v.pass_by))}
        </View>
      </Card>
    </Screen>
  );
}
