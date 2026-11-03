// BIR Form 2550M (Monthly Value-Added Tax Declaration): taught as HISTORY only. The monthly VAT declaration is no longer required from 2023 (the user's table); the quarterly
// 2550Q is the only VAT return. No official 2550M PDF was available on the BIR CDN (the BIR list shows an old February 2007 ENCS version), so there is no fillable simulation and no cases:
// the form definition below is a placeholder that carries the explanation.
import { f, fields, makeForm } from "../forms/kit";
import { lessonOf } from "./kit";

export const DEF = makeForm({
  id: "2550M", number: "2550M", title: "Monthly Value-Added Tax Declaration (history only)", subtitle: "No longer required from 2023; use the quarterly VAT return 2550Q",
  version: "February 2007 (ENCS), retired", versionNote: "History only: no fillable simulation.",
  identity: [fields(f("1", "Note", "This form is retired. File the quarterly VAT return 2550Q.", "text", { span: 12 }))],
  required: [],
  sections: [],
  due: () => "",
});

export const CASES = [];

export const BODY = lessonOf({
  title: "BIR Form 2550M: Monthly Value-Added Tax Declaration (history)", minutes: "About 3 minutes",
  sections: [
    ["1. What it was", "Until the end of 2022, a VAT-registered person filed a monthly VAT declaration (Form 2550M) for the first two months of each quarter, due about the 20th day of the following month (a date recalled by the author and not verified from a BIR document), and the quarterly return (2550Q) for the whole quarter, due 25 days after the quarter. The monthly declaration was a payment and reporting tool; the quarterly return reconciled it. The user's course table lists the 2550M as no longer required from 2023: the quarterly return is now the only VAT return and the VAT due is paid with it."],
    ["2. What to do today", "Use Form 2550Q (April 2024) every quarter; the lab teaches it fully. The BIR forms list on the BIR website shows a February 2007 version of the 2550M, and no current official PDF was available to build a simulation from, so this lab does not simulate the form. Ask the instructor which course materials still mention it."],
  ],
  worked: { intro: "Before 2023, a VAT taxpayer filed 2550M for July and August and 2550Q for the third quarter.", steps: ["From 2023 only the 2550Q is filed for the quarter."], title: "2550M (history)", table: { "2550M": "retired", "2550Q": "quarterly, within 25 days" } },
  legal: ["NIRC Sec. 114 (return and payment of VAT); the Revenue Regulations that discontinued the monthly VAT declaration (cited in the user's course table; not retrieved from a BIR document)."],
  guide: [["1", "1", "No fillable form. The explanation is in the lecture.", "—", "Filing a 2550M after 2022."]],
  checklist: ["Use the 2550Q for VAT.", "Do not file a monthly VAT declaration."],
  pitfalls: ["Looking for a 2550M in eBIRForms."],
  amended: "Not applicable.",
  noPayment: "Not applicable.",
  quiz: [
    ["From 2023, the VAT return filed is:", ["2550M monthly", "2550Q quarterly", "2551Q", "1601-C"], 1, "The quarterly 2550Q."],
    ["The 2550Q is due after the quarter within:", ["10 days", "25 days", "60 days", "1 year"], 1, "Twenty-five days."],
    ["The 2550M was a:", ["Monthly VAT declaration", "Income tax return", "Withholding return", "Estate tax return"], 0, "Monthly VAT declaration."],
    ["Percentage tax is filed on:", ["2551Q", "2550M", "1700", "2316"], 0, "2551Q."],
    ["A VAT-registered person today files VAT:", ["Monthly", "Quarterly", "Weekly", "Not at all"], 1, "Quarterly."],
  ],
});
