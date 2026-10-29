import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Screen, H, Sub, Card, T, Text, Badge, Row, Btn, SectionTitle, Chips, Empty, C, Spacer } from "../ui";
import { useData } from "../store";
import {
  activeBatch, bagCounts, batchCode, batchMaterial, batchTickets, briquetteKg, kgToTons, machineStatus, num, onSiteMap, openRuns, personName, mainRole,
  pelletKg, sumNet, ticketNet, trucksIn, trucksOut,
} from "../rules";
import { fmtDateTime, fmtTime, periodRange, PERIODS, type PeriodKey } from "../time";

/** Production only: no rupees. Worked out from the weights, never from rated capacity. */
export default function Dashboard() {
  const nav = useNavigation<any>();
  const D = useData();
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [asTable, setAsTable] = useState(false);

  const { from, to } = useMemo(() => periodRange(period), [period, D.weigh_ticket]);
  const pelletMat = D.material.find((m) => m.kind !== "Raw" && m.bag_kg != null);
  const briqMat = D.material.find((m) => /briquette/i.test(m.name) && !/dust/i.test(m.name));

  const raw = trucksIn(D, from, to, materialId ?? undefined);
  const sales = trucksOut(D, from, to, materialId ?? undefined);
  const pellets = !materialId || materialId === pelletMat?.id ? pelletKg(D, from, to) : 0;
  const briquettes = !materialId || materialId === briqMat?.id ? briquetteKg(D, from, to) : 0;
  const running = openRuns(D).length;
  const onSite = onSiteMap(D).size;
  const yardsInUse = D.yard.filter((y) => activeBatch(D, y.id)).length;

  const byMaterial = D.material
    .filter((m) => m.kind === "Raw")
    .map((m) => ({ m, kg: sumNet(trucksIn(D, from, to, m.id)), n: trucksIn(D, from, to, m.id).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.kg - a.kg);
  const total = byMaterial.reduce((n, x) => n + x.kg, 0);

  const go = (kind: string) => nav.navigate("Detail", { kind, from: from.toISOString(), to: to.toISOString(), materialId });

  const tile = (label: string, value: string, sub: string, kind: string, tone: string = C.green) => (
    <Card key={kind} onPress={() => go(kind)} style={{ flexBasis: "47%", flexGrow: 1 }}>
      <Sub>{label}</Sub>
      <Text style={{ fontSize: 26, fontWeight: "800", color: tone }}>{value}</Text>
      <Sub>{sub}</Sub>
    </Card>
  );

  return (
    <Screen>
      <H>Production</H>
      <Chips value={period} onChange={(v) => v && setPeriod(v)} options={PERIODS.map((p) => ({ key: p.key, label: p.label }))} />
      <Chips value={materialId} onChange={setMaterialId} options={D.material.map((m) => ({ key: m.id, label: m.name }))} />
      <Sub>{fmtDateTime(from)} to {fmtDateTime(to)}</Sub>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {tile("Raw material in", `${kgToTons(sumNet(raw))} t`, `${raw.length} trucks`, "raw")}
        {tile("Pellets made", `${kgToTons(pellets)} t`, `${bagCounts(D, from, to).reduce((n, b) => n + num(b.bags), 0)} bags`, "pellets")}
        {tile("Briquettes made", `${kgToTons(briquettes)} t`, "1-minute weight x running time", "briquettes")}
        {tile("Sales trucks", String(sales.length), `${kgToTons(sumNet(sales))} t`, "sales", C.blue)}
        {tile("Machines running", `${running}/${D.machine.length}`, "now", "machines", C.blue)}
        {tile("People on site", String(onSite), "now", "people", C.blue)}
        {tile("Yards in use", `${yardsInUse}/${D.yard.length}`, "now", "yards", C.blue)}
      </View>

      <Row>
        <SectionTitle>Raw material in, by material</SectionTitle>
        <Spacer />
        <Btn small kind="ghost" title={asTable ? "Show bars" : "Show table"} onPress={() => setAsTable(!asTable)} />
      </Row>
      {byMaterial.length === 0 ? <Empty text="No finished trucks in this period." /> : null}
      {byMaterial.map(({ m, kg, n }) => {
        const share = total ? kg / total : 0;
        return (
          <Card key={m.id}>
            <Row><T bold>{m.name}</T><Spacer /><T bold>{kgToTons(kg)} t</T></Row>
            {asTable ? (
              <Sub>{n} trucks · {(share * 100).toFixed(0)}% of raw material in</Sub>
            ) : (
              <>
                <View style={{ height: 10, backgroundColor: C.greySoft, borderRadius: 5 }}>
                  <View style={{ width: `${Math.max(2, share * 100)}%`, height: 10, borderRadius: 5, backgroundColor: C.green }} />
                </View>
                <Sub>{n} trucks · {(share * 100).toFixed(0)}%</Sub>
              </>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}

const kg = (n: number | null) => (n == null ? "-" : `${n.toLocaleString("en-US")} kg`);

export function Detail() {
  const { params } = useRoute<any>();
  const D = useData();
  const from = new Date(params.from);
  const to = new Date(params.to);
  const mat = (id: string) => D.material.find((m) => m.id === id)?.name ?? "-";
  const { kind } = params;

  const truck = (t: any) => (
    <Card key={t.id}>
      <Row><T bold>{t.vehicle_no}</T><Spacer /><T bold>{kg(ticketNet(t))}</T></Row>
      <Sub>{mat(t.material_id)} · {(t.direction === "in" ? D.supplier : D.buyer).find((p) => p.id === (t.direction === "in" ? t.supplier_id : t.buyer_id))?.name ?? "-"}</Sub>
      <Sub>#{t.wbsn} · {fmtDateTime(t.second_at)}{t.challan_no ? ` · ${t.challan_no}` : ""}</Sub>
    </Card>
  );

  let title = "";
  let body: React.ReactNode = null;
  if (kind === "raw") {
    title = "Raw material in";
    const list = trucksIn(D, from, to, params.materialId ?? undefined);
    body = list.length ? list.sort((a, b) => b.second_at.localeCompare(a.second_at)).map(truck) : <Empty text="No trucks." />;
  } else if (kind === "sales") {
    title = "Sales trucks";
    const list = trucksOut(D, from, to, params.materialId ?? undefined);
    body = list.length ? list.sort((a, b) => b.second_at.localeCompare(a.second_at)).map(truck) : <Empty text="No trucks." />;
  } else if (kind === "pellets") {
    title = "Pellet bag counts";
    const list = bagCounts(D, from, to).sort((a, b) => b.period_to.localeCompare(a.period_to));
    body = list.length ? list.map((b) => (
      <Card key={b.id}>
        <Row><T bold>{b.bags} bags × {num(b.kg_per_bag)} kg</T><Spacer /><T bold>{kg(num(b.bags) * num(b.kg_per_bag))}</T></Row>
        <Sub>{fmtDateTime(b.period_from)} to {fmtDateTime(b.period_to)} · {personName(D, b.entered_by)}</Sub>
      </Card>
    )) : <Empty text="No bag counts." />;
  } else if (kind === "briquettes") {
    title = "Briquettes by machine";
    body = D.machine.filter((m) => m.stage === "briquette").map((m) => (
      <Card key={m.id}><Row><T bold>{m.tag}</T><Spacer /><T bold>{kg(Math.round(briquetteKg(D, from, to, m.id)))}</T></Row><Sub>From the hourly 1-minute weight and the running time.</Sub></Card>
    ));
  } else if (kind === "machines") {
    title = "Machines now";
    body = [...D.machine].sort((a, b) => a.tag.localeCompare(b.tag)).map((m) => {
      const st = machineStatus(D, m);
      return (
        <Card key={m.id}>
          <Row><T bold>{m.tag}</T><Sub>{m.name}</Sub><Spacer /><Badge text={st.state} tone={st.state === "running" ? "good" : st.state === "down" ? "bad" : "mute"} /></Row>
          {st.run ? <Sub>{st.operator?.full_name} since {fmtTime(st.run.started_at)}</Sub> : null}
          {st.state === "down" ? <Sub style={{ color: C.red }}>{st.reason}</Sub> : null}
        </Card>
      );
    });
  } else if (kind === "people") {
    title = "People on site";
    const site = [...onSiteMap(D).entries()];
    body = site.length ? site.map(([id, a]) => (
      <Card key={id}><Row><T bold>{personName(D, id)}</T><Sub>{mainRole(D, id)}</Sub><Spacer /><Badge text={`In ${fmtTime(a.gate_in)}`} tone="good" /></Row></Card>
    )) : <Empty text="No one is checked in." />;
  } else if (kind === "yards") {
    title = "Yards";
    body = D.yard.map((y) => {
      const b = activeBatch(D, y.id);
      const tickets = b ? batchTickets(D, b.id) : [];
      return (
        <Card key={y.id}>
          <Row><T bold>{y.name}</T><Spacer />{b ? <Badge text={b.started_at ? "Feeding" : b.closed_at ? "Closed" : "Filling"} tone="info" /> : <Badge text="Empty" />}</Row>
          {b ? <Sub>{batchCode(D, b)} · {batchMaterial(D, b)?.name} · {tickets.length}/{y.holds_trucks ?? "-"} trucks · {kg(sumNet(tickets))} in</Sub> : null}
        </Card>
      );
    });
  }

  return (
    <Screen>
      <H>{title}</H>
      {body}
    </Screen>
  );
}
