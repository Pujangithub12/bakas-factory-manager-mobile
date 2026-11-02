import React, { useState } from "react";
import { View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Screen, H, Sub, Card, T, Text, Badge, Row, Btn, Field, SectionTitle, Chips, Select, Search, Empty, C, F, Spacer, say, useAction, type Option } from "../ui";
import { useAuth } from "../auth";
import { newId, save, useData, type Data } from "../store";
import { TabScreen, inDays } from "../tabs";
import { KINDS, PR_TONE, belowMin, freeQty, itemName, nextPrNo, num, onSiteMap, outCount, prText, rolesOf, round2, toolsOut, personName, hasRole } from "../rules";
import { fmtDateTime, fmtTime, nowIso, shiftWindow, HOUR, DAY, type Row as R } from "../time";

const isAdmin = (roles: string[]) => roles.includes("Owner") || roles.includes("Manager");
const qty = (n: unknown) => num(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const when = (v: string) => fmtTime(v) + (new Date(v).getTime() < Date.now() - DAY ? ` ${new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "");

// ---------------------------------------------------------------- tabs ----

/** Tools out and back, the low-stock list, and the buttons to issue and receive. */
export function StoreHome() {
  const nav = useNavigation<any>();
  const D = useData();
  const now = Date.now();
  const out = toolsOut(D).sort((a, b) => a.due_back.localeCompare(b.due_back));
  const late = out.filter((m) => now > new Date(m.due_back).getTime());
  const low = belowMin(D);
  return (
    <TabScreen title="Tools and stock">
      <Row style={{ gap: 12 }}>
        <View style={{ flex: 1 }}><Btn title="Issue" onPress={() => nav.navigate("IssueItem", {})} /></View>
        <View style={{ flex: 1 }}><Btn title="Receive" kind="soft" onPress={() => nav.navigate("ReceiveStock", {})} /></View>
      </Row>
      <Btn title="Pellet bags into store" kind="soft" onPress={() => nav.navigate("BagCount")} />
      <Row style={{ gap: 10 }}>
        <Figure value={out.length} label="Tools out" />
        <Figure value={late.length} label="Late" bad={late.length > 0} />
        <Figure value={low.length} label="Below minimum" bad={low.length > 0} />
      </Row>

      <SectionTitle>{`Tools out · ${out.length}`}</SectionTitle>
      {out.length === 0 ? <Empty text="All tools are in the store." /> : null}
      {out.map((m) => (
        <Card key={m.id} style={{ gap: 6, padding: 14, borderRadius: 16 }}>
          <Row>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.ink }}>{itemName(D, m.item_id)}{num(m.qty) > 1 ? ` x ${qty(m.qty)}` : ""}</Text>
              <Sub>{personName(D, m.to_person_id)} · since {when(m.at)}</Sub>
            </View>
            {now > new Date(m.due_back).getTime() ? <Badge text="Late" tone="bad" /> : <Badge text={`back by ${fmtTime(m.due_back)}`} />}
          </Row>
          {m.note ? <Sub>{m.note}</Sub> : null}
          <Btn small title="Returned: check it" onPress={() => nav.navigate("ReturnTool", { moveId: m.id })} />
        </Card>
      ))}

      {low.length ? (
        <>
          <SectionTitle>{`Below minimum · ${low.length}`}</SectionTitle>
          <Card>
            {low.map((i) => (
              <Row key={i.id} style={{ paddingVertical: 4 }}>
                <View style={{ flex: 1 }}><T>{i.name}</T><Sub>keep at least {qty(i.min_qty)} {i.unit}</Sub></View>
                <Text style={{ color: C.red, fontWeight: "700" }}>{qty(i.qty)}</Text>
                <Btn small kind="ghost" title="Request" onPress={() => nav.navigate("NewPR", { itemId: i.id })} />
              </Row>
            ))}
          </Card>
        </>
      ) : null}
    </TabScreen>
  );
}

function Figure({ value, label, bad }: { value: number; label: string; bad?: boolean }) {
  return (
    <Card style={{ flex: 1, gap: 2, padding: 12, borderRadius: 14 }}>
      <Text style={{ fontFamily: F.head, fontSize: 34, color: bad ? C.red : C.ink, lineHeight: 38 }}>{value}</Text>
      <Sub>{label}</Sub>
    </Card>
  );
}

/** Everything in the store: search, filter by kind, tap to edit. */
export function StoreStock() {
  const nav = useNavigation<any>();
  const D = useData();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const needle = q.trim().toLowerCase();
  const items = [...D.store_item]
    .filter((i) => (!kind || i.kind === kind) && (!needle || `${i.name} ${i.code ?? ""}`.toLowerCase().includes(needle)))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <TabScreen title="Stock">
      <Search value={q} onChangeText={setQ} placeholder="Name or part number" />
      <Chips value={kind} onChange={setKind} options={KINDS.map(([k, l]) => ({ key: k, label: l }))} />
      <Btn title="New item" kind="soft" onPress={() => nav.navigate("StoreItemForm", {})} />
      <Card style={{ padding: 4 }}>
        {items.length === 0 ? <Empty text="Nothing found." /> : null}
        {items.map((i, n) => {
          const out = i.kind === "Tool" ? outCount(D, i.id) : 0;
          const low = num(i.qty) < num(i.min_qty);
          return (
            <Row key={i.id} style={{ padding: 10, borderTopWidth: n ? 1 : 0, borderTopColor: C.line }}>
              <View style={{ flex: 1 }} >
                <Text onPress={() => nav.navigate("StoreItemForm", { itemId: i.id })} style={{ color: C.ink, fontSize: 15 }}>{i.name}</Text>
                <Sub>{i.code}{i.location ? ` · ${i.location}` : ""}</Sub>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontWeight: "700", color: low ? C.red : C.ink }}>{qty(i.qty)} {i.unit}</Text>
                {out ? <Sub>{out} out</Sub> : null}
              </View>
            </Row>
          );
        })}
      </Card>
    </TabScreen>
  );
}

/** Purchase requests: ask for something, and (for the store and the Owner or a Manager) move them along. */
export function StoreRequests() {
  const nav = useNavigation<any>();
  const D = useData();
  return (
    <TabScreen title="Purchase requests">
      <Btn title="Request something" onPress={() => nav.navigate("NewPR", {})} />
      {D.purchase_request.length === 0 ? <Empty text="No requests yet." /> : null}
      {[...D.purchase_request].sort((a, b) => b.requested_at.localeCompare(a.requested_at)).slice(0, 30).map((p) => <PrCard key={p.id} p={p} />)}
    </TabScreen>
  );
}

function PrCard({ p }: { p: R }) {
  const nav = useNavigation<any>();
  const D = useData();
  const { session, roles } = useAuth();
  const { busy, run } = useAction();
  const me = session!.person.id;
  const setStatus = (status: string, extra: R = {}) => run(() => save({ table: "purchase_request", row: { id: p.id, status, ...extra } }));
  const store = hasRole(roles, "Store", "Owner", "Manager", "Supervisor");
  return (
    <Card style={{ gap: 6, padding: 14, borderRadius: 16 }}>
      <Row>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.ink }}>{p.pr_no}{p.priority === "Urgent" ? " · urgent" : ""}</Text>
          <Sub>{fmtDateTime(p.requested_at)} · {personName(D, p.requested_by)}</Sub>
        </View>
        <Badge text={p.status} tone={PR_TONE[p.status]} />
      </Row>
      <T>{prText(D, p)}</T>
      {p.reason ? <Sub>{p.reason}</Sub> : null}
      {p.status === "Requested" && isAdmin(roles) ? (
        <Row>
          <Btn small title="Approve" busy={busy} onPress={() => setStatus("Approved", { approved_by: me, approved_at: nowIso() })} />
          <Btn small kind="ghost" title="Reject" busy={busy} onPress={() => nav.navigate("RejectPR", { prId: p.id })} />
        </Row>
      ) : null}
      {p.status === "Approved" && store ? <Btn small title="Mark ordered" onPress={() => nav.navigate("OrderPR", { prId: p.id })} /> : null}
      {p.status === "Ordered" && store ? <Btn small title="Mark received" onPress={() => nav.navigate("ReceiveStock", { prId: p.id })} /> : null}
      {p.vendor ? <Sub>From {p.vendor}{p.expected_on ? ` · expected ${new Date(p.expected_on).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</Sub> : null}
      {p.reject_reason ? <Sub style={{ color: C.red }}>{p.reject_reason}</Sub> : null}
    </Card>
  );
}

// -------------------------------------------------------------- forms ----

const peopleOnSite = (D: Data) => {
  const site = onSiteMap(D);
  return D.person.filter((p) => p.active && site.has(p.id) && !rolesOf(D, p.id).some((r) => r === "Security" || r === "Owner"));
};
const itemOptions = (D: Data): Option[] =>
  [...D.store_item].sort((a, b) => a.name.localeCompare(b.name)).map((i) => ({ key: i.id, label: i.name, sub: i.kind === "Tool" ? `${qty(freeQty(D, i))} free` : `${qty(i.qty)} ${i.unit}` }));

const back = (nav: any) => nav.goBack();

export function IssueItem() {
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const { session } = useAuth();
  const D = useData();
  const [itemId, setItemId] = useState<string | null>(params?.itemId ?? null);
  const [to, setTo] = useState<string | null>(null);
  const [q, setQ] = useState("1");
  const [jobId, setJobId] = useState<string | null>(null);
  const [due, setDue] = useState<string>("shift");
  const [note, setNote] = useState("");
  const { busy, run } = useAction();
  const it = D.store_item.find((i) => i.id === itemId);
  const jobs = D.maintenance_job.filter((j) => !j.fixed_at);

  const submit = () =>
    run(async () => {
      if (!it) throw new Error("Choose the item");
      if (!to) throw new Error("Choose who takes it");
      const n = Number(q);
      if (!(n > 0)) throw new Error("Enter the quantity");
      if (n > freeQty(D, it)) throw new Error(`Only ${qty(freeQty(D, it))} ${it.unit} available.`);
      const now = Date.now();
      const tool = it.kind === "Tool";
      const dueAt = due === "shift" ? shiftWindow(D.shift)?.end.getTime() ?? now + 8 * HOUR : now + Number(due) * HOUR;
      const job = jobs.find((j) => j.id === jobId);
      const text = [job ? `${D.machine.find((m) => m.id === job.machine_id)?.tag}: ${job.problem}` : "", note.trim()].filter(Boolean).join(" · ");
      await save(
        { table: "store_movement", row: { id: newId(), item_id: it.id, type: "issue", qty: n, to_person_id: to, by: session!.person.id, at: nowIso(), due_back: tool ? new Date(dueAt).toISOString() : null, returned_at: null, condition: null, returned_by: null, note: text || null, job_id: jobId, task_id: null, pr_id: null } },
        ...(tool ? [] : [{ table: "store_item", row: { id: it.id, qty: round2(num(it.qty) - n) } }]),
      );
      say("Issued", `${it.name} to ${personName(D, to)}.`);
      back(nav);
    });

  return (
    <Screen>
      <H>Issue from the store</H>
      <Sub>Tools go out to a person and must come back.</Sub>
      <SectionTitle>Item</SectionTitle>
      <Select value={itemId} options={itemOptions(D)} onChange={setItemId} placeholder="Choose the item" title="Item" />
      <SectionTitle>To</SectionTitle>
      <Select value={to} options={peopleOnSite(D).map((p) => ({ key: p.id, label: p.full_name, sub: rolesOf(D, p.id).join(", ") }))} onChange={setTo} placeholder="Choose a person on site" title="Who takes it" />
      <Field label="Quantity" value={q} onChangeText={(v) => setQ(v.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" />
      <SectionTitle>For (optional)</SectionTitle>
      <Select value={jobId} options={jobs.map((j) => ({ key: j.id, label: `${D.machine.find((m) => m.id === j.machine_id)?.tag}: ${j.problem}` }))} onChange={setJobId} placeholder="A job it is for" title="Job" />
      {it?.kind === "Tool" ? (
        <>
          <SectionTitle>Bring back by</SectionTitle>
          <Chips value={due} onChange={(v) => setDue(v ?? "shift")} options={[{ key: "shift", label: "End of shift" }, { key: "1", label: "1 hour" }, { key: "2", label: "2 hours" }, { key: "4", label: "4 hours" }]} />
        </>
      ) : null}
      <Field label="Note (optional)" value={note} onChangeText={setNote} />
      <Btn title="Issue" onPress={submit} busy={busy} />
    </Screen>
  );
}

export function ReturnTool() {
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const { session } = useAuth();
  const D = useData();
  const mv = D.store_movement.find((m) => m.id === params.moveId);
  const [cond, setCond] = useState<string>("OK");
  const [note, setNote] = useState("");
  const { busy, run } = useAction();
  if (!mv) return <Screen><Empty text="Not found." /></Screen>;
  const it = D.store_item.find((i) => i.id === mv.item_id);

  const submit = () =>
    run(async () => {
      if (cond !== "OK" && !note.trim()) throw new Error("Say what is wrong");
      await save(
        { table: "store_movement", row: { id: mv.id, returned_at: nowIso(), condition: cond, returned_by: session!.person.id, note: [mv.note, note.trim()].filter(Boolean).join(" · ") || null } },
        ...(cond === "Missing" && it ? [{ table: "store_item", row: { id: it.id, qty: Math.max(0, round2(num(it.qty) - num(mv.qty))) } }] : []),
      );
      if (cond !== "OK") say("Noted", `${it?.name} marked ${cond.toLowerCase()}. Management can see it.`);
      back(nav);
    });

  return (
    <Screen>
      <H>Return: {itemName(D, mv.item_id)}</H>
      <Sub>From {personName(D, mv.to_person_id)} · out since {when(mv.at)}</Sub>
      <SectionTitle>Checked on return</SectionTitle>
      <Chips value={cond} onChange={(v) => setCond(v ?? "OK")} options={[{ key: "OK", label: "OK", sub: "Working, clean" }, { key: "Damaged", label: "Damaged", sub: "Needs repair or replacing" }, { key: "Missing", label: "Missing", sub: "Not brought back" }]} />
      <Field label="Note" value={note} onChangeText={setNote} hint="What is wrong, if anything" />
      <Btn title="Save return" onPress={submit} busy={busy} />
    </Screen>
  );
}

export function ReceiveStock() {
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const { session } = useAuth();
  const D = useData();
  const pr = params?.prId ? D.purchase_request.find((p) => p.id === params.prId) : undefined;
  const line = pr ? D.purchase_request_line.find((l) => l.pr_id === pr.id && l.item_id) : undefined;
  const [itemId, setItemId] = useState<string | null>(params?.itemId ?? line?.item_id ?? null);
  const [q, setQ] = useState(line ? String(num(line.qty)) : "");
  const [prId, setPrId] = useState<string | null>(pr?.id ?? null);
  const [note, setNote] = useState("");
  const { busy, run } = useAction();
  const open = D.purchase_request.filter((p) => p.status === "Approved" || p.status === "Ordered");
  const it = D.store_item.find((i) => i.id === itemId);

  const submit = () =>
    run(async () => {
      const n = Number(q);
      if (!it) throw new Error("Choose the item");
      if (!(n > 0)) throw new Error("Enter the quantity");
      const now = nowIso();
      const me = session!.person.id;
      await save(
        { table: "store_item", row: { id: it.id, qty: round2(num(it.qty) + n) } },
        { table: "store_movement", row: { id: newId(), item_id: it.id, type: "in", qty: n, to_person_id: null, by: me, at: now, due_back: null, returned_at: null, condition: null, returned_by: null, note: note.trim() || null, job_id: null, task_id: null, pr_id: prId } },
        ...(prId ? [{ table: "purchase_request", row: { id: prId, status: "Received", received_by: me, received_at: now } }] : []),
      );
      say("Received", `${qty(n)} ${it.unit} of ${it.name}.`);
      back(nav);
    });

  return (
    <Screen>
      <H>Receive stock</H>
      <SectionTitle>Item</SectionTitle>
      <Select value={itemId} options={itemOptions(D)} onChange={setItemId} placeholder="Choose the item" title="Item" />
      <Field label="Quantity" value={q} onChangeText={(v) => setQ(v.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" />
      <SectionTitle>Against purchase request</SectionTitle>
      <Select value={prId} options={open.map((p) => ({ key: p.id, label: p.pr_no, sub: prText(D, p) }))} onChange={setPrId} placeholder="None" title="Purchase request" />
      <Field label="Note" value={note} onChangeText={setNote} hint="Supplier, bill no." />
      <Btn title="Receive" onPress={submit} busy={busy} />
    </Screen>
  );
}

export function StoreItemForm() {
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const D = useData();
  const it = params?.itemId ? D.store_item.find((i) => i.id === params.itemId) : undefined;
  const [name, setName] = useState(it?.name ?? "");
  const [kind, setKind] = useState<string | null>(it?.kind ?? "Spare");
  const [code, setCode] = useState(it?.code ?? "");
  const [unit, setUnit] = useState(it?.unit ?? "pc");
  const [min, setMin] = useState(it ? String(num(it.min_qty)) : "1");
  const [inStore, setInStore] = useState("0");
  const [loc, setLoc] = useState(it?.location ?? "");
  const { busy, run } = useAction();

  const submit = () =>
    run(async () => {
      if (!name.trim()) throw new Error("Enter the name");
      await save({ table: "store_item", row: { id: it?.id ?? newId(), name: name.trim(), kind: kind ?? "Spare", code: code.trim() || null, unit: unit.trim() || "pc", min_qty: Number(min) || 0, location: loc.trim() || null, ...(it ? {} : { qty: Number(inStore) || 0 }) } });
      back(nav);
    });

  return (
    <Screen>
      <H>{it ? "Edit item" : "New store item"}</H>
      <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
      <Chips value={kind} onChange={(v) => setKind(v ?? "Spare")} options={KINDS.map(([k, l]) => ({ key: k, label: l }))} />
      <Field label="Code or part no." value={code} onChangeText={setCode} autoCapitalize="characters" />
      <Field label="Unit" value={unit} onChangeText={setUnit} autoCapitalize="none" />
      <Field label="Minimum to keep" value={min} onChangeText={(v) => setMin(v.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" />
      {it ? null : <Field label="In store now" value={inStore} onChangeText={(v) => setInStore(v.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" />}
      <Field label="Location" value={loc} onChangeText={setLoc} />
      <Btn title={it ? "Save" : "Add"} onPress={submit} busy={busy} />
    </Screen>
  );
}

export function NewPR() {
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const { session } = useAuth();
  const D = useData();
  const pre = params?.itemId ? D.store_item.find((i) => i.id === params.itemId) : undefined;
  const blank = { itemId: null as string | null, desc: "", q: "", unit: "" };
  const [lines, setLines] = useState([
    pre ? { itemId: pre.id as string | null, desc: "", q: String(Math.max(1, num(pre.min_qty) * 2 - num(pre.qty))), unit: pre.unit as string } : { ...blank },
    { ...blank },
    { ...blank },
  ]);
  const [reason, setReason] = useState(pre ? "Below the minimum stock" : "");
  const [needBy, setNeedBy] = useState<string | null>("7");
  const [prio, setPrio] = useState<string | null>("Normal");
  const { busy, run } = useAction();
  const set = (i: number, patch: Partial<typeof blank>) => setLines((l) => l.map((x, n) => (n === i ? { ...x, ...patch } : x)));

  const submit = () =>
    run(async () => {
      const used = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.itemId || l.desc.trim());
      if (!used.length) throw new Error("Add at least one item");
      for (const { l, i } of used) if (!(Number(l.q) > 0)) throw new Error(`Enter the quantity for item ${i + 1}`);
      if (!reason.trim()) throw new Error("Say why it is needed");
      const id = newId();
      await save(
        { table: "purchase_request", row: { id, pr_no: nextPrNo(D), requested_by: session!.person.id, requested_at: nowIso(), reason: reason.trim(), need_by: needBy ? inDays(Number(needBy)) : null, priority: prio ?? "Normal", status: "Requested", approved_by: null, approved_at: null, reject_reason: null, ordered_by: null, ordered_at: null, vendor: null, expected_on: null, received_by: null, received_at: null } },
        ...used.map(({ l }) => {
          const it = l.itemId ? D.store_item.find((x) => x.id === l.itemId) : undefined;
          return { table: "purchase_request_line", row: { id: newId(), pr_id: id, item_id: l.itemId, description: l.desc.trim() || it?.name || null, qty: Number(l.q), unit: l.unit.trim() || it?.unit || null } };
        }),
      );
      say("Sent", "The request is waiting for approval.");
      back(nav);
    });

  return (
    <Screen>
      <H>New purchase request</H>
      <Sub>Say what is needed, how many and by when.</Sub>
      {lines.map((l, i) => (
        <Card key={i} style={{ gap: 8 }}>
          <Sub>Item {i + 1}{i ? " (optional)" : ""}</Sub>
          <Select value={l.itemId} options={[...D.store_item].sort((a, b) => a.name.localeCompare(b.name)).map((x) => ({ key: x.id, label: x.name }))} onChange={(v) => { const it = D.store_item.find((x) => x.id === v); set(i, { itemId: v, unit: it?.unit ?? l.unit }); }} placeholder="Not a store item: write it" title="Store item" />
          <Field label="Or describe it" value={l.desc} onChangeText={(v) => set(i, { desc: v })} />
          <Row>
            <View style={{ flex: 1 }}><Field label="Quantity" value={l.q} onChangeText={(v) => set(i, { q: v.replace(/[^\d.]/g, "") })} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1 }}><Field label="Unit" value={l.unit} onChangeText={(v) => set(i, { unit: v })} autoCapitalize="none" /></View>
          </Row>
        </Card>
      ))}
      <Field label="Why it is needed" value={reason} onChangeText={setReason} />
      <SectionTitle>Need by</SectionTitle>
      <Chips value={needBy} onChange={setNeedBy} options={[{ key: "1", label: "Tomorrow" }, { key: "3", label: "3 days" }, { key: "7", label: "1 week" }, { key: "14", label: "2 weeks" }, { key: "30", label: "1 month" }]} />
      <SectionTitle>Priority</SectionTitle>
      <Chips value={prio} onChange={(v) => setPrio(v ?? "Normal")} options={[{ key: "Normal", label: "Normal" }, { key: "Urgent", label: "Urgent", sub: "Machine stopped or unsafe" }]} />
      <Btn title="Send request" onPress={submit} busy={busy} />
    </Screen>
  );
}

export function OrderPR() {
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const { session } = useAuth();
  const D = useData();
  const p = D.purchase_request.find((x) => x.id === params.prId);
  const [vendor, setVendor] = useState("");
  const [exp, setExp] = useState<string | null>("3");
  const { busy, run } = useAction();
  if (!p) return <Screen><Empty text="Not found." /></Screen>;
  const submit = () =>
    run(async () => {
      if (!vendor.trim()) throw new Error("Enter the supplier");
      await save({ table: "purchase_request", row: { id: p.id, status: "Ordered", vendor: vendor.trim(), expected_on: exp ? inDays(Number(exp)) : null, ordered_by: session!.person.id, ordered_at: nowIso() } });
      back(nav);
    });
  return (
    <Screen>
      <H>Order {p.pr_no}</H>
      <Sub>{prText(D, p)}</Sub>
      <Field label="Supplier" value={vendor} onChangeText={setVendor} autoCapitalize="words" />
      <SectionTitle>Expected in</SectionTitle>
      <Chips value={exp} onChange={setExp} options={[{ key: "1", label: "1 day" }, { key: "3", label: "3 days" }, { key: "7", label: "1 week" }, { key: "14", label: "2 weeks" }]} />
      <Btn title="Mark ordered" onPress={submit} busy={busy} />
    </Screen>
  );
}

export function RejectPR() {
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const { session } = useAuth();
  const D = useData();
  const p = D.purchase_request.find((x) => x.id === params.prId);
  const [why, setWhy] = useState("");
  const { busy, run } = useAction();
  if (!p) return <Screen><Empty text="Not found." /></Screen>;
  const submit = () =>
    run(async () => {
      if (!why.trim()) throw new Error("Say why it is rejected");
      await save({ table: "purchase_request", row: { id: p.id, status: "Rejected", reject_reason: why.trim(), approved_by: session!.person.id, approved_at: nowIso() } });
      back(nav);
    });
  return (
    <Screen>
      <H>Reject {p.pr_no}</H>
      <Sub>{prText(D, p)}</Sub>
      <Field label="Reason" value={why} onChangeText={setWhy} multiline />
      <Btn title="Reject" kind="danger" onPress={submit} busy={busy} />
    </Screen>
  );
}
