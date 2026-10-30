import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Field, Btn, Card, Badge, Row, C, F, Icon, IconTile, PinPad } from "../ui";
import { isKnownOnDevice, loadPeople, loadRoles, loadStatus, roleKnownOnDevice, useAuth, type PersonOption, type RoleCount } from "../auth";
import { SIGN_IN_FOOTER, SIGN_IN_ROLES, roleInfo } from "../roles";

const PIN_LENGTH = 6;

/** Sign in: the first run creates the one Owner; after that pick a role, then your name, then enter the 6-digit PIN. */
export default function SignIn() {
  const { signIn, setupOwner } = useAuth();
  const [mode, setMode] = useState<"loading" | "setup" | "pick" | "people" | "pin">("loading");
  const [roles, setRoles] = useState<RoleCount[]>([]);
  const [known, setKnown] = useState<Record<string, boolean>>({});
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [knownPeople, setKnownPeople] = useState<Record<string, boolean>>({});
  const [offline, setOffline] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [person, setPerson] = useState<PersonOption | null>(null);
  const [msg, setMsg] = useState("");

  const refreshPeople = async () => {
    try {
      const p = await loadPeople();
      setPeople(p.people);
      setKnownPeople(Object.fromEntries(await Promise.all(p.people.map(async (x) => [x.id, await isKnownOnDevice(x.id)] as const))));
    } catch {
      // keep the list we already have
    }
  };

  const load = async () => {
    setMode("loading");
    setMsg("");
    try {
      const status = await loadStatus();
      if (status?.setup_needed) return setMode("setup");
      const r = await loadRoles();
      setRoles(r.roles);
      setOffline(r.offline);
      setKnown(Object.fromEntries(await Promise.all(SIGN_IN_ROLES.map(async (role) => [role, await roleKnownOnDevice(role)] as const))));
      await refreshPeople();
      if (r.roles.length === 0 && r.offline) setMsg("No signal, and no one has signed in on this phone yet.");
      setMode("pick");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not reach the server");
      setMode("pick");
    }
  };
  useEffect(() => { load(); }, []);

  const Brand = () => (
    <Row style={{ gap: 14, marginBottom: 8 }}>
      <View style={{ width: 62, height: 62, borderRadius: 16, backgroundColor: C.green, alignItems: "center", justifyContent: "center" }}>
        <Icon name="stats-chart" size={32} color="#fff" />
      </View>
      <View>
        <Text style={{ fontFamily: F.head, fontSize: 34, color: C.ink, lineHeight: 38 }}>BAKAS FACTORY</Text>
        <Text style={{ color: C.sub, fontSize: 14 }}>Bakas Renewable Energy · Sarlahi</Text>
      </View>
    </Row>
  );

  if (mode === "loading") {
    return <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.sub }}>Connecting...</Text></SafeAreaView>;
  }

  if (mode === "setup") return <OwnerSetup onDone={setupOwner} brand={<Brand />} />;

  if (mode === "pin" && pick && person) {
    return (
      <PinScreen
        label={person.full_name}
        offline={offline}
        onBack={() => { setPerson(null); setMode("people"); }}
        onPin={(pin) => signIn(person, pin).then(() => undefined)}
      />
    );
  }

  if (mode === "people" && pick) {
    const list = people.filter((p) => (p.roles ?? []).includes(pick));
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 14 }}>
          <View style={{ height: 44, justifyContent: "center" }}>
            <Pressable onPress={() => { setPick(null); setMode("pick"); }} hitSlop={12} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Icon name="chevron-back" size={20} color={C.ink} />
              <Text style={{ fontSize: 17, color: C.ink, fontWeight: "600" }}>Back</Text>
            </Pressable>
          </View>
          <View style={{ gap: 4, marginBottom: 4 }}>
            <Text style={{ fontFamily: F.head, fontSize: 44, color: C.ink, lineHeight: 48 }}>{roleInfo(pick).label}</Text>
            <Text style={{ color: C.sub, fontSize: 17 }}>Who are you?</Text>
          </View>
          {offline ? <Badge text="No signal: only people who have signed in on this phone before" tone="warn" /> : null}
          {list.map((p) => (
            <Card key={p.id} onPress={() => { setPerson(p); setMode("pin"); }} style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 18 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: F.head, fontSize: 24, color: C.ink }}>{p.full_name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bodyBold, fontSize: 19, color: C.ink }}>{p.full_name}</Text>
              </View>
              {offline ? <Badge text={knownPeople[p.id] ? "Ready offline" : "Needs signal"} tone={knownPeople[p.id] ? "good" : "mute"} /> : null}
            </Card>
          ))}
          {list.length === 0 ? (
            <Text style={{ color: C.sub, fontSize: 15, lineHeight: 21 }}>
              No one with this role has a PIN yet. Ask the Owner or a Manager to add you and set your PIN in Users & Roles.
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const countOf = (role: string) => roles.find((r) => r.role === role)?.count ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 14 }}>
        <Brand />
        <View style={{ gap: 4, marginTop: 4, marginBottom: 4 }}>
          <Text style={{ fontFamily: F.head, fontSize: 44, color: C.ink, lineHeight: 48 }}>Sign in</Text>
          <Text style={{ color: C.sub, fontSize: 17 }}>Who is using this phone?</Text>
        </View>
        {offline ? <Badge text="No signal: only roles that have signed in on this phone before" tone="warn" /> : null}
        {SIGN_IN_ROLES.map((role) => {
          const info = roleInfo(role);
          const empty = !offline && roles.length > 0 && countOf(role) === 0;
          return (
            <Card key={role} onPress={() => { setPick(role); setMode("people"); refreshPeople(); }} style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 18, opacity: empty ? 0.55 : 1 }}>
              <IconTile name={info.icon} size={52} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: F.bodyBold, fontSize: 19, color: C.ink }}>{info.label}</Text>
                <Text style={{ color: C.sub, fontSize: 14 }}>{info.blurb}</Text>
              </View>
              {offline ? <Badge text={known[role] ? "Ready offline" : "Needs signal"} tone={known[role] ? "good" : "mute"} /> : empty ? <Badge text="No one yet" /> : null}
            </Card>
          );
        })}
        {msg ? <Text style={{ color: C.red }}>{msg}</Text> : null}
        <Text style={{ color: C.sub, fontSize: 14, lineHeight: 20, marginTop: 6 }}>{SIGN_IN_FOOTER}</Text>
        <Btn title="Try again" kind="ghost" small onPress={load} />
      </ScrollView>
    </SafeAreaView>
  );
}

/** The PIN page: Back, the person's initial, their name, six dots and a number pad. */
function PinScreen({ label, title, offline, onBack, onPin }: { label: string; title?: string; offline?: boolean; onBack?: () => void; onPin: (pin: string) => Promise<string | void> }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 22, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View style={{ height: 44, justifyContent: "center" }}>
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={12} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Icon name="chevron-back" size={20} color={C.ink} />
              <Text style={{ fontSize: 17, color: C.ink, fontWeight: "600" }}>Back</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={{ alignItems: "center", gap: 8, marginTop: 12, marginBottom: 22 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.head, fontSize: 38, color: C.ink }}>{label.slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={{ fontFamily: F.head, fontSize: 38, color: C.ink, lineHeight: 42 }}>{label}</Text>
          <Text style={{ color: C.sub, fontSize: 17 }}>{title ?? `Enter your ${PIN_LENGTH}-digit PIN`}</Text>
          {offline ? <Badge text="No signal" tone="warn" /> : null}
        </View>
        <PinPad length={PIN_LENGTH} onComplete={onPin} />
      </ScrollView>
    </SafeAreaView>
  );
}

/** First run only: name, then choose and confirm a 6-digit PIN. This person becomes the Owner. */
function OwnerSetup({ onDone, brand }: { onDone: (name: string, pin: string) => Promise<void>; brand: React.ReactNode }) {
  const [step, setStep] = useState<"name" | "pin" | "confirm">("name");
  const [name, setName] = useState("");
  const [first, setFirst] = useState("");
  const [mismatch, setMismatch] = useState(false);

  if (step === "name") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
          {brand}
          <View style={{ gap: 4, marginTop: 4 }}>
            <Text style={{ fontFamily: F.head, fontSize: 44, color: C.ink, lineHeight: 48 }}>Welcome</Text>
            <Text style={{ color: C.sub, fontSize: 17 }}>Set up the Owner. The Owner is the super admin and decides who else gets access.</Text>
          </View>
          <Field label="YOUR NAME" value={name} onChangeText={setName} autoCapitalize="words" />
          <Btn title="Continue" disabled={name.trim().length < 2} onPress={() => setStep("pin")} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <PinScreen
      key={step}
      label="Owner"
      title={step === "confirm" ? "Enter it again to confirm" : mismatch ? "The PINs did not match. Choose a PIN again" : `Choose a ${PIN_LENGTH}-digit PIN`}
      onBack={() => { setFirst(""); setStep(step === "confirm" ? "pin" : "name"); }}
      onPin={async (pin) => {
        if (step === "pin") {
          if ("0123456789".includes(pin) || "9876543210".includes(pin)) return "Choose a PIN that is not a run like 123456";
          setFirst(pin);
          setMismatch(false);
          setStep("confirm");
          return;
        }
        if (pin !== first) {
          setFirst("");
          setMismatch(true);
          setStep("pin");
          return;
        }
        await onDone(name.trim(), pin);
      }}
    />
  );
}