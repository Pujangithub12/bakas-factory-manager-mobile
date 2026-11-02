import React, { useSyncExternalStore } from "react";
import { ScrollView, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ScreenHeader, initialsOf, C } from "./ui";
import { useAuth } from "./auth";
import { useData } from "./store";
import { shiftWindow } from "./time";

/** A tab screen: the title, "name · shift" and the avatar, then the scrolling body. */
export function TabScreen({ title, children }: { title: string; children: React.ReactNode }) {
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const D = useData();
  const name = session!.person.full_name;
  const shift = shiftWindow(D.shift)?.shift.name;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title={title} subtitle={`${name}${shift ? ` · ${shift} shift` : " · Off-shift"}`} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    </View>
  );
}

/** The next n days as a date string (YYYY-MM-DD), for "need by" and "expected on". */
export const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

// The machine an operator has chosen is shared by their Machine, Log sheet, Problems and Details tabs.
let opSel: string | null = null;
const opSubs = new Set<() => void>();
export const useOpMachine = () =>
  [
    useSyncExternalStore((f) => { opSubs.add(f); return () => { opSubs.delete(f); }; }, () => opSel),
    (id: string | null) => { opSel = id; opSubs.forEach((f) => f()); },
  ] as const;
