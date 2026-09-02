// Philippine statutory payroll deductions.
//
// IMPORTANT: These rates are based on published 2023–2024 tables (SSS 2023
// contribution schedule, PhilHealth 5% premium rate, Pag-IBIG standard rates,
// and the TRAIN law withholding tax table). Philippine law revises these
// periodically — verify against current SSS/PhilHealth/Pag-IBIG/BIR issuances
// before relying on this for real payroll. This is built for teaching the
// *structure* of Philippine payroll accounting, not as a certified calculator.

export type PayPeriod = "monthly" | "semi_first" | "semi_second";

export type PayrollBreakdown = {
  employeeId: string;
  employeeName: string;
  payPeriod: PayPeriod;
  gross: number;
  sssEE: number;
  sssER: number;
  philhealthEE: number;
  philhealthER: number;
  pagibigEE: number;
  pagibigER: number;
  withholdingTax: number;
  loanDeduction: number;
  netPay: number;
};

// ---------- SSS (2023 contribution table, simplified brackets) ----------
// Based on Monthly Salary Credit brackets. Employee share ~4.5%, employer ~9.5% (approx totals).
const SSS_BRACKETS: { max: number; ee: number; er: number }[] = [
  { max: 4250, ee: 180, er: 380 },
  { max: 4750, ee: 202.5, er: 427.5 },
  { max: 5250, ee: 225, er: 475 },
  { max: 5750, ee: 247.5, er: 522.5 },
  { max: 6250, ee: 270, er: 570 },
  { max: 6750, ee: 292.5, er: 617.5 },
  { max: 7250, ee: 315, er: 665 },
  { max: 7750, ee: 337.5, er: 712.5 },
  { max: 8250, ee: 360, er: 760 },
  { max: 8750, ee: 382.5, er: 807.5 },
  { max: 9250, ee: 405, er: 855 },
  { max: 9750, ee: 427.5, er: 902.5 },
  { max: 10250, ee: 450, er: 950 },
  { max: 10750, ee: 472.5, er: 997.5 },
  { max: 11250, ee: 495, er: 1045 },
  { max: 11750, ee: 517.5, er: 1092.5 },
  { max: 12250, ee: 540, er: 1140 },
  { max: 12750, ee: 562.5, er: 1187.5 },
  { max: 13250, ee: 585, er: 1235 },
  { max: 13750, ee: 607.5, er: 1282.5 },
  { max: 14250, ee: 630, er: 1330 },
  { max: 14750, ee: 652.5, er: 1377.5 },
  { max: 15250, ee: 675, er: 1425 },
  { max: 15750, ee: 697.5, er: 1472.5 },
  { max: 16250, ee: 720, er: 1520 },
  { max: 16750, ee: 742.5, er: 1567.5 },
  { max: 17250, ee: 765, er: 1615 },
  { max: 17750, ee: 787.5, er: 1662.5 },
  { max: 18250, ee: 810, er: 1710 },
  { max: 18750, ee: 832.5, er: 1757.5 },
  { max: 19250, ee: 855, er: 1805 },
  { max: 19750, ee: 877.5, er: 1852.5 },
  { max: 20250, ee: 900, er: 1900 },
  { max: 20750, ee: 922.5, er: 1947.5 },
  { max: 21250, ee: 945, er: 1995 },
  { max: 21750, ee: 967.5, er: 2042.5 },
  { max: 22250, ee: 990, er: 2090 },
  { max: 22750, ee: 1012.5, er: 2137.5 },
  { max: 23250, ee: 1035, er: 2185 },
  { max: 23750, ee: 1057.5, er: 2232.5 },
  { max: 24250, ee: 1080, er: 2280 },
  { max: 24750, ee: 1102.5, er: 2327.5 },
  { max: 25250, ee: 1125, er: 2375 },
  { max: 25750, ee: 1147.5, er: 2422.5 },
  { max: 26250, ee: 1170, er: 2470 },
  { max: 26750, ee: 1192.5, er: 2517.5 },
  { max: 27250, ee: 1215, er: 2565 },
  { max: 27750, ee: 1237.5, er: 2612.5 },
  { max: 28250, ee: 1260, er: 2660 },
  { max: 28750, ee: 1282.5, er: 2707.5 },
  { max: 29250, ee: 1305, er: 2755 },
  { max: 29750, ee: 1327.5, er: 2802.5 },
  { max: Infinity, ee: 1350, er: 2850 }, // ceiling
];

export function computeSSS(monthlySalary: number): { ee: number; er: number } {
  const bracket = SSS_BRACKETS.find((b) => monthlySalary <= b.max) ?? SSS_BRACKETS[SSS_BRACKETS.length - 1];
  return { ee: bracket.ee, er: bracket.er };
}

// ---------- PhilHealth (2024: 5% of monthly basic salary, split 50/50) ----------
const PHILHEALTH_RATE = 0.05;
const PHILHEALTH_FLOOR_SALARY = 10000;
const PHILHEALTH_CEILING_SALARY = 100000;

export function computePhilHealth(monthlySalary: number): { ee: number; er: number } {
  const base = Math.min(Math.max(monthlySalary, PHILHEALTH_FLOOR_SALARY), PHILHEALTH_CEILING_SALARY);
  const total = base * PHILHEALTH_RATE;
  return { ee: round2(total / 2), er: round2(total / 2) };
}

// ---------- Pag-IBIG / HDMF (standard rates, capped at ₱10,000 base) ----------
const PAGIBIG_CAP_BASE = 10000;

export function computePagIBIG(monthlySalary: number): { ee: number; er: number } {
  const base = Math.min(monthlySalary, PAGIBIG_CAP_BASE);
  const eeRate = base <= 1500 ? 0.01 : 0.02;
  const erRate = 0.02;
  return { ee: round2(base * eeRate), er: round2(base * erRate) };
}

// ---------- Withholding tax (BIR TRAIN law, monthly table, simplified) ----------
const WTAX_BRACKETS: { max: number; base: number; rate: number; excessOver: number }[] = [
  { max: 20833, base: 0, rate: 0, excessOver: 0 },
  { max: 33332, base: 0, rate: 0.15, excessOver: 20833 },
  { max: 66666, base: 1875, rate: 0.2, excessOver: 33333 },
  { max: 166666, base: 13541.8, rate: 0.25, excessOver: 66667 },
  { max: 666666, base: 90841.8, rate: 0.3, excessOver: 166667 },
  { max: Infinity, base: 240841.8, rate: 0.35, excessOver: 666667 },
];

export function computeWithholdingTax(taxableIncome: number): number {
  return computeWithholdingTaxForPeriod(taxableIncome, 1);
}

// scale = 1 for monthly, 0.5 for semi-monthly (halves the monthly bracket
// thresholds and base tax, keeping the same marginal rates — an approximation
// of BIR's separate semi-monthly table, not the official one).
export function computeWithholdingTaxForPeriod(taxableIncome: number, scale: number): number {
  const bracket = WTAX_BRACKETS.find((b) => taxableIncome <= b.max * scale) ?? WTAX_BRACKETS[WTAX_BRACKETS.length - 1];
  if (bracket.rate === 0) return 0;
  return round2(bracket.base * scale + (taxableIncome - bracket.excessOver * scale) * bracket.rate);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function computePayrollCore(
  employeeId: string, employeeName: string, gross: number, monthlySalaryForBrackets: number,
  payPeriod: PayPeriod, loanDeduction: number
): PayrollBreakdown {
  const isSemi = payPeriod !== "monthly";

  // SSS/PhilHealth/Pag-IBIG are withheld once per month, on the second cutoff for
  // semi-monthly pay — not split across both halves, matching common PH practice.
  const withholdStatutory = payPeriod !== "semi_first";
  const sss = withholdStatutory ? computeSSS(monthlySalaryForBrackets) : { ee: 0, er: 0 };
  const philhealth = withholdStatutory ? computePhilHealth(monthlySalaryForBrackets) : { ee: 0, er: 0 };
  const pagibig = withholdStatutory ? computePagIBIG(monthlySalaryForBrackets) : { ee: 0, er: 0 };

  const totalEEContributions = sss.ee + philhealth.ee + pagibig.ee;
  const taxableIncome = Math.max(0, gross - (withholdStatutory ? totalEEContributions : 0));
  const withholdingTax = computeWithholdingTaxForPeriod(taxableIncome, isSemi ? 0.5 : 1);

  // Loan installments are also collected on the second cutoff (paired with statutory dues).
  const appliedLoanDeduction = payPeriod === "semi_first" ? 0 : loanDeduction;
  const netPay = round2(gross - totalEEContributions - withholdingTax - appliedLoanDeduction);

  return {
    employeeId, employeeName, payPeriod, gross,
    sssEE: sss.ee, sssER: sss.er,
    philhealthEE: philhealth.ee, philhealthER: philhealth.er,
    pagibigEE: pagibig.ee, pagibigER: pagibig.er,
    withholdingTax, loanDeduction: appliedLoanDeduction, netPay,
  };
}

export function computePayrollForPeriod(
  employeeId: string, employeeName: string, annualSalary: number,
  payPeriod: PayPeriod, loanDeduction: number = 0
): PayrollBreakdown {
  const isSemi = payPeriod !== "monthly";
  const gross = round2(annualSalary / (isSemi ? 24 : 12));
  const monthlySalaryForBrackets = round2(annualSalary / 12);
  return computePayrollCore(employeeId, employeeName, gross, monthlySalaryForBrackets, payPeriod, loanDeduction);
}

// Hourly employees: gross pay comes directly from hours actually logged in the pay
// period × their rate, not a fixed salary divided into periods. Statutory contribution
// brackets are based on an implied monthly-equivalent figure (gross scaled up to a full
// month) since SSS/PhilHealth/Pag-IBIG brackets are defined in monthly terms.
export function computeHourlyPayrollForPeriod(
  employeeId: string, employeeName: string, hourlyRate: number, hoursWorked: number,
  payPeriod: PayPeriod, loanDeduction: number = 0
): PayrollBreakdown {
  const isSemi = payPeriod !== "monthly";
  const gross = round2(hourlyRate * hoursWorked);
  const monthlySalaryForBrackets = round2(isSemi ? gross * 2 : gross);
  return computePayrollCore(employeeId, employeeName, gross, monthlySalaryForBrackets, payPeriod, loanDeduction);
}

export function computeMonthlyPayroll(employeeId: string, employeeName: string, annualSalary: number): PayrollBreakdown {
  return computePayrollForPeriod(employeeId, employeeName, annualSalary, "monthly", 0);
}

// Date range for a given pay period, anchored to the current month.
export function getPeriodDateRange(payPeriod: PayPeriod): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const lastDay = new Date(y, m + 1, 0).getDate();

  if (payPeriod === "semi_first") return { start: fmt(new Date(y, m, 1)), end: fmt(new Date(y, m, 15)) };
  if (payPeriod === "semi_second") return { start: fmt(new Date(y, m, 16)), end: fmt(new Date(y, m, lastDay)) };
  return { start: fmt(new Date(y, m, 1)), end: fmt(new Date(y, m, lastDay)) };
}
