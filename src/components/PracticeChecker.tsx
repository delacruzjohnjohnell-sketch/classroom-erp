"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import {
  runPracticeChecks, summarize, computeNetIncome, PRACTICE_SETS, DEFAULT_PRACTICE_SET_ID,
  type CheckResult, type PracticeData,
} from "@/lib/practiceCheck";

const TEAL = "#12524F", RED = "#A6402F";

async function loadPracticeData(tenantId: string): Promise<PracticeData> {
  const rows = (table: string, cols: string) => supabase.from(table).select(cols).eq("tenant_id", tenantId);
  const count = (table: string) => supabase.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);

  const [tenant, accounts, entries, customers, vendors, items, employees, invoices, invoicePayments, bills, billPayments,
    quotes, loans, fixedAssets, recurring, payrollRuns, bankTxns, attachments, leave] = await Promise.all([
    supabase.from("tenants").select("books_locked_through, approval_threshold").eq("id", tenantId).single(),
    rows("accounts", "id, code, name, type"),
    rows("journal_entries", "id, entry_date, memo, journal_lines(account_id, debit, credit)"),
    rows("customers", "name"),
    rows("vendors", "name"),
    rows("items", "sku, name, qty_on_hand, unit_cost, reorder_point"),
    rows("employees", "name, salary, pay_type, hourly_rate"),
    rows("invoices", "id, total, tax_amount, status"),
    rows("invoice_payments", "invoice_id, amount"),
    rows("bills", "id, total, tax_amount, status, due_date"),
    rows("bill_payments", "bill_id, amount"),
    rows("quotes", "status"),
    rows("employee_loans", "principal, monthly_deduction, balance_remaining, status"),
    rows("fixed_assets", "name, cost, salvage_value, useful_life_months, accumulated_depreciation"),
    rows("recurring_entries", "memo, frequency, active"),
    rows("payroll_runs", "run_type, total"),
    rows("bank_transactions", "amount, reconciled, matched_journal_entry_id"),
    count("attachments"),
    count("leave_requests"),
  ]);

  const failed = [tenant, accounts, entries, customers, vendors, items, employees, invoices, invoicePayments, bills, billPayments,
    quotes, loans, fixedAssets, recurring, payrollRuns, bankTxns, attachments, leave].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const list = (r: { data: unknown }) => ((r.data as any[]) ?? []);
  return {
    tenant: tenant.data as any,
    accounts: list(accounts), entries: list(entries), customers: list(customers), vendors: list(vendors), items: list(items),
    employees: list(employees), invoices: list(invoices), invoicePayments: list(invoicePayments), bills: list(bills),
    billPayments: list(billPayments), quotes: list(quotes), loans: list(loans), fixedAssets: list(fixedAssets),
    recurring: list(recurring), payrollRuns: list(payrollRuns), bankTxns: list(bankTxns),
    attachments: attachments.count ?? 0, leaveRequests: leave.count ?? 0,
  };
}

function Row({ r }: { r: CheckResult }) {
  return (
    <div className="flex gap-2.5 py-2 border-b border-hairline text-[12.5px]">
      {r.pass ? <CheckCircle2 size={15} color={TEAL} className="mt-0.5 shrink-0" /> : <XCircle size={15} color={RED} className="mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <div className="font-semibold">{r.label}</div>
        <div className="text-[#6b6357] break-words">Expected {r.expected}<br />Found {r.actual}</div>
        {r.hint && <div className="mt-1" style={{ color: RED }}>{r.hint}</div>}
      </div>
    </div>
  );
}

function grouped(rows: CheckResult[]) {
  const order: string[] = [];
  rows.forEach((r) => { if (!order.includes(r.group)) order.push(r.group); });
  return order.map((g) => ({ group: g, rows: rows.filter((r) => r.group === g) }));
}

export default function PracticeCheckModal({ tenant, onClose }: { tenant: { id: string; name: string }; onClose: () => void }) {
  const [data, setData] = useState<PracticeData | null>(null);
  const [error, setError] = useState("");
  const [showPassed, setShowPassed] = useState(false);
  const [setId, setSetId] = useState(DEFAULT_PRACTICE_SET_ID);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadPracticeData(tenant.id);
        if (!cancelled) setData(loaded);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not read this company's data.");
      }
    })();
    return () => { cancelled = true; };
  }, [tenant.id]);

  const practiceSet = PRACTICE_SETS.find((p) => p.id === setId) ?? PRACTICE_SETS[0];
  const results: CheckResult[] | null = useMemo(() => (data ? runPracticeChecks(data, practiceSet) : null), [data, practiceSet]);
  const netIncome = data ? computeNetIncome(data) : 0;

  const s = results ? summarize(results) : null;
  const failed = results?.filter((r) => !r.pass) ?? [];
  const passed = results?.filter((r) => r.pass) ?? [];

  return (
    <Modal title={`Practice set check — ${tenant.name}`} onClose={onClose} wide>
      <label className="block text-[11px] font-bold uppercase tracking-wide text-[#8a8172] mt-3 mb-1" htmlFor="practice-set-select">Practice set</label>
      <select id="practice-set-select" className="input" value={setId} onChange={(e) => { setSetId(e.target.value); setShowPassed(false); }}>
        {PRACTICE_SETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <div className="text-[12px] text-[#6b6357] mt-1.5">{practiceSet.summary}</div>

      {!results && !error && <div className="py-10 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>}
      {error && <div className="mt-3 text-[13px]" style={{ color: RED }}>{error}</div>}
      {results && s && (
        <>
          <div className="mt-4 mb-3 flex items-baseline gap-3 flex-wrap">
            <div className="text-[22px] font-bold" style={{ color: s.failed === 0 ? TEAL : RED }}>{s.passed} / {s.total}</div>
            <div className="text-[12.5px] text-[#6b6357]">checks passed · {netIncome >= 0 ? "net profit" : "net loss"} so far</div>
          </div>
          {s.failed === 0 && <div className="text-[13px] mb-2" style={{ color: TEAL }}>Everything matches the practice set.</div>}

          {grouped(failed).map(({ group, rows }) => (
            <div key={group} className="mb-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#8a8172] mb-1">Needs attention · {group}</div>
              {rows.map((r) => <Row key={r.group + r.label} r={r} />)}
            </div>
          ))}

          {passed.length > 0 && (
            <button onClick={() => setShowPassed((v) => !v)} className="text-[12.5px] font-semibold text-teal mt-1">
              {showPassed ? "Hide" : "Show"} {passed.length} passed check{passed.length === 1 ? "" : "s"}
            </button>
          )}
          {showPassed && grouped(passed).map(({ group, rows }) => (
            <div key={group} className="mt-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#8a8172] mb-1">{group}</div>
              {rows.map((r) => <Row key={r.group + r.label} r={r} />)}
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}
