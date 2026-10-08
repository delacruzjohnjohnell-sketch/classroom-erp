import test from "node:test";
import assert from "node:assert/strict";
import { monthEnd, monthEndAfter, nextRecurringDate, isDateLocked, nextDepreciationDate } from "../src/lib/periods.ts";
import { addDays, dueFromTerms, termsFor, TERMS, CUSTOM_TERMS } from "../src/lib/terms.ts";

test("month-end handles leap years and year boundaries", () => {
  assert.equal(monthEnd("2026-02-10"), "2026-02-28");
  assert.equal(monthEnd("2028-02-10"), "2028-02-29");
  assert.equal(monthEnd("2026-11-02"), "2026-11-30");
  assert.equal(monthEndAfter("2026-11-02", 0), "2026-11-30");
  assert.equal(monthEndAfter("2026-11-02", 1), "2026-12-31");
  assert.equal(monthEndAfter("2026-11-02", 2), "2027-01-31");
  assert.equal(monthEndAfter("2026-11-02", 14), "2028-01-31");
});

// ---- book lock: only the closed past is blocked ----
test("the lock blocks the lock date and earlier, never later periods", () => {
  const lock = "2026-11-30";
  assert.equal(isDateLocked("2026-11-30", lock), true);   // the lock date itself
  assert.equal(isDateLocked("2026-10-15", lock), true);   // an earlier period
  assert.equal(isDateLocked("2026-12-01", lock), false);  // month 2 stays open
  assert.equal(isDateLocked("2027-03-15", lock), false);  // so does everything after
});

test("no lock means nothing is blocked", () => {
  assert.equal(isDateLocked("2020-01-01", null), false);
  assert.equal(isDateLocked("2026-11-30", undefined), false);
  assert.equal(isDateLocked("2026-11-30", ""), false);
});

// ---- recurring entries advance period by period ----
test("monthly rent advances one month at a time, clamping short months", () => {
  assert.equal(nextRecurringDate("2026-11-01", "monthly"), "2026-12-01");
  assert.equal(nextRecurringDate("2026-12-01", "monthly"), "2027-01-01");
  assert.equal(nextRecurringDate("2026-01-31", "monthly"), "2026-02-28");
  assert.equal(nextRecurringDate("2028-01-31", "monthly"), "2028-02-29");
  assert.equal(nextRecurringDate("2026-05-31", "monthly"), "2026-06-30");
});

test("consecutive rent postings walk through consecutive periods", () => {
  let due = "2026-11-01";
  const posted: string[] = [];
  for (let i = 0; i < 4; i++) { posted.push(due); due = nextRecurringDate(due, "monthly"); }
  assert.deepEqual(posted, ["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"]);
  // with the books locked through Nov 30, only the first posting is refused
  assert.deepEqual(posted.map((d) => isDateLocked(d, "2026-11-30")), [true, false, false, false]);
});

test("weekly entries advance seven days", () => {
  assert.equal(nextRecurringDate("2026-12-28", "weekly"), "2027-01-04");
});

test("depreciation defaults to the next unrecorded month-end", () => {
  assert.equal(nextDepreciationDate("2026-11-02", 0), "2026-11-30");
  assert.equal(nextDepreciationDate("2026-11-02", 1), "2026-12-31");
  assert.equal(nextDepreciationDate("2026-11-02", 2), "2027-01-31");
});

// ---- retroactive dates and payment terms ----
test("payment terms work out due dates from any document date, past or future", () => {
  assert.equal(dueFromTerms("2026-11-10", "15"), "2026-11-25");
  assert.equal(dueFromTerms("2026-11-13", "7"), "2026-11-20");
  assert.equal(dueFromTerms("2026-11-10", "0"), "2026-11-10");
  assert.equal(dueFromTerms("2019-01-20", "30"), "2019-02-19");   // retroactive
  assert.equal(dueFromTerms("2026-12-20", "30"), "2027-01-19");   // across a year end
  assert.equal(addDays("2028-02-27", 2), "2028-02-29");
});

test("an existing due date maps back to its terms, or to a custom date", () => {
  assert.equal(termsFor("2026-11-10", "2026-11-25"), "15");
  assert.equal(termsFor("2026-11-24", "2026-12-14"), CUSTOM_TERMS);   // 20 days is not a standard term
  assert.equal(termsFor("2026-11-10", null), CUSTOM_TERMS);
  for (const t of TERMS) assert.equal(termsFor("2026-06-01", dueFromTerms("2026-06-01", t.key)), t.key);
});
