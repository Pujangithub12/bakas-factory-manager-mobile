import React from "react";
import { ScrollView, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Badge, Card, Row, ScreenHeader, SectionTitle, Spacer, Sub, T, Text, C, F, initialsOf } from "../ui";
import { useAuth } from "../auth";
import { useData, useOutboxCounts } from "../store";
import { useSyncState } from "../sync";
import { getServerUrl } from "../api";
import { machineStatus, onSiteMap, personName } from "../rules";
import { fmtDateTime, fmtTime, nextShiftWindow, shiftWindow, type ShiftWindow } from "../time";

/** The shift, who is in charge, and the connection. */
export default function Details() {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const D = useData();
  const sync = useSyncState();
  const counts = useOutboxCounts();
  const name = session!.person.full_name;

  const now = shiftWindow(D.shift);
  const next = now ? nextShiftWindow(D.shift, now) : null;
  const inCharge = (w: ShiftWindow | null) => {
    const row = w && D.shift_in_charge.find((s) => new Date(s.shift_start).getTime() === w.start.getTime());
    return row ? personName(D, row.person_id) : "Not set";
  };
  const running = D.machine.filter((m) => machineStatus(D, m).state === "running").length;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Details" subtitle="Shift, crew and connection" initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}>
        <Card>
          <Sub>THIS SHIFT</Sub>
          <Text style={{ fontFamily: F.head, fontSize: 30, color: C.ink }}>{now ? `${now.shift.name} · ${fmtTime(now.start.toISOString())}–${fmtTime(now.end.toISOString())}` : "No shift set up"}</Text>
          <T>In charge: <T bold>{inCharge(now)}</T></T>
          {next ? <Sub>Next: {next.shift.name} from {fmtTime(next.start.toISOString())}, {inCharge(next)}</Sub> : null}
        </Card>

        <Row style={{ alignItems: "stretch", gap: 12 }}>
          <Card style={{ flex: 1 }}><Text style={{ fontFamily: F.head, fontSize: 36, color: C.ink }}>{onSiteMap(D).size}</Text><Sub>People on site</Sub></Card>
          <Card style={{ flex: 1 }}><Text style={{ fontFamily: F.head, fontSize: 36, color: C.ink }}>{running}/{D.machine.length}</Text><Sub>Machines running</Sub></Card>
        </Row>

        <SectionTitle>Connection</SectionTitle>
        <Card>
          <Row>
            <Badge text={sync.online ? "Online" : "Offline"} tone={sync.online ? "good" : "warn"} />
            {counts.pending ? <Badge text={`${counts.pending} waiting to send`} tone="warn" /> : <Badge text="All sent" tone="good" />}
            {counts.rejected ? <Badge text={`${counts.rejected} refused`} tone="bad" /> : null}
            <Spacer />
          </Row>
          <Sub>Last updated {sync.lastOk ? fmtDateTime(sync.lastOk) : "never"}</Sub>
          <Sub>Server: {getServerUrl() || "not set"}</Sub>
          {sync.error ? <Text style={{ color: C.red }}>{sync.error}</Text> : null}
        </Card>
      </ScrollView>
    </View>
  );
}
