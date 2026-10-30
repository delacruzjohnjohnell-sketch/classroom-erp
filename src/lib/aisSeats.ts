// Seats in an AIS (Accounting Information Systems) company. The database decides for real (ais__my_tenant); this only labels them
// and explains what each seat does, so the teacher's screen and the student's badge say the same thing.
// No imports, so the unit tests can load this file directly.

export type Seat = "ACCOUNTING" | "AUDIT";

export const SEATS: { key: Seat; label: string; does: string }[] = [
  { key: "ACCOUNTING", label: "Accounting", does: "Reviews each document packet and decides to post it or hold it, naming the control that failed. Posts to the ledger, records approvals." },
  { key: "AUDIT", label: "Audit", does: "Tests what was posted: samples, analytics, workpapers and findings. Reverses wrongly posted entries. Never posts a document." },
];

export const seatLabel = (k: string) => SEATS.find((s) => s.key === k)?.label ?? k;

/** "Accounting + Audit", or "No seat yet" for a member who can only look. */
export const seatsText = (keys: string[] | null | undefined) => (keys && keys.length ? keys.map(seatLabel).join(" + ") : "No seat yet (can only look)");

/** Toggle one seat in a selection, keeping the order the seats are defined in. */
export function toggleSeat(current: Seat[], seat: Seat): Seat[] {
  const next = current.includes(seat) ? current.filter((s) => s !== seat) : [...current, seat];
  return SEATS.map((s) => s.key).filter((k) => next.includes(k));
}

/** What the workspace screen should say about a student's access to an AIS company. */
export function seatAccess(seats: string[] | null | undefined): { canAccount: boolean; canAudit: boolean; lookOnly: boolean } {
  const s = seats ?? [];
  return { canAccount: s.includes("ACCOUNTING"), canAudit: s.includes("AUDIT"), lookOnly: s.length === 0 };
}
