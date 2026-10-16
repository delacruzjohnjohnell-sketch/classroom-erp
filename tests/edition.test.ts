import test from "node:test";
import assert from "node:assert/strict";
import { guardTarget, isMfgPath, mfgTwin, standardTwin, NEUTRAL_PATHS } from "../src/lib/edition.ts";

test("every reused Standard page has a Manufacturing twin and back again", () => {
  const pairs: [string, string][] = [
    ["/dashboard", "/mfg"], ["/financials", "/mfg/finance"], ["/sales", "/mfg/sales"], ["/banking", "/mfg/banking"],
    ["/fixed-assets", "/mfg/fixed-assets"], ["/hr", "/mfg/payroll"], ["/reports", "/mfg/reports"],
  ];
  for (const [std, mfg] of pairs) {
    assert.equal(mfgTwin(std), mfg, `${std} -> ${mfg}`);
    assert.equal(standardTwin(mfg), std, `${mfg} -> ${std}`);
  }
});

test("Standard pages with no Manufacturing screen yet fall back to the Manufacturing overview", () => {
  assert.equal(mfgTwin("/procurement"), "/mfg");
  assert.equal(mfgTwin("/inventory"), "/mfg");
  assert.equal(mfgTwin("/teacher"), "/mfg");
});

test("a longer Manufacturing path is not mistaken for the overview", () => {
  assert.equal(standardTwin("/mfg"), "/dashboard");
  assert.equal(standardTwin("/mfg/finance"), "/financials");
  assert.equal(standardTwin("/mfg/settings"), "/dashboard");   // no Standard twin
});

test("route detection does not confuse look-alike prefixes", () => {
  assert.equal(isMfgPath("/mfg"), true);
  assert.equal(isMfgPath("/mfg/finance"), true);
  assert.equal(isMfgPath("/mfg-setup"), false);
  assert.equal(isMfgPath("/mfgx"), false);
  assert.equal(mfgTwin("/hr/payslip/abc"), "/mfg/payroll");     // sub-pages follow their parent
  assert.equal(mfgTwin("/hrx"), "/mfg");
});

test("a Standard company is kept on Standard pages and a Manufacturing company on /mfg pages", () => {
  assert.equal(guardTarget("STANDARD", "/sales"), null);
  assert.equal(guardTarget("MANUFACTURING", "/mfg/sales"), null);
  assert.equal(guardTarget("MANUFACTURING", "/sales"), "/mfg/sales");
  assert.equal(guardTarget("MANUFACTURING", "/inventory"), "/mfg");
  assert.equal(guardTarget("STANDARD", "/mfg/finance"), "/financials");
  assert.equal(guardTarget("STANDARD", "/mfg"), "/dashboard");
});

test("managing companies works in either edition and never redirects", () => {
  for (const p of NEUTRAL_PATHS) {
    assert.equal(guardTarget("STANDARD", p), null);
    assert.equal(guardTarget("MANUFACTURING", p), null);
  }
});

test("redirects never loop: the target is always acceptable to the same edition", () => {
  const paths = ["/dashboard", "/financials", "/procurement", "/inventory", "/sales", "/banking", "/fixed-assets", "/hr", "/reports",
    "/mfg", "/mfg/finance", "/mfg/sales", "/mfg/banking", "/mfg/fixed-assets", "/mfg/payroll", "/mfg/reports", "/mfg/settings", "/companies"];
  for (const edition of ["STANDARD", "MANUFACTURING"] as const) {
    for (const p of paths) {
      const target = guardTarget(edition, p);
      if (target) assert.equal(guardTarget(edition, target), null, `${edition} ${p} -> ${target} must be final`);
    }
  }
});
