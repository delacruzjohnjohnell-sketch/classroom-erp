import test from "node:test";
import assert from "node:assert/strict";
import { PRACTICE_SETS, DEFAULT_PRACTICE_SET_ID } from "../src/lib/practiceCheck.ts";

test("practice sets have unique ids and the default exists", () => {
  const ids = PRACTICE_SETS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(DEFAULT_PRACTICE_SET_ID));
});

test("every set's due-date specs refer to invoices and bills the set actually has", () => {
  const cents = (n: number) => Math.round(n * 100);
  for (const s of PRACTICE_SETS) {
    for (const spec of s.invoiceDue ?? []) {
      assert.ok(s.invoiceTotals.some((t) => cents(t) === cents(spec.total)), `${s.id}: no invoice of ${spec.total}`);
      assert.match(spec.due, /^\d{4}-\d{2}-\d{2}$/);
    }
    if (s.openBillDue) {
      assert.match(s.openBillDue, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(s.billTotals.some((t) => cents(t) === cents(s.openBillTotal)), `${s.id}: open bill is not among its bills`);
    }
  }
});

test("the two-month set pins its four invoice due dates and Bill-004's due date", () => {
  const s = PRACTICE_SETS.find((x) => x.id === "nov-dec-2026")!;
  assert.equal(s.invoiceDue?.length, 4);
  assert.equal(s.openBillDue, "2026-12-25");
});

test("each set's ledger balances net to its stated net income", () => {
  for (const s of PRACTICE_SETS) {
    const revenue = s.balances.filter((b) => b.code.startsWith("4")).reduce((t, b) => t + (b.side === "cr" ? b.amount : -b.amount), 0);
    const expenses = s.balances.filter((b) => b.code.startsWith("5")).reduce((t, b) => t + (b.side === "dr" ? b.amount : -b.amount), 0);
    assert.ok(Math.abs(revenue - expenses - s.expectedNetIncome) < 0.02, `${s.id}: ${revenue - expenses} vs ${s.expectedNetIncome}`);
  }
});
