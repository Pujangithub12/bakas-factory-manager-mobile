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
import Crew, { CorrectWorker, CrewMachines, CrewVehicles, SetPin } from "./src/screens/Crew";
import MyMachines, { Machine, ReportProblem, YardFeed } from "./src/screens/Machines";
import Weighbridge, { BagCount, Trucks, TruckIn, TruckOut, WeighOut, YardsTab } from "./src/screens/Weighbridge";
import Jobs, { Job } from "./src/screens/Jobs";
import Floor from "./src/screens/Floor";
import { Detail } from "./src/screens/Dashboard";
import LogSheet from "./src/screens/LogSheet";
import Details from "./src/screens/Details";
import OperatorProblems from "./src/screens/OperatorProblems";
import MachineDetails, { MaintLog } from "./src/screens/MachineDetails";
import DriverVehicle from "./src/screens/DriverVehicle";
import DriverHistory from "./src/screens/DriverHistory";
import Overview from "./src/screens/Overview";
import { StoreHome, StoreStock, StoreRequests, IssueItem, ReturnTool, ReceiveStock, StoreItemForm, NewPR, OrderPR, RejectPR } from "./src/screens/Store";
import { FitterJobs, FitterPlan, FitterDone, PmDone, DailyRound } from "./src/screens/Fitter";
import { Visitors, NewVisitor, VisitorPass } from "./src/screens/Visitors";
import { AlertsScreen, MachineDrill, OwnerMachines, OwnerPeople, PeopleList, PersonDrill, TruckDrill } from "./src/screens/OwnerScreens";
import Money from "./src/screens/Money";
import PowerReading from "./src/screens/PowerReading";
import PaymentForm from "./src/screens/PaymentForm";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, IconName> = {
  Money: "cash-outline", StoreHome: "cube-outline", StoreStock: "list-outline", StoreRequests: "clipboard-outline", FitterJobs: "construct-outline", FitterPlan: "clipboard-outline", FitterDone: "checkmark-done-outline", Visitors: "people-outline", Trucks: "bus-outline", YardsTab: "layers-outline", CrewHome: "people-outline", FloorHome: "locate-outline", GateHome: "shield-checkmark-outline", GateToday: "list-outline", More: "grid-outline", Work: "locate-outline", Overview: "stats-chart-outline", Machines: "locate-outline", People: "people-outline", LogSheet: "clipboard-outline", Problems: "construct-outline", Details: "information-circle-outline", Me: "person-outline", DriverVehicle: "car-outline", DriverHistory: "list-outline",
};

/**
 * The Owner and Managers land on Overview (the dashboard) with Machines, People and Me.
 * Operators get their machine and log sheet; everyone else gets the screens for their roles.
 */
function Tabs() {
  const { roles } = useAuth();
  const insets = useSafeAreaInsets();
  const D = useData();
  // A phone screen or tab the Owner or a Manager has switched off (Phone app on the laptop) does not appear.
  const on = (key: string) => !D.phone_screen.some((r) => r.screen === key && r.is_on === false);
  const isOperator = roles.includes("Operator");
  const isAdmin = roles.includes("Owner") || roles.includes("Manager");
  // An operator who also has other roles (Security, Weighbridge, Store, Fitter, Supervisor) gets their screens on a More tab.
  // A security guard (and nothing else) gets Gate, Today and Me, like the design.
  const securityOnly = roles.includes("Security") && !isAdmin && !isOperator && !roles.includes("Supervisor");
  // A supervisor (not also an operator or admin) gets Crew, Floor and Me. The badges show what needs doing.
  const supervisorOnly = roles.includes("Supervisor") && !isAdmin && !isOperator && !securityOnly;
  // A weighbridge clerk (and nothing else) gets Trucks, Yards and Me.
  const weighbridgeOnly = roles.includes("Weighbridge") && !isAdmin && !isOperator && !securityOnly && !roles.includes("Supervisor");
  // A driver (and nothing else) gets Vehicle, History and Me.
  const driverOnly = roles.includes("Driver") && !isAdmin && !isOperator && !securityOnly && !supervisorOnly && !roles.some((r) => ["Fitter", "Store", "Weighbridge"].includes(r));
  // A fitter or the store keeper (and nothing else) gets their own tabs, like the design.
  const others = (...r: string[]) => !roles.some((x) => r.includes(x));
  const fitterOnly = roles.includes("Fitter") && !isAdmin && !isOperator && !securityOnly && !supervisorOnly && others("Store", "Weighbridge", "Driver");
  const storeOnly = roles.includes("Store") && !isAdmin && !isOperator && !securityOnly && !supervisorOnly && others("Fitter", "Weighbridge", "Driver");
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
          {on("owner.mach") ? <Tab.Screen name="Machines" component={OwnerMachines} /> : null}
          {on("owner.ppl") ? <Tab.Screen name="People" component={OwnerPeople} /> : null}
          {roles.includes("Owner") && on("owner.money") ? <Tab.Screen name="Money" component={Money} /> : null}
        </>
      ) : securityOnly ? (
        <>
          <Tab.Screen name="GateHome" component={Gate} options={{ title: "Gate" }} />
          {on("security.today") ? <Tab.Screen name="GateToday" component={GateToday} options={{ title: "Today" }} /> : null}
          {on("security.vis") ? <Tab.Screen name="Visitors" component={Visitors} /> : null}
        </>
      ) : fitterOnly ? (
        <>
          <Tab.Screen name="FitterJobs" component={FitterJobs} options={{ title: "Jobs" }} />
          {on("fitter.plan") ? <Tab.Screen name="FitterPlan" component={FitterPlan} options={{ title: "Plan" }} /> : null}
          {on("fitter.done") ? <Tab.Screen name="FitterDone" component={FitterDone} options={{ title: "Done" }} /> : null}
        </>
      ) : storeOnly ? (
        <>
          <Tab.Screen name="StoreHome" component={StoreHome} options={{ title: "Tools" }} />
          {on("store.stock") ? <Tab.Screen name="StoreStock" component={StoreStock} options={{ title: "Stock" }} /> : null}
          {on("store.req") ? <Tab.Screen name="StoreRequests" component={StoreRequests} options={{ title: "Requests" }} /> : null}
        </>
      ) : weighbridgeOnly ? (
        <>
          <Tab.Screen name="Trucks" component={Trucks} />
          <Tab.Screen name="YardsTab" component={YardsTab} options={{ title: "Yards" }} />
        </>
      ) : supervisorOnly ? (
        <>
          <Tab.Screen name="CrewHome" component={Crew} options={{ title: "Crew", tabBarBadge: crewBadge || undefined }} />
          {on("supervisor.floor") ? <Tab.Screen name="FloorHome" component={Floor} options={{ title: "Floor", tabBarBadge: floorBadge || undefined }} /> : null}
        </>
      ) : driverOnly ? (
        <>
          <Tab.Screen name="DriverVehicle" component={DriverVehicle} options={{ title: "Vehicle" }} />
          {on("driver.hist") ? <Tab.Screen name="DriverHistory" component={DriverHistory} options={{ title: "History" }} /> : null}
        </>
      ) : (
        <>
          <Tab.Screen name="Work" component={isOperator ? MyMachines : Home} options={{ title: isOperator ? "Machine" : "Work" }} />
          {isOperator && on("operator.sheet") ? <Tab.Screen name="LogSheet" component={LogSheet} options={{ title: "Log sheet" }} /> : null}
          {moreScreens ? <Tab.Screen name="More" component={Home} /> : null}
          {on("operator.jobs") ? <Tab.Screen name="Problems" component={isOperator ? OperatorProblems : Jobs} /> : null}
          {!moreScreens && on("operator.info") ? <Tab.Screen name="Details" component={isOperator ? MachineDetails : Details} /> : null}
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
        <Stack.Screen name="CrewVehicles" component={CrewVehicles} options={{ title: "Vehicles" }} />
        <Stack.Screen name="SetPin" component={SetPin} options={{ title: "PIN" }} />
        <Stack.Screen name="MyMachines" component={MyMachines} options={{ title: "My machine" }} />
        <Stack.Screen name="Machine" component={Machine} options={{ title: "Machine" }} />
        <Stack.Screen name="Alerts" component={AlertsScreen} options={{ title: "Alerts" }} />
        <Stack.Screen name="MachineDrill" component={MachineDrill} options={{ title: "Machine" }} />
        <Stack.Screen name="TruckDrill" component={TruckDrill} options={{ title: "Truck" }} />
        <Stack.Screen name="PeopleList" component={PeopleList} options={{ title: "People" }} />
        <Stack.Screen name="PersonDrill" component={PersonDrill} options={{ title: "Person" }} />
        <Stack.Screen name="MaintLog" component={MaintLog} options={{ title: "Maintenance done" }} />
        <Stack.Screen name="YardFeed" component={YardFeed} options={{ title: "Yard" }} />
        <Stack.Screen name="ReportProblem" component={ReportProblem} options={{ title: "Report a problem" }} />
        <Stack.Screen name="Weighbridge" component={Weighbridge} />
        <Stack.Screen name="TruckIn" component={TruckIn} options={{ title: "Truck in" }} />
        <Stack.Screen name="TruckOut" component={TruckOut} options={{ title: "Truck out" }} />
        <Stack.Screen name="WeighOut" component={WeighOut} options={{ title: "Weigh out" }} />
        <Stack.Screen name="BagCount" component={BagCount} options={{ title: "Bag count" }} />
        <Stack.Screen name="PowerReading" component={PowerReading} options={{ title: "Meter reading" }} />
        <Stack.Screen name="PaymentForm" component={PaymentForm} options={{ title: "Payment" }} />
        <Stack.Screen name="IssueItem" component={IssueItem} options={{ title: "Issue" }} />
        <Stack.Screen name="ReturnTool" component={ReturnTool} options={{ title: "Return" }} />
        <Stack.Screen name="ReceiveStock" component={ReceiveStock} options={{ title: "Receive stock" }} />
        <Stack.Screen name="StoreItemForm" component={StoreItemForm} options={{ title: "Store item" }} />
        <Stack.Screen name="NewPR" component={NewPR} options={{ title: "Purchase request" }} />
        <Stack.Screen name="OrderPR" component={OrderPR} options={{ title: "Order" }} />
        <Stack.Screen name="RejectPR" component={RejectPR} options={{ title: "Reject" }} />
        <Stack.Screen name="PmDone" component={PmDone} options={{ title: "Maintenance done" }} />
        <Stack.Screen name="DailyRound" component={DailyRound} options={{ title: "Daily round" }} />
        <Stack.Screen name="NewVisitor" component={NewVisitor} options={{ title: "Gate pass" }} />
        <Stack.Screen name="VisitorPass" component={VisitorPass} options={{ title: "Gate pass" }} />
        <Stack.Screen name="Jobs" component={Jobs} options={{ title: "Maintenance jobs" }} />
        <Stack.Screen name="Job" component={Job} options={{ title: "Job" }} />
        <Stack.Screen name="Floor" component={Floor} />
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