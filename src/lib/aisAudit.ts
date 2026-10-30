// Pure helpers for the AIS Audit room: the tests on offer, how a finding is filled in, dates for a reversal, and how the audit is scored in words.
// No imports, so the unit tests can load this file directly. The database decides for real (ais_save_finding, ais_reverse_finding, the scoring).

export type TestKind = "DUPLICATE" | "ROUND" | "WEEKEND" | "AFTER_HOURS" | "JUST_BELOW" | "GAP" | "BENFORD";

export type TestParam = { key: string; label: string; default: number };
export type TestDef = { kind: TestKind; label: string; what: string; findingType: string | null; params: TestParam[] };

export const TESTS: TestDef[] = [
  { kind: "DUPLICATE", label: "Duplicates", what: "Entries for the same customer and the same amount within 7 days of an earlier one. A duplicate sale or payment overstates the books.", findingType: "DUP_INVOICE", params: [] },
  { kind: "ROUND", label: "Round amounts", what: "Amounts that are an exact multiple of a round number. Real sales rarely land on 50,000.00 exactly; estimates and made-up entries do.", findingType: "ROUND_AMOUNT", params: [{ key: "mod", label: "Multiple of", default: 10000 }] },
  { kind: "WEEKEND", label: "Weekend postings", what: "Entries created on a Saturday or Sunday. Posting outside working days can mean someone is hiding activity.", findingType: "WEEKEND_POSTING", params: [] },
  { kind: "AFTER_HOURS", label: "After-hours postings", what: "Entries created before the first or after the last working hour.", findingType: "WEEKEND_POSTING", params: [{ key: "from_hour", label: "Day starts at (hour)", default: 6 }, { key: "to_hour", label: "Day ends at (hour)", default: 21 }] },
  { kind: "JUST_BELOW", label: "Just below the approval limit", what: "Amounts that sit just under the limit where a manager's approval is needed: a sign someone is avoiding review.", findingType: "JUST_BELOW_LIMIT", params: [{ key: "limit", label: "Approval limit", default: 150000 }, { key: "band_pct", label: "Within % below", default: 5 }] },
  { kind: "GAP", label: "Gaps in invoice numbers", what: "Invoice numbers that are missing from the running sequence. A missing document may be a deleted sale or an unrecorded one.", findingType: "SEQUENCE_GAP", params: [] },
  { kind: "BENFORD", label: "Benford first digits", what: "Compares how often each leading digit appears with what Benford's law predicts. A screening tool: it needs about 300 entries and points to where to look, it proves nothing alone.", findingType: null, params: [] },
];

export const SEVERITIES = ["LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_TONE: Record<Severity, string> = { LOW: "#7F8EA0", MODERATE: "#F2B13C", HIGH: "#FF8A4C", CRITICAL: "#FF6B7A" };

export type FindingForm = {
  entryId: string; type: string; condition: string; criteria: string; cause: string; effect: string; recommendation: string; severity: Severity; workpaperId: string;
};
export const emptyFinding = (): FindingForm => ({ entryId: "", type: "", condition: "", criteria: "", cause: "", effect: "", recommendation: "", severity: "MODERATE", workpaperId: "" });

/** Why a finding cannot be saved yet, in words ("" when it can). */
export function findingProblem(f: FindingForm): string {
  if (!f.type) return "Choose the type of exception.";
  if (f.condition.trim().length < 10) return "Describe the condition: what you found, in at least a sentence.";
  return "";
}

/** The exception type a test points to, for pre-filling the finding form. */
export function typeForTest(kind: TestKind): string {
  return TESTS.find((t) => t.kind === kind)?.findingType ?? "";
}

/** The first day a reversal may be dated: the day after the books were locked (the closed period cannot take new entries). */
export function reversalDate(lockDate: string | null | undefined): string {
  if (!lockDate) return new Date().toISOString().slice(0, 10);
  const d = new Date(lockDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export type BenfordDigit = { digit: number; actual: number; actual_pct: number; expected_pct: number };
/** For the Benford table: how far each digit is from the expected share, in percentage points, and whether it is worth a look. */
export function benfordRows(digits: BenfordDigit[], n: number): { digit: number; actual: number; actualPct: number; expectedPct: number; diffPts: number; look: boolean }[] {
  return digits.map((d) => {
    const diff = Math.round((d.actual_pct - d.expected_pct) * 1000) / 10;
    // roughly two standard errors for a share of expected_pct among n entries
    const se = n > 0 ? Math.sqrt((d.expected_pct * (1 - d.expected_pct)) / n) : 1;
    return { digit: d.digit, actual: d.actual, actualPct: d.actual_pct, expectedPct: d.expected_pct, diffPts: diff, look: Math.abs(d.actual_pct - d.expected_pct) > 2 * se };
  });
}

export type AuditScore = {
  visible: boolean; points?: number; max?: number; planted?: number; found?: number; wrong_type?: number; missed?: number; false_positives?: number;
  details?: { type: string; entry_id: string | null; memo: string | null; status: "found" | "wrong_type" | "missed"; reversed: boolean }[];
  false_positive_details?: { type: string; memo: string | null; condition: string }[];
};

/** A one-line reading of the audit result. */
export function scoreSentence(s: AuditScore): string {
  if (!s.visible) return "The score appears when you close the audit.";
  const planted = s.planted ?? 0;
  if (planted === 0) return "There was nothing planted to find in this company.";
  const pct = s.max ? Math.round(((s.points ?? 0) / s.max) * 100) : 0;
  const parts = [`${s.found} of ${planted} exceptions found with the right type`];
  if (s.wrong_type) parts.push(`${s.wrong_type} found under the wrong type`);
  if (s.missed) parts.push(`${s.missed} missed`);
  if (s.false_positives) parts.push(`${s.false_positives} reported that were not planted`);
  return `You scored ${s.points} of ${s.max} (${pct}%). ${parts.join(", ")}.`;
}

export const STATUS_WORDS: Record<"found" | "wrong_type" | "missed", string> = { found: "Found", wrong_type: "Right entry, wrong type", missed: "Missed" };
