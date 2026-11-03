// The filing calendar: every due date of a taxable year for each kind of taxpayer, computed from the rules file (so it moves when a rule moves) and
// labelled with whether the date was verified against an official BIR document or comes from the Code / the course table only.
import { RULES } from "../rules/2026";
import { addDays, dayOfNextMonth, lastDay, ymd } from "./dates";

export type Audience = "individual" | "employee" | "employer" | "corporation" | "vat" | "nonvat" | "withholding";
export const AUDIENCES: { id: Audience; label: string }[] = [
  { id: "individual", label: "Individual in business or profession" },
  { id: "employee", label: "Employee" },
  { id: "employer", label: "Employer" },
  { id: "corporation", label: "Corporation / partnership" },
  { id: "vat", label: "VAT-registered" },
  { id: "nonvat", label: "Non-VAT (percentage tax)" },
  { id: "withholding", label: "Withholding agent (expanded)" },
];

export interface CalendarEvent { date: string; form: string; what: string; audiences: Audience[]; verified: boolean; source: string }
export interface TransactionRule { form: string; rule: string; verified: boolean }

const Q_END = [[3, 31], [6, 30], [9, 30], [12, 31]] as const;

/** Every dated obligation of a calendar-year taxpayer for taxable year `year` (dates fall in `year` and `year + 1`), earliest first. */
export function calendarFor(year: number): CalendarEvent[] {
  const ev: CalendarEvent[] = [];
  const add = (date: string, form: string, what: string, audiences: Audience[], verified: boolean, source: string) => ev.push({ date, form, what, audiences, verified, source });
  const q = RULES.quarterlyIndividualDue.dates;
  const ind: Audience[] = ["individual"];
  add(`${year}-${q[1]}`, "1701Q", "First quarter income tax return", ind, RULES.quarterlyIndividualDue.verified, "Guidelines of Form 1701Q");
  add(`${year}-${q[2]}`, "1701Q", "Second quarter income tax return", ind, true, "Guidelines of Form 1701Q");
  add(`${year}-${q[3]}`, "1701Q", "Third quarter income tax return", ind, true, "Guidelines of Form 1701Q");
  const aMonth = RULES.annualIndividualDue.month, aDay = RULES.annualIndividualDue.day;
  add(ymd(year + 1, aMonth, aDay), "1701 / 1701A / 1701-MS", "Annual income tax return of the self-employed", ind, true, "BIR forms page; Guide of 1701-MS");
  add(ymd(year + 1, aMonth, aDay), "1700", "Annual income tax return of the employee without substituted filing", ["employee"], true, "BIR forms page for Form 1700");
  add(ymd(year + 1, RULES.certificateDue.form2316Month, RULES.certificateDue.form2316Day), "2316", "Employer gives employees the certificate of compensation and tax withheld", ["employer", "employee"], RULES.certificateDue.verified, "The course table (not printed on the PDF)");
  add(ymd(year + 1, RULES.informationReturnDue.form1604C.month, RULES.informationReturnDue.form1604C.day), "1604-C", "Annual information return of tax withheld on compensation", ["employer"], RULES.informationReturnDue.verified, "The course table (not printed on the PDF)");
  add(ymd(year + 1, RULES.informationReturnDue.form1604E.month, RULES.informationReturnDue.form1604E.day), "1604-E", "Annual information return of expanded withholding", ["withholding"], true, "BIR guidance for Form 1604-E");
  for (let m = 1; m <= 12; m++) {
    const due = dayOfNextMonth(year, m, m === 12 ? RULES.withholdingDue.decemberCompensationDay : RULES.withholdingDue.monthlyDay);
    add(due, "1601-C", `Compensation withholding for ${m}/${year}`, ["employer"], true, "Guidelines of Form 1601-C");
    if (m % 3 !== 0) add(dayOfNextMonth(year, m, RULES.withholdingDue.monthlyDay), "0619-E", `Expanded withholding remittance for ${m}/${year} (first two months of the quarter)`, ["withholding"], true, "Guidelines of Form 0619-E");
  }
  Q_END.forEach(([m, d], i) => {
    const end = ymd(year, m, d);
    const nm = m === 12 ? 1 : m + 1, ny = m === 12 ? year + 1 : year;
    add(ymd(ny, nm, lastDay(ny, nm)), "1601-EQ", `Expanded withholding, quarter ${i + 1}`, ["withholding"], true, "Guide of Form 1601-EQ");
    add(addDays(end, RULES.vat.dueDays), "2550Q", `Quarterly VAT, quarter ${i + 1}`, ["vat"], true, "Guidelines of Form 2550Q");
    add(addDays(end, RULES.percentageTax.dueDays), "2551Q", `Quarterly percentage tax, quarter ${i + 1}`, ["nonvat"], RULES.percentageTax.verified, "NIRC Sec. 128 (not printed on the PDF)");
    add(addDays(end, RULES.certificateDue.form2307Days), "2307", `Certificates of creditable tax withheld, quarter ${i + 1}`, ["withholding", "individual", "corporation"], RULES.certificateDue.verified, "RR 11-2018 (20 days after the quarter)");
    if (i < 3) add(addDays(end, RULES.corporateDue.quarterlyDays), "1702Q", `Corporate quarterly income tax, quarter ${i + 1}`, ["corporation"], true, "Guidelines of Form 1702Q");
  });
  add(ymd(year + 1, RULES.corporateDue.annualMonthsAfterYearEnd, RULES.corporateDue.annualDay), "1702-RT / 1702-EX / 1702-MX", "Annual income tax return of a calendar-year corporation", ["corporation"], true, "BIR forms page for Form 1702");
  return ev.sort((a, b) => a.date.localeCompare(b.date) || a.form.localeCompare(b.form));
}

/** Deadlines that run from an event (a sale, a gift, a death, a document) instead of the calendar. */
export const TRANSACTION_RULES: TransactionRule[] = [
  { form: "1706", rule: "Capital gains tax on real property (capital asset): within 30 days after each sale.", verified: RULES.capitalGains.verified },
  { form: "1707", rule: "Capital gains tax on unlisted shares: within 30 days after each sale (Guidelines of Form 1707).", verified: true },
  { form: "1606", rule: "Withholding on a sale of an ordinary-asset real property: the 10th day of the month after the transaction (taught; not printed on the PDF).", verified: RULES.realPropertyWithholding.verified },
  { form: "2000", rule: "Monthly documentary stamp tax: the 5th day after the end of the month (taught; not printed on the PDF).", verified: RULES.dst.verified },
  { form: "2000-OT", rule: "Documentary stamp tax on a one-time transaction: the 5th day after the end of the month of the transaction (taught; not printed on the PDF).", verified: RULES.dst.verified },
  { form: "1800", rule: "Donor's tax: within 30 days after each gift (Code Sec. 103; the form could not be downloaded).", verified: RULES.donorTax.verified },
  { form: "1801", rule: "Estate tax: within one year from the date of death (Code Sec. 90; not printed on the PDF).", verified: false },
];
