import test from "node:test";
import assert from "node:assert/strict";
import { TESTS, typeForTest, findingProblem, emptyFinding, reversalDate, benfordRows, scoreSentence } from "../src/lib/aisAudit.ts";

test("every test has a plain-language explanation and the right finding type", () => {
  assert.equal(TESTS.length, 7);
  for (const t of TESTS) assert.ok(t.what.length > 40, `${t.kind} explains itself`);
  assert.equal(typeForTest("DUPLICATE"), "DUP_INVOICE");
  assert.equal(typeForTest("ROUND"), "ROUND_AMOUNT");
  assert.equal(typeForTest("WEEKEND"), "WEEKEND_POSTING");
  assert.equal(typeForTest("AFTER_HOURS"), "WEEKEND_POSTING");
  assert.equal(typeForTest("JUST_BELOW"), "JUST_BELOW_LIMIT");
  assert.equal(typeForTest("GAP"), "SEQUENCE_GAP");
  assert.equal(typeForTest("BENFORD"), "");                       // Benford only points to where to look
});

test("test parameters have sensible defaults", () => {
  const by = Object.fromEntries(TESTS.map((t) => [t.kind, t]));
  assert.deepEqual(by.ROUND.params.map((p) => [p.key, p.default]), [["mod", 10000]]);
  assert.deepEqual(by.JUST_BELOW.params.map((p) => [p.key, p.default]), [["limit", 150000], ["band_pct", 5]]);
  assert.deepEqual(by.AFTER_HOURS.params.map((p) => [p.key, p.default]), [["from_hour", 6], ["to_hour", 21]]);
});

test("a finding needs a type and a real sentence", () => {
  const f = emptyFinding();
  assert.match(findingProblem(f), /type of exception/);
  assert.match(findingProblem({ ...f, type: "SOD", condition: "short" }), /Describe the condition/);
  assert.equal(findingProblem({ ...f, type: "SOD", condition: "Invoice prepared and approved by one person." }), "");
});

test("a reversal is dated the day after the books were locked, across month and year ends", () => {
  assert.equal(reversalDate("2027-01-31"), "2027-02-01");
  assert.equal(reversalDate("2027-02-28"), "2027-03-01");
  assert.equal(reversalDate("2027-12-31"), "2028-01-01");
  assert.equal(reversalDate("2028-02-28"), "2028-02-29");         // leap year
  assert.match(reversalDate(null), /^\d{4}-\d{2}-\d{2}$/);
});

test("Benford rows flag a digit only when it is well away from what is expected", () => {
  const expected = [0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046];
  const even = expected.map((e, i) => ({ digit: i + 1, actual: Math.round(e * 300), actual_pct: e, expected_pct: e }));
  assert.ok(benfordRows(even, 300).every((r) => !r.look && r.diffPts === 0));
  const skewed = even.map((d) => (d.digit === 1 ? { ...d, actual_pct: 0.4, actual: 120 } : d));
  const rows = benfordRows(skewed, 300);
  assert.equal(rows[0].look, true);
  assert.equal(rows[0].diffPts, 9.9);
  assert.equal(rows[1].look, false);
  assert.ok(benfordRows(even, 0).every((r) => !r.look));          // no entries, nothing to say
});

test("the score reads in words", () => {
  assert.equal(scoreSentence({ visible: false }), "The score appears when you close the audit.");
  assert.equal(scoreSentence({ visible: true, planted: 0 }), "There was nothing planted to find in this company.");
  assert.equal(
    scoreSentence({ visible: true, points: 111, max: 166, planted: 21, found: 18, wrong_type: 1, missed: 2, false_positives: 1 }),
    "You scored 111 of 166 (67%). 18 of 21 exceptions found with the right type, 1 found under the wrong type, 2 missed, 1 reported that were not planted.");
  assert.equal(scoreSentence({ visible: true, points: 48, max: 48, planted: 6, found: 6, wrong_type: 0, missed: 0, false_positives: 0 }), "You scored 48 of 48 (100%). 6 of 6 exceptions found with the right type.");
});
