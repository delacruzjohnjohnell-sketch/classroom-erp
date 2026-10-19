"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";
import { Label } from "@/components/ui";
import ReportSheet from "@/components/mfg/ReportSheet";
import { useLookups } from "@/components/mfg/useLookups";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { showQueryErrors } from "@/lib/queryErrors";
import { fmtAmount, longDate, shortDate } from "@/lib/mfgStatements";
import { qtyText } from "@/lib/mfgOps";

export type ControlKind = "grir" | "match" | "integrity" | "ageing" | "audit";
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;
const yearAgo = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); };
const csvN = (n: number | null | undefined) => (n == null ? "" : Number(n).toFixed(2));

type Grir = { po_no: string; vendor: string | null; item_id: string; ordered: number; received: number; invoiced: number; uninvoiced: number; unit_cost: number; value: number; first_receipt: string | null; age_days: number | null; bucket: string };
type Match = { invoice_no: string; vendor: string | null; vendor_ref: string | null; invoice_date: string; total: number; status: string; reason: string | null; worst_qty_var_pct: number | null; worst_price_var_pct: number | null; tolerance_pct: number | null; decided_by: string | null; decided_at: string | null };
type Check = { check_no: number; area: string; title: string; status: "PASS" | "FAIL" | "WARN"; expected: string; actual: string; detail: string };
type Open = { side: "AR" | "AP"; doc_no: string; party: string | null; doc_date: string; due_date: string | null; total: number; paid: number; balance: number; days_overdue: number; bucket: string };
type Trail = { at: string; kind: string; who: string | null; what: string; ref: string | null };
const BUCKETS = ["Current", "1-30", "31-60", "61-90", "Over 90"];
const STATUS_TEXT: Record<string, string> = { HELD: "On hold", POSTED: "Approved and posted", REJECTED: "Rejected", VOID: "Voided" };

/** GR/IR ageing, three-way-match exceptions, the books integrity check, receivables and payables ageing, and the audit trail. */
export default function ControlReports({ kind, company, preparedBy }: { kind: ControlKind; company: string; preparedBy?: string }) {
  const { effectiveTenantId } = useSession();
  const { data: lk } = useLookups();
  const [asOf, setAsOf] = useState(today());
  const [from, setFrom] = useState(kind === "match" ? yearAgo() : monthStart());
  const [to, setTo] = useState(today());
  const [grir, setGrir] = useState<Grir[] | null>(null);
  const [gl, setGl] = useState<number | null>(null);
  const [match, setMatch] = useState<Match[] | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [open, setOpen] = useState<Open[] | null>(null);
  const [trail, setTrail] = useState<Trail[] | null>(null);
  const name = (id: string) => lk.items.find((i) => i.item_id === id)?.name ?? "—";

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const t = effectiveTenantId;
    if (kind === "grir") {
      const [r, g] = await Promise.all([supabase.rpc("mfg_grir_aging", { p_tenant: t, p_as_of: asOf }), supabase.rpc("mfg_account_balances", { p_tenant: t, p_from: null, p_to: asOf })]);
      showQueryErrors(r, g); setGrir((r.data as Grir[]) ?? []);
      setGl(Number(((g.data as { code: string; closing: number }[]) ?? []).find((x) => x.code === "2050")?.closing ?? 0));
    } else if (kind === "match") {
      if (!from || !to || to < from) return;
      const r = await supabase.rpc("mfg_match_exceptions", { p_tenant: t, p_from: from, p_to: to });
      showQueryErrors(r); setMatch((r.data as Match[]) ?? []);
    } else if (kind === "ageing") {
      const r = await supabase.rpc("mfg_open_items", { p_tenant: t, p_as_of: asOf });
      showQueryErrors(r); setOpen(((r.data as Open[]) ?? []).map((x) => ({ ...x, total: Number(x.total), paid: Number(x.paid), balance: Number(x.balance) })));
    } else if (kind === "audit") {
      if (!from || !to || to < from) return;
      const r = await supabase.rpc("mfg_audit_trail", { p_tenant: t, p_from: from, p_to: to });
      showQueryErrors(r); setTrail((r.data as Trail[]) ?? []);
    } else {
      const r = await supabase.rpc("mfg_integrity_check", { p_tenant: t });
      showQueryErrors(r); setChecks((r.data as Check[]) ?? []);
    }
  }, [effectiveTenantId, kind, asOf, from, to]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {(kind === "grir" || kind === "ageing") && <div className="flex flex-wrap items-end gap-3 mb-3"><div><Label>As at</Label><input className="input" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div></div>}
      {(kind === "match" || kind === "audit") && (
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div><Label>From</Label><input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>To</Label><input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      )}

      {kind === "grir" && grir && (() => {
        const tot = grir.reduce((s, r) => s + Number(r.value), 0);
        const buckets = ["0-30", "31-60", "61-90", "Over 90", "Invoice only"].map((b) => ({ b, rows: grir.filter((r) => r.bucket === b) })).filter((x) => x.rows.length);
        const glCredit = gl == null ? null : -gl;
        return (
          <ReportSheet company={company} title="Goods Received, Not Invoiced (GR/IR) — Ageing" period={`As at ${longDate(asOf)}`} exportName="grir-ageing" preparedBy={preparedBy}
            csv={[["PO", "Vendor", "Item", "Ordered", "Received", "Invoiced", "Not invoiced", "Price", "Value", "First receipt", "Age (days)", "Bucket"],
              ...grir.map((r) => [r.po_no, r.vendor ?? "", name(r.item_id), csvN(r.ordered), csvN(r.received), csvN(r.invoiced), csvN(r.uninvoiced), csvN(r.unit_cost), csvN(r.value), r.first_receipt ?? "", r.age_days == null ? "" : String(r.age_days), r.bucket])]}
            notes={["The GR/IR account holds the value of goods received for which the vendor’s invoice has not been posted yet. It is valued at the purchase-order price. A balance that stays for long means an invoice is missing, or a receipt was posted twice.",
              "Age counts from the first receipt of the line. A negative amount is an invoice posted for goods not yet received.",
              glCredit != null && Math.abs(glCredit - tot) < 0.1 ? `The total agrees with account 2050 GR/IR in the general ledger (${fmtAmount(glCredit)}).` : `The general ledger shows ${glCredit == null ? "—" : fmtAmount(glCredit)} in account 2050; the difference is ${glCredit == null ? "—" : fmtAmount(tot - glCredit)}.`]}>
            <table className="rs-table">
              <thead><tr><th>PO</th><th>Vendor</th><th>Item</th><th className="num">Received</th><th className="num">Invoiced</th><th className="num">Not invoiced</th><th className="num">Price</th><th className="num">Value</th><th>First receipt</th><th className="num">Age (days)</th></tr></thead>
              <tbody>
                {grir.map((r, i) => <tr key={i}><td>{r.po_no}</td><td>{r.vendor}</td><td>{name(r.item_id)}</td><td className="num">{qtyText(r.received)}</td><td className="num">{qtyText(r.invoiced)}</td><td className="num">{qtyText(r.uninvoiced)}</td>
                  <td className="num">{fmtAmount(r.unit_cost)}</td><td className="num">{fmtAmount(r.value)}</td><td>{r.first_receipt ? shortDate(r.first_receipt) : ""}</td><td className="num">{r.age_days ?? ""}</td></tr>)}
                <tr className="tot"><td colSpan={7}>Total goods received, not invoiced</td><td className="num">{fmtAmount(tot)}</td><td colSpan={2} /></tr>
              </tbody>
            </table>
            <h4>Ageing</h4>
            <table className="rs-table"><thead><tr><th>Days since first receipt</th><th className="num">Lines</th><th className="num">Value</th></tr></thead>
              <tbody>{buckets.map((x) => <tr key={x.b}><td>{x.b}</td><td className="num">{x.rows.length}</td><td className="num">{fmtAmount(x.rows.reduce((s, r) => s + Number(r.value), 0))}</td></tr>)}</tbody></table>
            {grir.length === 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: "#555" }}>Every receipt has been invoiced.</div>}
          </ReportSheet>
        );
      })()}

      {kind === "match" && match && (
        <ReportSheet company={company} title="Three-Way Match Exceptions" period={`Vendor invoices dated ${longDate(from)} to ${longDate(to)}`} exportName="match-exceptions" preparedBy={preparedBy}
          csv={[["Invoice", "Vendor", "Vendor ref", "Date", "Total", "Status", "Reason", "Worst quantity %", "Worst price %", "Tolerance %", "Decided by", "Decided at"],
            ...match.map((r) => [r.invoice_no, r.vendor ?? "", r.vendor_ref ?? "", r.invoice_date, csvN(r.total), STATUS_TEXT[r.status] ?? r.status, r.reason ?? "", csvN(r.worst_qty_var_pct), csvN(r.worst_price_var_pct), csvN(r.tolerance_pct), r.decided_by ?? "", r.decided_at ?? ""])]}
          notes={["A vendor invoice is matched to the purchase order and the goods received. When quantity or price differs by more than the tolerance, the invoice is put on hold and appears here with the reason, until someone approves or rejects it.", "“On hold” invoices have not been posted to the books."]}>
          <table className="rs-table">
            <thead><tr><th>Invoice</th><th>Vendor</th><th>Their ref.</th><th>Date</th><th className="num">Total</th><th>Status</th><th>Why it failed</th><th className="num">Qty %</th><th className="num">Price %</th><th className="num">Tol. %</th><th>Decided by</th></tr></thead>
            <tbody>
              {match.map((r) => <tr key={r.invoice_no}><td>{r.invoice_no}</td><td>{r.vendor}</td><td>{r.vendor_ref}</td><td>{shortDate(r.invoice_date)}</td><td className="num">{fmtAmount(r.total)}</td><td>{STATUS_TEXT[r.status] ?? r.status}</td><td>{r.reason}</td>
                <td className="num">{r.worst_qty_var_pct ?? ""}</td><td className="num">{r.worst_price_var_pct ?? ""}</td><td className="num">{r.tolerance_pct ?? ""}</td><td>{r.decided_by ?? ""}{r.decided_at ? ` ${shortDate(r.decided_at.slice(0, 10))}` : ""}</td></tr>)}
            </tbody>
          </table>
          {match.length === 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: "#555" }}>No vendor invoice failed the match in this period.</div>}
        </ReportSheet>
      )}


      {kind === "ageing" && open && (["AR", "AP"] as const).map((side) => {
        const rows = open.filter((r) => r.side === side);
        const tot = rows.reduce((s, r) => s + r.balance, 0);
        const title = side === "AR" ? "Receivables Ageing" : "Payables Ageing";
        return (
          <div key={side} style={{ marginBottom: 24 }}>
            <ReportSheet company={company} title={title} period={`As at ${longDate(asOf)}`} exportName={side === "AR" ? "receivables-ageing" : "payables-ageing"} preparedBy={preparedBy}
              csv={[["Document", side === "AR" ? "Customer" : "Vendor", "Date", "Due", "Total", "Paid", "Balance", "Days overdue", "Bucket"],
                ...rows.map((r) => [r.doc_no, r.party ?? "", r.doc_date, r.due_date ?? "", csvN(r.total), csvN(r.paid), csvN(r.balance), String(r.days_overdue), r.bucket])]}
              notes={[side === "AR" ? "Amounts customers still owe, grouped by how many days past the due date they are. “Current” means not yet due." : "Amounts owed to vendors, grouped by how many days past the due date they are. “Current” means not yet due.",
                "The total agrees with the control account (Accounts " + (side === "AR" ? "Receivable" : "Payable") + ") when nothing was posted to it by hand; the integrity check tests this."]}>
              <table className="rs-table">
                <thead><tr><th>Document</th><th>{side === "AR" ? "Customer" : "Vendor"}</th><th>Date</th><th>Due</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th><th className="num">Days overdue</th></tr></thead>
                <tbody>
                  {rows.map((r) => <tr key={r.doc_no}><td>{r.doc_no}</td><td>{r.party}</td><td>{shortDate(r.doc_date)}</td><td>{r.due_date ? shortDate(r.due_date) : ""}</td>
                    <td className="num">{fmtAmount(r.total)}</td><td className="num">{fmtAmount(r.paid)}</td><td className="num">{fmtAmount(r.balance)}</td><td className="num">{r.days_overdue > 0 ? r.days_overdue : ""}</td></tr>)}
                  <tr className="tot"><td colSpan={6}>Total</td><td className="num">{fmtAmount(tot)}</td><td /></tr>
                </tbody>
              </table>
              <h4>Ageing</h4>
              <table className="rs-table"><thead><tr><th>Days past due</th><th className="num">Documents</th><th className="num">Balance</th></tr></thead>
                <tbody>{BUCKETS.map((b) => { const x = rows.filter((r) => r.bucket === b); return <tr key={b}><td>{b}</td><td className="num">{x.length}</td><td className="num">{fmtAmount(x.reduce((s, r) => s + r.balance, 0))}</td></tr>; })}</tbody></table>
              {rows.length === 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: "#555" }}>Nothing is outstanding.</div>}
            </ReportSheet>
          </div>
        );
      })}

      {kind === "audit" && trail && (
        <ReportSheet company={company} title="Audit Trail" period={`${longDate(from)} to ${longDate(to)}`} unitNote="(Changes to master data and control events)" exportName="audit-trail" preparedBy={preparedBy}
          csv={[["When", "Kind", "Who", "What", "Reference"], ...trail.map((r) => [r.at, r.kind, r.who ?? "", r.what, r.ref ?? ""])]}
          notes={["Who changed what, and when: master-data changes (items, vendors, rates, work centers) and control events (overrides, approvals, reversals, price-variance decisions). Journal postings themselves are in the journal voucher register."]}>
          <table className="rs-table">
            <thead><tr><th>When</th><th>Kind</th><th>Who</th><th>What</th><th>Reference</th></tr></thead>
            <tbody>
              {trail.map((r, i) => <tr key={i}><td>{shortDate(r.at.slice(0, 10))} {r.at.slice(11, 16)}</td><td>{r.kind}</td><td>{r.who ?? ""}</td><td>{r.what}</td><td>{r.ref ?? ""}</td></tr>)}
            </tbody>
          </table>
          {trail.length === 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: "#555" }}>Nothing was recorded in this period.</div>}
        </ReportSheet>
      )}

      {kind === "integrity" && checks && (() => {
        const fails = checks.filter((c) => c.status === "FAIL").length, warns = checks.filter((c) => c.status === "WARN").length;
        return (
          <div>
            <div className="flex items-center gap-2 text-[13px] mb-3" style={{ color: fails ? "#FF6B7A" : warns ? "#F2B13C" : "#22D3C5" }}>
              {fails ? <AlertTriangle size={15} /> : warns ? <CircleAlert size={15} /> : <CheckCircle2 size={15} />}
              {fails ? `${fails} check${fails > 1 ? "s" : ""} failed — the books need attention.` : warns ? `All checks passed; ${warns} warning${warns > 1 ? "s" : ""} to look at.` : "All checks passed."}
            </div>
            <ReportSheet company={company} title="Books Integrity Check" period={`Run on ${longDate(today())}`} unitNote="(Amounts in Philippine peso; counts as stated)" exportName="integrity-check" preparedBy={preparedBy}
              csv={[["No.", "Area", "Check", "Result", "Expected", "Found", "Where to look"], ...checks.map((c) => [String(c.check_no), c.area, c.title, c.status, c.expected, c.actual, c.detail])]}
              notes={["These are the questions an auditor asks of the books: do debits equal credits, does each sub-ledger agree with its control account, does every stock movement have an entry. A FAIL means the books contradict themselves and must be corrected; a WARN is worth a look but is not an error."]}>
              <table className="rs-table">
                <thead><tr><th>No.</th><th>Area</th><th>Check</th><th>Result</th><th className="num">Expected</th><th className="num">Found</th><th>Where to look</th></tr></thead>
                <tbody>
                  {checks.map((c) => <tr key={c.check_no} className={c.status === "PASS" ? "" : "strong"}><td>{c.check_no}</td><td>{c.area}</td><td>{c.title}</td>
                    <td style={{ color: c.status === "PASS" ? "#1a7f37" : c.status === "WARN" ? "#9a6700" : "#cf222e", fontWeight: 700 }}>{c.status === "PASS" ? "Pass" : c.status === "WARN" ? "Warning" : "FAIL"}</td>
                    <td className="num">{c.expected}</td><td className="num">{c.actual}</td><td>{c.detail}</td></tr>)}
                </tbody>
              </table>
            </ReportSheet>
          </div>
        );
      })()}
    </div>
  );
}
