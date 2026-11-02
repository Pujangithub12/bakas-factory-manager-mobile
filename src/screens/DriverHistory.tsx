import React, { useEffect } from "react";
import { ScrollView, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { C, Card, Empty, Row, ScreenHeader, SectionTitle, Sub, T, Text, initialsOf } from "../ui";
import { useAuth } from "../auth";
import { useData } from "../store";
import { requestDays } from "../sync";
import { DAY, fmtTime, productionDayStart } from "../time";

const ms = (v: any) => new Date(v).getTime();
const h1 = (n: number) => n.toFixed(1);

/** The driver's own entries for the last 7 days, newest day first: hours worked and diesel put in. */
export default function DriverHistory() {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const D = useData();
  const me = session!.person.id;
  const name = session!.person.full_name;

  // A phone normally keeps 3 days of records. This tab needs 7.
  useEffect(() => { requestDays(7); }, []);

  const vname = (id: string) => D.vehicle.find((x) => x.id === id)?.name ?? "?";
  const t0 = productionDayStart().getTime();

  const days = [];
  for (let d = 0; d < 7; d++) {
    const a = t0 - d * DAY;
    const b = a + DAY;
    const items = [
      ...D.vehicle_session.filter((x) => x.driver_id === me && ms(x.started_at) >= a && ms(x.started_at) < b).map((x) => ({
        id: x.id as string,
        at: ms(x.started_at),
        left: `${fmtTime(x.started_at)}-${x.stopped_at ? fmtTime(x.stopped_at) : "now"}`,
        mid: vname(x.vehicle_id),
        right: x.meter_end != null ? `${h1(Number(x.meter_end) - Number(x.meter_start))} h` : "working",
      })),
      ...D.diesel_fill.filter((f) => f.by === me && ms(f.at) >= a && ms(f.at) < b).map((f) => ({
        id: f.id as string,
        at: ms(f.at),
        left: fmtTime(f.at),
        mid: `${vname(f.vehicle_id)} · diesel`,
        right: `${Number(f.litres)} L`,
      })),
    ].sort((x, y) => y.at - x.at);
    if (items.length === 0) continue;
    const label = d === 0 ? "Today" : d === 1 ? "Yesterday" : new Date(a).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    days.push({ key: a, label, items });
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="History" subtitle="Your last 7 days" initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}>
        {days.length === 0 ? <Empty text="No entries in the last 7 days." /> : null}
        {days.map((day) => (
          <View key={day.key} style={{ gap: 8 }}>
            <SectionTitle>{day.label}</SectionTitle>
            <Card>
              {day.items.map((e) => (
                <Row key={e.id} style={{ justifyContent: "space-between", gap: 8 }}>
                  <T bold>{e.left}</T>
                  <Text style={{ flex: 1, color: C.ink, fontSize: 14 }}>{e.mid}</Text>
                  <Sub>{e.right}</Sub>
                </Row>
              ))}
            </Card>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}