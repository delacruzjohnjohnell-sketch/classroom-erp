"use client";

// Finance for a Manufacturing company: the journal voucher register and form, the chart of accounts, and recurring entries.
// Closing a month (the books lock) is done in Period end, so it is only mentioned here. The Standard Financials screen is not used.
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import VoucherRegister from "@/components/mfg/VoucherRegister";
import { ChartOfAccountsPanel, RecurringPanel } from "@/components/mfg/FinanceSetupPanels";
import { useSession } from "@/lib/session";

const TABS = [["vouchers", "Journal vouchers"], ["accounts", "Chart of accounts"], ["recurring", "Recurring entries"]] as const;
const MONO = 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';

export default function FinancePage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>}>
        <FinanceBody />
      </Suspense>
    </AppShell>
  );
}

function FinanceBody() {
  const router = useRouter();
  const params = useSearchParams();
  const { profile } = useSession();
  const isTeacher = profile?.role === "teacher";
  const tab = TABS.find((t) => t[0] === params.get("tab"))?.[0] ?? "vouchers";
  const period = /^\d{4}-\d{2}$/.test(params.get("period") ?? "") ? params.get("period")! : undefined;

  return (
    <>
      <div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-[#7F8EA0]" style={{ fontFamily: MONO }}>Manufacturing</div>
        <h1 className="text-[20px] font-semibold">Finance</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1 max-w-[800px]">
          Every posting in the books is a numbered voucher. Documents (receipts, invoices, issues, completions, shipments) write theirs automatically; adjusting entries you prepare here.
          Months are closed in <b>Period end</b>, which locks the books through the last day.
          {isTeacher && " You are looking at a student’s company: you can approve or send back vouchers, but only the student prepares them."}
        </div>
      </div>

      <div className="flex gap-1 flex-wrap border-b border-hairline mt-4" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => router.replace(`/mfg/finance?tab=${id}`)}
            className={`px-3 py-2 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors ${tab === id ? "text-gold border-[#F2B13C]" : "text-[#A3B1C2] border-transparent hover:text-ink"}`}>{label}</button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "vouchers" && <VoucherRegister initialPeriod={period} />}
        {tab === "accounts" && <ChartOfAccountsPanel readOnly={isTeacher} />}
        {tab === "recurring" && <RecurringPanel readOnly={isTeacher} />}
      </div>
    </>
  );
}
