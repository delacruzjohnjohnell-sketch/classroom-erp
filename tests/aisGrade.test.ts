import test from "node:test";
import assert from "node:assert/strict";
import { pct, heatColor, rate, detectionRate, deskAccuracy, deskReading, classSummary, gradebookCsv, type GradeRow, type DeskRow } from "../src/lib/aisGrade.ts";

const row = (o: Partial<GradeRow>): GradeRow => ({
  tenant_id: "t", company: "Co", set_id: "s", set_title: "Revenue cycle", mode: "AFTER_CLOSE", phase: "CLOSED", members: [{ name: "Ana Cruz", seats: ["ACCOUNTING", "AUDIT"] }], created_at: "2027-01-01",
  desk_points: 66, desk_max: 78, desk_decided: 13, desk_total: 13, audit_points: 126, audit_max: 166, audit_planted: 21, audit_found: 21, audit_wrong_type: 0, audit_missed: 0, audit_false_positives: 0, findings: 21, ...o,
});

test("percentages round and refuse to divide by nothing", () => {
  assert.equal(pct(66, 78), 85);
  assert.equal(pct(0, 78), 0);
  assert.equal(pct(5, 0), null);
  assert.equal(pct(null, 100), null);
  assert.equal(pct(undefined, 100), null);
});

test("heat colours run from red to green and are absent without data", () => {
  assert.equal(heatColor(null), null);
  assert.match(heatColor(0)!, /^hsla\(0,/);
  assert.match(heatColor(1)!, /^hsla\(130,/);
  assert.equal(heatColor(5), heatColor(1));          // clamped
  assert.equal(heatColor(-1), heatColor(0));
  assert.equal(heatColor(Number.NaN), null);
});

test("detection and desk accuracy", () => {
  assert.equal(rate(1, 0), null);
  assert.equal(detectionRate({ exception_type: "X", label: "X", planted_n: 12, found_n: 6, wrong_type_n: 0, missed_n: 6, companies_n: 2 }), 0.5);
  const hold: DeskRow = { seq: 3, key_decision: "HOLD", failed_control: "CREDIT_LIMIT", docs: 4, posted: 1, held_right: 2, held_other: 1, avg_points: 3.5 };
  const post: DeskRow = { seq: 1, key_decision: "POST", failed_control: null, docs: 4, posted: 3, held_right: 0, held_other: 1, avg_points: 5 };
  assert.equal(deskAccuracy(hold), 0.5);              // right = held for the right control
  assert.equal(deskAccuracy(post), 0.75);             // right = posted
  assert.equal(deskAccuracy({ ...post, docs: 0 }), null);
});

test("what fooled the class is said in words", () => {
  assert.equal(deskReading({ seq: 1, key_decision: "HOLD", failed_control: "SOD", docs: 0, posted: 0, held_right: 0, held_other: 0, avg_points: null }), "Nobody has decided this one yet.");
  assert.equal(deskReading({ seq: 1, key_decision: "HOLD", failed_control: "SOD", docs: 4, posted: 0, held_right: 4, held_other: 0, avg_points: 6 }), "Everyone held it for the right reason.");
  assert.equal(deskReading({ seq: 1, key_decision: "HOLD", failed_control: "SOD", docs: 4, posted: 1, held_right: 2, held_other: 1, avg_points: 3 }), "25% posted it although a control had failed; 25% held it but named a different control.");
  assert.equal(deskReading({ seq: 13, key_decision: "POST", failed_control: null, docs: 4, posted: 4, held_right: 0, held_other: 0, avg_points: 6 }), "Everyone posted it, as they should.");
  assert.equal(deskReading({ seq: 13, key_decision: "POST", failed_control: null, docs: 4, posted: 3, held_right: 0, held_other: 1, avg_points: 4.5 }), "25% held a valid document.");
});

test("the class summary averages only what is finished", () => {
  const rows = [row({}), row({ company: "B", desk_points: 78, audit_points: 0, audit_max: 150 }), row({ company: "C", phase: "ACCOUNTING", desk_decided: 0, desk_points: 0, audit_points: null, audit_max: null })];
  assert.deepEqual(classSummary(rows), { companies: 3, started: 2, finished: 2, avgDeskPct: 93, avgAuditPct: 38 });   // desk (85+100)/2; audit (76+0)/2
  assert.deepEqual(classSummary([]), { companies: 0, started: 0, finished: 0, avgDeskPct: null, avgAuditPct: null });
});

test("the CSV is one header and one row per company, with awkward characters quoted", () => {
  const csv = gradebookCsv([row({ company: 'Sinag "A", Section 1', members: [{ name: "Ana Cruz", seats: ["ACCOUNTING", "AUDIT"] }, { name: "Ben", seats: [] }] }), row({ company: "C", phase: "ACCOUNTING", audit_points: null, audit_max: null, audit_planted: null, audit_found: null, audit_wrong_type: null, audit_missed: null, audit_false_positives: null })]);
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith("Company,Members,Practice set"));
  assert.ok(lines[1].startsWith('"Sinag ""A"", Section 1",Ana Cruz (accounting+audit); Ben (no seat),Revenue cycle,Graded,Finished,13,13,66,78,85,126,166,76,21,21,0,0,0,21'));
  assert.ok(lines[2].startsWith("C,Ana Cruz (accounting+audit),Revenue cycle,Graded,Accounting,13,13,66,78,85,,,,,,,,,21"));
});
