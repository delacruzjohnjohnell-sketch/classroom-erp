import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runMfgPracticeChecks, summarizeMfg, netIncome, type MfgSnapshot, type MfgPracticeSet } from "../src/lib/mfgPracticeCheck.ts";

// The snapshot is a real run of Practice Set 1 (supabase/tests/mfg_practice_set1_key.sql) read by mfg_practice_snapshot.
const MFG_SET_1: MfgPracticeSet = JSON.parse(readFileSync(new URL("./fixtures/mfgPracticeSet1.definition.json", import.meta.url), "utf8"));
const key = (): MfgSnapshot => JSON.parse(readFileSync(new URL("./fixtures/mfgPracticeSet1.snapshot.json", import.meta.url), "utf8"));

test("the answer-key run passes every check of Set 1", () => {
  const results = runMfgPracticeChecks(key(), MFG_SET_1);
  const bad = results.filter((r) => !r.pass).map((r) => `${r.group} / ${r.label}: expected ${r.expected}, found ${r.actual}`);
  assert.deepEqual(bad, []);
  assert.ok(results.length > 50);
});

test("the net profit in the summary is the ledger's", () => {
  assert.equal(netIncome(key().gl), 10105.95);
  assert.ok(MFG_SET_1.summary.includes("10,105.95"));
});

test("the set's own balances are a balanced ledger", () => {
  const sum = MFG_SET_1.balances.reduce((a, b) => a + b.amount, 0);
  assert.ok(Math.abs(sum) < 0.005);
});

test("an empty company fails nearly everything but does not crash", () => {
  const empty: MfgSnapshot = {
    company: "x", vendors: [], customers: [], employees: [], work_centers: [], rates: [], oh_rate: null, items: [], boms: [], routings: [], estimates_released: [],
    purchase_orders: [], vendor_invoices: [], orders: [], invoices: [], gl: {}, vouchers: { manual_posted: 0, total_manual_amount: 0 }, periods: [],
  };
  const s = summarizeMfg(runMfgPracticeChecks(empty, MFG_SET_1));
  assert.ok(s.failed > 50);
  assert.ok(s.passed < 5);
});

test("each kind of slip is caught with a hint", () => {
  const find = (snap: MfgSnapshot, label: string) => runMfgPracticeChecks(snap, MFG_SET_1).find((r) => r.label === label)!;

  const a = key(); a.invoices[0].date = "2026-11-24";
  const inv = find(a, "Invoice of ₱35,728.00");
  assert.equal(inv.pass, false);
  assert.match(inv.hint ?? "", /invoice date/);

  const b = key(); b.gl["1100"] = 24000;
  const ar = find(b, "1100 Accounts Receivable");
  assert.equal(ar.pass, false);
  assert.match(ar.hint ?? "", /unpaid/);

  const c = key(); c.periods = [{ period: "2026-11", status: "SETTLED" }];
  assert.equal(find(c, "Month 2026-11").pass, false);

  const d = key(); d.boms[0].lines![1].qty = 2;
  assert.equal(find(d, "Bill of materials BSK-LD").pass, false);

  const e = key(); e.gl["9999"] = 12;
  assert.equal(find(e, "9999").pass, false);   // an account the set never touches must be nil

  const f = key(); f.items.find((i) => i.sku === "RAT-STR")!.qty = 33;
  assert.equal(find(f, "RAT-STR").pass, false);
});
