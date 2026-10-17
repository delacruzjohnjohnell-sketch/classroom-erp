import test from "node:test";
import assert from "node:assert/strict";
import { acct, allocationText, blocks, infos, monthAction, monthEnd, monthLabel, monthStart, tiesOut, warnings, type PeriodCheck, type PeriodRow } from "../src/lib/mfgPeriod.ts";

const row = (start: string, status: PeriodRow["status"], entries = 5): PeriodRow => ({
  period_start: start, period_end: monthEnd(start), status, entries, settled_at: null, closed_at: null, to_cogs: 0, to_wip: 0, to_fg: 0,
});

test("months are named and bounded", () => {
  assert.equal(monthLabel("2026-11-01"), "November 2026");
  assert.equal(monthStart("2026-11-17"), "2026-11-01");
  assert.equal(monthEnd("2026-11-17"), "2026-11-30");
  assert.equal(monthEnd("2028-02-10"), "2028-02-29");     // a leap year
  assert.equal(monthEnd("2026-12-01"), "2026-12-31");
});

test("a statement puts deductions in brackets and shows zero plainly", () => {
  assert.equal(acct(45864), "45,864.00");
  assert.equal(acct(-2936), "(2,936.00)");
  assert.equal(acct(0), "0.00");
  assert.equal(acct(-0.001), "0.00");
  assert.equal(acct("1619.39"), "1,619.39");
  assert.equal(acct(null), "0.00");
});

test("the checks are grouped by how serious they are", () => {
  const checks: PeriodCheck[] = [
    { code: "EARLIER_OPEN", severity: "block", message: "x", n: 1 },
    { code: "QC_WAITING", severity: "warn", message: "y", n: 2 },
    { code: "GRIR", severity: "info", message: "z", n: 1 },
  ];
  assert.deepEqual(blocks(checks).map((c) => c.code), ["EARLIER_OPEN"]);
  assert.deepEqual(warnings(checks).map((c) => c.code), ["QC_WAITING"]);
  assert.deepEqual(infos(checks).map((c) => c.code), ["GRIR"]);
});

test("two figures that differ by a few centavos still tie out", () => {
  assert.equal(tiesOut({ diff: 0 }), true);
  assert.equal(tiesOut({ diff: -0.05 }), true);
  assert.equal(tiesOut({ diff: 0.5 }), false);
});

test("months are settled and closed oldest first", () => {
  const rows = [row("2026-12-01", "OPEN"), row("2026-11-01", "SETTLED"), row("2026-10-01", "CLOSED"), row("2026-09-01", "CLOSED")];
  assert.equal(monthAction(rows, "2026-09-01"), "none");        // done
  assert.equal(monthAction(rows, "2026-11-01"), "close");       // October is closed, so November can be closed
  assert.equal(monthAction(rows, "2026-12-01"), "none");        // November is not closed yet
  const open = [row("2026-12-01", "OPEN"), row("2026-11-01", "OPEN"), row("2026-10-01", "CLOSED")];
  assert.equal(monthAction(open, "2026-11-01"), "settle");
  assert.equal(monthAction(open, "2026-12-01"), "none");
  assert.equal(monthAction(open, "2025-01-01"), "none");        // not in the list
});

test("an older month with no activity does not hold a newer one back", () => {
  const rows = [row("2026-11-01", "OPEN"), row("2026-10-01", "OPEN", 0)];
  assert.equal(monthAction(rows, "2026-11-01"), "settle");
});

test("the allocation sentence follows the method", () => {
  assert.match(allocationText("COGS", 0, 0, 4256), /All of it goes to cost of goods sold \(4,256.00\)/);
  assert.match(allocationText("PRORATE", 129.74, 1619.39, 2506.87), /work in process 129.74, finished goods 1,619.39, cost of goods sold 2,506.87/);
});
