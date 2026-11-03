// Builds adjusting entries: accruals, deferrals (asset vs expense method, liability vs income method), depreciation, supplies and uncollectibles.
// Every builder returns a ready JournalEntry (stage "adjusting") tagged with the adjustment letter.
import { createEntry, cr, dr } from "./journalizer";
import { percentOf, roundDiv, sum, type Centavos } from "../lib/currency";
import type { AdjustmentType, JournalEntry, JournalLine } from "./types";

interface Base { date: string; tag: string; explanation?: string }

function make(b: Base, adjType: AdjustmentType, lines: JournalLine[], fallback: string): JournalEntry {
  const e = createEntry({ date: b.date, kind: "general", lines, explanation: b.explanation ?? fallback }, { stage: "adjusting", tag: b.tag });
  return { ...e, adjType };
}

/** Expense incurred but not yet paid or recorded (salaries, interest, utilities). */
export const accruedExpense = (b: Base & { expenseCode: string; payableCode: string; amount: Centavos }) =>
  make(b, "accrued-expense", [dr(b.expenseCode, b.amount), cr(b.payableCode, b.amount)], "To record the accrued expense.");

/** Revenue earned but not yet billed or collected. */
export const accruedRevenue = (b: Base & { receivableCode: string; revenueCode: string; amount: Centavos }) =>
  make(b, "accrued-revenue", [dr(b.receivableCode, b.amount), cr(b.revenueCode, b.amount)], "To record the accrued revenue.");

/**
 * Prepaid expense. Asset method: the payment was debited to the prepaid asset, so `amount` is the part that EXPIRED (Dr expense, Cr prepaid).
 * Expense method: the payment was debited to expense, so `amount` is the part still UNEXPIRED (Dr prepaid, Cr expense).
 */
export function prepaid(b: Base & { method: "asset" | "expense"; expenseCode: string; prepaidCode: string; amount: Centavos }) {
  return b.method === "asset"
    ? make(b, "prepaid-asset", [dr(b.expenseCode, b.amount), cr(b.prepaidCode, b.amount)], "To record the expired portion of the prepayment.")
    : make(b, "prepaid-expense", [dr(b.prepaidCode, b.amount), cr(b.expenseCode, b.amount)], "To record the unexpired portion of the prepayment.");
}

/** Part of a prepayment that has expired after `monthsElapsed` of `monthsTotal`. */
export const expiredPortion = (total: Centavos, monthsTotal: number, monthsElapsed: number): Centavos => roundDiv(total * monthsElapsed, monthsTotal);

/**
 * Unearned revenue. Liability method: cash was credited to Unearned Revenue, so `amount` is the part now EARNED (Dr unearned, Cr revenue).
 * Income method: cash was credited to revenue, so `amount` is the part still UNEARNED (Dr revenue, Cr unearned).
 */
export function unearned(b: Base & { method: "liability" | "income"; unearnedCode?: string; revenueCode?: string; amount: Centavos }) {
  const u = b.unearnedCode ?? "230", r = b.revenueCode ?? "401";
  return b.method === "liability"
    ? make(b, "unearned-liability", [dr(u, b.amount), cr(r, b.amount)], "To record the revenue earned during the period.")
    : make(b, "unearned-income", [dr(r, b.amount), cr(u, b.amount)], "To record the revenue still unearned.");
}

/** Straight-line depreciation for `months` months: (cost − salvage) ÷ life, rounded to the centavo. */
export const straightLine = (cost: Centavos, salvage: Centavos, lifeMonths: number, months = 1): Centavos => {
  if (lifeMonths <= 0) throw new Error("Useful life must be more than zero.");
  return roundDiv((cost - salvage) * months, lifeMonths);
};

export const depreciation = (b: Base & { expenseCode: string; accumulatedCode: string; amount: Centavos }) =>
  make(b, "depreciation", [dr(b.expenseCode, b.amount), cr(b.accumulatedCode, b.amount)], "To record depreciation for the period.");

/** Supplies used = supplies available (beginning + purchases) − supplies on hand by count. */
export function suppliesUsed(b: Base & { suppliesCode: string; expenseCode?: string; available: Centavos; onHand: Centavos }) {
  const used = b.available - b.onHand;
  return make(b, "supplies", [dr(b.expenseCode ?? "604", used), cr(b.suppliesCode, used)], "To record the supplies used.");
}

/** Allowance needed under the percentage-of-receivables method. */
export const allowanceByPercent = (receivables: Centavos, ratePercent: number): Centavos => percentOf(receivables, ratePercent);

/** Allowance needed under the aging method: each bucket's balance times its own rate. */
export const allowanceByAging = (buckets: { amount: Centavos; ratePercent: number }[]): Centavos => sum(buckets.map((x) => percentOf(x.amount, x.ratePercent)));

/**
 * Uncollectible accounts expense. `existingAllowance` is the allowance's credit balance before adjusting (negative when it has a debit balance).
 * Returns null when the allowance is already large enough.
 */
export function uncollectible(b: Base & { requiredAllowance: Centavos; existingAllowance?: Centavos }): JournalEntry | null {
  const amount = b.requiredAllowance - (b.existingAllowance ?? 0);
  if (amount <= 0) return null;
  return make(b, "uncollectible", [dr("607", amount), cr("110-A", amount)], "To record the estimated uncollectible accounts.");
}
