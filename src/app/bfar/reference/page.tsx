import { CHART_OF_ACCOUNTS } from "@/bfar/core/chart-of-accounts";
import { Card, PageHeader } from "@/bfar/components/ui";

const TYPE_LABEL = { asset: "Assets", liability: "Liabilities", equity: "Equity", revenue: "Revenues", expense: "Expenses and purchases" } as const;

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-gray-500"><tr>{head.map((h) => <th key={h} className="p-1.5">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-gray-100 align-top">{r.map((c, j) => <td key={j} className="p-1.5">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default function ReferencePage() {
  return (
    <>
      <PageHeader title="Reference" subtitle="Quick cheat sheets for the rules the practice sets keep testing." />
      <div className="grid gap-4">
        <Card title="Normal balances (chart of accounts)">
          <div className="grid gap-4 md:grid-cols-2">
            {(Object.keys(TYPE_LABEL) as (keyof typeof TYPE_LABEL)[]).map((t) => (
              <div key={t}>
                <div className="text-xs font-semibold text-gray-500 mb-1">{TYPE_LABEL[t]}</div>
                <table className="w-full text-sm"><tbody>
                  {CHART_OF_ACCOUNTS.filter((a) => a.type === t).map((a) => (
                    <tr key={a.code} className="border-t border-gray-100">
                      <td className="p-1 w-14">{a.code}</td><td className="p-1">{a.name}{a.contra && <span className="ml-1 text-xs text-amber-700">(contra)</span>}</td>
                      <td className="p-1 w-16 text-right text-xs font-semibold">{a.normal === "debit" ? "Dr" : "Cr"}</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">Owner&apos;s Drawing (302) is the one equity account with a debit balance. Contra accounts carry the opposite balance of the account they offset.</p>
        </Card>

        <Card title="Prepaid expenses: asset method vs expense method">
          <Table head={["", "Asset method", "Expense method"]} rows={[
            ["When paid", "Dr Prepaid Rent, Cr Cash", "Dr Rent Expense, Cr Cash"],
            ["Adjusting entry", "Dr Rent Expense, Cr Prepaid Rent for the EXPIRED part", "Dr Prepaid Rent, Cr Rent Expense for the UNEXPIRED part"],
            ["Reverse next period?", "No", "Yes"],
          ]} />
        </Card>

        <Card title="Unearned revenue: liability method vs income method">
          <Table head={["", "Liability method", "Income method"]} rows={[
            ["When cash is received", "Dr Cash, Cr Unearned Service Revenues", "Dr Cash, Cr Service Revenues"],
            ["Adjusting entry", "Dr Unearned, Cr Revenue for the EARNED part", "Dr Revenue, Cr Unearned for the UNEARNED part"],
            ["Reverse next period?", "No", "Yes"],
          ]} />
        </Card>

        <Card title="Shipping terms and freight">
          <Table head={["Term", "Who owns the goods in transit", "Who pays the freight", "Buyer records", "Seller records"]} rows={[
            ["FOB shipping point", "Buyer", "Buyer (freight collect)", "Dr Freight-In", "Nothing"],
            ["FOB shipping point, freight prepaid by seller", "Buyer", "Buyer (seller advances it)", "Dr Freight-In, Cr Accounts Payable", "Dr Accounts Receivable, Cr Cash"],
            ["FOB destination", "Seller", "Seller (freight prepaid)", "Nothing", "Dr Freight-Out (operating expense)"],
          ]} />
        </Card>

        <Card title="Credit terms: 2/10, n/30">
          <p className="text-sm text-gray-700">A 2% discount if paid within 10 days of the invoice date; the full amount is due within 30 days. &quot;n/eom&quot; means net due at the end of the month. The discount is computed on the invoice amount LESS returns and allowances, and freight is never discounted.</p>
          <p className="text-sm text-gray-700 mt-2">Example: ₱120,000 purchase on 2/10, n/30, paid on day 8. Discount = ₱120,000 × 2% = ₱2,400. Cash paid = ₱117,600. Dr Accounts Payable 120,000; Cr Cash 117,600; Cr Purchase Discounts 2,400.</p>
        </Card>

        <Card title="Closing entries (REID)">
          <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-1">
            <li><b>R</b>evenues: debit each revenue account, credit Income Summary.</li>
            <li><b>E</b>xpenses: debit Income Summary, credit each expense account.</li>
            <li><b>I</b>ncome Summary: debit it and credit Owner&apos;s Capital for net income (reverse for a net loss).</li>
            <li><b>D</b>rawing: debit Owner&apos;s Capital, credit Owner&apos;s Drawing.</li>
          </ol>
          <p className="text-xs text-gray-500 mt-2">Under the periodic system, also debit Merchandise Inventory for the ending count in entry 1 and credit it for the beginning balance in entry 2.</p>
        </Card>

        <Card title="Which adjustments are reversed?">
          <Table head={["Reverse", "Do not reverse"]} rows={[["Accrued expenses and accrued revenues; prepaids under the expense method; unearned revenue under the income method", "Prepaids under the asset method; unearned under the liability method; depreciation; supplies used; uncollectible accounts"]]} />
        </Card>
      </div>
    </>
  );
}
