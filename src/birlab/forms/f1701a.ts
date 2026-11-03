// BIR Form 1701A, January 2018 (with the Table 2 rates for 2023 onwards): Annual Income Tax Return for individuals earning income PURELY from business/profession.
// Item numbers and labels follow the official PDF in docs/bir-forms/1701A-Jan-2018-v5-with-rates.pdf (page 1: items 1-35, page 2: items 36-75 and the rate tables).
import { RULES } from "../rules/2026";
import { amt, annualReturnDue, classify, eightPercentTax, graduatedTax, hasCentavos, isEmail, isIso, isRdo, isTin, money, optionalStandardDeduction, penaltiesFor, usToIso } from "../engine/tax";
import type { ComputeContext, FieldDef, FormDef, Issue, Option, Page, Row, Values } from "./types";

const YES_NO: Option[] = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];
void YES_NO;
const TYPE: Option[] = [{ value: "single", label: "Single Proprietor" }, { value: "professional", label: "Professional" }];
const RATE: Option[] = [
  { value: "graduated", label: "Graduated rates with OSD as method of deduction" },
  { value: "eight", label: "8% in lieu of Graduated Rates under Sec. 24(A) & Percentage Tax under Sec. 116 of NIRC [available if gross sales/receipts and other non-operating income do not exceed Three million pesos (P3M)]" },
];
const ATC: Option[] = [
  { value: "II012", label: "II012 Business Income - Graduated IT Rates" },
  { value: "II014", label: "II014 Income from Profession - Graduated IT Rates" },
  { value: "II015", label: "II015 Business Income - 8% IT Rate" },
  { value: "II017", label: "II017 Income from Profession - 8% IT Rate" },
];
const CIVIL: Option[] = [{ value: "single", label: "Single" }, { value: "married", label: "Married" }, { value: "separated", label: "Legally Separated" }, { value: "widow", label: "Widow/er" }];
const FILING: Option[] = [{ value: "joint", label: "Joint Filing" }, { value: "separate", label: "Separate Filing" }];
const OVERPAY: Option[] = [{ value: "refund", label: "To be refunded" }, { value: "tcc", label: "To be issued a Tax Credit Certificate (TCC)" }, { value: "carry", label: "To be carried over as a tax credit for next year/quarter" }];

const f = (id: string, item: string, label: string, kind: FieldDef["kind"], extra: Partial<FieldDef> = {}): FieldDef => ({ id, item, label, kind, ...extra });
const joint = (v: Values) => v["18"] === "joint";

const COLS: ("A" | "B")[] = ["A", "B"];
type AmountRow = Extract<Row, { type: "amounts" }>;
const amountRow = (id: string, item: string, label: string, mode: "input" | "computed", extra: Partial<AmountRow> = {}): Row => ({ type: "amounts", id, item, label, mode, cols: COLS, ...extra });

const page1: Page = {
  id: "p1", title: "Page 1",
  sections: [
    { id: "head", title: "BIR Form No. 1701A", note: "Annual Income Tax Return. Individuals Earning Income PURELY from Business/Profession [Those under the graduated income tax rates with OSD as mode of deduction OR those who opted to avail of the 8% flat income tax rate]", rows: [
      { type: "fields", fields: [f("1", "1", "For the Year (MM/YYYY)", "monthyear", { span: 4, required: true }), f("2", "2", "Amended Return?", "yesno", { span: 4, required: true }), f("3", "3", "Short Period Return?", "yesno", { span: 4, required: true })] },
    ] },
    { id: "part1", title: "Part I – Background Information on Taxpayer/Filer", rows: [
      { type: "fields", fields: [f("4", "4", "Taxpayer Identification Number (TIN)", "tin", { span: 5, required: true }), f("5", "5", "RDO Code", "rdo", { span: 3, required: true }), f("6", "6", "Taxpayer Type", "radio", { span: 4, options: TYPE, required: true })] },
      { type: "fields", fields: [f("7", "7", "Alphanumeric Tax Code (ATC)", "radio", { span: 12, options: ATC, required: true })] },
      { type: "fields", fields: [f("8", "8", "Taxpayer's Name (Last Name, First Name, Middle Name)", "text", { span: 12, required: true })] },
      { type: "fields", fields: [f("9", "9", "Registered Address (Indicate complete address. If the registered address is different from the current address, go to the RDO to update registered address by using BIR Form No. 1905)", "text", { span: 9, required: true }), f("9A", "9A", "ZIP Code", "zip", { span: 3, required: true })] },
      { type: "fields", fields: [f("10", "10", "Date of Birth (MM/DD/YYYY)", "date", { span: 4, required: true }), f("11", "11", "Email Address", "email", { span: 8 })] },
      { type: "fields", fields: [f("12", "12", "Citizenship", "text", { span: 4, required: true }), f("13", "13", "Claiming Foreign Tax Credits?", "yesno", { span: 4, required: true }), f("14", "14", "Foreign Tax Number, if applicable", "text", { span: 4 })] },
      { type: "fields", fields: [f("15", "15", "Contact Number (Landline/Cellphone No.)", "phone", { span: 4, required: true }), f("16", "16", "Civil Status", "radio", { span: 8, options: CIVIL, required: true })] },
      { type: "fields", fields: [f("17", "17", "If married, spouse has income?", "yesno", { span: 5 }), f("18", "18", "Filing Status", "radio", { span: 7, options: FILING })] },
      { type: "fields", fields: [f("19", "19", "Tax Rate", "radio", { span: 12, options: RATE, required: true })] },
    ] },
    { id: "part2", title: "Part II – Total Tax Payable", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", rows: [
      amountRow("20", "20", "Tax Due (Either from Part IV.A Item 46 OR Part IV.B Item 56)", "computed"),
      amountRow("21", "21", "Less: Total Tax Credits/Payments (From Part IV.C Item 64)", "computed"),
      amountRow("22", "22", "Net Tax Payable/(Overpayment) (Item 20 Less Item 21) (From Part IV Item 65)", "computed"),
      amountRow("23", "23", "Less: Portion of Tax Payable Allowed for 2nd Installment to be paid on or before October 15 (50% or less of Item 20)", "input", { note: "Only when Item 22 is a payable." }),
      amountRow("24", "24", "Amount of Tax Payable/(Overpayment) (Item 22 Less Item 23)", "computed", { bold: true }),
      { type: "heading", text: "Add: Penalties" },
      amountRow("25", "25", "Surcharge", "computed", { indent: 1 }),
      amountRow("26", "26", "Interest", "computed", { indent: 1 }),
      amountRow("27", "27", "Compromise", "input", { indent: 1 }),
      amountRow("28", "28", "Total Penalties (Sum of Items 25 to 27)", "computed", { indent: 1 }),
      amountRow("29", "29", "Total Amount Payable/(Overpayment) (Sum of Items 24 and 28)", "computed", { bold: true }),
      { type: "amounts", id: "30", item: "30", label: "Aggregate Amount Payable/(Overpayment) (Sum of Items 29A & 29B)", mode: "computed", cols: ["A"], bold: true },
      { type: "fields", fields: [f("30R", "", "If overpayment, mark one (1) box only. (Once the choice is made, the same is irrevocable)", "radio", { span: 12, options: OVERPAY })] },
      { type: "fields", fields: [f("31", "31", "Number of Attachments", "count", { span: 4, required: true })] },
    ] },
    { id: "part3", title: "Part III – Details of Payment", note: "Particulars: Drawee Bank/Agency · Number · Date (MM/DD/YYYY) · Amount", rows: [
      { type: "payment", id: "32", item: "32", label: "Cash/Bank Debit Memo" },
      { type: "payment", id: "33", item: "33", label: "Check" },
      { type: "payment", id: "34", item: "34", label: "Tax Debit Memo" },
      { type: "payment", id: "35", item: "35", label: "Others (specify below)" },
    ] },
  ],
};

const page2: Page = {
  id: "p2", title: "Page 2",
  sections: [
    { id: "iva", title: "Part IV – Computation of Income Tax", note: "If Optional Standard Deductions (OSD), fill in items 36 to 46; if 8%, fill in items 47 to 56. DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up. IV.A – For Graduated Income Tax Rates", rows: [
      amountRow("36", "36", "Sales/Revenues/Receipts/Fees", "input"),
      amountRow("37", "37", "Less: Sales Returns, Allowances and Discounts", "input"),
      amountRow("38", "38", "Net Sales/Revenues/Receipts/Fees (Item 36 Less Item 37)", "computed"),
      amountRow("39", "39", "Less: Allowable Deduction - Optional Standard Deduction (OSD) (40% of Item 38)", "computed"),
      amountRow("40", "40", "Net Income (Item 38 Less Item 39)", "computed"),
      { type: "heading", text: "Add: Other Non-Operating Income (specify below)" },
      amountRow("41", "41", "", "input", { indent: 1, specify: true }),
      amountRow("42", "42", "", "input", { indent: 1, specify: true }),
      amountRow("43", "43", "Amount Received/Share in Income by a Partner from General Professional Partnership (GPP)", "input", { indent: 1 }),
      amountRow("44", "44", "Total Other Income (Sum of Items 41 to 43)", "computed", { indent: 1 }),
      amountRow("45", "45", "Total Taxable Income (Sum of Items 40 and 44)", "computed"),
      amountRow("46", "46", "TAX DUE (Item 45 x Applicable Tax Rate based on Tax Table below) (To Part II - Item 20)", "computed", { bold: true }),
    ] },
    { id: "ivb", title: "IV.B – For 8% Income Tax Rate", note: "Those whose sales/receipts/others did not exceed P3M and opted at the initial quarter for this rate", rows: [
      amountRow("47", "47", "Sales/Revenues/Receipts/Fees", "input"),
      amountRow("48", "48", "Less: Sales Returns, Allowances and Discounts", "input"),
      amountRow("49", "49", "Net Sales/Revenues/Receipts/Fees (Item 47 Less Item 48)", "computed"),
      { type: "heading", text: "Add: Other Non-Operating Income (specify below)" },
      amountRow("50", "50", "", "input", { indent: 1, specify: true }),
      amountRow("51", "51", "", "input", { indent: 1, specify: true }),
      amountRow("52", "52", "Total Other Non-operating Income (Sum of Items 50 and 51)", "computed", { indent: 1 }),
      amountRow("53", "53", "Total Taxable Income (Sum of Items 49 and 52)", "computed"),
      amountRow("54", "54", "Less: Allowable reduction from gross sales/receipts and other non-operating income of PURELY self-employed individuals and/or professionals in the amount of P 250,000", "computed"),
      amountRow("55", "55", "Taxable Income/(Loss) (Item 53 Less Item 54)", "computed"),
      amountRow("56", "56", "TAX DUE (Item 55 x 8% Income Tax Rate) (To Part II - Item 20)", "computed", { bold: true }),
    ] },
    { id: "ivc", title: "IV.C – Tax Credits/Payments (attach proof)", rows: [
      amountRow("57", "57", "Prior Year's Excess Credits", "input"),
      amountRow("58", "58", "Tax Payments for the First Three (3) Quarters", "input"),
      amountRow("59", "59", "Creditable Tax Withheld for the First Three (3) Quarters", "input"),
      amountRow("60", "60", "Creditable Tax Withheld per BIR Form No. 2307 for the 4th Quarter", "input"),
      amountRow("61", "61", "Tax Paid in Return Previously Filed, if this is an Amended Return", "input"),
      amountRow("62", "62", "Foreign Tax Credits, if applicable", "input"),
      amountRow("63", "63", "Other Tax Credits/Payments (specify)", "input", { specify: true }),
      amountRow("64", "64", "Total Tax Credits/Payments (Sum of Items 57 to 63) (To Item 21)", "computed", { bold: true }),
      amountRow("65", "65", "Net Tax Payable/(Overpayment) (Item 46 OR 56 Less Item 64) (To Part II - Item 22)", "computed", { bold: true }),
    ] },
    { id: "part5", title: "Part V – Background Information on Spouse", note: "Fill in when filing jointly.", rows: [
      { type: "fields", fields: [f("66", "66", "Spouse's Taxpayer Identification Number (TIN)", "tin", { span: 5, when: joint }), f("67", "67", "RDO Code", "rdo", { span: 3, when: joint }), f("68", "68", "Filer's Spouse Type", "radio", { span: 4, options: TYPE, when: joint })] },
      { type: "fields", fields: [f("69", "69", "Alphanumeric Tax Code (ATC)", "radio", { span: 12, options: ATC, when: joint })] },
      { type: "fields", fields: [f("70", "70", "Spouse's Name (Last Name, First Name, Middle Name)", "text", { span: 12, when: joint })] },
      { type: "fields", fields: [f("71", "71", "Contact Number", "phone", { span: 5, when: joint }), f("72", "72", "Citizenship", "text", { span: 7, when: joint })] },
      { type: "fields", fields: [f("73", "73", "Claiming Foreign Tax Credits?", "yesno", { span: 4, when: joint }), f("74", "74", "Foreign Tax Number (if applicable)", "text", { span: 8, when: joint })] },
      { type: "fields", fields: [f("75", "75", "Tax Rate", "radio", { span: 12, options: RATE, when: joint })] },
    ] },
  ],
};

// ---- computation -------------------------------------------------------------------------------------------------------------------------------------

const yearOf = (v: Values): number => { const m = /^(\d{2})\/(\d{4})$/.exec(v["1"] ?? ""); return m ? Number(m[2]) : 0; };
export const taxableYear = yearOf;
const dueOf = (v: Values): string => (yearOf(v) ? annualReturnDue(yearOf(v)) : "");

function compute(v: Values, ctx: ComputeContext): Values {
  const out: Values = {};
  const year = yearOf(v);
  // Computed values are kept as peso text ("9300.00"), the same form a typed amount has, so amt() reads both the same way.
  const put = (id: string, c: number) => { out[id] = (c / 100).toFixed(2); };
  let total29 = 0;
  for (const col of ["A", "B"] as const) {
    if (col === "B" && !joint(v)) continue;
    const rate = col === "A" ? v["19"] : v["75"];
    const n = (id: string) => amt(v[id + col]);
    const grad = rate === "graduated", eight = rate === "eight";
    let td = 0;
    if (grad) {
      const i38 = n("36") - n("37");
      const i39 = optionalStandardDeduction(i38);
      const i40 = i38 - i39;
      const i44 = n("41") + n("42") + n("43");
      const i45 = i40 + i44;
      put("38" + col, i38); put("39" + col, i39); put("40" + col, i40); put("44" + col, i44); put("45" + col, i45);
      td = graduatedTax(i45, year || 2023);
      put("46" + col, td);
    }
    if (eight) {
      const i49 = n("47") - n("48");
      const i52 = n("50") + n("51");
      const i53 = i49 + i52;
      const i54 = RULES.eightPercent.reduction * 100;
      const i55 = i53 - i54;
      put("49" + col, i49); put("52" + col, i52); put("53" + col, i53); put("54" + col, i54); put("55" + col, i55);
      td = eightPercentTax(i55);
      put("56" + col, td);
    }
    const i64 = ["57", "58", "59", "60", "61", "62", "63"].reduce((s, id) => s + n(id), 0);
    const i65 = td - i64;
    put("64" + col, i64); put("65" + col, i65);
    put("20" + col, td); put("21" + col, i64); put("22" + col, i65);
    const i24 = i65 - n("23");
    put("24" + col, i24);
    const gross = eight ? n("47") : n("36");
    const p = penaltiesFor(Math.max(i24, 0), dueOf(v), ctx.filingDate, classify(gross));
    put("25" + col, p.surcharge); put("26" + col, p.interest);
    const i28 = p.surcharge + p.interest + n("27");
    put("28" + col, i28);
    const i29 = i24 + i28;
    put("29" + col, i29);
    total29 += i29;
  }
  put("30A", total29);
  return out;
}

// ---- validation --------------------------------------------------------------------------------------------------------------------------------------

const INPUT_AMOUNTS = ["23", "27", "36", "37", "41", "42", "43", "47", "48", "50", "51", "57", "58", "59", "60", "61", "62", "63"];

function validate(v: Values, ctx: ComputeContext): Issue[] {
  const issues: Issue[] = [];
  const bad = (id: string, item: string, message: string) => issues.push({ id, item, message });
  const blank = (id: string) => !(v[id] ?? "").trim();

  const year = yearOf(v);
  if (!year) bad("1", "1", "Enter the taxable year as MM/YYYY.");
  else if (year < 2018 || year > 2100) bad("1", "1", "The year is outside the years this form covers.");
  for (const id of ["2", "3", "13"]) if (blank(id)) bad(id, id, "Choose Yes or No.");
  if (!isTin(v["4"])) bad("4", "4", "TIN must be 3-3-3-5 digits (for example 000-000-000-00000).");
  if (!isRdo(v["5"])) bad("5", "5", "RDO code must be 3 digits.");
  if (blank("6")) bad("6", "6", "Choose the taxpayer type.");
  if (blank("7")) bad("7", "7", "Choose the Alphanumeric Tax Code (ATC).");
  if (blank("8")) bad("8", "8", "Enter the taxpayer's name (Last, First, Middle).");
  if (blank("9")) bad("9", "9", "Enter the registered address.");
  if (!/^\d{4}$/.test(v["9A"] ?? "")) bad("9A", "9A", "ZIP code must be 4 digits.");
  if (!usToIso(v["10"])) bad("10", "10", "Enter the date of birth as MM/DD/YYYY.");
  if (!blank("11") && !isEmail(v["11"])) bad("11", "11", "The email address is not valid.");
  if (blank("12")) bad("12", "12", "Enter the citizenship.");
  if (v["13"] === "yes" && blank("14")) bad("14", "14", "Enter the foreign tax number when claiming foreign tax credits.");
  if (blank("15")) bad("15", "15", "Enter a contact number.");
  if (blank("16")) bad("16", "16", "Choose the civil status.");
  if (v["16"] === "married" && blank("17")) bad("17", "17", "Answer whether the spouse has income.");
  if (v["17"] === "yes" && blank("18")) bad("18", "18", "Choose the filing status.");
  if (blank("19")) bad("19", "19", "Choose the tax rate.");

  // The ATC must agree with the taxpayer type and the tax rate.
  const atc = RULES.atc[v["7"] as keyof typeof RULES.atc];
  if (atc) {
    if (v["6"] && atc.type !== v["6"]) bad("7", "7", `ATC ${v["7"]} is for ${atc.type === "single" ? "a Single Proprietor" : "a Professional"}; Item 6 says otherwise.`);
    if (v["19"] && atc.rate !== v["19"]) bad("7", "7", `ATC ${v["7"]} is for ${atc.rate === "graduated" ? "graduated rates" : "the 8% rate"}; Item 19 says otherwise.`);
  }

  // Amounts: whole pesos, never negative.
  for (const base of INPUT_AMOUNTS) for (const col of ["A", "B"]) {
    if (col === "B" && !joint(v)) continue;
    const id = base + col;
    if (amt(v[id]) < 0) bad(id, base, `Item ${base}${col} cannot be negative.`);
    if (hasCentavos(v[id])) bad(id, base, `Item ${base}${col}: do not enter centavos on this form.`);
  }

  const c = compute(v, ctx);
  const rate = v["19"];
  if (rate === "graduated" && amt(v["36A"]) <= 0) bad("36A", "36", "Item 36 Sales/Revenues/Receipts/Fees is required for the graduated rates.");
  if (rate === "eight") {
    if (amt(v["47A"]) <= 0) bad("47A", "47", "Item 47 Sales/Revenues/Receipts/Fees is required for the 8% rate.");
    if (amt(c["53A"]) > RULES.eightPercent.ceiling * 100) bad("19", "19", `The 8% rate is available only if gross sales/receipts and other non-operating income do not exceed P${RULES.eightPercent.ceiling.toLocaleString("en-PH")} (Item 53 is ${money(amt(c["53A"]), false)}).`);
  }
  for (const id of ["41", "42", "50", "51", "63"]) if (amt(v[id + "A"]) > 0 && blank(id + "S")) bad(id + "S", id, `Specify what Item ${id} is.`);
  if (v["2"] === "yes" && amt(v["61A"]) <= 0) bad("61A", "61", "This is an amended return: enter the tax paid in the return previously filed (Item 61).");

  const i20 = amt(c["20A"]);
  if (amt(v["23A"]) > 0) {
    if (amt(c["22A"]) <= 0) bad("23A", "23", "A second installment is possible only when there is a tax payable (Item 22).");
    else if (amt(v["23A"]) > i20 / 2) bad("23A", "23", "The second installment cannot be more than 50% of Item 20.");
  }
  if (amt(c["24A"]) < 0 && blank("30R")) bad("30R", "24", "There is an overpayment: mark one box for what to do with it.");
  if (blank("31")) bad("31", "31", "Enter the number of attachments (0 if none).");
  else if (!/^\d+$/.test(v["31"])) bad("31", "31", "Number of attachments must be a whole number.");

  if (joint(v)) {
    if (!isTin(v["66"])) bad("66", "66", "The spouse's TIN must be 3-3-3-5 digits.");
    if (!isRdo(v["67"])) bad("67", "67", "The spouse's RDO code must be 3 digits.");
    for (const [id, label] of [["68", "Filer's Spouse Type"], ["69", "ATC"], ["70", "name"], ["73", "Claiming Foreign Tax Credits?"], ["75", "Tax Rate"]] as const) if (blank(id)) bad(id, id, `Enter the spouse's ${label}.`);
  }
  if (ctx.filingDate && !isIso(ctx.filingDate)) bad("filing", "", "The filing date is not a valid date.");
  return issues;
}

// ---- scoring -----------------------------------------------------------------------------------------------------------------------------------------

function scoring(v: Values) {
  const heavy = new Set(["20", "24", "29", "46", "56", "65"]);
  const rate = v["19"];
  const ids = ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"];
  if (rate === "graduated") ids.push("36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46");
  if (rate === "eight") ids.push("47", "48", "49", "50", "51", "52", "53", "54", "55", "56");
  ids.push("57", "58", "59", "60", "61", "62", "63", "64", "65");
  const cols = joint(v) ? ["A", "B"] : ["A"];
  const out = [
    { id: "1", item: "1", weight: 1 }, { id: "2", item: "2", weight: 1 }, { id: "6", item: "6", weight: 1 }, { id: "7", item: "7", weight: 2 }, { id: "19", item: "19", weight: 2 },
  ];
  for (const base of ids) for (const col of cols) out.push({ id: base + col, item: base, weight: heavy.has(base) ? 3 : 1 });
  return out;
}

export const F1701A: FormDef = {
  id: "1701A",
  number: "1701A",
  title: "Annual Income Tax Return",
  subtitle: "Individuals Earning Income PURELY from Business/Profession [Those under the graduated income tax rates with OSD as mode of deduction OR those who opted to avail of the 8% flat income tax rate]",
  version: "January 2018",
  versionNote: "Official PDF: 1701A Jan 2018 v5 with rates (Table 2 rates effective January 1, 2023 and onwards).",
  pages: [page1, page2],
  compute,
  validate,
  dueDate: dueOf,
  scoring,
};
