import test from "node:test";
import assert from "node:assert/strict";
import { blankLine, canPost, isControlCode, jvTypeLabel, linesForSave, totals, typeAmount, type DraftLine } from "../src/lib/mfgVouchers.ts";

const L = (account_id: string, debit: string, credit: string, extra: Partial<DraftLine> = {}): DraftLine => ({ ...blankLine(), account_id, debit, credit, ...extra });
const none = { override: false, overrideReason: "", controlUsed: false };

test("typing a debit clears the credit on that line, and typing a credit clears the debit", () => {
  let l = L("a", "", "250");
  l = typeAmount(l, "debit", "100");
  assert.equal(l.debit, "100");
  assert.equal(l.credit, "");
  l = typeAmount(l, "credit", "40");
  assert.equal(l.credit, "40");
  assert.equal(l.debit, "");
  // clearing a field does not wipe the other side
  l = typeAmount(L("a", "", "75"), "debit", "");
  assert.equal(l.credit, "75");
});

test("the balance bar adds only lines that have an account and an amount", () => {
  const t = totals([L("a", "1000", ""), L("b", "", "600"), L("", "", ""), L("c", "", "400.004")]);
  assert.equal(t.debit, 1000);
  assert.equal(t.credit, 1000);
  assert.equal(t.balanced, true);
  assert.equal(t.filled, 3);
  const off = totals([L("a", "1000", ""), L("b", "", "600")]);
  assert.equal(off.diff, 400);
  assert.equal(off.balanced, false);
});

test("Post stays off until the voucher balances with two lines and a total above zero", () => {
  assert.equal(canPost([L("a", "100", "")], none).ok, false);
  assert.match(canPost([L("a", "100", "")], none).reason ?? "", /at least two lines/);
  assert.match(canPost([L("a", "100", ""), L("b", "", "60")], none).reason ?? "", /differ by 40\.00/);
  assert.equal(canPost([L("a", "100", ""), L("b", "", "100")], none).ok, true);
  assert.match(canPost([L("a", "100", ""), L("", "", "100")], none).reason ?? "", /Line 2 has an amount but no account/);
  assert.equal(canPost([L("a", "0", ""), L("b", "", "0")], none).ok, false);
});

test("a control account needs an override with a reason of ten characters", () => {
  const lines = [L("rm", "500", ""), L("cash", "", "500")];
  assert.match(canPost(lines, { override: false, overrideReason: "", controlUsed: true }).reason ?? "", /control account/);
  assert.match(canPost(lines, { override: true, overrideReason: "short", controlUsed: true }).reason ?? "", /ten characters/);
  assert.equal(canPost(lines, { override: true, overrideReason: "Auditor found a count difference", controlUsed: true }).ok, true);
});

test("the control accounts a company starts with are recognised by code", () => {
  for (const c of ["1100", "1200", "1210", "1220", "1230", "2000", "2050", "5700"]) assert.equal(isControlCode(c), true, c);
  for (const c of ["1000", "5100", "2100", "4000", null, undefined, ""]) assert.equal(isControlCode(c as string), false, String(c));
});

test("lines are sent to the database as numbers, with empty lines left out", () => {
  const out = linesForSave([L("a", "1000", "", { description: " SSS employer ", cost_center_id: "cc1" }), L("", "", ""), L("b", "", "1000")]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { account_id: "a", debit: 1000, credit: 0, cost_center_id: "cc1", order_id: null, description: "SSS employer" });
  assert.deepEqual(out[1], { account_id: "b", debit: 0, credit: 1000, cost_center_id: null, order_id: null, description: null });
});

test("voucher kinds have readable names", () => {
  assert.equal(jvTypeLabel("ACCRUAL"), "Accrual");
  assert.equal(jvTypeLabel("REVERSING"), "Reversing entry");
  assert.equal(jvTypeLabel(null), "General / adjusting");
});
