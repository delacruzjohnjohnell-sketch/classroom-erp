"use client";

// A short, collapsible "how this desk works" for each AIS desk: the steps, and plain-language answers to the questions a student is likely to have.
// The same explanations are in the printed student handout.

export type DeskKey = "sales" | "purchases" | "payroll" | "assets" | "close";

const PRIMERS: Record<DeskKey, { steps: string[]; terms: { term: string; text: string }[]; rule: string }> = {
  sales: {
    steps: ["Enter the order exactly as the customer's purchase order reads.", "Run the credit check: what the customer already owes, plus anything shipped but not billed, plus this order, against the credit limit.", "If the check holds the order, approve it or reject it, with a written reason.", "Ship (this posts the cost of the goods and lowers stock), then bill (receivable, sales and VAT).", "For a remittance advice, record the cash against the invoice being paid."],
    terms: [
      { term: "a credit check", text: "Before shipping on credit you make sure the customer can be trusted with more. What they already owe plus this new order must not be above their limit. The key words are \"already owe\": a small order can still be too much if the customer has a big unpaid balance." },
      { term: "segregation of duties", text: "No one person should start, approve and complete the same transaction. If you approve an exception you entered yourself, it is recorded as a self-approval, and an auditor will look for exactly that." },
    ],
    rule: "A card you never open scores nothing. Stopping a bad order is worth as much as processing a good one.",
  },
  purchases: {
    steps: ["Record the receipt: copy the quantity the warehouse counted on the receiving report.", "Enter the vendor invoice exactly as printed.", "Run the three-way match: purchase order against receiving report against invoice, and the vendor against the approved list.", "Approve or reject what the match holds, with a written reason.", "Post to payables, then pay from the payment vouchers."],
    terms: [
      { term: "the three-way match", text: "Before paying a supplier, three independent documents must agree: what you ordered (purchase order), what arrived (receiving report) and what the supplier charges (invoice). If the invoice bills more than arrived, or at a higher price than agreed, you are about to overpay. With no receiving report you cannot be sure the goods came." },
      { term: "GR/IR", text: "Goods Received / Invoice Received is a temporary liability. When goods arrive before the invoice you owe for them but have no bill yet. GR/IR holds that debt until the invoice clears it into Accounts Payable." },
    ],
    rule: "Never pay for more than arrived, at more than was agreed, to a vendor nobody approved, or twice.",
  },
  payroll: {
    steps: ["Check each timecard or pay-rate change against the HR file and its approvals.", "Approve or reject what the check holds, with a written reason. A rejected card is not paid in this run.", "When every card is decided, post the payroll: one voucher per employee.", "Then pay the net pay."],
    terms: [
      { term: "a payroll voucher", text: "For each employee the pay is more than one number. Gross pay is the expense. The company holds back the employee's SSS, PhilHealth and Pag-IBIG contributions and withholding tax (liabilities to pay to the government), and the rest is net pay. The employer's own share of contributions is another expense. One balanced entry records all of it." },
      { term: "a ghost employee", text: "A name on the payroll that is not a real, currently working person, kept by someone who collects the pay. The defense is simple: pay only people on the HR master file, and keep HR separate from whoever approves timecards." },
    ],
    rule: "Rates here are simplified classroom rates, not the legal tables.",
  },
  assets: {
    steps: ["Decide Capitalize or Expense for each of the five invoices. The system posts exactly what you choose.", "When all five are decided, run January depreciation.", "Then record the sale of the old forklift."],
    terms: [
      { term: "capitalizing", text: "Recording a cost as an asset instead of an expense because it will help the business for years. Its cost is then spread over its useful life as depreciation. Expense something that should be capitalized and this month's profit is too low; capitalize a repair and assets and profit are too high." },
      { term: "straight-line depreciation", text: "Cost, less any salvage value, divided by the months of useful life. A 1,250,000 truck with a 60-month life loses 20,833.33 a month. The entry is debit Depreciation Expense, credit Accumulated Depreciation." },
    ],
    rule: "Policy: spend above 15,000 that adds an asset or extends its life is capitalized. Routine repairs and small items are expensed. Depreciation waits for the invoices; the sale waits for depreciation.",
  },
  close: {
    steps: ["Work out the allowance for doubtful accounts: 2% of the receivable balance, to the centavo.", "Decide whether to accrue the January electricity bill that arrives in February.", "Post the closing entries once both adjustments are in.", "Watch the statements change after each step."],
    terms: [
      { term: "an adjusting entry", text: "At period end some things have changed although no document arrived: an expense was used but not billed, or an asset is worth less than the books say. An adjusting entry brings the books up to date so the statements are true for the period." },
      { term: "accrual accounting", text: "You record an expense in the period it is used and revenue in the period it is earned, not when cash moves. January's electricity belongs in January even if the bill comes in February." },
    ],
    rule: "The trial balance must balance, and so must the balance sheet: assets equal liabilities plus equity.",
  },
};

export default function DeskPrimer({ desk }: { desk: DeskKey }) {
  const p = PRIMERS[desk];
  return (
    <details className="rounded-lg border border-hairline bg-panel px-4 py-3 text-[12.5px] text-[#C8D3E0]">
      <summary className="cursor-pointer font-semibold select-none">How this desk works (read this first)</summary>
      <ol className="list-decimal pl-5 mt-3 flex flex-col gap-1">{p.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      {p.terms.map((t) => (
        <div key={t.term} className="mt-3 rounded-md border-l-4 px-3 py-2" style={{ borderColor: "#9D7CFF", background: "rgba(157,124,255,0.08)" }}>
          <div className="font-semibold">What is {t.term}?</div>
          <div className="text-[#A3B1C2] mt-0.5">{t.text}</div>
        </div>
      ))}
      <div className="mt-3 text-[12px] text-[#7F8EA0]"><b>Remember:</b> {p.rule}</div>
    </details>
  );
}
