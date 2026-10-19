"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import FinancialStatements, { type FinancialKind } from "@/components/mfg/reports/FinancialStatements";
import InventoryReports, { type InventoryKind } from "@/components/mfg/reports/InventoryReports";
import ControlReports, { type ControlKind } from "@/components/mfg/reports/ControlReports";
import { useSession } from "@/lib/session";

type Entry = { id: string; label: string } | { href: string; label: string };
const GROUPS: { title: string; items: Entry[] }[] = [
  { title: "Financial statements (PAS 1)", items: [
    { id: "position", label: "Statement of financial position" }, { id: "income", label: "Statement of comprehensive income" }, { id: "cashflow", label: "Statement of cash flows (PAS 7)" },
    { id: "trial", label: "Trial balance" }, { href: "/mfg/period?tab=cogm", label: "Cost of goods manufactured and sold" },
    { id: "ageing", label: "Receivables and payables ageing" }, { href: "/mfg/finance", label: "Journal vouchers" },
  ] },
  { title: "Inventories and production", items: [
    { id: "schedule", label: "Schedule of inventories (PAS 2)" }, { id: "stockcard", label: "Stock card" }, { id: "wip", label: "Work in process: valuation and ageing" }, { id: "scrap", label: "Scrap loss in pesos" },
    { href: "/mfg/inventory?tab=lots", label: "Lots, expiry and traceability" }, { href: "/mfg/analytics?tab=inventory", label: "Slow-moving and dead stock" }, { href: "/mfg/analytics", label: "Profitability, variances and KPIs" },
  ] },
  { title: "Purchasing", items: [{ id: "grir", label: "Goods received, not invoiced (GR/IR)" }, { id: "match", label: "Three-way match exceptions" }] },
  { title: "Controls", items: [
    { id: "integrity", label: "Books integrity check" }, { id: "audit", label: "Audit trail" }, { id: "machine", label: "Machine cost: depreciation vs applied" }, { href: "/mfg/costing", label: "Is the standard cost still right?" },
    { href: "/mfg/shopfloor?tab=upkeep", label: "Machines and upkeep" },
  ] },
];
const FIN: FinancialKind[] = ["position", "income", "cashflow", "trial"];
const INV: InventoryKind[] = ["schedule", "stockcard", "wip", "scrap"];
const CTL: ControlKind[] = ["grir", "match", "integrity", "ageing", "audit", "machine"];

export default function ReportsPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>}>
        <ReportsBody />
      </Suspense>
    </AppShell>
  );
}

function ReportsBody() {
  const router = useRouter();
  const params = useSearchParams();
  const { effectiveTenantId, tenants, profile } = useSession();
  const company = tenants.find((t) => t.id === effectiveTenantId)?.name ?? "Company";
  const preparedBy = profile?.role === "teacher" ? undefined : profile?.full_name ?? undefined;
  const r = params.get("r") ?? "position";

  return (
    <>
      <div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-[#7F8EA0]" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>Manufacturing</div>
        <h1 className="text-[20px] font-semibold">Reports</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1 max-w-[760px]">
          Reports in the layout a finance department files: the company, the title, the period, the currency, brackets for negatives, single and double rules, notes, and signature lines.
          Each one can be printed or saved as a spreadsheet. Every figure comes from the same books, so the reports agree with each other.
        </div>
      </div>
      <div className="grid gap-5" style={{ gridTemplateColumns: "minmax(210px, 260px) minmax(0, 1fr)" }}>
        <nav aria-label="Reports" className="flex flex-col gap-4">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="text-[10.5px] uppercase tracking-[0.1em] text-[#7F8EA0] mb-1.5" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{g.title}</div>
              <div className="flex flex-col">
                {g.items.map((it) => "id" in it ? (
                  <button key={it.id} onClick={() => router.replace(`/mfg/reports?r=${it.id}`)} aria-current={r === it.id ? "page" : undefined}
                    className={`text-left text-[13px] px-2.5 py-1.5 rounded border-l-2 transition-colors ${r === it.id ? "text-gold border-[#F2B13C] bg-white/5 font-semibold" : "text-[#A3B1C2] border-transparent hover:text-ink hover:bg-white/5"}`}>{it.label}</button>
                ) : (
                  <Link key={it.href} href={it.href} className="text-[13px] px-2.5 py-1.5 rounded text-[#A3B1C2] hover:text-ink hover:bg-white/5 flex items-center gap-1.5">{it.label} <ExternalLink size={11} /></Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <section aria-live="polite">
          {FIN.includes(r as FinancialKind) && <FinancialStatements key={r} kind={r as FinancialKind} company={company} preparedBy={preparedBy} />}
          {INV.includes(r as InventoryKind) && <InventoryReports key={r} kind={r as InventoryKind} company={company} preparedBy={preparedBy} />}
          {CTL.includes(r as ControlKind) && <ControlReports key={r} kind={r as ControlKind} company={company} preparedBy={preparedBy} />}
          {![...FIN, ...INV, ...CTL].includes(r as never) && <div className="py-10 text-center text-[13px] text-[#7F8EA0]">Choose a report from the list.</div>}
        </section>
      </div>
    </>
  );
}
