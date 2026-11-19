// A person can hold several roles. The tabs they see are those of the role they are working as: the one they picked on the
// sign-in screen, or the last one they used on this phone, and they can switch on the Me tab. This is only about which
// screens show. The server still allows everything the union of their roles allows.

/** The roles that have their own set of tabs, in the order offered when there is no earlier choice. */
export const MODE_ORDER = ["Owner", "Manager", "Supervisor", "Operator", "Security", "Weighbridge", "Store", "Fitter", "Driver"] as const;

/** The roles this person can work as. Owner and Manager open the same admin tabs, so only the higher one is offered. */
export function modesOf(roles: string[]): string[] {
  const modes: string[] = MODE_ORDER.filter((r) => roles.includes(r));
  return modes.includes("Owner") ? modes.filter((r) => r !== "Manager") : modes;
}

/** The role to work as: the preferred one if the person still has it, otherwise the first they can. "" when they have none. */
export function pickMode(roles: string[], preferred: string | null): string {
  const modes = modesOf(roles);
  return preferred && modes.includes(preferred) ? preferred : modes[0] ?? "";
}
