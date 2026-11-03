// BIR Form 1701Q, January 2018 (ENCS): Quarterly Income Tax Return for Individuals, Estates and Trusts.
// Item numbers and labels follow docs/bir-forms/1701Q-Jan-2018-final-rev2.pdf; due dates follow its Guidelines and Instructions (1701Q-Guide-Jan-2018.pdf).
// The computation is cumulative: each quarter declares the income to date and credits what was paid in the previous quarters.
import { RULES } from "../rules/2026";
import { amt, classify, eightPercentTax, graduatedTax, hasCentavos, isEmail, isIso, isRdo, isTin, money, optionalStandardDeduction, penaltiesFor, usToIso } from "../engine/tax";
import type { ComputeContext, FieldDef, FormDef, Issue, Option, Page, Row, Values } from "./types";

const TYPE: Option[] = [{ value: "single", label: "Single Proprietor" }, { value: "professional", label: "Professional" }, { value: "estate", label: "Estate" }, { value: "trust", label: "Trust" }];
const SPOUSE_TYPE: Option[] = [{ value: "single", label: "Single Proprietor" }, { value: "professional", label: "Professional" }, { value: "compensation", label: "Compensation Earner" }];
const QUARTER: Option[] = [{ value: "1", label: "First" }, { value: "2", label: "Second" }, { value: "3", label: "Third" }];
const ATC: Option[] = [
  { value: "II012", label: "II012 Business Income - Graduated IT Rates" }, { value: "II014", label: "II014 Income from Profession - Graduated IT Rates" }, { value: "II013", label: "II013 Mixed Income - Graduated IT Rates" },
  { value: "II015", label: "II015 Business Income - 8% IT Rate" }, { value: "II017", label: "II017 Income from Profession - 8% IT Rate" }, { value: "II016", label: "II016 Mixed Income - 8% IT Rate" },
];
const SPOUSE_ATC: Option[] = [{ value: "II011", label: "II011 Compensation Income" }, ...ATC];
const RATE: Option[] = [
  { value: "graduated", label: "Graduated Rates per Tax Table - page 2 (Choose Method of Deduction in Item 16A)" },
  { value: "eight", label: "8% on gross sales/receipts & other non-operating income in lieu of Graduated Rates under Sec. 24(A)(2)(a) & Percentage Tax under Sec. 116 of the NIRC, as amended [available if gross sales/receipts and other non-operating income do not exceed Three million pesos (P3M)]" },
];
const METHOD: Option[] = [{ value: "itemized", label: "Itemized Deduction [Sec. 34(A-J), NIRC]" }, { value: "osd", label: "Optional Standard Deduction (OSD) [40% of Gross Sales/Receipts/Revenues/Fees, Sec. 34(L), NIRC]" }];

const f = (id: string, item: string, label: string, kind: FieldDef["kind"], extra: Partial<FieldDef> = {}): FieldDef => ({ id, item, label, kind, ...extra });
const spouseOn = (v: Values) => !!(v["17"] ?? "").trim();
const COLS: ("A" | "B")[] = ["A", "B"];
type AmountRow = Extract<Row, { type: "amounts" }>;
const row = (id: string, item: string, label: string, mode: "input" | "computed", extra: Partial<AmountRow> = {}): Row => ({ type: "amounts", id, item, label, mode, cols: COLS, ...extra });

const page1: Page = {
  id: "p1", title: "Page 1",
  sections: [
    { id: "head", title: "BIR Form No. 1701Q", note: "Quarterly Income Tax Return for Individuals, Estates and Trusts", rows: [
      { type: "fields", fields: [f("1", "1", "For the Year (YYYY)", "year", { span: 3, required: true }), f("2", "2", "Quarter", "radio", { span: 4, options: QUARTER, required: true }), f("3", "3", "Amended Return?", "yesno", { span: 3, required: true }), f("4", "4", "Number of Sheet/s Attached", "count", { span: 2, required: true })] },
    ] },
    { id: "part1", title: "Part I – Background Information on Taxpayer/Filer", rows: [
      { type: "fields", fields: [f("5", "5", "Taxpayer Identification Number (TIN)", "tin", { span: 7, required: true }), f("6", "6", "RDO Code", "rdo", { span: 5, required: true })] },
      { type: "fields", fields: [f("7", "7", "Taxpayer/Filer Type", "radio", { span: 12, options: TYPE, required: true })] },
      { type: "fields", fields: [f("8", "8", "Alphanumeric Tax Code (ATC)", "radio", { span: 12, options: ATC, required: true })] },
      { type: "fields", fields: [f("9", "9", "Taxpayer/Filer's Name (Last Name, First Name, Middle Name for Individual) / ESTATE of (First Name, Middle Name, Last Name) / TRUST FAO: (First Name, Middle Name, Last Name)", "text", { span: 12, required: true })] },
      { type: "fields", fields: [f("10", "10", "Registered Address (Indicate complete address. If branch, indicate the branch address. If the registered address is different from the current address, go to the RDO to update registered address by using BIR Form No. 1905)", "text", { span: 9, required: true }), f("10A", "10A", "ZIP Code", "zip", { span: 3, required: true })] },
      { type: "fields", fields: [f("11", "11", "Date of Birth (MM/DD/YYYY)", "date", { span: 4 }), f("12", "12", "Email Address", "email", { span: 8 })] },
      { type: "fields", fields: [f("13", "13", "Citizenship", "text", { span: 4, required: true }), f("14", "14", "Foreign Tax Number (if applicable)", "text", { span: 4 }), f("15", "15", "Claiming Foreign Tax Credits?", "yesno", { span: 4, required: true })] },
      { type: "fields", fields: [f("16", "16", "Tax Rate (choose one, for income from business/profession)*", "radio", { span: 12, options: RATE, required: true })] },
      { type: "fields", fields: [f("16A", "16A", "Method of Deduction", "radio", { span: 12, options: METHOD })] },
    ] },
    { id: "part2", title: "Part II – Background Information on Spouse (if applicable)", rows: [
      { type: "fields", fields: [f("17", "17", "Spouse's TIN", "tin", { span: 7 }), f("18", "18", "RDO Code", "rdo", { span: 5 })] },
      { type: "fields", fields: [f("19", "19", "Filer's Spouse Type", "radio", { span: 12, options: SPOUSE_TYPE })] },
      { type: "fields", fields: [f("20", "20", "ATC", "radio", { span: 12, options: SPOUSE_ATC })] },
      { type: "fields", fields: [f("21", "21", "Spouse's Name (Last Name, First Name, Middle Name)", "text", { span: 12 })] },
      { type: "fields", fields: [f("22", "22", "Citizenship", "text", { span: 4 }), f("23", "23", "Foreign Tax Number, if applicable", "text", { span: 4 }), f("24", "24", "Claiming Foreign Tax Credits?", "yesno", { span: 4 })] },
      { type: "fields", fields: [f("25", "25", "Tax Rate (choose one, for income from business/profession)*", "radio", { span: 12, options: RATE })] },
      { type: "fields", fields: [f("25A", "25A", "Method of Deduction", "radio", { span: 12, options: METHOD })] },
    ] },
    { id: "part3", title: "Part III – Total Tax Payable", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", rows: [
      row("26", "26", "Tax Due (From Part V, Schedule I-Item 46 OR Schedule II-Item 54)", "computed"),
      row("27", "27", "Less: Tax Credits/Payments (From Part V, Schedule III-Item 62)", "computed"),
      row("28", "28", "Tax Payable/(Overpayment) (Item 26 Less Item 27) (From Part V, Item 63)", "computed", { bold: true }),
      row("29", "29", "Add: Total Penalties (From Part V, Schedule IV-Item 67)", "computed"),
      row("30", "30", "Total Amount Payable/(Overpayment) (Sum of Items 28 and 29) (From Part V, Item 68)", "computed", { bold: true }),
      { type: "amounts", id: "31", item: "31", label: "Aggregate Amount Payable/(Overpayment) (Sum of Items 30A and 30B)", mode: "computed", cols: ["A"], bold: true },
    ] },
    { id: "part4", title: "Part IV – Details of Payment", note: "Particulars: Drawee Bank/Agency · Number · Date (MM/DD/YYYY) · Amount", rows: [
      { type: "payment", id: "32", item: "32", label: "Cash/Bank Debit Memo" }, { type: "payment", id: "33", item: "33", label: "Check" },
      { type: "payment", id: "34", item: "34", label: "Tax Debit Memo" }, { type: "payment", id: "35", item: "35", label: "Others (specify)" },
    ] },
  ],
};

const page2: Page = {
  id: "p2", title: "Page 2",
  sections: [
    { id: "s1", title: "Part V – Computation of Tax Due: Schedule I – For Graduated IT Rate", note: "Declaration this Quarter. If graduated rate, fill in items 36 to 46; if 8%, fill in items 47 to 54. DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up.", rows: [
      row("36", "36", "Sales/Revenues/Receipts/Fees (net of sales returns, allowances and discounts)", "input"),
      row("37", "37", "Less: Cost of Sales/Services (applicable only if availing Itemized Deductions)", "input"),
      row("38", "38", "Gross Income/(Loss) from Operation (Item 36 Less Item 37)", "computed"),
      { type: "heading", text: "Less: Allowable Deductions" },
      row("39", "39", "Total Allowable Itemized Deductions", "input", { indent: 1 }),
      row("40", "40", "OR Optional Standard Deduction (OSD) (40% of Item 36)", "computed", { indent: 1 }),
      row("41", "41", "Net Income/(Loss) This Quarter (If Itemized: Item 38 Less Item 39; If OSD: Item 38 Less Item 40)", "computed"),
      { type: "heading", text: "Add:" },
      row("42", "42", "Taxable Income/(Loss) Previous Quarter/s", "input", { indent: 1 }),
      row("43", "43", "Non-Operating Income (specify)", "input", { indent: 1, specify: true }),
      row("44", "44", "Amount Received/Share in Income by a Partner from General Professional Partnership (GPP)", "input", { indent: 1 }),
      row("45", "45", "Total Taxable Income/(Loss) To Date (Sum of Items 41 to 44)", "computed"),
      row("46", "46", "TAX DUE (Item 45 x Applicable Tax Rate based on Tax Table below) (To Part III, Item 26)", "computed", { bold: true }),
    ] },
    { id: "s2", title: "Schedule II – For 8% IT Rate", rows: [
      row("47", "47", "Sales/Revenues/Receipts/Fees (net of sales returns, allowances and discounts)", "input"),
      row("48", "48", "Add: Non-Operating Income (specify)", "input", { specify: true }),
      row("49", "49", "Total Income for the quarter (Sum of Items 47 and 48)", "computed"),
      row("50", "50", "Add: Total Taxable Income/(Loss) Previous Quarter (Item 51 of previous quarter)", "input"),
      row("51", "51", "Cumulative Taxable Income/(Loss) as of This Quarter (Sum of Items 49 and 50)", "computed"),
      row("52", "52", "Less: Allowable reduction from gross sales/receipts and other non-operating income of purely self-employed individuals and/or professionals in the amount of P 250,000", "computed"),
      row("53", "53", "Taxable Income/(Loss) To Date (Item 51 Less Item 52)", "computed"),
      row("54", "54", "TAX DUE (Item 53 x 8% Tax Rate) (To Part III, Item 26)", "computed", { bold: true }),
    ] },
    { id: "s3", title: "Schedule III – Tax Credits/Payments", rows: [
      row("55", "55", "Prior Year's Excess Credits", "input"),
      row("56", "56", "Tax Payment/s for the Previous Quarter/s", "input"),
      row("57", "57", "Creditable Tax Withheld for the Previous Quarter/s", "input"),
      row("58", "58", "Creditable Tax Withheld per BIR Form No. 2307 for this Quarter", "input"),
      row("59", "59", "Tax Paid in Return Previously Filed, if this is an Amended Return", "input"),
      row("60", "60", "Foreign Tax Credits, if applicable", "input"),
      row("61", "61", "Other Tax Credits/Payments (specify)", "input", { specify: true }),
      row("62", "62", "Total Tax Credits/Payments (Sum of Items 55 to 61) (To Part III, Item 27)", "computed", { bold: true }),
      row("63", "63", "Tax Payable/(Overpayment) (Item 46 or 54, Less Item 62) (To Part III, Item 28)", "computed", { bold: true }),
    ] },
    { id: "s4", title: "Schedule IV – Penalties", rows: [
      row("64", "64", "Surcharge", "computed"), row("65", "65", "Interest", "computed"), row("66", "66", "Compromise", "input"),
      row("67", "67", "Total Penalties (Sum of Items 64 to 66) (To Part III, Item 29)", "computed"),
      row("68", "68", "Total Amount Payable/(Overpayment) (Sum of Items 63 and 67) (To Part III, Item 30)", "computed", { bold: true }),
    ] },
  ],
};

// ---- computation -------------------------------------------------------------------------------------------------------------------------------------

const yearOf = (v: Values): number => (/^\d{4}$/.test(v["1"] ?? "") ? Number(v["1"]) : 0);
/** First quarter May 15, second August 15, third November 15 of the current taxable year (the form's Guidelines and Instructions). */
function dueOf(v: Values): string {
  const y = yearOf(v), md = RULES.quarterlyIndividualDue.dates[Number(v["2"])];
  return y && md ? `${y}-${md}` : "";
}

function compute(v: Values, ctx: ComputeContext): Values {
  const out: Values = {};
  const year = yearOf(v);
  const put = (id: string, c: number) => { out[id] = (c / 100).toFixed(2); };
  let total30 = 0;
  for (const col of ["A", "B"] as const) {
    if (col === "B" && !spouseOn(v)) continue;
    const rate = col === "A" ? v["16"] : v["25"];
    const method = col === "A" ? v["16A"] : v["25A"];
    const n = (id: string) => amt(v[id + col]);
    const grad = rate === "graduated", eight = rate === "eight";
    let td = 0;
    if (grad) {
      const itemized = method === "itemized";
      const i38 = n("36") - (itemized ? n("37") : 0);
      const i40 = method === "osd" ? optionalStandardDeduction(n("36")) : 0;
      const i41 = i38 - (itemized ? n("39") : i40);
      const i45 = i41 + n("42") + n("43") + n("44");
      put("38" + col, i38); if (method === "osd") put("40" + col, i40); put("41" + col, i41); put("45" + col, i45);
      td = graduatedTax(i45, year || 2023);
      put("46" + col, td);
    }
    if (eight) {
      const i49 = n("47") + n("48");
      const i51 = i49 + n("50");
      const i52 = RULES.eightPercent.reduction * 100;
      const i53 = i51 - i52;
      put("49" + col, i49); put("51" + col, i51); put("52" + col, i52); put("53" + col, i53);
      td = eightPercentTax(i53);
      put("54" + col, td);
    }
    const i62 = ["55", "56", "57", "58", "59", "60", "61"].reduce((s, id) => s + n(id), 0);
    const i63 = td - i62;
    put("62" + col, i62); put("63" + col, i63);
    const gross = eight ? n("47") + n("48") + n("50") : n("36");
    const p = penaltiesFor(Math.max(i63, 0), dueOf(v), ctx.filingDate, ctx.classification ?? classify(gross));
    put("64" + col, p.surcharge); put("65" + col, p.interest);
    const i67 = p.surcharge + p.interest + n("66");
    put("67" + col, i67);
    const i68 = i63 + i67;
    put("68" + col, i68);
    put("26" + col, td); put("27" + col, i62); put("28" + col, i63); put("29" + col, i67); put("30" + col, i68);
    total30 += i68;
  }
  put("31A", total30);
  return out;
}

// ---- validation --------------------------------------------------------------------------------------------------------------------------------------

const INPUTS = ["36", "37", "39", "43", "44", "47", "48", "55", "56", "57", "58", "59", "60", "61", "66"];
const ATC_RATE: Record<string, "graduated" | "eight"> = { II012: "graduated", II014: "graduated", II013: "graduated", II015: "eight", II017: "eight", II016: "eight" };
const ATC_TYPE: Record<string, "single" | "professional" | "mixed"> = { II012: "single", II014: "professional", II013: "mixed", II015: "single", II017: "professional", II016: "mixed" };

function validate(v: Values, ctx: ComputeContext): Issue[] {
  const issues: Issue[] = [];
  const bad = (id: string, item: string, message: string) => issues.push({ id, item, message });
  const blank = (id: string) => !(v[id] ?? "").trim();
  const year = yearOf(v);
  if (!year || year < 2018) bad("1", "1", "Enter the taxable year as 4 digits (YYYY).");
  if (blank("2")) bad("2", "2", "Choose the quarter: First, Second or Third. There is no fourth-quarter 1701Q; the annual return covers it.");
  if (blank("3")) bad("3", "3", "Choose Yes or No.");
  if (blank("4") || !/^\d+$/.test(v["4"] ?? "")) bad("4", "4", "Enter the number of sheets attached (0 if none).");
  if (!isTin(v["5"])) bad("5", "5", "TIN must be 3-3-3-5 digits (for example 000-000-000-00000).");
  if (!isRdo(v["6"])) bad("6", "6", "RDO code must be 3 digits.");
  if (blank("7")) bad("7", "7", "Choose the taxpayer/filer type.");
  if (blank("8")) bad("8", "8", "Choose the Alphanumeric Tax Code (ATC).");
  if (blank("9")) bad("9", "9", "Enter the taxpayer/filer's name.");
  if (blank("10")) bad("10", "10", "Enter the registered address.");
  if (!/^\d{4}$/.test(v["10A"] ?? "")) bad("10A", "10A", "ZIP code must be 4 digits.");
  if (!blank("11") && !usToIso(v["11"])) bad("11", "11", "Enter the date of birth as MM/DD/YYYY.");
  if (!blank("12") && !isEmail(v["12"])) bad("12", "12", "The email address is not valid.");
  if (blank("13")) bad("13", "13", "Enter the citizenship.");
  if (blank("15")) bad("15", "15", "Choose Yes or No.");
  if (v["15"] === "yes" && blank("14")) bad("14", "14", "Enter the foreign tax number when claiming foreign tax credits.");
  if (blank("16")) bad("16", "16", "Choose the tax rate.");
  if (v["16"] === "graduated" && blank("16A")) bad("16A", "16A", "Choose the method of deduction: itemized or OSD (if none is marked the taxpayer is deemed to use itemized).");

  if (v["8"] && ATC_RATE[v["8"]] && v["16"] && ATC_RATE[v["8"]] !== v["16"]) bad("8", "8", `ATC ${v["8"]} is for ${ATC_RATE[v["8"]] === "graduated" ? "graduated rates" : "the 8% rate"}; Item 16 says otherwise.`);
  const kind = ATC_TYPE[v["8"]];
  if (kind && kind !== "mixed" && (v["7"] === "single" || v["7"] === "professional") && kind !== v["7"]) bad("8", "8", `ATC ${v["8"]} is for ${kind === "single" ? "a Single Proprietor" : "a Professional"}; Item 7 says otherwise.`);

  for (const base of INPUTS) for (const col of ["A", "B"]) {
    if (col === "B" && !spouseOn(v)) continue;
    const id = base + col;
    if (amt(v[id]) < 0) bad(id, base, `Item ${base}${col} cannot be negative.`);
    if (hasCentavos(v[id])) bad(id, base, `Item ${base}${col}: do not enter centavos on this form.`);
  }
  for (const base of ["42", "50"]) for (const col of ["A", "B"]) if (hasCentavos(v[base + col]) && (col === "A" || spouseOn(v))) bad(base + col, base, `Item ${base}${col}: do not enter centavos on this form.`);

  const c = compute(v, ctx);
  if (v["16"] === "graduated" && amt(v["36A"]) <= 0) bad("36A", "36", "Item 36 Sales/Revenues/Receipts/Fees is required for the graduated rate.");
  if (v["16"] === "eight") {
    if (amt(v["47A"]) <= 0) bad("47A", "47", "Item 47 Sales/Revenues/Receipts/Fees is required for the 8% rate.");
    if (amt(c["51A"]) > RULES.eightPercent.ceiling * 100) bad("16", "16", `The 8% rate is automatically changed to graduated rates when gross sales/receipts and other non-operating income exceed P${RULES.eightPercent.ceiling.toLocaleString("en-PH")} (Item 51 is ${money(amt(c["51A"]), false)}).`);
  }
  for (const id of ["43", "48", "61"]) if (amt(v[id + "A"]) > 0 && blank(id + "S")) bad(id + "S", id, `Specify what Item ${id} is.`);
  if (v["3"] === "yes" && amt(v["59A"]) <= 0) bad("59A", "59", "This is an amended return: enter the tax paid in the return previously filed (Item 59).");
  if (spouseOn(v)) {
    if (!isTin(v["17"])) bad("17", "17", "The spouse's TIN must be 3-3-3-5 digits.");
    if (!isRdo(v["18"])) bad("18", "18", "The spouse's RDO code must be 3 digits.");
    for (const [id, label] of [["19", "Filer's Spouse Type"], ["20", "ATC"], ["21", "name"], ["24", "Claiming Foreign Tax Credits?"], ["25", "Tax Rate"]] as const) if (blank(id)) bad(id, id, `Enter the spouse's ${label}.`);
  }
  if (ctx.filingDate && !isIso(ctx.filingDate)) bad("filing", "", "The filing date is not a valid date.");
  return issues;
}

function scoring(v: Values) {
  const heavy = new Set(["26", "28", "30", "46", "54", "63", "68"]);
  const ids = ["26", "27", "28", "29", "30"];
  if (v["16"] === "graduated") ids.push("36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46");
  if (v["16"] === "eight") ids.push("47", "48", "49", "50", "51", "52", "53", "54");
  ids.push("55", "56", "57", "58", "59", "60", "61", "62", "63", "64", "65", "66", "67", "68");
  const cols = spouseOn(v) ? ["A", "B"] : ["A"];
  const out = [{ id: "1", item: "1", weight: 1 }, { id: "2", item: "2", weight: 1 }, { id: "3", item: "3", weight: 1 }, { id: "8", item: "8", weight: 2 }, { id: "16", item: "16", weight: 2 }];
  if (v["16"] === "graduated") out.push({ id: "16A", item: "16A", weight: 2 });
  for (const base of ids) for (const col of cols) out.push({ id: base + col, item: base, weight: heavy.has(base) ? 3 : 1 });
  return out;
}

export const F1701Q: FormDef = {
  id: "1701Q",
  number: "1701Q",
  title: "Quarterly Income Tax Return",
  subtitle: "For Individuals, Estates and Trusts",
  version: "January 2018 (ENCS)",
  versionNote: "Official PDF: 1701Q Jan 2018 final rev2. Due dates from its Guidelines and Instructions: 1st quarter May 15, 2nd August 15, 3rd November 15.",
  pages: [page1, page2],
  spouseOn,
  compute,
  validate,
  dueDate: dueOf,
  scoring,
};
