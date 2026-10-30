// Pure helpers for the two ERP editions. No imports, so they run in the unit tests.
//
// A company belongs to exactly one edition. The Standard ERP lives at the top-level routes
// (/dashboard, /sales, …); the Manufacturing ERP lives under /mfg. A few Standard screens are
// reused inside the Manufacturing workspace (they work on whichever company is active), so each has
// a "twin" path under /mfg.

export type Edition = "STANDARD" | "MANUFACTURING" | "AIS";

// [Standard path, Manufacturing path] — only screens that exist in the Manufacturing workspace.
const TWINS: [string, string][] = [
  ["/dashboard", "/mfg"],
  ["/financials", "/mfg/finance"],
  ["/sales", "/mfg/sales"],
  ["/banking", "/mfg/banking"],
  ["/fixed-assets", "/mfg/fixed-assets"],
  ["/hr", "/mfg/payroll"],
  ["/reports", "/mfg/reports"],
];

// Pages that work the same in either edition (managing your companies).
export const NEUTRAL_PATHS = ["/companies", "/messages"];

export const isMfgPath = (pathname: string) => pathname === "/mfg" || pathname.startsWith("/mfg/");
/** The Accounting Information Systems workspace (/ais/...). Has no Standard twin: it is its own workspace. */
export const isAisPath = (pathname: string) => pathname === "/ais" || pathname.startsWith("/ais/");

const matches = (pathname: string, base: string) => pathname === base || pathname.startsWith(base + "/");

/** The Manufacturing page that corresponds to a Standard page ("/mfg" when there isn't one). */
export function mfgTwin(pathname: string): string {
  const hit = TWINS.find(([std]) => matches(pathname, std));
  return hit ? hit[1] : "/mfg";
}

/** The Standard page that corresponds to a Manufacturing page ("/dashboard" when there isn't one). */
export function standardTwin(pathname: string): string {
  // longest base first, so "/mfg/finance" is not mistaken for "/mfg"
  const hit = [...TWINS].sort((a, b) => b[1].length - a[1].length).find(([, mfg]) => matches(pathname, mfg));
  return hit ? hit[0] : "/dashboard";
}

/**
 * Where a signed-in person on `pathname` should be sent, given the active company's edition.
 * null = the page is right for this company.
 */
export function guardTarget(edition: Edition, pathname: string): string | null {
  if (NEUTRAL_PATHS.some((p) => matches(pathname, p))) return null;
  if (edition === "AIS") return isAisPath(pathname) ? null : "/ais";
  if (isAisPath(pathname)) return edition === "MANUFACTURING" ? "/mfg" : "/dashboard";
  if (edition === "MANUFACTURING" && !isMfgPath(pathname)) return mfgTwin(pathname);
  if (edition === "STANDARD" && isMfgPath(pathname)) return standardTwin(pathname);
  return null;
}

export const EDITION_LABEL: Record<Edition, string> = {
  STANDARD: "JJ and Co. ERP",
  MANUFACTURING: "JJ and Co. Manufacturing ERP",
  AIS: "JJ and Co. Accounting Information Systems",
};
