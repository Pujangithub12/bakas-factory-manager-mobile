import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View, type KeyboardTypeOptions, type TextProps, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

// Brand: warm brown on a soft grey page. Green is kept only for "good" status.
export const C = {
  bg: "#f2f2ee", card: "#fcfbf8", ink: "#1b1b1a", sub: "#66665e", line: "#d9d5cc",
  green: "#744820", greenSoft: "#f2e6d8", // the brand brown (name kept so existing screens pick it up)
  ok: "#2e7d32", okSoft: "#e4f1e4",
  red: "#c0392b", redSoft: "#fbe7e5", amber: "#9a5b00", amberSoft: "#fdf0d8", blue: "#1c4f9c", blueSoft: "#e4edfa",
  grey: "#8e948f", greySoft: "#ebebe6",
};

/** Condensed bold for headings and big numbers; a plain sans for text. Loaded in App.tsx. */
export const F = {
  head: "BarlowCondensed_700Bold",
  headSemi: "BarlowCondensed_600SemiBold",
  body: "IBMPlexSans_400Regular",
  bodyMed: "IBMPlexSans_500Medium",
  bodyBold: "IBMPlexSans_600SemiBold",
};

/** Text with the app font. Use this instead of react-native's Text. */
export function Text({ style, ...rest }: TextProps) {
  const flat = StyleSheet.flatten(style) as { fontWeight?: string; fontFamily?: string } | undefined;
  const bold = flat?.fontWeight === "700" || flat?.fontWeight === "800" || flat?.fontWeight === "bold";
  const semi = flat?.fontWeight === "600";
  return <RNText {...rest} style={[{ fontFamily: bold ? F.bodyBold : semi ? F.bodyMed : F.body }, style, { fontWeight: "normal" }, flat?.fontFamily ? { fontFamily: flat.fontFamily } : null]} />;
}

export type IconName = React.ComponentProps<typeof Ionicons>["name"];
export const Icon = ({ name, size = 22, color = C.green }: { name: IconName; size?: number; color?: string }) => <Ionicons name={name} size={size} color={color} />;

export function Screen({ children, scroll = true, pad = true }: { children: React.ReactNode; scroll?: boolean; pad?: boolean }) {
  const inner = scroll ? (
    <ScrollView contentContainerStyle={[pad && { padding: 16 }, { paddingBottom: 48, gap: 12 }]} keyboardShouldPersistTaps="handled">{children}</ScrollView>
  ) : (
    <View style={[{ flex: 1, gap: 12 }, pad && { padding: 16 }]}>{children}</View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={["bottom", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>{inner}</KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export const H = ({ children }: { children: React.ReactNode }) => <Text style={s.h}>{children}</Text>;
export const Sub = ({ children, style }: { children: React.ReactNode; style?: object }) => <Text style={[s.sub, style]}>{children}</Text>;
export const T = ({ children, bold, style }: { children: React.ReactNode; bold?: boolean; style?: object }) => (
  <Text style={[{ color: C.ink, fontSize: 15 }, bold && { fontWeight: "700" }, style]}>{children}</Text>
);

/** Screen title with an optional subtitle and an initials avatar, as in the design. */
export function ScreenHeader({ title, subtitle, initials, onAvatar }: { title: string; subtitle?: string; initials?: string; onAvatar?: () => void }) {
  return (
    <SafeAreaView edges={["top"]} style={{ backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.head, fontSize: 32, color: C.ink, lineHeight: 36 }}>{title}</Text>
          {subtitle ? <Text style={{ color: C.sub, fontSize: 13 }}>{subtitle}</Text> : null}
        </View>
        {initials ? <Pressable onPress={onAvatar}><Avatar text={initials} /></Pressable> : null}
      </View>
    </SafeAreaView>
  );
}

export const Avatar = ({ text, size = 46 }: { text: string; size?: number }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.greenSoft, alignItems: "center", justifyContent: "center" }}>
    <Text style={{ fontFamily: F.head, color: C.green, fontSize: size * 0.4 }}>{text}</Text>
  </View>
);
export const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

export const IconTile = ({ name, size = 44 }: { name: IconName; size?: number }) => (
  <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: C.greenSoft, alignItems: "center", justifyContent: "center" }}>
    <Icon name={name} size={size * 0.5} />
  </View>
);

/** A square-ish action tile: icon, title, one line of help. */
export function Tile({ icon, title, sub, onPress }: { icon: IconName; title: string; sub?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, { flex: 1, gap: 8, padding: 14 }, pressed && { opacity: 0.7 }]}>
      <IconTile name={icon} />
      <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.ink }}>{title}</Text>
      {sub ? <Text style={{ color: C.sub, fontSize: 13 }}>{sub}</Text> : null}
    </Pressable>
  );
}

export const StatusDot = ({ color, size = 10 }: { color: string; size?: number }) => <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;

/** A rounded tab for choosing among a few items (the machine pills). */
export function Pill({ label, dot, selected, onPress }: { label: string; dot?: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.pill, selected && { backgroundColor: C.green, borderColor: C.green }]}>
      {dot ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: dot, borderWidth: selected ? 1.5 : 0, borderColor: "#fff" }} /> : null}
      <Text style={{ fontFamily: F.headSemi, fontSize: 19, color: selected ? "#fff" : C.ink }}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: ViewStyle }) {
  if (!onPress) return <View style={[s.card, style]}>{children}</View>;
  return <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.7 }]}>{children}</Pressable>;
}

type BtnKind = "primary" | "ghost" | "danger" | "soft";
export function Btn({ title, onPress, kind = "primary", disabled, small, busy }: { title: string; onPress: () => void; kind?: BtnKind; disabled?: boolean; small?: boolean; busy?: boolean }) {
  const bg = kind === "primary" ? C.green : kind === "danger" ? C.red : kind === "soft" ? C.greenSoft : "transparent";
  const fg = kind === "primary" || kind === "danger" ? "#fff" : C.green;
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [s.btn, small && { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12 }, { backgroundColor: bg, borderColor: kind === "ghost" ? C.green : bg }, off && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}
    >
      <Text style={{ color: fg, fontFamily: F.headSemi, fontSize: small ? 16 : 21, letterSpacing: 0.2 }}>{busy ? "Please wait..." : title}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, keyboardType, placeholder, multiline, hint, secure, maxLength, autoCapitalize }: {
  label: string; value: string; onChangeText: (v: string) => void; keyboardType?: KeyboardTypeOptions; placeholder?: string;
  multiline?: boolean; hint?: string; secure?: boolean; maxLength?: number; autoCapitalize?: "none" | "words" | "sentences" | "characters";
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChangeText} keyboardType={keyboardType} placeholder={placeholder} placeholderTextColor={C.grey}
        multiline={multiline} secureTextEntry={secure} maxLength={maxLength} autoCapitalize={autoCapitalize ?? "sentences"}
        style={[s.input, multiline && { minHeight: 72, textAlignVertical: "top" }]}
      />
      {hint ? <Text style={{ color: C.sub, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );
}

export const Search = ({ value, onChangeText, placeholder = "Search" }: { value: string; onChangeText: (v: string) => void; placeholder?: string }) => (
  <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={C.grey} style={s.input} autoCapitalize="none" />
);

export type Option = { key: string; label: string; sub?: string };

/** Tap to choose one (or several). */
export function Chips({ options, value, onChange, multi }: { options: Option[]; value: string | string[] | null; onChange: (v: any) => void; multi?: boolean }) {
  const sel = (k: string) => (multi ? (value as string[]).includes(k) : value === k);
  const toggle = (k: string) => {
    if (!multi) return onChange(k === value ? null : k);
    const cur = value as string[];
    onChange(cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]);
  };
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => (
        <Pressable key={o.key} onPress={() => toggle(o.key)} style={[s.chip, sel(o.key) && { backgroundColor: C.green, borderColor: C.green }]}>
          <Text style={{ color: sel(o.key) ? "#fff" : C.ink, fontWeight: "600", fontSize: 14 }}>{o.label}</Text>
          {o.sub ? <Text style={{ color: sel(o.key) ? "#f2e6d8" : C.sub, fontSize: 11 }}>{o.sub}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

type Tone = "good" | "bad" | "warn" | "info" | "mute";
const tones: Record<Tone, [string, string]> = {
  good: [C.okSoft, C.ok], bad: [C.redSoft, C.red], warn: [C.amberSoft, C.amber], info: [C.blueSoft, C.blue], mute: [C.greySoft, C.sub],
};
export function Badge({ text, tone = "mute" }: { text: string; tone?: Tone }) {
  const [bg, fg] = tones[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "700" }}>{text}</Text>
    </View>
  );
}

export const Row = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => (
  <View style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, style]}>{children}</View>
);
export const Spacer = () => <View style={{ flex: 1 }} />;
export const Empty = ({ text }: { text: string }) => <Text style={{ color: C.sub, textAlign: "center", padding: 24 }}>{text}</Text>;
export const SectionTitle = ({ children }: { children: React.ReactNode }) => <Text style={[s.label, { marginTop: 8, fontSize: 13 }]}>{String(children).toUpperCase()}</Text>;

export function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <Row>
      <Pressable onPress={() => onChange(true)} style={[s.chip, value === true && { backgroundColor: C.ok, borderColor: C.ok }]}>
        <Text style={{ color: value === true ? "#fff" : C.ink, fontWeight: "700" }}>Yes</Text>
      </Pressable>
      <Pressable onPress={() => onChange(false)} style={[s.chip, value === false && { backgroundColor: C.red, borderColor: C.red }]}>
        <Text style={{ color: value === false ? "#fff" : C.ink, fontWeight: "700" }}>No</Text>
      </Pressable>
    </Row>
  );
}

export function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }}>
      <View style={[s.box, value && { backgroundColor: C.green, borderColor: C.green }]}>{value ? <Text style={{ color: "#fff", fontWeight: "800" }}>✓</Text> : null}</View>
      <Text style={{ color: C.ink, fontSize: 15, flex: 1 }}>{label}</Text>
    </Pressable>
  );
}

/** A dropdown: a box showing the choice, and a list to pick from. */
export function Select({ value, options, onChange, placeholder = "Choose...", title }: { value: string | null; options: Option[]; onChange: (key: string) => void; placeholder?: string; title?: string }) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.key === value);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14 }, pressed && { opacity: 0.7 }]}>
        <Text style={{ flex: 1, fontSize: 18, color: C.ink }}>{cur?.label ?? placeholder}</Text>
        <Icon name="chevron-down" size={18} color={C.ink} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: C.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28, maxHeight: "70%" }}>
            {title ? <Text style={{ fontFamily: F.head, fontSize: 26, color: C.ink, marginBottom: 8 }}>{title}</Text> : null}
            <ScrollView>
              {options.length === 0 ? <Text style={{ color: C.sub, paddingVertical: 12 }}>Nothing to choose from.</Text> : null}
              {options.map((o) => (
                <Pressable key={o.key} onPress={() => { onChange(o.key); setOpen(false); }} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 17, color: C.ink, fontWeight: o.key === value ? "700" : "400" }}>{o.label}</Text>
                    {o.sub ? <Text style={{ fontSize: 13, color: C.sub }}>{o.sub}</Text> : null}
                  </View>
                  {o.key === value ? <Icon name="checkmark" size={20} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/**
 * A number pad with dots, for the 6-digit PIN. Calls onComplete when the last digit is entered; if that
 * returns an error message it is shown and the PIN is cleared so the person can try again.
 */
export function PinPad({ length = 6, onComplete, disabled }: { length?: number; onComplete: (pin: string) => Promise<string | void> | string | void; disabled?: boolean }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const press = async (d: string) => {
    if (busy || disabled || pin.length >= length) return;
    const next = pin + d;
    setError("");
    setPin(next);
    if (next.length < length) return;
    setBusy(true);
    try {
      const msg = await onComplete(next);
      if (msg) setError(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPin("");
      setBusy(false);
    }
  };
  const back = () => { if (!busy) { setError(""); setPin((p) => p.slice(0, -1)); } };

  const key = (label: string, onPress: () => void, icon?: IconName) => (
    <Pressable key={label} onPress={onPress} disabled={busy || disabled} style={({ pressed }) => [s.padKey, pressed && { backgroundColor: C.greenSoft }, (busy || disabled) && { opacity: 0.6 }]}>
      {icon ? <Icon name={icon} size={26} color={C.ink} /> : <Text style={{ fontFamily: F.bodyBold, fontSize: 30, color: C.ink }}>{label}</Text>}
    </Pressable>
  );

  return (
    <View style={{ alignItems: "center", gap: 22 }}>
      <View style={{ flexDirection: "row", gap: 18, height: 24, alignItems: "center" }}>
        {Array.from({ length }).map((_, i) => (
          <View key={i} style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: error ? C.red : C.ink, backgroundColor: i < pin.length ? (error ? C.red : C.ink) : "transparent" }} />
        ))}
      </View>
      <Text style={{ color: C.red, minHeight: 20, textAlign: "center", fontWeight: "600" }}>{error}</Text>
      <View style={{ width: "100%", maxWidth: 380, gap: 12 }}>
        {[["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]].map((row, r) => (
          <View key={r} style={{ flexDirection: "row", gap: 12 }}>{row.map((d) => key(d, () => press(d)))}</View>
        ))}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }} />
          {key("0", () => press("0"))}
          {key("back", back, "backspace-outline")}
        </View>
      </View>
    </View>
  );
}

export const say = (title: string, message?: string) => Alert.alert(title, message);
export const confirm = (title: string, message: string, ok: string, onOk: () => void) =>
  Alert.alert(title, message, [{ text: "Cancel", style: "cancel" }, { text: ok, onPress: onOk }]);

/** Run an async action once, showing a message if it throws. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      say("Could not save", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

const s = StyleSheet.create({
  h: { fontFamily: F.head, fontSize: 30, color: C.ink, lineHeight: 34 },
  sub: { fontSize: 13, color: C.sub },
  label: { fontSize: 12, fontWeight: "700", color: C.sub, letterSpacing: 0.3 },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14, gap: 6 },
  btn: { borderRadius: 16, paddingVertical: 15, paddingHorizontal: 18, alignItems: "center", borderWidth: 1.5 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, color: C.ink, fontFamily: F.body },
  chip: { borderWidth: 1, borderColor: C.line, backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  pill: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  padKey: { flex: 1, height: 74, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: "#e4e0d6", alignItems: "center", justifyContent: "center" },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.grey, alignItems: "center", justifyContent: "center" },
});
