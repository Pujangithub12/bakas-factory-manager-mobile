import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from "@expo-google-fonts/barlow-condensed";
import { IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold } from "@expo-google-fonts/ibm-plex-sans";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { initStore, useData } from "./src/store";
import { machineAlerts } from "./src/rules";
import { shiftWindow } from "./src/time";
import { loadSyncMemory } from "./src/sync";
import { AuthProvider, useAuth } from "./src/auth";
import { C, F, Icon, type IconName } from "./src/ui";
import SignIn from "./src/screens/SignIn";
import Home, { Me, SyncStatus } from "./src/screens/Home";
import Gate, { GateToday, Register } from "./src/screens/Gate";
import Crew, { CorrectWorker, CrewMachines, SetPin } from "./src/screens/Crew";
import MyMachines, { Machine, ReportProblem } from "./src/screens/Machines";
import Weighbridge, { BagCount, TruckIn, TruckOut, WeighOut } from "./src/screens/Weighbridge";
import Jobs, { Job } from "./src/screens/Jobs";
import Floor from "./src/screens/Floor";
import Dashboard, { Detail } from "./src/screens/Dashboard";
import LogSheet from "./src/screens/LogSheet";
import Details from "./src/screens/Details";
import OperatorProblems from "./src/screens/OperatorProblems";
import MachineDetails from "./src/screens/MachineDetails";
import Overview from "./src/screens/Overview";
import People from "./src/screens/People";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, IconName> = {
  CrewHome: "people-outline", FloorHome: "locate-outline", GateHome: "shield-checkmark-outline", GateToday: "list-outline", More: "grid-outline", Work: "locate-outline", Overview: "stats-chart-outline", Machines: "locate-outline", People: "people-outline", LogSheet: "clipboard-outline", Problems: "construct-outline", Details: "information-circle-outline", Me: "person-outline",
};

/**
 * The Owner and Managers land on Overview (the dashboard) with Machines, People and Me.
 * Operators get their machine and log sheet; everyone else gets the screens for their roles.
 */
function Tabs() {
  const { roles } = useAuth();
  const insets = useSafeAreaInsets();
  const D = useData();
  const isOperator = roles.includes("Operator");
  const isAdmin = roles.includes("Owner") || roles.includes("Manager");
  // An operator who also has other roles (Security, Weighbridge, Store, Fitter, Supervisor) gets their screens on a More tab.
  // A security guard (and nothing else) gets Gate, Today and Me, like the design.
  const securityOnly = roles.includes("Security") && !isAdmin && !isOperator && !roles.includes("Supervisor");
  // A supervisor (not also an operator or admin) gets Crew, Floor and Me. The badges show what needs doing.
  const supervisorOnly = roles.includes("Supervisor") && !isAdmin && !isOperator && !securityOnly;
  const shift = shiftWindow(D.shift);
  const notOnDuty = new Set(D.attendance.filter((a) => shift && new Date(a.shift_start).getTime() === shift.start.getTime() && !a.on_duty_at && !a.gate_out).map((a) => a.person_id)).size;
  const crewBadge = D.person.filter((p) => p.active && !p.checked).length + notOnDuty;
  const floorBadge = supervisorOnly ? D.machine.reduce((n, m) => n + machineAlerts(D, m).length, 0) : 0;
  const moreScreens = isOperator && roles.some((r) => ["Security", "Weighbridge", "Store", "Fitter", "Supervisor"].includes(r));
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: C.green,
        tabBarInactiveTintColor: C.sub,
        tabBarStyle: { backgroundColor: C.card, borderTopColor: C.line, height: 70 + insets.bottom, paddingTop: 8, paddingBottom: insets.bottom + 6 },
        tabBarLabelStyle: { fontFamily: F.bodyBold, fontSize: 12 },
        tabBarIcon: ({ focused, color }) => (
          <View style={{ width: 64, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: focused ? C.greenSoft : "transparent" }}>
            <Icon name={TAB_ICONS[route.name]} color={color} size={24} />
          </View>
        ),
      })}
    >
      {isAdmin ? (
        <>
          <Tab.Screen name="Overview" component={Overview} />
          <Tab.Screen name="Machines" component={Floor} />
          <Tab.Screen name="People" component={People} />
        </>
      ) : securityOnly ? (
        <>
          <Tab.Screen name="GateHome" component={Gate} options={{ title: "Gate" }} />
          <Tab.Screen name="GateToday" component={GateToday} options={{ title: "Today" }} />
        </>
      ) : supervisorOnly ? (
        <>
          <Tab.Screen name="CrewHome" component={Crew} options={{ title: "Crew", tabBarBadge: crewBadge || undefined }} />
          <Tab.Screen name="FloorHome" component={Floor} options={{ title: "Floor", tabBarBadge: floorBadge || undefined }} />
        </>
      ) : (
        <>
          <Tab.Screen name="Work" component={isOperator ? MyMachines : Home} options={{ title: isOperator ? "Machine" : "Work" }} />
          {isOperator ? <Tab.Screen name="LogSheet" component={LogSheet} options={{ title: "Log sheet" }} /> : null}
          {moreScreens ? <Tab.Screen name="More" component={Home} /> : null}
          <Tab.Screen name="Problems" component={isOperator ? OperatorProblems : Jobs} />
          {moreScreens ? null : <Tab.Screen name="Details" component={isOperator ? MachineDetails : Details} />}
        </>
      )}
      <Tab.Screen name="Me" component={Me} />
    </Tab.Navigator>
  );
}

function Root() {
  const { session } = useAuth();
  if (!session) return <SignIn />;
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: C.card },
          headerTintColor: C.green,
          headerTitleStyle: { color: C.ink, fontFamily: F.head, fontSize: 24 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: C.bg },
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="SyncStatus" component={SyncStatus} options={{ title: "Refused entries" }} />
        <Stack.Screen name="Gate" component={Gate} options={{ title: "Gate register" }} />
        <Stack.Screen name="Register" component={Register} options={{ title: "New person" }} />
        <Stack.Screen name="Crew" component={Crew} options={{ title: "Shift & crew" }} />
        <Stack.Screen name="CorrectWorker" component={CorrectWorker} options={{ title: "Correct details" }} />
        <Stack.Screen name="CrewMachines" component={CrewMachines} options={{ title: "Machines" }} />
        <Stack.Screen name="SetPin" component={SetPin} options={{ title: "PIN" }} />
        <Stack.Screen name="MyMachines" component={MyMachines} options={{ title: "My machine" }} />
        <Stack.Screen name="Machine" component={Machine} options={{ title: "Machine" }} />
        <Stack.Screen name="ReportProblem" component={ReportProblem} options={{ title: "Report a problem" }} />
        <Stack.Screen name="Weighbridge" component={Weighbridge} />
        <Stack.Screen name="TruckIn" component={TruckIn} options={{ title: "Truck in" }} />
        <Stack.Screen name="TruckOut" component={TruckOut} options={{ title: "Truck out" }} />
        <Stack.Screen name="WeighOut" component={WeighOut} options={{ title: "Weigh out" }} />
        <Stack.Screen name="BagCount" component={BagCount} options={{ title: "Bag count" }} />
        <Stack.Screen name="Jobs" component={Jobs} options={{ title: "Maintenance jobs" }} />
        <Stack.Screen name="Job" component={Job} options={{ title: "Job" }} />
        <Stack.Screen name="Floor" component={Floor} />
        <Stack.Screen name="Dashboard" component={Dashboard} options={{ title: "Dashboard" }} />
        <Stack.Screen name="Detail" component={Detail} options={{ title: "Detail" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [fontsLoaded] = useFonts({ BarlowCondensed_600SemiBold, BarlowCondensed_700Bold, IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold });
  useEffect(() => {
    (async () => {
      await initStore();
      await loadSyncMemory();
      setReady(true);
    })();
  }, []);

  if (!ready || !fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg }}>
        <ActivityIndicator color={C.green} />
      </View>
    );
  }
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}