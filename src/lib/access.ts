// Which systems a signed-in person may use. The teacher approves each new sign-up and ticks the systems (migration 0085); the database enforces it,
// this file only decides what to show. A profile without the new fields (migration not applied yet, or an old row) counts as approved for everything.
import type { Profile } from "./types";

export type ModuleId = "standard" | "manufacturing" | "ais" | "bfar" | "bir";
export const MODULES: { id: ModuleId; label: string }[] = [
  { id: "standard", label: "Standard ERP" },
  { id: "manufacturing", label: "Manufacturing ERP" },
  { id: "ais", label: "Accounting Information Systems" },
  { id: "bfar", label: "BFAR practice sets" },
  { id: "bir", label: "BIR eForms Lab" },
];
export const ALL_MODULES: ModuleId[] = MODULES.map((m) => m.id);

export type AccessState = "ok" | "pending" | "rejected";

/** ok, or the waiting/rejected state of a student. Teachers are always ok. */
export function accessState(p: Pick<Profile, "role" | "approval"> | null | undefined): AccessState {
  if (!p || p.role === "teacher") return "ok";
  return p.approval === "pending" ? "pending" : p.approval === "rejected" ? "rejected" : "ok";
}

export function canUse(p: Pick<Profile, "role" | "approval" | "modules"> | null | undefined, m: ModuleId): boolean {
  if (!p || p.role === "teacher") return true;
  if (accessState(p) !== "ok") return false;
  return (p.modules ?? ALL_MODULES).includes(m);
}

/** Whether the person has to start or join a company of their own: only the Standard and Manufacturing ERPs work that way.
 *  AIS companies are made and assigned by the teacher, and the BFAR and BIR practice sets use no company, so a student given only those goes straight to the menu. */
export function needsCompany(p: Pick<Profile, "role" | "approval" | "modules"> | null | undefined): boolean {
  if (!p || p.role === "teacher") return false;
  return canUse(p, "standard") || canUse(p, "manufacturing");
}

/** The module an edition belongs to. */
export const moduleOfEdition = (edition: string | null | undefined): ModuleId => (edition === "MANUFACTURING" ? "manufacturing" : edition === "AIS" ? "ais" : "standard");
