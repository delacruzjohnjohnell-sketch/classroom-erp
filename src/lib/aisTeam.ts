// The teacher's team form: which students are ticked and with which roles (migration 0090). Pure helpers, so the form and the tests share one set of rules.

export type TeamSeat = "ACCOUNTING" | "AUDIT";
export type SeatPick = { ACCOUNTING: boolean; AUDIT: boolean };
export type Picks = Record<string, SeatPick>;   // student id -> the roles ticked for that student

/** The members the database function takes: only students with at least one role ticked. */
export function toMembers(picks: Picks): { user: string; seats: TeamSeat[] }[] {
  return Object.entries(picks)
    .filter(([, p]) => p.ACCOUNTING || p.AUDIT)
    .map(([user, p]) => ({ user, seats: ([p.ACCOUNTING && "ACCOUNTING", p.AUDIT && "AUDIT"].filter(Boolean)) as TeamSeat[] }));
}

/** What the teacher should be told before creating the team. */
export function teamSummary(picks: Picks): { members: number; accounting: number; audit: number; both: number; notes: string[] } {
  const ms = toMembers(picks);
  const accounting = ms.filter((m) => m.seats.includes("ACCOUNTING")).length;
  const audit = ms.filter((m) => m.seats.includes("AUDIT")).length;
  const both = ms.filter((m) => m.seats.length === 2).length;
  const notes: string[] = [];
  if (ms.length > 0 && accounting === 0) notes.push("Nobody holds the Accounting seat, so nobody can post the documents.");
  if (ms.length > 0 && audit === 0) notes.push("Nobody holds the Audit seat, so nobody can audit the books.");
  if (both > 0) notes.push("A student with both roles audits their own postings, so this team works as solo practice.");
  return { members: ms.length, accounting, audit, both, notes };
}

/** "Team 4" when Team 1 to Team 3 exist; otherwise one more than the number of companies. */
export function nextTeamName(existing: string[]): string {
  const nums = existing.map((n) => /^Team\s+(\d+)$/i.exec(n.trim())?.[1]).filter((x): x is string => !!x).map(Number);
  return `Team ${nums.length > 0 ? Math.max(...nums) + 1 : existing.length + 1}`;
}
