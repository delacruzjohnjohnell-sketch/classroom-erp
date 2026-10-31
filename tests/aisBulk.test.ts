import test from "node:test";
import assert from "node:assert/strict";
import { parseCompanyList, planOk } from "../src/lib/aisBulk.ts";

const students = [{ id: "1", full_name: "Ana Cruz" }, { id: "2", full_name: "Ben Reyes" }, { id: "3", full_name: "Carla Dizon" }, { id: "4", full_name: "Dan Lim" }, { id: "5", full_name: "Dan  Lim" }];

test("a pair, a solo with the audit left out, and a solo with the same name twice", () => {
  const p = parseCompanyList("Alpha Trading, Ana Cruz, Ben Reyes\nBeta Supply, Carla Dizon\nGamma Co, ana cruz, Ana Cruz", students.slice(0, 3));
  assert.equal(p.length, 3);
  assert.equal(p[0].solo, false); assert.equal(p[0].accounting?.id, "1"); assert.equal(p[0].audit?.id, "2"); assert.ok(planOk(p[0]));
  assert.equal(p[1].solo, true); assert.equal(p[1].audit?.id, "3"); assert.ok(planOk(p[1]));
  assert.equal(p[2].solo, true);
  assert.ok(p[2].errors.some((e) => /already in line 1/.test(e)), "Ana is already in the first company");
  assert.ok(!planOk(p[2]));
});

test("a header row and tab-separated cells copied from a spreadsheet are understood", () => {
  const p = parseCompanyList("Company\tAccounting\tAudit\nAlpha\tAna Cruz\tBen Reyes\n", students.slice(0, 2));
  assert.equal(p.length, 1); assert.equal(p[0].company, "Alpha"); assert.ok(planOk(p[0]));
});

test("unknown names, ambiguous names, duplicate companies and a missing accounting student are explained", () => {
  const p = parseCompanyList("Alpha, Zed Nobody, Ben Reyes\nBeta, Dan Lim\nAlpha, Carla Dizon\nDelta, , Ana Cruz", students);
  assert.match(p[0].errors.join(" "), /No student is called "Zed Nobody"/);
  assert.match(p[1].errors.join(" "), /More than one student is called "Dan Lim"/);
  assert.match(p[2].errors.join(" "), /in the list twice/);
  assert.match(p[3].errors.join(" "), /Name the Accounting student/);
  assert.ok(p.every((x) => !planOk(x)));
});

test("blank lines are skipped and names match regardless of case or extra spaces", () => {
  const p = parseCompanyList("\n  Omega ,  ben   reyes  \n\n", students.slice(0, 2));
  assert.equal(p.length, 1); assert.equal(p[0].accounting?.id, "2"); assert.ok(planOk(p[0]));
});
