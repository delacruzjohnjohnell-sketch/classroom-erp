// Pieces shared by the corporate annual returns (1702-RT, 1702-EX, 1702-MX): the page-1 identity rows, Schedule 1 (ordinary itemized deductions) and the due date.
import { RULES } from "../rules/2026";
import { f, fields, opts, radio, yes, type RowSpec } from "../forms/kit";
import type { Line } from "../forms/kit";
import type { Option, Row, Values } from "../forms/types";
import { parseMonth, ymd } from "./kit";

/** The annual corporate return is due the 15th day of the 4th month after the close of the taxable year (MM/YYYY is the month the year ends). */
export function corpAnnualDue(v: Values): string {
  const p = parseMonth(v["2"]);
  if (!p) return "";
  const [m, y] = p;
  const total = m + RULES.corporateDue.annualMonthsAfterYearEnd;
  return ymd(total > 12 ? y + 1 : y, total > 12 ? total - 12 : total, RULES.corporateDue.annualDay);
}

export const corpYear = (v: Values): number => parseMonth(v["2"])?.[1] ?? 0;

/** Items 1 to 13 of the 1702 annual forms. `atc` lists the ATCs printed on the form. */
export function corpIdentity(atc: Option[], methodLabel: string, extra: Row[] = []): Row[] {
  return [
    fields(f("1", "1", "For", "radio", { span: 4, options: opts(["calendar", "Calendar"], ["fiscal", "Fiscal"]), required: true }), f("2", "2", "Year Ended (MM/YYYY)", "monthyear", { span: 3, required: true }), yes("3", "3", "Amended Return?", 3), yes("4", "4", "Short Period Return?", 2)),
    radio("5", "5", "Alphanumeric Tax Code (ATC)", atc),
    fields(f("6", "6", "Taxpayer Identification Number (TIN)", "tin", { span: 7, required: true }), f("7", "7", "RDO Code", "rdo", { span: 5, required: true })),
    fields(f("8", "8", "Registered Name", "text", { span: 12, required: true })),
    fields(f("9", "9", "Registered Address", "text", { span: 9, required: true }), f("9A", "9A", "ZIP Code", "zip", { span: 3, required: true })),
    fields(f("10", "10", "Date of Incorporation/Organization (MM/DD/YYYY)", "date", { span: 4 }), f("11", "11", "Contact Number", "phone", { span: 3 }), f("12", "12", "Email Address", "email", { span: 5 })),
    radio("13", "13", methodLabel, opts(["itemized", "Itemized Deductions [Section 34 (A-J), NIRC]"], ["osd", "Optional Standard Deduction (OSD) - 40% of Gross Income [Section 34(L), NIRC]"])),
    ...extra,
  ];
}

export const CORP_REQUIRED = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "9A", "13"].map((id) => ({ id, message: `Item ${id} is required.` }));

const S1 = ["Amortizations", "Bad Debts", "Charitable and Other Contributions", "Depletion", "Depreciation", "Entertainment, Amusement and Recreation", "Fringe Benefits", "Interest", "Losses", "Pension Trusts", "Rental", "Research and Development", "Salaries, Wages and Allowances", "SSS, GSIS, Philhealth, HDMF and Other Contributions", "Taxes and Licenses", "Transportation and Travel", "Others (Deductions Subject to Withholding Tax and Other Expenses)"];

/** Schedule I / 1 / 5: 17 typed lines (ids k1..k17) and the computed total k18. */
export const scheduleOrdinary = (): Line[] => [
  ...S1.map((label, i): RowSpec => ({ id: `k${i + 1}`, item: `Sch.-${i + 1}`, label, specify: i === 16 })),
  { id: "k18", item: "Sch.-18", label: "Total Ordinary Allowable Itemized Deductions (Sum of Items 1 to 17)", f: (c) => Array.from({ length: 17 }, (_, i) => c.n(`k${i + 1}`)).reduce((a, b) => a + b, 0), bold: true },
];

export const corpPerson = (n: number, rdo: string, name: string, addr: string, zip: string): Values => ({ "6": `000-000-${n}-00000`, "7": rdo, "8": name, "9": addr, "9A": zip, "10": "07/01/2012", "11": `0917000${n}`, "12": `accounting${n}@example.com` });
