import React from "react";
import { ScrollView, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Badge, Card, Empty, Row, ScreenHeader, SectionTitle, Spacer, Sub, Text, C, F, Avatar, initialsOf } from "../ui";
import { useAuth } from "../auth";
import { useData } from "../store";
import { onSiteMap, rolesOf } from "../rules";
import { fmtTime } from "../time";
import { roleInfo } from "../roles";

const tone = (r: string) => (r === "Owner" ? "bad" : r === "Manager" ? "warn" : r === "Supervisor" ? "info" : "mute") as "bad" | "warn" | "info" | "mute";

/** Who is on site now, and everyone who has access. Adding and removing users is on the laptop for now. */
export default function People() {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const D = useData();
  const name = session!.person.full_name;
  const site = onSiteMap(D);
  const active = D.person.filter((p) => p.active).sort((a, b) => a.full_name.localeCompare(b.full_name));
  const here = active.filter((p) => site.has(p.id));
  const others = active.filter((p) => !site.has(p.id));

  const card = (p: any) => {
    const a = site.get(p.id);
    const roles = rolesOf(D, p.id);
    return (
      <Card key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16 }}>
        <Avatar text={initialsOf(p.full_name)} size={44} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.ink }}>{p.full_name}</Text>
          <Row style={{ flexWrap: "wrap", gap: 6 }}>
            {roles.length ? roles.map((r) => <Badge key={r} text={roleInfo(r).label} tone={tone(r)} />) : <Sub>No role yet</Sub>}
            {!p.checked ? <Badge text="New" tone="info" /> : null}
          </Row>
        </View>
        {a ? <Badge text={`In ${fmtTime(a.gate_in)}`} tone="good" /> : null}
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="People" subtitle={`${here.length} on site · ${active.length} users`} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32, gap: 10 }}>
        <SectionTitle>On site ({here.length})</SectionTitle>
        {here.length === 0 ? <Empty text="No one is checked in." /> : here.map(card)}
        <SectionTitle>Everyone else ({others.length})</SectionTitle>
        {others.length === 0 ? <Sub>No one else.</Sub> : others.map(card)}
        <Spacer />
      </ScrollView>
    </View>
  );
}
