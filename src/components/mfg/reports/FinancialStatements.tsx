"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Label } from "@/components/ui";
import ReportSheet from "@/components/mfg/ReportSheet";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { showQueryErrors } from "@/lib/queryErrors";
import {
  buildCashFlow, buildFinancialPosition, buildIncomeStatement, buildTrialBalance, longDate, monthEndBefore, priorPeriod, shortDate, toCsvRows, type Bal,
} from "@/lib/mfgStatements";

export type FinancialKind = "position" | "income" | "trial" | "cashflow";
const dayBefore = (s: string) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;

type Raw = { code: string; name: string; type: Bal["type"]; opening: number; debit: number; credit: number; closing: number };
const norm = (rows: Raw[] | null): Bal[] => (rows ?? []).map((r) => ({ ...r, opening: Number(r.opening), debit: Number(r.debit), credit: Number(r.credit), closing: Number(r.closing) }));

/** The statement of financial position, the statement of comprehensive income, and the trial balance, all from the same balances. */
export default function FinancialStatements({ kind, company, preparedBy }: { kind: FinancialKind; company: string; preparedBy?: string }) {
  const { effectiveTenantId } = useSession();
  const [asOf, setAsOf] = useState(today());
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [compare, setCompare] = useState(true);
  const [cols, setCols] = useState<Bal[][] | null>(null);

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const t = effectiveTenantId;
    const calls: PromiseLike<{ data: unknown; error: { message: string } | null }>[] = [];
    if (kind === "cashflow") {
      if (!from || !to || to < from) return;
      calls.push(supabase.rpc("mfg_account_balances", { p_tenant: t, p_from: null, p_to: dayBefore(from) }));
      calls.push(supabase.rpc("mfg_account_balances", { p_tenant: t, p_from: null, p_to: to }));
    } else if (kind === "income") {
      if (!from || !to || to < from) return;
      calls.push(supabase.rpc("mfg_account_balances", { p_tenant: t, p_from: from, p_to: to }));
      if (compare) { const p = priorPeriod(from, to); calls.push(supabase.rpc("mfg_account_balances", { p_tenant: t, p_from: p.from, p_to: p.to })); }
    } else {
      if (!asOf) return;
      calls.push(supabase.rpc("mfg_account_balances", { p_tenant: t, p_from: null, p_to: asOf }));
      if (kind === "position" && compare) calls.push(supabase.rpc("mfg_account_balances", { p_tenant: t, p_from: null, p_to: monthEndBefore(asOf) }));
    }
    const res = await Promise.all(calls);
    showQueryErrors(...res);
    setCols(res.map((r) => norm(r.data as Raw[] | null)));
  }, [effectiveTenantId, kind, asOf, from, to, compare]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const built = useMemo(() => {
    if (!cols) return null;
    if (kind === "cashflow") {
      const c = buildCashFlow(cols[0], cols[1]);
      return { lines: c.lines, columns: [`${shortDate(from)} – ${shortDate(to)}`], ok: c.reconciles, okText: "Opening cash plus the net change equals closing cash.", badText: "The cash flows do not add up to the change in cash — the books need attention (see the integrity check)." };
    }
    if (kind === "trial") {
      const tb = buildTrialBalance(cols[0]);
      return { lines: tb.lines, columns: ["Debit", "Credit"], ok: tb.balanced, okText: "Total debits equal total credits.", badText: "Total debits and credits differ — the books are out of balance." };
    }
    if (kind === "position") {
      const p = buildFinancialPosition(cols);
      return { lines: p.lines, columns: cols.map((_, i) => (i === 0 ? shortDate(asOf) : shortDate(monthEndBefore(asOf)))), ok: p.balanced, okText: "Total assets equal total equity and liabilities.", badText: "Assets and equity plus liabilities differ — the books are out of balance." };
    }
    const i = buildIncomeStatement(cols);
    const pp = priorPeriod(from, to);
    return { lines: i.lines, columns: cols.map((_, k) => (k === 0 ? `${shortDate(from)} – ${shortDate(to)}` : `${shortDate(pp.from)} – ${shortDate(pp.to)}`)), ok: true, okText: "", badText: "" };
  }, [cols, kind, asOf, from, to]);

  const title = kind === "cashflow" ? "Statement of Cash Flows" : kind === "position" ? "Statement of Financial Position" : kind === "income" ? "Statement of Comprehensive Income" : "Trial Balance";
  const period = kind === "income" || kind === "cashflow" ? `For the period ${longDate(from)} to ${longDate(to)}` : `As at ${longDate(asOf)}`;
  const notes: string[] = kind === "cashflow" ? [
    "Prepared by the indirect method (PAS 7, Statement of Cash Flows): profit is adjusted for non-cash items and for changes in working capital.",
    "Cash and cash equivalents are the cash and bank accounts. Investing activities are purchases and disposals of fixed assets; financing activities are the owner’s contributions and withdrawals and long-term borrowings.",
    "No interest or income tax is separately presented because none has been recorded.",
  ] : kind === "position" ? [
    "Assets and liabilities are classified as current and non-current, as PAS 1 (Presentation of Financial Statements) requires.",
    "Inventories are measured at cost (PAS 2). See the Schedule of Inventories for the classes, the cost recognised as an expense, and the write-downs.",
    "Accumulated depreciation is shown against Fixed assets. Retained earnings is the profit accumulated to this date; no year-end closing entry has been made.",
  ] : kind === "income" ? [
    "Expenses are presented by function (PAS 1): cost of sales first, then operating expenses.",
    "Production costs absorbed into inventory (applied direct labor, machine and fixed overhead) are credited against operating expenses here; they reach cost of sales when the goods are sold.",
    "Purchase price, usage and other manufacturing variances still open at the end of the period are part of cost of sales. No income tax expense has been recorded.",
  ] : [
    "Closing balance of every account with a balance on the date shown. Accounts with a nil balance are left out.",
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-3">
        {kind === "income" || kind === "cashflow" ? (
          <>
            <div><Label>From</Label><input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label>To</Label><input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
          </>
        ) : <div><Label>As at</Label><input className="input" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>}
        {kind !== "trial" && kind !== "cashflow" && (
          <label className="text-[12.5px] text-[#A3B1C2] flex items-center gap-2 pb-2.5"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
            {kind === "position" ? "Compare with the end of the previous month" : "Compare with the period just before"}</label>
        )}
      </div>
      {built && kind !== "income" && (
        <div className="flex items-center gap-2 text-[12.5px] mb-2" style={{ color: built.ok ? "#22D3C5" : "#FF6B7A" }}>
          {built.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {built.ok ? built.okText : built.badText}
        </div>
      )}
      {built ? (
        <ReportSheet company={company} title={title} period={period} columns={built.columns} lines={built.lines} notes={notes} exportName={title.toLowerCase().replace(/\s+/g, "-")}
          csv={toCsvRows(built.lines, built.columns)} preparedBy={preparedBy} />
      ) : <div className="py-10 text-center text-[13px] text-[#7F8EA0]">Loading…</div>}
    </div>
  );
}
