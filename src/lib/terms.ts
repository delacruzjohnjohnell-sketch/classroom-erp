// Payment terms: pick "Net 30" and the due date is worked out from the document
// date, instead of asking students to do date arithmetic.

export const TERMS = [
  { key: "0", label: "Due on receipt", days: 0 },
  { key: "7", label: "Net 7", days: 7 },
  { key: "15", label: "Net 15", days: 15 },
  { key: "30", label: "Net 30", days: 30 },
  { key: "45", label: "Net 45", days: 45 },
  { key: "60", label: "Net 60", days: 60 },
] as const;

export const CUSTOM_TERMS = "custom";
export const DEFAULT_TERMS = "30";

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function dueFromTerms(dateStr: string, termsKey: string): string {
  const t = TERMS.find((x) => x.key === termsKey);
  return t ? addDays(dateStr, t.days) : "";
}

// Which terms option matches an existing due date, or "custom" if none does.
export function termsFor(dateStr: string, due: string | null | undefined): string {
  if (!due) return CUSTOM_TERMS;
  const hit = TERMS.find((t) => addDays(dateStr, t.days) === due);
  return hit ? hit.key : CUSTOM_TERMS;
}
