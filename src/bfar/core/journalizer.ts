// Validates and builds journal entries: every line has exactly one side, accounts exist, the date is real, an explanation is given, and ΣDr = ΣCr.
import { z } from "zod";
import { getAccount } from "./chart-of-accounts";
import { formatPeso, sum } from "../lib/currency";
import type { JournalEntry, JournalKind, JournalLine } from "./types";

const realDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export const lineSchema = z.object({
  accountCode: z.string().refine((c) => !!getAccount(c), { message: "Choose an account from the chart of accounts." }),
  debit: z.number().int("Amounts are in whole centavos.").min(0, "An amount cannot be negative."),
  credit: z.number().int("Amounts are in whole centavos.").min(0, "An amount cannot be negative."),
}).refine((l) => !(l.debit > 0 && l.credit > 0), { message: "A line is either a debit or a credit, not both." })
  .refine((l) => l.debit > 0 || l.credit > 0, { message: "Enter an amount on every line." });

export const entrySchema = z.object({
  date: z.string().refine(realDate, { message: "Enter a valid date." }),
  kind: z.enum(["general", "sales", "purchases", "cash-receipts", "cash-disbursements"]),
  lines: z.array(lineSchema).min(2, "An entry needs at least two lines."),
  explanation: z.string().trim().min(1, "Add a short explanation."),
});

export type EntryInput = z.input<typeof entrySchema>;

export const totalDebits = (lines: JournalLine[]) => sum(lines.map((l) => l.debit));
export const totalCredits = (lines: JournalLine[]) => sum(lines.map((l) => l.credit));

export const balanceMessage = (lines: JournalLine[]): string | null => {
  const d = totalDebits(lines), c = totalCredits(lines);
  return d === c ? null : `Debits (${formatPeso(d)}) do not equal Credits (${formatPeso(c)})`;
};

export interface Validation { ok: boolean; errors: string[] }

export function validateEntry(input: unknown): Validation {
  const parsed = entrySchema.safeParse(input);
  const errors: string[] = [];
  if (!parsed.success) {
    for (const i of parsed.error.issues) errors.push(i.message);
    return { ok: false, errors: [...new Set(errors)] };
  }
  const msg = balanceMessage(parsed.data.lines);
  if (msg) errors.push(msg);
  return { ok: errors.length === 0, errors };
}

const REF: Record<JournalKind, string> = { general: "GJ", sales: "SJ", purchases: "PJ", "cash-receipts": "CRJ", "cash-disbursements": "CDJ" };
export const journalRef = (kind: JournalKind) => REF[kind];

let counter = 0;
export function createEntry(input: EntryInput, extra: Pick<Partial<JournalEntry>, "stage" | "tag" | "id"> = {}): JournalEntry {
  const v = validateEntry(input);
  if (!v.ok) throw new Error(v.errors.join(" "));
  const e = entrySchema.parse(input);
  counter += 1;
  return { id: extra.id ?? `je-${Date.now().toString(36)}-${counter}`, ...e, stage: extra.stage ?? "transaction", tag: extra.tag };
}

/** Shorthand for building lines in tests and practice sets (amounts in centavos). */
export const dr = (accountCode: string, amount: number): JournalLine => ({ accountCode, debit: amount, credit: 0 });
export const cr = (accountCode: string, amount: number): JournalLine => ({ accountCode, debit: 0, credit: amount });
