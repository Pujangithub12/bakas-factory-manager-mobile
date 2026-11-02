import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Card, C, F, Row, ScreenHeader, SectionTitle, Spacer, Sub, T, Text, initialsOf } from "../ui";
import { useAuth } from "../auth";
import { useData } from "../store";
import { requestDays } from "../sync";
import { DAY, fiscalYearStart, periodRange, shiftWindow, type PeriodKey } from "../time";
import { avgRate, balances, briquetteId, moneyIn, moistStd, pelletId, priceRaw, priceSale, rkg, rs, rsK, settingOf, vatRate, type Money as M } from "../money";
import { bucketsOf, num } from "../rules";
import { ColumnChart } from "../charts";

type Key = PeriodKey | "year";
const PERIODS: { key: Key; label: string }[] = [
  { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" }, { key: "7d", label: "7 days" }, { key: "30d", label: "30 days" }, { key: "year", label: "This year" },
];
const NEED: Record<Key, number> = { today: 3, yesterday: 4, "7d": 9, "30d": 32, year: 0 };
const pct = (x: number) => `${Math.round(x * 100)}%`;
const tons = (t: number) => `${t.toLocaleString("en-US", { maximumFractionDigits: t >= 100 ? 0 : 1 })} t`;

function Tile({ label, value, sub, sub2 }: { label: string; value: string; sub?: string; sub2?: string }) {
  return (
    <View style={{ flexBasis: "47%", flexGrow: 1, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 14, gap: 3 }}>
      <Text style={{ fontSize: 14, fontWeight: "700", color: C.ink }}>{label}</Text>
      <Text style={{ fontFamily: F.head, fontSize: 32, lineHeight: 36, color: C.ink }}>{value}</Text>
      {sub ? <Text style={{ color: C.sub, fontSize: 13 }}>{sub}</Text> : null}
      {sub2 ? <Text style={{ color: C.sub, fontSize: 12 }}>{sub2}</Text> : null}
    </View>
  );
}

function Bar({ label, value, total, note }: { label: string; value: number; total: number; note: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Row><T>{label}</T><Spacer /><Sub>{note}</Sub></Row>
      <View style={{ height: 10, borderRadius: 4, backgroundColor: C.greySoft, overflow: "hidden" }}>
        <View style={{ height: 10, width: `${Math.min(100, Math.max(0, (value / (total || 1)) * 100))}%`, backgroundColor: C.green }} />
      </View>
    </View>
  );
}

/** The Owner's Money tab: sales, production cost, margin, cost per kg, and who to pay or collect from. */
export default function Money() {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const D = useData();
  const [period, setPeriod] = useState<Key>("today");
  const name = session!.person.full_name;
  const w = shiftWindow(D.shift);
  const { from, to } = useMemo(() => (period === "year" ? { from: fiscalYearStart(), to: new Date() } : periodRange(period)), [period]);

  useEffect(() => {
    requestDays(period === "year" ? Math.ceil((Date.now() - fiscalYearStart().getTime()) / DAY) + 2 : NEED[period]);
  }, [period]);

  const a = from.getTime(), b = to.getTime();
  const m: M = useMemo(() => moneyIn(D, a, b), [D, a, b]);
  const made = m.pel + m.bri;
  const mg = m.rev > 0 ? m.margin / m.rev : null;
  const pay = Object.values(balances(D, "in")).filter((x) => x.n).sort((x, y) => y.bal - x.bal);
  const rec = Object.values(balances(D, "out")).filter((x) => x.n || x.unbilled).sort((x, y) => y.bal - x.bal);
  const rows: [string, number, string][] = [
    ["Raw material", m.rawUse, `${tons(m.rawUseT)} at ${rkg(m.px)} a kg`],
    ["Electricity", m.elec, `${Math.round(m.kwh).toLocaleString("en-US")} kWh`],
    ["Labour", m.lab, "shifts at the gate x daily wage"],
    ["Diesel", m.dslC, `${Math.round(m.dsl).toLocaleString("en-US")} L`],
    ["Spares and oil", m.spares, "issued from the store"],
  ];
  const noPrices = D.raw_price.length === 0 && D.sale_price.length === 0;
  const buckets = useMemo(() => bucketsOf(from, to), [a, b]); // eslint-disable-line react-hooks/exhaustive-deps
  const chart = useMemo(() => buckets.map((k) => moneyIn(D, k.a, k.b)), [D, buckets]);
  const rawMats = D.material.filter((x) => x.kind === "Raw");
  const products = D.material.filter((x) => x.kind !== "Raw");
  const tariff = D.nea_tariff.slice().sort((x, y) => String(y.valid_from).localeCompare(String(x.valid_from)))[0];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Money" subtitle={`${name} · Owner${w ? ` · ${w.shift.name} shift` : ""}`} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32, gap: 14 }}>
        <View style={{ backgroundColor: C.greySoft, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 5 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
            {PERIODS.map((p) => (
              <Pressable key={p.key} onPress={() => setPeriod(p.key)} style={[{ paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14 }, period === p.key && { backgroundColor: "#fff", elevation: 2 }]}>
                <Text style={{ fontSize: 16, color: period === p.key ? C.ink : C.sub, fontWeight: period === p.key ? "700" : "600" }}>{p.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        {noPrices ? <Card style={{ backgroundColor: C.amberSoft }}><Sub>No prices are set yet. The Owner sets them on the laptop (Prices).</Sub></Card> : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <Tile label="Sales" value={rsK(m.rev)} sub={`${m.sold.length} trucks`} sub2="excluding VAT" />
          <Tile label="Production cost" value={rsK(m.cost)} sub={`${tons(made)} made`} sub2={`raw material ${pct(m.rawUse / (m.cost || 1))} of it`} />
          <Tile label="Margin on sales" value={rsK(m.margin)} sub={mg != null ? `${pct(mg)} of sales` : "nothing sold"} sub2="sales minus the cost of what was sold" />
          <Tile label="Cost per kg of pellet" value={rkg(m.cpel)} sub={`briquette ${rkg(m.cbri)} a kg`} sub2={`selling at ${rkg(avgRate(D, pelletId(D), a, b))} and ${rkg(avgRate(D, briquetteId(D), a, b))}`} />
        </View>

        <Card style={{ gap: 10, padding: 16, borderRadius: 18 }}>
          <Text style={{ fontFamily: F.head, fontSize: 24, color: C.ink }}>Sales and production cost</Text>
          <Sub>Rupees in thousands, by {buckets.length > 1 && buckets[0].label.endsWith("h") ? "hour" : "day"}.</Sub>
          <ColumnChart labels={buckets.map((k) => k.label)} series={[
            { name: "Sales", color: "#2a78d6", values: chart.map((x) => x.rev / 1000) },
            { name: "Production cost", color: "#eb6834", values: chart.map((x) => x.cost / 1000) },
          ]} />
          <Row style={{ flexWrap: "wrap", gap: 14 }}>
            <Row style={{ gap: 6 }}><View style={{ width: 10, height: 10, backgroundColor: "#2a78d6" }} /><Sub>Sales {rsK(m.rev)}</Sub></Row>
            <Row style={{ gap: 6 }}><View style={{ width: 10, height: 10, backgroundColor: "#eb6834" }} /><Sub>Production cost {rsK(m.cost)}</Sub></Row>
          </Row>
        </Card>

        <Card style={{ gap: 10, padding: 16, borderRadius: 18 }}>
          <Text style={{ fontFamily: F.head, fontSize: 24, color: C.ink }}>Where the money goes</Text>
          {made > 0 ? <Sub>{rkg(m.cost / made / 1000)} per kg made on average</Sub> : null}
          {rows.map(([l, v, s]) => <Bar key={l} label={l} value={v} total={m.cost} note={`${rsK(v)} · ${pct(v / (m.cost || 1))}`} />)}
          <Sub>Raw material used = tons made / yield ({pct(m.yield)}) x the average price paid in the last 30 days. Electricity is shared by the machines that use it; the rest by tons made.</Sub>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <View style={{ flexBasis: "47%", flexGrow: 1 }}><Sub>Raw material bought</Sub><T bold>{rsK(m.rawC)}</T></View>
            <View style={{ flexBasis: "47%", flexGrow: 1 }}><Sub>Not paid for moisture</Sub><T bold>{Math.round(m.ded).toLocaleString("en-US")} kg</T></View>
          </View>
        </Card>

        <Row><SectionTitle>Suppliers to pay</SectionTitle><Spacer /><Pressable onPress={() => nav.navigate("PaymentForm", { dir: "paid" })}><Text style={{ color: C.green, fontWeight: "700", fontSize: 15 }}>Record payment</Text></Pressable></Row>
        <Card style={{ padding: 6 }}>
          {pay.length === 0 ? <Sub style={{ padding: 10 }}>No raw material trucks held on this phone.</Sub> : null}
          {pay.map((x, i) => (
            <Row key={x.party.id} style={{ padding: 10, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <View style={{ flex: 1 }}><T>{x.party.name}</T><Sub>{x.n} trucks · paid {rsK(x.paid)}</Sub></View>
              <Text style={{ fontWeight: "700", color: C.ink }}>{rsK(x.bal)}</Text>
            </Row>
          ))}
        </Card>
        <Row><SectionTitle>Buyers to collect from</SectionTitle><Spacer /><Pressable onPress={() => nav.navigate("PaymentForm", { dir: "received" })}><Text style={{ color: C.green, fontWeight: "700", fontSize: 15 }}>Record receipt</Text></Pressable></Row>
        <Card style={{ padding: 6 }}>
          {rec.length === 0 ? <Sub style={{ padding: 10 }}>No sales held on this phone.</Sub> : null}
          {rec.map((x, i) => (
            <Row key={x.party.id} style={{ padding: 10, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <View style={{ flex: 1 }}>
                <T>{x.party.name}</T>
                <Sub>{x.n} bills{x.unbilled ? ` · ${x.unbilled} truck${x.unbilled > 1 ? "s" : ""} not billed` : ""} · received {rsK(x.paid)}</Sub>
              </View>
              <Text style={{ fontWeight: "700", color: C.ink }}>{rsK(x.bal)}</Text>
            </Row>
          ))}
        </Card>
        <SectionTitle>Prices and rates</SectionTitle>
        <Card style={{ gap: 6, padding: 14 }}>
          <Sub>Rs per kg. The Owner changes them on the laptop (Prices).</Sub>
          <T bold>Raw material (we pay)</T>
          {rawMats.map((x) => <Row key={x.id}><T>{x.name}</T><Spacer /><T bold>{rkg(priceRaw(D, x.id, null))}</T></Row>)}
          <Sub>Moisture: {num(settingOf(D, "moisture_deduction") ?? 1)}% of the weight is not paid for each 1% above the standard ({rawMats.map((x) => `${x.name} ${moistStd(D, x.id)}%`).join(", ")}).</Sub>
          <T bold>Sales (we charge, before VAT)</T>
          {D.buyer.flatMap((by) => products.filter((p) => D.sale_price.some((r) => r.buyer_id === by.id && r.product_id === p.id)).map((p) => (
            <Row key={`${by.id}-${p.id}`}><T>{by.name} · {p.name}</T><Spacer /><T bold>{rkg(priceSale(D, p.id, by.id))}</T></Row>
          )))}
          <Row><T>VAT</T><Spacer /><T bold>{products.map((p) => `${String(p.name).replace("Biomass ", "")} ${vatRate(D, p.id)}%`).join(", ")}</T></Row>
          <T bold>Other</T>
          <Row><T>Diesel, per litre</T><Spacer /><T bold>{rs(num(settingOf(D, "diesel_rate")))}</T></Row>
          {tariff ? <Row><T>Electricity: {tariff.name}</T><Spacer /><T bold>Rs {num(tariff.peak_rate)} / {num(tariff.offpeak_rate)} / {num(tariff.normal_rate)}</T></Row> : null}
        </Card>
        <Sub>Balances count only the records held on this phone. The laptop can load a longer history.</Sub>
      </ScrollView>
    </View>
  );
}
