// The BIR Lab's tax engine: pure functions, no React, no I/O. Amounts are integer centavos.
// Forms and answer keys both call these, so a key can never disagree with the form.
import { RULES, type Bracket } from "../rules/2026";

export type Centavos = number;

/** Typed text ("1,250,000", "₱1,250,000.50") to centavos; blank or unreadable is 0. */
export function amt(text: string | undefined): Centavos {
  if (!text) return 0;
  const s = text.replace(/[₱,\s]/g, "");
  if (!/^-?\d*\.?\d*$/.test(s) || s === "" || s === "-" || s === ".") return 0;
  const neg = s.startsWith("-");
  const [w = "0", f = ""] = (neg ? s.slice(1) : s).split(".");
  const c = Number(w || "0") * 100 + Number((f + "00").slice(0, 2)) + (f.length > 2 && Number(f[2]) >= 5 ? 1 : 0);
  return neg ? -c : c;
}

/** True when the text has centavos other than ".00". */
export const hasCentavos = (text: string | undefined): boolean => !!text && amt(text) % 100 !== 0;

/** "49 centavos or less drop down; 50 or more round up", as printed on the form. Negative amounts mirror. */
export const roundToPeso = (c: Centavos): Centavos => (c < 0 ? -Math.floor((-c + 50) / 100) * 100 : Math.floor((c + 50) / 100) * 100);

export const pesos = (c: Centavos): number => c / 100;
export const money = (c: Centavos, decimals = true): string =>
  (c < 0 ? "-" : "") + (Math.abs(c) / 100).toLocaleString("en-PH", { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: decimals ? 2 : 0 });

/** The bracket table for a taxable year: 2018-2022 use Table 1, 2023 onwards Table 2. */
export const bracketsFor = (year: number): Bracket[] => (year >= 2023 ? RULES.individualTable2023.brackets : RULES.individualTable2018.brackets);

/** Graduated income tax on taxable income (centavos), whole pesos. */
export function graduatedTax(taxable: Centavos, year: number): Centavos {
  if (taxable <= 0) return 0;
  const table = bracketsFor(year);
  let b = table[0];
  for (const row of table) if (taxable > row.over * 100) b = row;
  return roundToPeso(b.base * 100 + Math.round((taxable - b.over * 100) * b.rate));
}

/** 8% of taxable income, never below zero. */
export const eightPercentTax = (taxable: Centavos): Centavos => (taxable <= 0 ? 0 : roundToPeso(Math.round(taxable * RULES.eightPercent.rate)));

/** 40% OSD on net sales (item 38). */
export const optionalStandardDeduction = (netSales: Centavos): Centavos => roundToPeso(Math.round(Math.max(netSales, 0) * RULES.osd.rate));

export type Classification = "micro" | "small" | "medium" | "large";
export function classify(grossSales: Centavos): Classification {
  const c = RULES.classification;
  if (grossSales < c.microBelow * 100) return "micro";
  if (grossSales < c.smallBelow * 100) return "small";
  if (grossSales < c.mediumBelow * 100) return "medium";
  return "large";
}

// ---- dates (ISO yyyy-mm-dd)
const toUtc = (iso: string): number => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
export const daysBetween = (fromIso: string, toIso: string): number => Math.round((toUtc(toIso) - toUtc(fromIso)) / 86_400_000);
export const isIso = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUtc(s));
/** "MM/DD/YYYY" typed on the form to ISO; empty string when it is not a real date. */
export function usToIso(us: string | undefined): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(us ?? "");
  if (!m) return "";
  const iso = `${m[3]}-${m[1]}-${m[2]}`;
  return isIso(iso) && new Date(toUtc(iso)).getUTCMonth() + 1 === Number(m[1]) ? iso : "";
}
export const isoToUs = (iso: string): string => (isIso(iso) ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : "");

/** Due date of the annual return of an individual for a taxable year: April 15 of the next year. */
export function annualReturnDue(year: number): string {
  const r = RULES.annualIndividualDue;
  return `${year + 1}-${String(r.month).padStart(2, "0")}-${String(r.day).padStart(2, "0")}`;
}

export interface Penalties { late: boolean; days: number; surcharge: Centavos; interest: Centavos; klass: Classification; surchargeRate: number; interestRate: number }

/**
 * Surcharge and interest on an amount payable, for a return filed after its due date.
 * General rule 25% / 12% a year; micro and small taxpayers 10% / 6% (EOPT). Interest runs by the day over 365.
 */
export function penaltiesFor(payable: Centavos, dueIso: string, filedIso: string | undefined, klass: Classification, willful = false): Penalties {
  const days = isIso(filedIso) && isIso(dueIso) ? daysBetween(dueIso, filedIso) : 0;
  const late = days > 0 && payable > 0;
  const small = klass === "micro" || klass === "small";
  const surchargeRate = small ? RULES.penalties.microSmall.surcharge : willful ? RULES.penalties.general.willfulSurcharge : RULES.penalties.general.surcharge;
  const interestRate = small ? RULES.penalties.microSmall.interest : RULES.penalties.general.interest;
  if (!late) return { late: false, days: Math.max(days, 0), surcharge: 0, interest: 0, klass, surchargeRate, interestRate };
  return { late, days, klass, surchargeRate, interestRate, surcharge: roundToPeso(Math.round(payable * surchargeRate)), interest: roundToPeso(Math.round((payable * interestRate * days) / 365)) };
}

// ---- identifiers
/** TIN as printed on the form: 3-3-3 digits then the 5-digit branch code. */
export const isTin = (s: string | undefined): boolean => /^\d{3}-\d{3}-\d{3}-\d{5}$/.test(s ?? "");
export const isRdo = (s: string | undefined): boolean => /^\d{3}$/.test(s ?? "");
export const isEmail = (s: string | undefined): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s ?? "");
