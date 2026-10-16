import test from "node:test";
import assert from "node:assert/strict";
import { checkDecision, decisionSummary, inSpec, planRowsSchema, resultsSchema, specText, type DecisionInput } from "../src/lib/mfgQuality.ts";

test("a value is in specification between the limits, and either limit can be missing", () => {
  assert.equal(inSpec(9.5, 8, 12), true);
  assert.equal(inSpec(8, 8, 12), true);
  assert.equal(inSpec(12.0001, 8, 12), false);
  assert.equal(inSpec(98, 100, null), false);
  assert.equal(inSpec(1000, 100, null), true);
  assert.equal(inSpec(6, null, 5), false);
});

test("the specification reads in plain words", () => {
  assert.equal(specText(8, 12, "%"), "8 – 12 %");
  assert.equal(specText(100, null, "mm"), "at least 100 mm");
  assert.equal(specText(null, 5), "at most 5");
  assert.equal(specText(null, null), "—");
});

test("an inspection plan needs a name and a limit on each line, and no repeats", () => {
  const ok = [{ characteristic: "Moisture", unit: "%", spec_min: "8", spec_max: "12" }, { characteristic: "Length", unit: "", spec_min: "100", spec_max: "" }];
  const r = planRowsSchema.safeParse(ok);
  assert.equal(r.success, true);
  assert.deepEqual(r.success && r.data[1], { characteristic: "Length", unit: null, spec_min: 100, spec_max: null });
  assert.match(String(planRowsSchema.safeParse([{ characteristic: "A", spec_min: "", spec_max: "" }]).error?.issues[0].message), /minimum, a maximum, or both/);
  assert.match(String(planRowsSchema.safeParse([{ characteristic: "A", spec_min: "9", spec_max: "3" }]).error?.issues[0].message), /minimum can't be above/);
  assert.match(String(planRowsSchema.safeParse([{ characteristic: "A", spec_min: "1" }, { characteristic: "a", spec_max: "2" }]).error?.issues[0].message), /listed twice/);
  assert.match(String(planRowsSchema.safeParse([{ characteristic: " ", spec_min: "1" }]).error?.issues[0].message), /Name every/);
});

test("measured values must be numbers and there must be at least one", () => {
  assert.equal(resultsSchema.safeParse([{ characteristic: "Moisture", value: "9.5" }]).success, true);
  assert.equal(resultsSchema.safeParse([]).success, false);
  assert.equal(resultsSchema.safeParse([{ characteristic: "Moisture", value: "abc" }]).success, false);
});

const base: DecisionInput = { lotQty: 100, accept: "100", scrap: "", ret: "", rework: "", cause: "", note: "", outOfSpec: 0, missing: 0, canReturn: true };

test("a decision is checked the same way the database checks it", () => {
  assert.equal(checkDecision(base), null);
  assert.match(String(checkDecision({ ...base, accept: "50" })), /add up to the whole lot.*holds 100.*entered 50/);
  assert.match(String(checkDecision({ ...base, accept: "-5", scrap: "105" })), /can't be negative/);
  assert.match(String(checkDecision({ ...base, missing: 2 })), /2 still missing/);
  assert.match(String(checkDecision({ ...base, outOfSpec: 1 })), /1 result is outside the specification/);
  assert.match(String(checkDecision({ ...base, outOfSpec: 2 })), /2 results are outside/);
  assert.equal(checkDecision({ ...base, outOfSpec: 1, note: "Cosmetic only" }), null);
  assert.match(String(checkDecision({ ...base, accept: "90", scrap: "10" })), /root cause/);
  assert.equal(checkDecision({ ...base, accept: "90", scrap: "10", cause: "MACHINE" }), null);
  assert.match(String(checkDecision({ ...base, accept: "90", ret: "10", cause: "SUPPLIER", canReturn: false })), /Only goods bought from a vendor/);
  assert.match(String(checkDecision({ ...base, accept: "x" })), /must be a number/);
});

test("a decision summary lists only what was done", () => {
  assert.equal(decisionSummary({ qty_accept: 60, qty_scrap: 10, qty_return: 20, qty_rework: 10 }), "Accepted 60 · Scrapped 10 · Returned 20 · Rework 10");
  assert.equal(decisionSummary({ qty_accept: 8, qty_scrap: 2, qty_return: 0, qty_rework: 0 }), "Accepted 8 · Scrapped 2");
});
