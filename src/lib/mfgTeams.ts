// Roles in a Manufacturing team company. The database decides for real (mfg__role_areas); this only labels them and explains what each role does,
// so the teacher's Teams screen and the student's role badge say the same thing. No imports, so the unit tests can load this file directly.

export type TeamRole = "PURCHASING" | "WAREHOUSE" | "PRODUCTION" | "QUALITY" | "SALES" | "ACCOUNTANT" | "FINANCE_MANAGER" | "AUDITOR";

export const ROLES: { key: TeamRole; label: string; does: string }[] = [
  { key: "PURCHASING", label: "Purchasing officer", does: "Creates purchase orders and enters vendor invoices and landed costs." },
  { key: "WAREHOUSE", label: "Warehouse clerk", does: "Receives goods, adjusts and moves stock, issues materials and delivers to customers." },
  { key: "PRODUCTION", label: "Production planner", does: "Runs planning, production orders, the shop floor, and the items, bills of materials and routings." },
  { key: "QUALITY", label: "Quality inspector", does: "Records inspections and decisions and closes non-conformance reports." },
  { key: "SALES", label: "Sales and shipping clerk", does: "Delivers goods and raises sales invoices." },
  { key: "ACCOUNTANT", label: "Accountant", does: "Prepares journal vouchers, enters vendor invoices, works on costing and settles orders and the month." },
  { key: "FINANCE_MANAGER", label: "Finance manager", does: "Everything the accountant does, plus approves vouchers (never their own) and closes the month." },
  { key: "AUDITOR", label: "Auditor", does: "Reads everything and posts nothing." },
];

export const roleLabel = (k: string) => ROLES.find((r) => r.key === k)?.label ?? k;

/** "Accountant, Purchasing officer" — or "No role yet" for a member who can only look. */
export const rolesText = (keys: string[] | null | undefined) => (keys && keys.length ? keys.map(roleLabel).join(", ") : "No role yet (can only look)");

/** Toggle one role in a selection, keeping the list in the order the roles are defined. */
export function toggleRole(current: TeamRole[], role: TeamRole): TeamRole[] {
  const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
  return ROLES.map((r) => r.key).filter((k) => next.includes(k));
}
