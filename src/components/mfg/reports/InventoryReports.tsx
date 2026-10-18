"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui";
import ReportSheet from "@/components/mfg/ReportSheet";
import { useLookups } from "@/components/mfg/useLookups";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { showQueryErrors } from "@/lib/queryErrors";
import { fmtAmount, longDate, shortDate } from "@/lib/mfgStatements";
import { qtyText } from "@/lib/mfgOps";

export type InventoryKind = "stockcard" | "schedule" | "wip" | "scrap";
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;
const yearAgo = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); };
const q = (n: number | null | undefined) => (n == null ? "" : qtyText(n));
const a = (n: number | null | undefined) => (n == null ? "" : fmtAmount(n));
const csvN = (n: number | null | undefined) => (n == null ? "" : Number(n).toFixed(2));

type Card = { seq: number; row_kind: string; posting_date: string; document_number: string | null; doc_type: string | null; memo: string | null; location: string | null;
  qty_in: number | null; qty_out: number | null; unit_cost: number | null; value_in: number | null; value_out: number | null; balance_qty: number; balance_value: number };
type Sched = { section: string; line_no: number; label: string; account_code: string | null; ledger: number; subledger: number | null; difference: number | null; note: string | null };
type Wip = { order_id: string; order_no: string; item_id: string; status: string; started_on: string; age_days: number; bucket: string; qty_planned: number; qty_good: number;
  material: number; labor: number; machine: number; overhead: number; relieved: number; wip: number };
type Scrap = { item_id: string; reason: string; orders: number; good_qty: number; scrap_qty: number; scrap_pct: number; unit_cost: number; scrap_value: number };

const DOC: Record<string, string> = { GR: "Goods receipt", GI: "Issue to production", FGR: "Finished goods receipt", TRF: "Transfer", ADJ: "Adjustment", DLV: "Delivery", REV: "Reversal" };

/** Stock card, schedule of inventories (PAS 2), work in process valuation and ageing, and scrap loss in pesos. */
export default function InventoryReports({ kind, company, preparedBy }: { kind: InventoryKind; company: string; preparedBy?: string }) {
  const { effectiveTenantId } = useSession();
  const { data: lk } = useLookups();
  const [asOf, setAsOf] = useState(today());
  const [from, setFrom] = useState(kind === "schedule" ? yearAgo() : monthStart());
  const [to, setTo] = useState(today());
  const [item, setItem] = useState("");
  const [withWip, setWithWip] = useState(false);
  const [card, setCard] = useState<Card[] | null>(null);
  const [sched, setSched] = useState<Sched[] | null>(null);
  const [wip, setWip] = useState<Wip[] | null>(null);
  const [scrap, setScrap] = useState<Scrap[] | null>(null);
  const [method, setMethod] = useState("STANDARD");
  const [gl, setGl] = useState<number | null>(null);

  const stocked = useMemo(() => lk.items.filter((i) => i.active && i.item_type !== "SERVICE"), [lk.items]);
  const name = (id: string) => lk.items.find((i) => i.item_id === id)?.name ?? "—";
  const unit = (id: string) => lk.items.find((i) => i.item_id === id)?.base_uom ?? "";

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const t = effectiveTenantId;
    if (kind === "stockcard") {
      if (!item || !from || !to || to < from) { setCard(null); return; }
      const r = await supabase.rpc("mfg_stock_card", { p_tenant: t, p_item: item, p_from: from, p_to: to, p_include_wip: withWip });
      showQueryErrors(r); setCard((r.data as Card[]) ?? []);
    } else if (kind === "schedule") {
      if (!from || !asOf || asOf < from) return;
      const [r, m] = await Promise.all([supabase.rpc("mfg_inventory_schedule", { p_tenant: t, p_as_of: asOf, p_from: from }), supabase.from("mfg_company_settings").select("costing_method").eq("tenant_id", t).maybeSingle()]);
      showQueryErrors(r, m); setSched((r.data as Sched[]) ?? []); setMethod((m.data as { costing_method?: string } | null)?.costing_method ?? "STANDARD");
    } else if (kind === "wip") {
      const [r, g] = await Promise.all([supabase.rpc("mfg_wip_report", { p_tenant: t, p_as_of: asOf }), supabase.rpc("mfg_account_balances", { p_tenant: t, p_from: null, p_to: asOf })]);
      showQueryErrors(r, g); setWip((r.data as Wip[]) ?? []);
      setGl(Number(((g.data as { code: string; closing: number }[]) ?? []).find((x) => x.code === "1210")?.closing ?? 0));
    } else {
      if (!from || !to || to < from) return;
      const r = await supabase.rpc("mfg_scrap_report", { p_tenant: t, p_from: from, p_to: to });
      showQueryErrors(r); setScrap((r.data as Scrap[]) ?? []);
    }
  }, [effectiveTenantId, kind, asOf, from, to, item, withWip]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const dates = kind === "schedule"
    ? <><div><Label>From</Label><input className="input" type="date" value={from} max={asOf} onChange={(e) => setFrom(e.target.value)} /></div><div><Label>To</Label><input className="input" type="date" value={asOf} min={from} onChange={(e) => setAsOf(e.target.value)} /></div></>
    : kind === "wip"
      ? <div><Label>As at</Label><input className="input" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>
      : <><div><Label>From</Label><input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div><div><Label>To</Label><input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div></>;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-3">
        {kind === "stockcard" && (
          <div style={{ minWidth: 260 }}><Label>Item</Label>
            <select className="input" value={item} onChange={(e) => setItem(e.target.value)}>
              <option value="">Choose an item…</option>
              {stocked.map((i) => <option key={i.item_id} value={i.item_id}>{i.sku} — {i.name}</option>)}
            </select></div>
        )}
        {dates}
        {kind === "stockcard" && <label className="text-[12.5px] text-[#A3B1C2] flex items-center gap-2 pb-2.5"><input type="checkbox" checked={withWip} onChange={(e) => setWithWip(e.target.checked)} /> Include the shop floor</label>}
      </div>

      {kind === "stockcard" && (!item ? <div className="py-10 text-center text-[13px] text-[#7F8EA0]">Choose an item to see its stock card.</div> : card && (
        <ReportSheet company={company} title="Stock Card" period={`${name(item)} (${unit(item)}) — ${shortDate(from)} to ${shortDate(to)}`} unitNote="(Quantities in the item’s unit; values in Philippine peso)" exportName="stock-card" preparedBy={preparedBy}
          csv={[["Date", "Document", "Type", "Details", "Location", "In", "Out", "Unit cost", "Value in", "Value out", "Balance qty", "Balance value"],
            ...card.map((r) => [r.posting_date, r.document_number ?? "", r.doc_type ?? "", r.memo ?? "", r.location ?? "", csvN(r.qty_in), csvN(r.qty_out), csvN(r.unit_cost), csvN(r.value_in), csvN(r.value_out), csvN(r.balance_qty), csvN(r.balance_value)])]}
          notes={["Each line is one stock document line, at the cost of the movement when it was posted. Revaluations of standard cost are posted to the ledger and are not movements of quantity, so they are not on the card.", "Transfers between stores appear as an issue from one and a receipt in the other."]}>
          <table className="rs-table">
            <thead><tr><th>Date</th><th>Document</th><th>Details</th><th>Store</th><th className="num">In</th><th className="num">Out</th><th className="num">Unit cost</th><th className="num">Value in</th><th className="num">Value out</th><th className="num">Balance</th><th className="num">Balance value</th></tr></thead>
            <tbody>
              {card.map((r) => (
                <tr key={r.seq} className={r.row_kind === "MOVE" ? "" : "strong"}>
                  <td>{r.row_kind === "MOVE" ? shortDate(r.posting_date) : ""}</td>
                  <td>{r.document_number ?? ""}</td>
                  <td>{r.row_kind === "MOVE" ? `${DOC[r.doc_type ?? ""] ?? r.doc_type ?? ""}${r.memo ? ` — ${r.memo}` : ""}` : r.memo}</td>
                  <td>{r.location ?? ""}</td>
                  <td className="num">{q(r.qty_in)}</td><td className="num">{q(r.qty_out)}</td><td className="num">{r.unit_cost == null ? "" : fmtAmount(r.unit_cost)}</td>
                  <td className="num">{a(r.value_in)}</td><td className="num">{a(r.value_out)}</td><td className="num">{qtyText(r.balance_qty)}</td><td className="num">{fmtAmount(r.balance_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportSheet>
      ))}

      {kind === "schedule" && sched && (() => {
        const carrying = sched.filter((s) => s.section === "CARRYING");
        const totLedger = carrying.reduce((s, r) => s + Number(r.ledger), 0);
        const tied = carrying.every((r) => r.subledger != null);
        const totSub = carrying.reduce((s, r) => s + Number(r.subledger ?? 0), 0);
        const exp = sched.find((s) => s.section === "EXPENSE");
        const wd = sched.filter((s) => s.section === "WRITEDOWN");
        return (
          <ReportSheet company={company} title="Schedule of Inventories (PAS 2)" period={`For the period ${longDate(from)} to ${longDate(asOf)}; carrying amounts as at ${longDate(asOf)}`} exportName="schedule-of-inventories" preparedBy={preparedBy}
            csv={[["Section", "Line", "Account", "Per general ledger", "Per stock records", "Difference"], ...sched.map((s) => [s.section, s.label, s.account_code ?? "", csvN(s.ledger), csvN(s.subledger), csvN(s.difference)])]}
            notes={[
              method === "STANDARD"
                ? "Cost formula: inventories are carried at standard cost, which is reviewed against actual cost; variances between actual and standard are charged to cost of sales (PAS 2.21)."
                : "Cost formula: inventories are carried at weighted average (moving average) cost, recalculated at every receipt (PAS 2.25).",
              "Inventories are measured at the lower of cost and net realisable value. Write-downs and count differences recognised in the period are listed below.",
              tied ? "The stock records (quantities × cost, and the cost held on open production orders) agree with the general ledger." : "The stock records are tied to the ledger for today’s date only; for an earlier date the ledger balance is the figure reported.",
            ]}>
            <h4>Carrying amount of inventories</h4>
            <table className="rs-table">
              <thead><tr><th>Class</th><th>Account</th><th className="num">Per general ledger</th>{tied && <th className="num">Per stock records</th>}{tied && <th className="num">Difference</th>}</tr></thead>
              <tbody>
                {carrying.map((r) => <tr key={r.line_no}><td>{r.label}</td><td>{r.account_code}</td><td className="num">{fmtAmount(r.ledger)}</td>{tied && <td className="num">{fmtAmount(r.subledger)}</td>}{tied && <td className="num">{fmtAmount(r.difference)}</td>}</tr>)}
                <tr className="tot"><td colSpan={2}>Total inventories</td><td className="num">{fmtAmount(totLedger)}</td>{tied && <td className="num">{fmtAmount(totSub)}</td>}{tied && <td className="num">{fmtAmount(totSub - totLedger)}</td>}</tr>
              </tbody>
            </table>
            <h4>Amounts recognised in profit or loss during the period</h4>
            <table className="rs-table">
              <tbody>
                {exp && <tr><td>{exp.label}</td><td>{exp.account_code}</td><td className="num">{fmtAmount(exp.ledger)}</td></tr>}
                {wd.map((r) => <tr key={r.line_no}><td>Write-down / loss: {r.label}</td><td>{r.account_code}</td><td className="num">{fmtAmount(r.ledger)}</td></tr>)}
              </tbody>
            </table>
          </ReportSheet>
        );
      })()}

      {kind === "wip" && wip && (() => {
        const tot = wip.reduce((s, r) => s + Number(r.wip), 0);
        const buckets = ["0-30", "31-60", "61-90", "Over 90"].map((b) => ({ b, v: wip.filter((r) => r.bucket === b).reduce((s, r) => s + Number(r.wip), 0), n: wip.filter((r) => r.bucket === b).length }));
        return (
          <ReportSheet company={company} title="Work in Process — Valuation and Ageing" period={`As at ${longDate(asOf)}`} exportName="wip-valuation" preparedBy={preparedBy}
            csv={[["Order", "Item", "Status", "Started", "Age (days)", "Bucket", "Planned", "Good", "Materials", "Labor", "Machine", "Overhead", "Relieved", "Work in process"],
              ...wip.map((r) => [r.order_no, name(r.item_id), r.status, r.started_on, String(r.age_days), r.bucket, csvN(r.qty_planned), csvN(r.qty_good), csvN(r.material), csvN(r.labor), csvN(r.machine), csvN(r.overhead), csvN(r.relieved), csvN(r.wip)])]}
            notes={["Work in process is the cost charged to an open production order (materials issued, labor, machine time and overhead) less what has been transferred to finished goods. Age counts from the first cost charged to the order.",
              gl != null && Math.abs(gl - tot) < 0.1 ? `The total agrees with account 1210 Work in Process in the general ledger (${fmtAmount(gl)}).` : `The general ledger shows ${gl == null ? "—" : fmtAmount(gl)} in account 1210; the difference is ${gl == null ? "—" : fmtAmount(tot - gl)}.`]}>
            <table className="rs-table">
              <thead><tr><th>Order</th><th>Item</th><th>Status</th><th>Started</th><th className="num">Age (days)</th><th className="num">Materials</th><th className="num">Labor</th><th className="num">Machine</th><th className="num">Overhead</th><th className="num">Relieved</th><th className="num">Work in process</th></tr></thead>
              <tbody>
                {wip.map((r) => <tr key={r.order_id}><td>{r.order_no}</td><td>{name(r.item_id)}</td><td>{r.status.replace(/_/g, " ").toLowerCase()}</td><td>{shortDate(r.started_on)}</td><td className="num">{r.age_days}</td>
                  <td className="num">{fmtAmount(r.material)}</td><td className="num">{fmtAmount(r.labor)}</td><td className="num">{fmtAmount(r.machine)}</td><td className="num">{fmtAmount(r.overhead)}</td><td className="num">{fmtAmount(r.relieved)}</td><td className="num">{fmtAmount(r.wip)}</td></tr>)}
                <tr className="tot"><td colSpan={10}>Total work in process</td><td className="num">{fmtAmount(tot)}</td></tr>
              </tbody>
            </table>
            <h4>Ageing</h4>
            <table className="rs-table"><thead><tr><th>Days since the first cost</th><th className="num">Orders</th><th className="num">Work in process</th></tr></thead>
              <tbody>{buckets.map((x) => <tr key={x.b}><td>{x.b}</td><td className="num">{x.n}</td><td className="num">{fmtAmount(x.v)}</td></tr>)}</tbody></table>
            {wip.length === 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: "#555" }}>No production order holds cost on this date.</div>}
          </ReportSheet>
        );
      })()}

      {kind === "scrap" && scrap && (() => {
        const tot = scrap.reduce((s, r) => s + Number(r.scrap_value), 0);
        return (
          <ReportSheet company={company} title="Scrap Loss Report" period={`For the period ${longDate(from)} to ${longDate(to)}`} exportName="scrap-loss" preparedBy={preparedBy}
            csv={[["Item", "Reason", "Orders", "Good", "Scrap", "Scrap %", "Cost per unit", "Loss"], ...scrap.map((r) => [name(r.item_id), r.reason, String(r.orders), csvN(r.good_qty), csvN(r.scrap_qty), csvN(r.scrap_pct), csvN(r.unit_cost), csvN(r.scrap_value)])]}
            notes={["Scrap is the quantity recorded as scrapped when operations were confirmed (confirmations reversed in the period net out). It is valued at the standard cost of one good unit on the production order, so the loss is the cost of the finished unit that was not obtained.",
              "Scrap % = scrap ÷ (good + scrap)."]}>
            <table className="rs-table">
              <thead><tr><th>Item</th><th>Reason</th><th className="num">Orders</th><th className="num">Good</th><th className="num">Scrap</th><th className="num">Scrap %</th><th className="num">Cost per unit</th><th className="num">Loss</th></tr></thead>
              <tbody>
                {scrap.map((r, i) => <tr key={i}><td>{name(r.item_id)}</td><td>{r.reason}</td><td className="num">{r.orders}</td><td className="num">{qtyText(r.good_qty)}</td><td className="num">{qtyText(r.scrap_qty)}</td><td className="num">{r.scrap_pct}%</td><td className="num">{fmtAmount(r.unit_cost)}</td><td className="num">{fmtAmount(r.scrap_value)}</td></tr>)}
                <tr className="tot"><td colSpan={7}>Total scrap loss</td><td className="num">{fmtAmount(tot)}</td></tr>
              </tbody>
            </table>
            {scrap.length === 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: "#555" }}>No scrap was recorded in this period.</div>}
          </ReportSheet>
        );
      })()}
    </div>
  );
}
