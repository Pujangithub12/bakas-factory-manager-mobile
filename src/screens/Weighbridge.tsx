import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Screen, H, Sub, Card, T, Text, Badge, Row, Btn, Field, SectionTitle, Chips, confirm, say, useAction, Empty, C, F, Spacer, Icon, ScreenHeader, initialsOf, type IconName } from "../ui";
import { useAuth } from "../auth";
import { newId, save, useData, type Data } from "../store";
import { useSyncState } from "../sync";
import { activeBatch, batchCode, batchMaterial, batchTickets, fillingBatch, nextChallan, num, suggestYard, ticketNet } from "../rules";
import { fmtDateTime, fmtTime, nowIso, productionDayStart, shiftWindow, type Row as R } from "../time";

const kg = (n: number | null) => (n == null ? "-" : `${n.toLocaleString("en-US")} kg`);

const kindBadge = (t: R) => <Badge text={t.direction === "in" ? "In" : "Sale"} tone={t.direction === "in" ? "info" : "warn"} />;

function useWeighData() {
  const D = useData();
  const party = (t: R) => (t.direction === "in" ? D.supplier : D.buyer).find((p) => p.id === (t.direction === "in" ? t.supplier_id : t.buyer_id))?.name ?? "-";
  const mat = (t: R) => D.material.find((m) => m.id === t.material_id)?.name ?? "-";
  const onBridge = D.weigh_ticket.filter((t) => t.second_kg == null).sort((a, b) => b.first_at.localeCompare(a.first_at));
  const dayStart = productionDayStart().getTime();
  const done = D.weigh_ticket
    .filter((t) => t.second_kg != null && new Date(t.second_at).getTime() >= dayStart)
    .sort((a, b) => b.second_at.localeCompare(a.second_at));
  return { D, party, mat, onBridge, done };
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <Card style={{ flex: 1, gap: 2, padding: 12, borderRadius: 14 }}>
      <Text style={{ fontFamily: F.head, fontSize: 34, color: C.ink, lineHeight: 38 }}>{value}</Text>
      <Sub>{label}</Sub>
    </Card>
  );
}

/** Big brown action button with a truck, as in the design. */
function BigAction({ title, icon, onPress }: { title: string; icon: IconName; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: C.green, borderRadius: 18, paddingVertical: 20 }, pressed && { opacity: 0.8 }]}>
      <Icon name={icon} size={26} color="#fff" />
      <Text style={{ fontFamily: F.head, fontSize: 26, color: "#fff" }}>{title}</Text>
    </Pressable>
  );
}

/** Trucks that have had their first weight and wait for the second. */
function TrucksBody() {
  const nav = useNavigation<any>();
  const { D, party, mat, onBridge, done } = useWeighData();
  const filling = D.yard.filter((y) => fillingBatch(D, y.id)).length;

  return (
    <>
      <Row style={{ gap: 12 }}>
        <BigAction title="Truck in" icon="bus-outline" onPress={() => nav.navigate("TruckIn")} />
        <BigAction title="Sale out" icon="bus-outline" onPress={() => nav.navigate("TruckOut")} />
      </Row>
      <Row style={{ gap: 12 }}>
        <Stat value={onBridge.length} label="On the site" />
        <Stat value={done.length} label="Done today" />
        <Stat value={filling} label="Yards filling" />
      </Row>
      <Btn title="Count pellet bags" kind="soft" onPress={() => nav.navigate("BagCount")} />

      <SectionTitle>{`Weighed once · ${onBridge.length}`}</SectionTitle>
      {onBridge.length === 0 ? <Empty text="No truck is waiting for its second weight." /> : null}
      {onBridge.map((t) => {
        const batch = t.direction === "in" ? D.yard_batch.find((b) => b.id === t.batch_id) : null;
        return (
          <Card key={t.id} style={{ gap: 6, padding: 16, borderRadius: 18 }}>
            <Row>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 18, color: C.ink }}>{t.vehicle_no}</Text>
              <Spacer />
              {kindBadge(t)}
            </Row>
            <Sub style={{ fontSize: 14 }}>{party(t)} · {mat(t)}</Sub>
            <T>
              First weight {num(t.first_kg).toLocaleString("en-US")} kg at {fmtTime(t.first_at)}
              {t.direction === "in" ? (batch ? ` · unloading at ${batchCode(D, batch)}` : "") : ` · ${t.challan_no}`}
            </T>
            <Sub>Serial #{t.wbsn} · {t.direction === "in" ? "gross" : "empty truck"}</Sub>
            <Btn title="Weigh out" onPress={() => nav.navigate("WeighOut", { ticketId: t.id })} />
          </Card>
        );
      })}

      <SectionTitle>Done today</SectionTitle>
      {done.length === 0 ? <Sub>No finished trucks yet.</Sub> : null}
      {done.map((t) => (
        <Card key={t.id}>
          <Row><T bold>{t.vehicle_no}</T>{kindBadge(t)}<Spacer /><T bold>{kg(ticketNet(t))}</T></Row>
          <Sub>{mat(t)} · {party(t)} · #{t.wbsn}{t.challan_no ? ` · ${t.challan_no}` : ""}</Sub>
          <Sub>{fmtDateTime(t.second_at)}</Sub>
        </Card>
      ))}
    </>
  );
}

/** Each yard: its batch, trucks against the limit, and Stop filling. */
function YardsBody() {
  const D = useData();
  const { busy, run } = useAction();
  return (
    <>
      {[...D.yard].sort((a, b) => a.letter.localeCompare(b.letter)).map((y) => {
        const b = activeBatch(D, y.id);
        const trucks = b ? batchTickets(D, b.id).length : 0;
        return (
          <Card key={y.id} style={{ padding: 16, borderRadius: 18 }}>
            <Row>
              <Text style={{ fontFamily: F.head, fontSize: 26, color: C.ink }}>{y.name}</Text>
              <Spacer />
              {!b ? <Badge text="Empty" /> : b.started_at ? <Badge text="Feeding" tone="info" /> : b.closed_at ? <Badge text="Closed" tone="warn" /> : <Badge text="Filling" tone="good" />}
            </Row>
            {b ? (
              <>
                <T>{batchCode(D, b)} · {batchMaterial(D, b)?.name ?? "no truck yet"}</T>
                <Sub>{trucks} of {y.holds_trucks ?? "-"} trucks</Sub>
                {!b.closed_at ? (
                  <Btn small kind="ghost" title="Stop filling" busy={busy} onPress={() => confirm("Stop filling", `Close ${batchCode(D, b)} for filling?`, "Close", () => run(() => save({ table: "yard_batch", row: { id: b.id, closed_at: nowIso() } })))} />
                ) : null}
              </>
            ) : (
              <Sub>Ready for the next truck. Limit {y.holds_trucks ?? "-"} trucks.</Sub>
            )}
          </Card>
        );
      })}
    </>
  );
}

/** A tab screen: the title, "name · shift" and the avatar, then the scrolling body. */
function TabScreen({ title, children }: { title: string; children: React.ReactNode }) {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const D = useData();
  const name = session!.person.full_name;
  const shift = shiftWindow(D.shift)?.shift.name;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title={title} subtitle={`${name}${shift ? ` · ${shift} shift` : ""}`} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    </View>
  );
}

/** The Weighbridge person's first tab. */
export const Trucks = () => <TabScreen title="Weighbridge"><TrucksBody /></TabScreen>;
/** The Weighbridge person's second tab. */
export const YardsTab = () => <TabScreen title="Yards"><YardsBody /></TabScreen>;

/** The same screens for the Owner and Manager, opened from the home list. */
export default function Weighbridge() {
  return (
    <Screen>
      <TrucksBody />
      <SectionTitle>Yards</SectionTitle>
      <YardsBody />
    </Screen>
  );
}

/** Add a supplier or buyer without leaving the form. */
function PartyAdder({ table, onAdded }: { table: "supplier" | "buyer"; onAdded: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const { busy, run } = useAction();
  if (!open) return <Btn small kind="ghost" title={`New ${table}`} onPress={() => setOpen(true)} />;
  return (
    <Card>
      <Field label={`${table === "supplier" ? "Supplier" : "Buyer"} name`} value={name} onChangeText={setName} autoCapitalize="words" />
      <Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Row>
        <Btn small title="Add" busy={busy} onPress={() => run(async () => {
          if (!name.trim()) throw new Error("Enter the name");
          const id = newId();
          await save({ table, row: table === "supplier"
            ? { id, name: name.trim(), phone: phone.trim() || null, address: null, pan: null, usually_supplies: null }
            : { id, name: name.trim(), phone: phone.trim() || null, address: null, pan_vat: null, products: null } });
          onAdded(id); setOpen(false); setName(""); setPhone("");
        })} />
        <Btn small kind="ghost" title="Cancel" onPress={() => setOpen(false)} />
      </Row>
    </Card>
  );
}

const intOrThrow = (v: string, label: string) => {
  const n = Number(v);
  if (!v.trim() || !Number.isInteger(n) || n <= 0) throw new Error(`${label} must be a whole number of kg`);
  return n;
};

function checkSerial(D: Data, v: string) {
  const n = intOrThrow(v, "Weighbridge serial");
  if (D.weigh_ticket.some((t) => num(t.wbsn) === n)) throw new Error(`Serial ${n} is already entered.`);
  return n;
}

export function TruckIn() {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const D = useData();
  const me = session!.person.id;
  const [wbsn, setWbsn] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [vehicleType, setVehicleType] = useState<string | null>(null);
  const [driver, setDriver] = useState("");
  const [contact, setContact] = useState("");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [gross, setGross] = useState("");
  const [m1, setM1] = useState(""); const [m2, setM2] = useState(""); const [m3, setM3] = useState("");
  const [yardId, setYardId] = useState<string | null>(null);
  const [yardTouched, setYardTouched] = useState(false);
  const [remarks, setRemarks] = useState("");
  const { busy, run } = useAction();

  // The system names the yard to unload at; the clerk can change it.
  const suggested = materialId ? suggestYard(D, materialId) : undefined;
  useEffect(() => { if (!yardTouched) setYardId(suggested?.id ?? null); }, [suggested?.id, yardTouched]);

  const submit = () =>
    run(async () => {
      const serial = checkSerial(D, wbsn);
      if (!vehicleNo.trim()) throw new Error("Enter the vehicle number");
      if (!supplierId) throw new Error("Choose the supplier");
      if (!materialId) throw new Error("Choose the material");
      const first = intOrThrow(gross, "Gross weight");
      const moist = [m1, m2, m3].map((v) => (v.trim() === "" ? NaN : Number(v)));
      if (moist.some((v) => isNaN(v) || v < 0 || v > 99)) throw new Error("Enter all three moisture readings (0 to 99)");
      if (!yardId) throw new Error("Choose the yard to unload at");
      const yard = D.yard.find((y) => y.id === yardId)!;
      const now = nowIso();

      const writes: Parameters<typeof save> = [];
      let batch = fillingBatch(D, yardId);
      if (!batch) {
        const seq = Math.max(0, ...D.yard_batch.filter((b) => b.yard_id === yardId).map((b) => num(b.seq))) + 1;
        batch = { id: newId(), yard_id: yardId, seq, opened_at: now, closed_at: null, started_at: null, finished_at: null, started_by: null, finished_by: null };
        writes.push({ table: "yard_batch", row: batch });
      }
      writes.push({
        table: "weigh_ticket",
        row: {
          id: newId(), wbsn: serial, direction: "in", vehicle_type: vehicleType, vehicle_no: vehicleNo.trim(), driver_name: driver.trim() || null, driver_contact: contact.trim() || null,
          supplier_id: supplierId, buyer_id: null, material_id: materialId, first_kg: first, first_at: now, second_kg: null, second_at: null,
          moisture_1: moist[0], moisture_2: moist[1], moisture_3: moist[2], batch_id: batch.id, challan_no: null, po_no: null, vcts_no: null,
          remarks: remarks.trim() || null, entered_by: me, out_by: null,
        },
      });
      // A yard closes for filling at its truck limit.
      const trucks = batchTickets(D, batch.id).length + 1;
      if (yard.holds_trucks && trucks >= num(yard.holds_trucks)) writes.push({ table: "yard_batch", row: { id: batch.id, closed_at: now } });
      await save(...writes);
      if (yard.holds_trucks && trucks >= num(yard.holds_trucks)) say("Yard full", `${yard.name} reached its limit of ${yard.holds_trucks} trucks and is closed for filling.`);
      nav.goBack();
    });

  return (
    <Screen>
      <H>Truck in (raw material)</H>
      <Sub>First weight is the gross weight.</Sub>
      <Field label="Weighbridge serial no." value={wbsn} onChangeText={(v) => setWbsn(v.replace(/\D/g, ""))} keyboardType="number-pad" />
      <Field label="Vehicle no." value={vehicleNo} onChangeText={setVehicleNo} autoCapitalize="characters" />
      <Chips value={vehicleType} onChange={setVehicleType} options={["Truck", "Tractor", "Trailer", "Other"].map((v) => ({ key: v, label: v }))} />
      <Field label="Driver name (optional)" value={driver} onChangeText={setDriver} autoCapitalize="words" />
      <Field label="Driver contact (optional)" value={contact} onChangeText={setContact} keyboardType="phone-pad" />
      <SectionTitle>Supplier</SectionTitle>
      <Chips value={supplierId} onChange={setSupplierId} options={[...D.supplier].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ key: s.id, label: s.name }))} />
      <PartyAdder table="supplier" onAdded={setSupplierId} />
      <SectionTitle>Material</SectionTitle>
      <Chips value={materialId} onChange={(v) => { setMaterialId(v); setYardTouched(false); }} options={D.material.filter((m) => m.kind === "Raw").map((m) => ({ key: m.id, label: m.name }))} />
      <Field label="Gross weight (kg)" value={gross} onChangeText={(v) => setGross(v.replace(/\D/g, ""))} keyboardType="number-pad" />
      <SectionTitle>Moisture with the pins (%)</SectionTitle>
      <Row>
        <View style={{ flex: 1 }}><Field label="1" value={m1} onChangeText={setM1} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><Field label="2" value={m2} onChangeText={setM2} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><Field label="3" value={m3} onChangeText={setM3} keyboardType="decimal-pad" /></View>
      </Row>
      <SectionTitle>Unload at</SectionTitle>
      <Chips
        value={yardId}
        onChange={(v) => { setYardId(v); setYardTouched(true); }}
        options={[...D.yard].sort((a, b) => a.letter.localeCompare(b.letter)).map((y) => {
          const b = activeBatch(D, y.id);
          return { key: y.id, label: y.name, sub: b ? `${batchCode(D, b)}${b.closed_at ? " closed" : ""} ${batchTickets(D, b.id).length}/${y.holds_trucks ?? "-"}` : "empty" };
        })}
      />
      {suggested && !yardTouched ? <Sub>Suggested: {suggested.name}</Sub> : null}
      {!suggested && materialId ? <Text style={{ color: C.amber }}>No yard is free for this material. Choose one.</Text> : null}
      <Field label="Remarks (optional)" value={remarks} onChangeText={setRemarks} multiline />
      <Btn title="Save truck in" onPress={submit} busy={busy} />
    </Screen>
  );
}

export function TruckOut() {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const D = useData();
  const sync = useSyncState();
  const me = session!.person.id;
  const [wbsn, setWbsn] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [vehicleType, setVehicleType] = useState<string | null>(null);
  const [driver, setDriver] = useState("");
  const [contact, setContact] = useState("");
  const [buyerId, setBuyerId] = useState<string | null>(null);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [tare, setTare] = useState("");
  const suggestion = nextChallan(D, sync.challan);
  const [challan, setChallan] = useState<string | null>(null);
  const [po, setPo] = useState("");
  const [remarks, setRemarks] = useState("");
  const { busy, run } = useAction();
  const challanValue = challan ?? suggestion;

  const submit = () =>
    run(async () => {
      const serial = checkSerial(D, wbsn);
      if (!vehicleNo.trim()) throw new Error("Enter the vehicle number");
      if (!buyerId) throw new Error("Choose the buyer");
      if (!materialId) throw new Error("Choose the product");
      const first = intOrThrow(tare, "Empty truck weight");
      if (!challanValue.trim()) throw new Error("Enter the challan no. from the challan book");
      if (D.weigh_ticket.some((t) => t.challan_no === challanValue.trim())) throw new Error(`Challan ${challanValue.trim()} is already used.`);
      await save({
        table: "weigh_ticket",
        row: {
          id: newId(), wbsn: serial, direction: "out", vehicle_type: vehicleType, vehicle_no: vehicleNo.trim(), driver_name: driver.trim() || null, driver_contact: contact.trim() || null,
          supplier_id: null, buyer_id: buyerId, material_id: materialId, first_kg: first, first_at: nowIso(), second_kg: null, second_at: null,
          moisture_1: null, moisture_2: null, moisture_3: null, batch_id: null, challan_no: challanValue.trim(), po_no: po.trim() || null, vcts_no: null,
          remarks: remarks.trim() || null, entered_by: me, out_by: null,
        },
      });
      nav.goBack();
    });

  return (
    <Screen>
      <H>Truck out (sale)</H>
      <Sub>First weight is the empty truck.</Sub>
      <Field label="Weighbridge serial no." value={wbsn} onChangeText={(v) => setWbsn(v.replace(/\D/g, ""))} keyboardType="number-pad" />
      <Field label="Vehicle no." value={vehicleNo} onChangeText={setVehicleNo} autoCapitalize="characters" />
      <Chips value={vehicleType} onChange={setVehicleType} options={["Truck", "Tractor", "Trailer", "Other"].map((v) => ({ key: v, label: v }))} />
      <Field label="Driver name (optional)" value={driver} onChangeText={setDriver} autoCapitalize="words" />
      <Field label="Driver contact (optional)" value={contact} onChangeText={setContact} keyboardType="phone-pad" />
      <SectionTitle>Buyer</SectionTitle>
      <Chips value={buyerId} onChange={setBuyerId} options={[...D.buyer].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ key: s.id, label: s.name }))} />
      <PartyAdder table="buyer" onAdded={setBuyerId} />
      <SectionTitle>Product</SectionTitle>
      <Chips value={materialId} onChange={setMaterialId} options={D.material.filter((m) => m.kind !== "Raw").map((m) => ({ key: m.id, label: m.name }))} />
      <Field label="Empty truck weight (kg)" value={tare} onChangeText={(v) => setTare(v.replace(/\D/g, ""))} keyboardType="number-pad" />
      <Field label="Challan no. (from the challan book)" value={challanValue} onChangeText={setChallan} autoCapitalize="characters" hint="Next number suggested. The bill gets the same number." />
      <Field label="Buyer's P.O. no. (optional)" value={po} onChangeText={setPo} />
      <Field label="Remarks (optional)" value={remarks} onChangeText={setRemarks} multiline />
      <Btn title="Save truck out" onPress={submit} busy={busy} />
    </Screen>
  );
}

export function WeighOut() {
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const { session } = useAuth();
  const D = useData();
  const t = D.weigh_ticket.find((x) => x.id === params.ticketId);
  const [second, setSecond] = useState("");
  const { busy, run } = useAction();
  if (!t) return <Screen><Empty text="Ticket not found." /></Screen>;

  const isIn = t.direction === "in";
  const s = Number(second);
  const net = second && Number.isInteger(s) ? (isIn ? num(t.first_kg) - s : s - num(t.first_kg)) : null;
  const yard = isIn && t.batch_id ? D.yard_batch.find((b) => b.id === t.batch_id) : null;

  const submit = () =>
    run(async () => {
      const w = intOrThrow(second, isIn ? "Tare weight" : "Gross weight");
      const n = isIn ? num(t.first_kg) - w : w - num(t.first_kg);
      if (n <= 0) throw new Error(isIn ? "The empty truck must weigh less than the loaded truck." : "The loaded truck must weigh more than the empty truck.");
      confirm("Weigh out", `Net ${kg(n)}. ${isIn ? "It goes to the yard." : "It comes off the store stock."} Save?`, "Save", () =>
        run(async () => {
          await save({ table: "weigh_ticket", row: { id: t.id, second_kg: w, second_at: nowIso(), out_by: session!.person.id } });
          nav.goBack();
        })
      );
    });

  return (
    <Screen>
      <H>{t.vehicle_no}</H>
      <Card>
        <Row><Badge text={isIn ? "Truck in" : "Sale"} tone={isIn ? "info" : "warn"} /><Spacer /><Sub>#{t.wbsn}</Sub></Row>
        <T>{D.material.find((m) => m.id === t.material_id)?.name} · {(isIn ? D.supplier : D.buyer).find((p) => p.id === (isIn ? t.supplier_id : t.buyer_id))?.name}</T>
        <T bold>{isIn ? "Gross" : "Empty"}: {kg(num(t.first_kg))} at {fmtTime(t.first_at)}</T>
        {yard ? <Sub>Unload at {batchCode(D, yard)}</Sub> : null}
        {t.challan_no ? <Sub>Challan {t.challan_no}</Sub> : null}
      </Card>
      <Field label={isIn ? "Second weight: empty truck, tare (kg)" : "Second weight: loaded truck, gross (kg)"} value={second} onChangeText={(v) => setSecond(v.replace(/\D/g, ""))} keyboardType="number-pad" />
      {net != null ? <T bold style={{ fontSize: 18, color: net > 0 ? C.ok : C.red }}>Net {kg(net)}</T> : null}
      <Btn title="Weigh out" onPress={submit} busy={busy} />
    </Screen>
  );
}

export function BagCount() {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const D = useData();
  const me = session!.person.id;
  const pellet = D.material.find((m) => m.kind !== "Raw" && m.bag_kg != null);
  const [bags, setBags] = useState("");
  const [bagKg, setBagKg] = useState(pellet?.bag_kg ? String(num(pellet.bag_kg)) : "25");
  const { busy, run } = useAction();
  if (!pellet) return <Screen><Empty text="No pellet product is set up." /></Screen>;

  // The count covers the time since the last one (or the start of this shift).
  const last = D.bag_count.filter((b) => b.product_id === pellet.id).sort((a, b) => b.period_to.localeCompare(a.period_to))[0];
  const from = last?.period_to ?? shiftWindow(D.shift)?.start.toISOString() ?? new Date(Date.now() - 6 * 3_600_000).toISOString();

  const submit = () =>
    run(async () => {
      const n = Number(bags);
      if (!bags.trim() || !Number.isInteger(n) || n <= 0) throw new Error("Enter the number of bags");
      const k = Number(bagKg);
      if (!(k > 0)) throw new Error("Enter kg per bag");
      const now = nowIso();
      await save({ table: "bag_count", row: { id: newId(), product_id: pellet.id, period_from: from, period_to: now, bags: n, kg_per_bag: k, entered_by: me, entered_at: now } });
      say("Counted", `${n} bags = ${(n * k).toLocaleString("en-US")} kg of ${pellet.name}.`);
      nav.goBack();
    });

  return (
    <Screen>
      <H>Pellet bag count</H>
      <Sub>Bags counted into the store since {fmtDateTime(from)}.</Sub>
      <Field label="Bags" value={bags} onChangeText={(v) => setBags(v.replace(/\D/g, ""))} keyboardType="number-pad" />
      <Field label="kg per bag" value={bagKg} onChangeText={setBagKg} keyboardType="decimal-pad" />
      {bags ? <T bold>{(Number(bags) * Number(bagKg || 0)).toLocaleString("en-US")} kg</T> : null}
      <Btn title="Save count" onPress={submit} busy={busy} />
    </Screen>
  );
}
