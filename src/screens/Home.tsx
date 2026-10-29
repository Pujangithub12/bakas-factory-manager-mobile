import React, { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Screen, Sub, Card, T, Text, Badge, Row, Btn, C, F, SectionTitle, say, confirm, ScreenHeader, IconTile, Avatar, initialsOf, Icon, type IconName } from "../ui";
import { useAuth } from "../auth";
import { clearRejected, pendingOps, rejectedList, useData, useOutboxCounts, type Rejected } from "../store";
import { syncNow, useSyncState } from "../sync";
import { fmtDateTime } from "../time";
import { getServerUrl } from "../api";
import { hasRole, machineAlerts, onSiteMap } from "../rules";
import { roleInfo } from "../roles";

type Tile = { title: string; sub: string; screen: string; icon: IconName; roles: string[] | "all"; badge?: () => { text: string; tone: "bad" | "warn" | "info" } | null };

/** The first tab for everyone except operators (who get their machine): the screens their roles open. */
export default function Home() {
  const nav = useNavigation<any>();
  const { session, roles } = useAuth();
  const D = useData();
  const name = session!.person.full_name;

  const openJobs = D.maintenance_job.filter((j) => !j.fixed_at).length;
  const newWorkers = D.person.filter((p) => p.active && !p.checked && onSiteMap(D).has(p.id)).length;
  const alerts = D.machine.reduce((n, m) => n + machineAlerts(D, m).filter((a) => a.tone === "bad").length, 0);

  const tiles: Tile[] = [
    { title: "Gate register", sub: "Check people in and out", screen: "Gate", icon: "log-in-outline", roles: ["Security", "Owner", "Manager", "Supervisor"] },
    { title: "Shift & crew", sub: "In charge, on duty, who runs what", screen: "Crew", icon: "people-outline", roles: ["Owner", "Manager", "Supervisor"], badge: () => (newWorkers ? { text: `${newWorkers} new`, tone: "info" } : null) },
    { title: "My machine", sub: "Start, stop, readings", screen: "MyMachines", icon: "locate-outline", roles: ["Operator", "Owner", "Manager", "Supervisor"] },
    { title: "Weighbridge", sub: "Trucks in and out, yards, bags", screen: "Weighbridge", icon: "speedometer-outline", roles: ["Weighbridge", "Owner", "Manager"] },
    { title: "Bag count", sub: "Pellet bags into the store", screen: "BagCount", icon: "cube-outline", roles: ["Store", "Owner", "Manager"] },
    { title: "Maintenance jobs", sub: "Take a job, mark it fixed", screen: "Problems", icon: "construct-outline", roles: ["Fitter", "Owner", "Manager", "Supervisor"], badge: () => (openJobs ? { text: `${openJobs} open`, tone: "warn" } : null) },
    { title: "Floor", sub: "All machines, what needs a look", screen: "Floor", icon: "grid-outline", roles: ["Owner", "Manager", "Supervisor"], badge: () => (alerts ? { text: `${alerts} alert`, tone: "bad" } : null) },
    { title: "Dashboard", sub: "Production, no rupees", screen: "Dashboard", icon: "stats-chart-outline", roles: ["Owner", "Manager"] },
    { title: "Report a problem", sub: "Goes straight to the fitters", screen: "ReportProblem", icon: "alert-circle-outline", roles: "all" },
  ];
  const shown = tiles.filter((t) => t.roles === "all" || hasRole(roles, ...t.roles));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Factory" subtitle={`${name} · ${roles.map((r) => roleInfo(r).label).join(", ") || "No role yet"}`} initials={initialsOf(name)} onAvatar={() => nav.navigate("Me")} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}>
        {shown.length === 0 ? <Sub>Your role has no screens yet. Ask the supervisor.</Sub> : null}
        {shown.map((t) => {
          const b = t.badge?.();
          return (
            <Card key={t.screen} onPress={() => nav.navigate(t.screen)} style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 18 }}>
              <IconTile name={t.icon} size={52} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: F.bodyBold, fontSize: 18, color: C.ink }}>{t.title}</Text>
                <Text style={{ color: C.sub, fontSize: 14 }}>{t.sub}</Text>
              </View>
              {b ? <Badge text={b.text} tone={b.tone} /> : null}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Sign out, but try to send waiting entries first: a phone sends them under whoever is signed in. */
function useSafeSignOut() {
  const { signOut } = useAuth();
  return async () => {
    await syncNow();
    const left = (await pendingOps(1)).length;
    if (!left) return signOut();
    confirm(
      "Entries not sent yet",
      "There is no signal, so your entries are still on this phone. They can only be sent when you sign in again here. Sign out anyway?",
      "Sign out",
      signOut
    );
  };
}

/** The "Me" tab. */
export function Me() {
  const nav = useNavigation<any>();
  const { session, roles } = useAuth();
  const sync = useSyncState();
  const counts = useOutboxCounts();
  const signOutSafely = useSafeSignOut();
  const name = session!.person.full_name;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Me" subtitle={name} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}>
        <Card style={{ alignItems: "center", gap: 8, paddingVertical: 24 }}>
          <Avatar text={initialsOf(name)} size={84} />
          <Text style={{ fontFamily: F.head, fontSize: 32, color: C.ink }}>{name}</Text>
          <Row style={{ flexWrap: "wrap", justifyContent: "center" }}>
            {roles.map((r) => <Badge key={r} text={roleInfo(r).label} tone="info" />)}
          </Row>
        </Card>
        <Btn title={sync.syncing ? "Syncing..." : "Sync now"} kind="soft" onPress={() => syncNow().then(() => undefined)} busy={sync.syncing} />
        <Card onPress={() => nav.navigate("SyncStatus")} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Icon name="alert-circle-outline" />
          <View style={{ flex: 1 }}>
            <T bold>Entries refused by the server</T>
            <Sub>{counts.rejected ? `${counts.rejected} to look at` : "Nothing refused"}</Sub>
          </View>
          <Icon name="chevron-forward" color={C.grey} />
        </Card>
        {sync.needsSignIn ? <Text style={{ color: C.red, fontWeight: "700" }}>Sign out and sign in again with signal to send your entries.</Text> : null}
        <Btn title="Sign out" kind="danger" onPress={signOutSafely} />
      </ScrollView>
    </View>
  );
}

export function SyncStatus() {
  const sync = useSyncState();
  const counts = useOutboxCounts();
  const [rejected, setRejected] = useState<Rejected[]>([]);
  useEffect(() => { rejectedList().then(setRejected); }, [counts.rejected]);

  return (
    <Screen>
      <Card>
        <T bold>{sync.online ? "Phone has a connection" : "No connection"}</T>
        <Sub>Server: {getServerUrl() || "not set"}</Sub>
        <Sub>Last updated: {sync.lastOk ? fmtDateTime(sync.lastOk) : "never"}</Sub>
        <Sub>{counts.pending} entries waiting to be sent</Sub>
        {sync.error ? <Text style={{ color: C.red }}>{sync.error}</Text> : null}
      </Card>
      <Btn title="Sync now" onPress={() => syncNow().then(() => undefined)} busy={sync.syncing} />

      <SectionTitle>Refused by the server</SectionTitle>
      {rejected.length === 0 ? <Sub>Nothing refused.</Sub> : null}
      {rejected.map((r) => (
        <Card key={r.id}>
          <T bold>{r.table.replace(/_/g, " ")}</T>
          <Text style={{ color: C.red }}>{r.error}</Text>
          <Sub>{fmtDateTime(r.at)}. Tell the supervisor so it can be corrected.</Sub>
        </Card>
      ))}
      {rejected.length ? <Btn title="Clear this list" kind="ghost" onPress={() => clearRejected().then(() => say("Cleared"))} /> : null}
    </Screen>
  );
}
