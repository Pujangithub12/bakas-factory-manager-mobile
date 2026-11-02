import React, { useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { Screen, H, Sub, Card, T, Field, Btn, say, useAction } from "../ui";
import { useAuth } from "../auth";
import { newId, save, useData } from "../store";
import { lastPower } from "../money";
import { fmtTime, nowIso } from "../time";
import { num } from "../rules";

/** The hourly reading of the main kWh meter in the MCC panel. */
export default function PowerReading() {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const D = useData();
  const last = lastPower(D);
  const [kwh, setKwh] = useState("");
  const [load, setLoad] = useState("");
  const [pf, setPf] = useState("");
  const { busy, run } = useAction();

  const k = Number(kwh);
  const hours = last ? (Date.now() - new Date(last.at).getTime()) / 3_600_000 : 0;
  const used = last && kwh ? k - num(last.kwh_meter) : null;

  const submit = () =>
    run(async () => {
      if (!kwh.trim() || isNaN(k)) throw new Error("Enter the kWh reading");
      if (last && k < num(last.kwh_meter)) throw new Error(`The meter cannot go back: the last reading was ${num(last.kwh_meter)}.`);
      if (last && hours > 0 && (k - num(last.kwh_meter)) / hours > 1500) throw new Error("That is more than the plant can use in that time. Check the reading.");
      const p = pf.trim() === "" ? null : Number(pf);
      if (p != null && (isNaN(p) || p < 0 || p > 1)) throw new Error("Power factor is between 0 and 1");
      await save({ table: "power_reading", row: { id: newId(), at: nowIso(), kwh_meter: k, load_kw: load.trim() === "" ? null : Number(load), power_factor: p, by: session!.person.id } });
      say("Saved", used != null && used >= 0 ? `${Math.round(used).toLocaleString("en-US")} kWh since ${fmtTime(last!.at)}.` : undefined);
      nav.goBack();
    });

  return (
    <Screen>
      <H>Electricity meter reading</H>
      <Sub>Every hour, from the main kWh meter in the MCC panel. Load and power factor from the multifunction meter if you can.</Sub>
      <Field label="Main meter (kWh)" value={kwh} onChangeText={(v) => setKwh(v.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" hint={last ? `Last ${num(last.kwh_meter).toLocaleString("en-US")} at ${fmtTime(last.at)}` : undefined} />
      <Field label="Load now (kW, optional)" value={load} onChangeText={(v) => setLoad(v.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" />
      <Field label="Power factor (optional)" value={pf} onChangeText={(v) => setPf(v.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" />
      {used != null ? <Card><T>{used < 0 ? "Lower than the last reading. Check it." : `${Math.round(used).toLocaleString("en-US")} kWh in ${hours.toFixed(1)} h: about ${Math.round(hours > 0 ? used / hours : 0).toLocaleString("en-US")} kW on average.`}</T></Card> : null}
      <Btn title="Save reading" onPress={submit} busy={busy} />
    </Screen>
  );
}
