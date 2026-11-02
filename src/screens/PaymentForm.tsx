import React, { useState } from "react";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Screen, H, Sub, Card, T, Field, Btn, Chips, Select, say, useAction } from "../ui";
import { useAuth } from "../auth";
import { newId, save, useData } from "../store";
import { balances, rs, rsK } from "../money";
import { nowIso } from "../time";

const MODES = ["Bank", "Cash", "Cheque", "Online"];

/** A payment to a supplier ("paid") or money received from a buyer ("received"). */
export default function PaymentForm() {
  const nav = useNavigation<any>();
  const { dir } = useRoute<any>().params as { dir: "paid" | "received" };
  const { session } = useAuth();
  const D = useData();
  const list = dir === "paid" ? D.supplier : D.buyer;
  const bal = balances(D, dir === "paid" ? "in" : "out");
  const [party, setParty] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<string | null>("Bank");
  const [ref, setRef] = useState("");
  const { busy, run } = useAction();

  const owing = party ? bal[party]?.bal : undefined;
  const submit = () =>
    run(async () => {
      if (!party) throw new Error(dir === "paid" ? "Choose the supplier" : "Choose the buyer");
      if (!(Number(amount) > 0)) throw new Error("Enter the amount");
      await save({
        table: "payment",
        row: {
          id: newId(), direction: dir, supplier_id: dir === "paid" ? party : null, buyer_id: dir === "received" ? party : null,
          at: nowIso(), amount: Number(amount), mode: mode ?? "Bank", ref: ref.trim() || null, entered_by: session!.person.id, entered_at: nowIso(),
        },
      });
      say("Saved", `${rs(Number(amount))} ${dir === "paid" ? "paid" : "received"}.`);
      nav.goBack();
    });

  return (
    <Screen>
      <H>{dir === "paid" ? "Payment to a supplier" : "Money received from a buyer"}</H>
      <Sub>{dir === "paid" ? "Record what was paid out of the books." : "Record what a buyer has paid."} You can change your own entry for 7 days.</Sub>
      <Select
        title={dir === "paid" ? "Supplier" : "Buyer"}
        value={party}
        onChange={setParty}
        placeholder={dir === "paid" ? "Choose the supplier" : "Choose the buyer"}
        options={list.map((p) => ({ key: p.id as string, label: p.name as string, sub: `Balance ${rsK(bal[p.id as string]?.bal ?? 0)}` }))}
      />
      {owing != null ? <Card><T>{dir === "paid" ? "Still to pay" : "Still to collect"}: {rsK(owing)}</T></Card> : null}
      <Field label="Amount (Rs)" value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" />
      <Chips options={MODES.map((m) => ({ key: m, label: m }))} value={mode} onChange={(v: string | null) => setMode(v ?? "Bank")} />
      <Field label="Reference (cheque or transfer no., optional)" value={ref} onChangeText={setRef} />
      <Btn title={dir === "paid" ? "Save payment" : "Save receipt"} onPress={submit} busy={busy} />
    </Screen>
  );
}
