import type { IconName } from "./ui";

// Owner is the super admin. Manager is the admin (only the Owner can give it). The rest are work roles.
// A person can hold several roles; the screens they see are the union of what each role opens.
export const ROLE_LIST = ["Owner", "Manager", "Supervisor", "Operator", "Driver", "Security", "Fitter", "Store", "Weighbridge", "Helper"] as const;

/** How each role is shown on the sign-in cards. */
export const ROLE_INFO: Record<string, { label: string; blurb: string; icon: IconName }> = {
  Owner: { label: "Owner", blurb: "Dashboard: raw material, production, machines, people", icon: "stats-chart-outline" },
  Manager: { label: "Manager", blurb: "Admin: users, roles, dashboard, setup", icon: "briefcase-outline" },
  Supervisor: { label: "Supervisor", blurb: "Cross-check crew, in-charge, floor", icon: "people-outline" },
  Operator: { label: "Operator", blurb: "Machines, checks, log sheets", icon: "locate-outline" },
  Driver: { label: "Driver", blurb: "JCB and tractors, diesel", icon: "car-outline" },
  Security: { label: "Security", blurb: "Gate register, new workers", icon: "shield-checkmark-outline" },
  Fitter: { label: "Fitter", blurb: "Maintenance jobs and the plan", icon: "construct-outline" },
  Store: { label: "Store", blurb: "Tools out and back, stock, requests", icon: "cube-outline" },
  Weighbridge: { label: "Weighbridge", blurb: "Trucks in and out, yards, bag count", icon: "speedometer-outline" },
  Helper: { label: "Helper", blurb: "Crews a machine; no app sign-in", icon: "hand-left-outline" },
};

/** The cards on the sign-in page, in order. Helper is a worker role with no sign-in. */
export const SIGN_IN_ROLES = ["Owner", "Manager", "Operator", "Driver", "Security", "Supervisor", "Fitter", "Store", "Weighbridge"] as const;
export const SIGN_IN_FOOTER = "The lab uses the laptop. The factory manager or the owner switches phone screens on and off (Setup: Phone app).";

export const roleInfo = (role?: string | null) => ROLE_INFO[role ?? ""] ?? { label: role ?? "No role yet", blurb: "Ask the Owner or a Manager to give you a role", icon: "person-outline" as IconName };

/** Roles the signed-in person may give someone: the Owner role is never given; Manager only by the Owner; Supervisor by an admin. */
export function grantableRoles(actorRoles: string[]): string[] {
  const owner = actorRoles.includes("Owner");
  const admin = owner || actorRoles.includes("Manager");
  return ROLE_LIST.filter((r) => r !== "Owner" && (r !== "Manager" || owner) && (r !== "Supervisor" || admin));
}
