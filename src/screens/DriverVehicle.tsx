import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Badge, Btn, C, Card, Chips, Empty, F, Field, Icon, Pill, Row, ScreenHeader, SectionTitle, Spacer, Sub, T, Text, initialsOf, useAction } from "../ui";
import { useAuth } from "../auth";
import { requestDays } from "../sync";
import { newId, save, useData } from "../store";
import { onSiteMap, personName } from "../rules";
import { DAY, fmtDuration, fmtTime, HOUR, nowIso, productionDayStart } from "../time";

type Data = ReturnType<typeof useData>;

const PURPOSES = ["Feeding the chippers", "Moving raw material", "Loading a sales truck", "Other"];
const ms = (v: any) => new Date(v).getTime();
const dec = (v: string) => {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const h1 = (n: number) => n.toFixed(1);
const clock2 = (n: number) => String(n).padStart(2, "0");
const fmtClock = (t: number) => {
  const s = Math.max(0, Math.floor(t / 1000));
  return `${clock2(Math.floor(s / 3600))}:${clock2(Math.floor((s % 3600) / 60))}:${clock2(s % 60)}`;
};

/** The last hour meter reading of a vehicle: from its work sessions or its diesel fills, whichever is newest. */
function lastMeter(D: Data, vehicleId: string): number | null {
  let best: { at: number; v: number } | null = null;
  for (const x of D.vehicle_session) {
    if (x.vehicle_id !== vehicleId) continue;
    const raw = x.meter_end ?? x.meter_start;
    const v = raw == null ? NaN : Number(raw);
    const at = ms(x.stopped_at ?? x.started_at);
    if (!Number.isNaN(v) && (!best || at > best.at)) best = { at, v };
  }
  for (const f of D.diesel_fill) {
    if (f.vehicle_id !== vehicleId || f.meter == null) continue;
    const at = ms(f.at);
    if (!best || at > best.at) best = { at, v: Number(f.meter) };
  }
  return best ? best.v : null;
}

/** Litres per hour: the diesel put in after the first fill, over the meter hours between the first and the last fill. */
function dieselRate(D: Data, vehicleId: string, nowMs: number): number | null {
  const fills = D.diesel_fill.filter((f) => f.vehicle_id === vehicleId && ms(f.at) >= nowMs - 30 * DAY).sort((a, b) => ms(a.at) - ms(b.at));
  if (fills.length < 2) return null;
  const used = fills.slice(1).reduce((n, f) => n + Number(f.litres), 0);
  const hours = Number(fills[fills.length - 1].meter) - Number(fills[0].meter);
  return hours > 0 ? used / hours : null;
}

/** The working time, ticking every second. It re-renders on its own so the rest of the screen stays still. */
function LiveClock({ since, color }: { since: string; color: string }) {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setT(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  return <Text style={{ fontFamily: F.head, fontSize: 64, lineHeight: 68, color }}>{fmtClock(t - ms(since))}</Text>;
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Sub>{label}</Sub>
      <Text style={{ fontFamily: F.bodyBold, fontSize: 17, color: C.ink }}>{value}</Text>
    </View>
  );
}

/** The driver's vehicle: start and stop work with the hour meter, add diesel, and see today's entries. */
export default function DriverVehicle() {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const D = useData();
  const me = session!.person.id;
  const name = session!.person.full_name;
  const [sel, setSel] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "start" | "stop" | "fuel">(null);

  // A phone normally keeps 3 days of records. Diesel use over 30 days needs the fills of 30 days.
  useEffect(() => { requestDays(30); }, []);
  const nowMs = Date.now();

  const allowed = D.vehicle
    .filter((v) => D.driver_vehicle.some((o) => o.person_id === me && o.vehicle_id === v.id))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const here = onSiteMap(D).has(me);
  const openOf = (vehicleId: string) => D.vehicle_session.find((x) => x.vehicle_id === vehicleId && !x.stopped_at);
  const v = allowed.find((x) => x.id === sel) ?? allowed.find((x) => openOf(x.id)?.driver_id === me) ?? allowed[0];

  const header = <ScreenHeader title="Vehicle" subtitle={name} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} />;

  if (!v) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        {header}
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          {!here ? <Badge text="You are not checked in at the gate" tone="warn" /> : null}
          <Empty text="No vehicle is set up for you yet. The supervisor ticks your vehicles." />
        </ScrollView>
      </View>
    );
  }

  const os = openOf(v.id);
  const lockedBy = os && os.driver_id !== me ? (os.driver_id as string) : null;
  const ok = here && !lockedBy;
  const last = lastMeter(D, v.id);
  const rate = dieselRate(D, v.id, nowMs);
  const color = os ? C.ok : C.grey;
  const vname = (id: string) => D.vehicle.find((x) => x.id === id)?.name ?? "?";

  // Today's entries: my work sessions and my diesel fills since the production day began.
  const t0 = productionDayStart().getTime();
  const entries = [
    ...D.vehicle_session.filter((x) => x.driver_id === me && ms(x.started_at) >= t0).map((x) => ({
      id: x.id as string,
      at: ms(x.started_at),
      left: `${fmtTime(x.started_at)}-${x.stopped_at ? fmtTime(x.stopped_at) : "now"}`,
      mid: `${vname(x.vehicle_id)} · ${x.job ?? ""}`,
      right: x.meter_end != null ? `${h1(Number(x.meter_end) - Number(x.meter_start))} h` : "working",
    })),
    ...D.diesel_fill.filter((f) => f.by === me && ms(f.at) >= t0).map((f) => ({
      id: f.id as string,
      at: ms(f.at),
      left: fmtTime(f.at),
      mid: `${vname(f.vehicle_id)} · diesel`,
      right: `${Number(f.litres)} L`,
    })),
  ].sort((a, b) => b.at - a.at);

  const close = () => setPanel(null);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {header}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }} keyboardShouldPersistTaps="handled">
        {!here ? <Badge text="You are not checked in at the gate" tone="warn" /> : null}

        {allowed.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {allowed.map((x) => <Pill key={x.id} label={x.name} dot={openOf(x.id) ? C.ok : C.grey} selected={x.id === v.id} onPress={() => { setSel(x.id); setPanel(null); }} />)}
          </ScrollView>
        ) : null}

        <View style={{ backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, borderTopWidth: 5, borderTopColor: color, padding: 18, gap: 8 }}>
          <Row>
            <View style={{ backgroundColor: C.greySoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 13, color: C.sub, fontWeight: "600" }}>{v.type}</Text>
            </View>
            <Spacer />
            <View style={{ backgroundColor: C.greySoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
              <Text style={{ fontSize: 14, color: C.ink, fontWeight: "600" }}>{os ? "Working" : "Parked"}</Text>
            </View>
          </Row>
          <Text style={{ fontFamily: F.head, fontSize: 36, color: C.ink, lineHeight: 40 }}>{v.name}</Text>
          {v.reg_no ? <Sub>{v.reg_no}</Sub> : null}
          {os ? <LiveClock since={os.started_at} color={color} /> : <Text style={{ fontFamily: F.head, fontSize: 72, lineHeight: 76, color: "#4a4f4b" }}>Parked</Text>}
          {os ? <Text style={{ color: C.sub, fontSize: 15 }}>{os.job} · since {fmtTime(os.started_at)} · {personName(D, os.driver_id)}</Text> : null}

          <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
            <Kv label="Hour meter" value={last != null ? `${h1(last)} h` : "-"} />
            <Kv label="Diesel use, 30 days" value={rate ? `${h1(rate)} L per hour` : "not enough fills"} />
          </View>

          {lockedBy ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="warning-outline" size={18} color={C.amber} />
              <Text style={{ flex: 1, color: C.amber, fontSize: 14 }}>In use by {personName(D, lockedBy)}.</Text>
            </View>
          ) : null}

          <View style={{ marginTop: 8, gap: 8 }}>
            {os ? (
              <Btn title="Stop work" kind="danger" disabled={!ok} onPress={() => setPanel("stop")} />
            ) : (
              <Btn title="Start work" disabled={!ok} onPress={() => setPanel("start")} />
            )}
            <Btn title="Add diesel" kind="soft" disabled={!ok} onPress={() => setPanel("fuel")} />
          </View>
        </View>

        <SectionTitle>Your entries today</SectionTitle>
        <Card>
          {entries.length === 0 ? <Sub>Nothing yet today.</Sub> : entries.map((e) => (
            <Row key={e.id} style={{ justifyContent: "space-between", gap: 8 }}>
              <T bold>{e.left}</T>
              <Text style={{ flex: 1, color: C.ink, fontSize: 14 }}>{e.mid}</Text>
              <Sub>{e.right}</Sub>
            </Row>
          ))}
        </Card>
      </ScrollView>

      <Sheet visible={panel === "start" && !os} title={`Start work · ${v.name}`} onClose={close}>
        <StartPanel key={v.id} v={v} me={me} last={last} onDone={close} />
      </Sheet>
      <Sheet visible={panel === "stop" && !!os} title={`Stop work · ${v.name}`} onClose={close}>
        {os ? <StopPanel key={os.id} os={os} onDone={close} /> : null}
      </Sheet>
      <Sheet visible={panel === "fuel"} title={`Add diesel · ${v.name}`} onClose={close}>
        <FuelPanel key={v.id} v={v} me={me} last={last} onDone={close} />
      </Sheet>
    </View>
  );
}

/** A form that slides up from the bottom: a title, Close at the top right, and the form below. */
function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable onPress={onClose} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)" }} />
        <View style={{ backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18 + insets.bottom, maxHeight: "90%" }}>
          <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: C.line, marginBottom: 14 }} />
          <Row style={{ marginBottom: 6 }}>
            <Text style={{ flex: 1, fontFamily: F.head, fontSize: 30, lineHeight: 34, color: C.ink }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}><Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.sub }}>Close</Text></Pressable>
          </Row>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingTop: 4 }}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Cancel and the main action, side by side. */
function SheetButtons({ onCancel, children }: { onCancel: () => void; children: React.ReactNode }) {
  return (
    <Row style={{ gap: 12, marginTop: 4 }}>
      <View style={{ flex: 1 }}><Btn title="Cancel" kind="ghost" onPress={onCancel} /></View>
      <View style={{ flex: 1 }}>{children}</View>
    </Row>
  );
}

function StartPanel({ v, me, last, onDone }: { v: any; me: string; last: number | null; onDone: () => void }) {
  const [meter, setMeter] = useState(last != null ? String(last) : "");
  const [job, setJob] = useState<string | null>(PURPOSES[0]);
  const { busy, run } = useAction();

  const go = () =>
    run(async () => {
      const m = dec(meter);
      if (m == null) throw new Error("Enter the hour meter reading.");
      if (last != null && m < last) throw new Error(`The meter cannot be below the last reading (${h1(last)}).`);
      await save({
        table: "vehicle_session",
        row: { id: newId(), vehicle_id: v.id, driver_id: me, started_at: nowIso(), stopped_at: null, meter_start: m, meter_end: null, job: job ?? "Other" },
      });
      onDone();
    });

  return (
    <>
      <Field label="HOUR METER NOW" value={meter} onChangeText={setMeter} keyboardType="decimal-pad" />
      {last != null ? <Sub>Last reading {h1(last)} h</Sub> : null}
      <Sub>Job</Sub>
      <Chips options={PURPOSES.map((p) => ({ key: p, label: p }))} value={job} onChange={setJob} />
      <SheetButtons onCancel={onDone}><Btn title="Start work" onPress={go} busy={busy} /></SheetButtons>
    </>
  );
}

function StopPanel({ os, onDone }: { os: any; onDone: () => void }) {
  const [meter, setMeter] = useState("");
  const { busy, run } = useAction();
  const start = Number(os.meter_start);
  const m = dec(meter);

  const go = () =>
    run(async () => {
      if (m == null) throw new Error("Enter the hour meter reading.");
      if (m < start) throw new Error(`The meter cannot be below the start reading (${h1(start)}).`);
      const since = Date.now() - ms(os.started_at);
      if (m - start > since / HOUR + 0.5) throw new Error(`That is ${h1(m - start)} hours, but work started only ${fmtDuration(since)} ago. Check the reading.`);
      await save({ table: "vehicle_session", row: { id: os.id, stopped_at: nowIso(), meter_end: m } });
      onDone();
    });

  return (
    <>
      <Sub>Started {fmtTime(os.started_at)} at {start.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h</Sub>
      <Field label="HOUR METER NOW" value={meter} onChangeText={setMeter} keyboardType="decimal-pad" />
      <View style={{ backgroundColor: C.amberSoft, borderRadius: 12, padding: 14 }}>
        <Text style={{ color: C.ink, fontSize: 15 }}>{m != null ? `${h1(m - start)} hours worked.` : "Enter the reading to see hours worked."}</Text>
      </View>
      <SheetButtons onCancel={onDone}><Btn title="Stop work" kind="danger" onPress={go} busy={busy} /></SheetButtons>
    </>
  );
}

function FuelPanel({ v, me, last, onDone }: { v: any; me: string; last: number | null; onDone: () => void }) {
  const [litres, setLitres] = useState("");
  const [meter, setMeter] = useState(last != null ? String(last) : "");
  const { busy, run } = useAction();

  const go = () =>
    run(async () => {
      const l = dec(litres);
      const m = dec(meter);
      if (l == null || l <= 0 || l > 500) throw new Error("Enter the litres filled (1 to 500).");
      if (m == null) throw new Error("Enter the hour meter reading.");
      if (last != null && m < last) throw new Error(`The meter cannot be below the last reading (${h1(last)}).`);
      await save({ table: "diesel_fill", row: { id: newId(), vehicle_id: v.id, at: nowIso(), litres: Math.round(l), meter: m, by: me } });
      onDone();
    });

  return (
    <>
      <Sub>Write it down at every fill so diesel use per hour can be worked out.</Sub>
      <Field label="LITRES FILLED" value={litres} onChangeText={setLitres} keyboardType="number-pad" />
      <Field label="HOUR METER AT THE FILL" value={meter} onChangeText={setMeter} keyboardType="decimal-pad" />
      <SheetButtons onCancel={onDone}><Btn title="Save fill" onPress={go} busy={busy} /></SheetButtons>
    </>
  );
}