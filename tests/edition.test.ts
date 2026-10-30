import test from "node:test";
import assert from "node:assert/strict";
import { guardTarget, isMfgPath, isAisPath, mfgTwin, standardTwin, NEUTRAL_PATHS, EDITION_LABEL } from "../src/lib/edition.ts";

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

test("the Manufacturing master data and costing screens belong to the Manufacturing workspace only", () => {
  for (const p of ["/mfg/master", "/mfg/master/bom/new", "/mfg/master/bom/0b1c", "/mfg/master/routing/9f2", "/mfg/costing", "/mfg/costing/4d2e", "/mfg/purchasing", "/mfg/inventory", "/mfg/production", "/mfg/production/77ab", "/mfg/shipping", "/mfg/planning", "/mfg/quality", "/mfg/shopfloor", "/mfg/period", "/mfg/analytics", "/mfg/compare"]) {
    assert.equal(isMfgPath(p), true, p);
    assert.equal(guardTarget("MANUFACTURING", p), null, p);
    assert.equal(guardTarget("STANDARD", p), "/dashboard", p);   // no Standard twin
  }
});

// ---------- the third edition: Accounting Information Systems ----------

test("AIS route detection does not confuse look-alike prefixes", () => {
  assert.equal(isAisPath("/ais"), true);
  assert.equal(isAisPath("/ais/inbox"), true);
  assert.equal(isAisPath("/ais/teams"), true);
  assert.equal(isAisPath("/aisle"), false);
  assert.equal(isAisPath("/ais-setup"), false);
  assert.equal(isAisPath("/mfg/ais"), false);
});

test("an AIS company is kept inside /ais and every other page sends it there", () => {
  assert.equal(guardTarget("AIS", "/ais"), null);
  assert.equal(guardTarget("AIS", "/ais/ledger"), null);
  assert.equal(guardTarget("AIS", "/dashboard"), "/ais");
  assert.equal(guardTarget("AIS", "/sales"), "/ais");
  assert.equal(guardTarget("AIS", "/mfg"), "/ais");
  assert.equal(guardTarget("AIS", "/mfg/finance"), "/ais");
  assert.equal(guardTarget("AIS", "/teacher"), "/ais");
});

test("Standard and Manufacturing companies are sent out of /ais", () => {
  assert.equal(guardTarget("STANDARD", "/ais"), "/dashboard");
  assert.equal(guardTarget("STANDARD", "/ais/inbox"), "/dashboard");
  assert.equal(guardTarget("MANUFACTURING", "/ais"), "/mfg");
  assert.equal(guardTarget("MANUFACTURING", "/ais/ledger"), "/mfg");
});

test("managing companies and messages work in the AIS edition too", () => {
  for (const p of NEUTRAL_PATHS) assert.equal(guardTarget("AIS", p), null);
});

test("adding the third edition changed nothing for Standard and Manufacturing", () => {
  assert.equal(guardTarget("STANDARD", "/sales"), null);
  assert.equal(guardTarget("MANUFACTURING", "/mfg/sales"), null);
  assert.equal(guardTarget("MANUFACTURING", "/sales"), "/mfg/sales");
  assert.equal(guardTarget("STANDARD", "/mfg/finance"), "/financials");
  assert.equal(EDITION_LABEL.STANDARD, "JJ and Co. ERP");
  assert.equal(EDITION_LABEL.MANUFACTURING, "JJ and Co. Manufacturing ERP");
  assert.equal(EDITION_LABEL.AIS, "JJ and Co. Accounting Information Systems");
});

test("redirects never loop for any edition", () => {
  const paths = ["/dashboard", "/financials", "/sales", "/hr", "/mfg", "/mfg/finance", "/mfg/teams", "/ais", "/ais/inbox", "/ais/teams", "/companies", "/teacher", "/choose"];
  for (const edition of ["STANDARD", "MANUFACTURING", "AIS"] as const) {
    for (const p of paths) {
      const target = guardTarget(edition, p);
      if (target) assert.equal(guardTarget(edition, target), null, `${edition} ${p} -> ${target} must be final`);
    }
  }
});
