"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { FileText, Scale, Receipt, Package, Truck, ShoppingCart, Briefcase, Download, Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Panel, Empty } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { money, round2, type Account } from "@/lib/types";
import { computeAccountBalances, type EntryWithLines } from "@/lib/metrics";
import { agingBucket } from "@/lib/payments";

const TEAL = "#12524F", GOLD = "#C08A2E", RED = "#A6402F", LINE = "#DDD8CC", INK = "#1B2430";
const PIE_COLORS = ["#12524F", "#C08A2E", "#A6402F", "#5B7B93", "#8A8172", "#7A9E8E"];
const tooltipStyle = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 12 };

type ReportKey = "pnl" | "balance" | "trial" | "arAging" | "apAging" | "inventory" | "procurement" | "sales" | "hr";
const REPORTS: { key: ReportKey; label: string; icon: React.ReactNode }[] = [
  { key: "pnl", label: "Income statement", icon: <FileText size={14} /> },
  { key: "balance", label: "Balance sheet", icon: <Scale size={14} /> },
  { key: "trial", label: "Trial balance", icon: <Receipt size={14} /> },
  { key: "arAging", label: "A/R aging", icon: <ShoppingCart size={14} /> },
  { key: "apAging", label: "A/P aging", icon: <Truck size={14} /> },
  { key: "inventory", label: "Inventory", icon: <Package size={14} /> },
  { key: "procurement", label: "Procurement", icon: <Truck size={14} /> },
  { key: "sales", label: "Sales", icon: <ShoppingCart size={14} /> },
  { key: "hr", label: "HR", icon: <Briefcase size={14} /> },
];

export default function ReportsPage() {
  return <AppShell><ReportsBody /></AppShell>;
}

function ReportsBody() {
  const { effectiveTenantId } = useSession();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ReportKey>("pnl");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<EntryWithLines[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [pos, setPOs] = useState<any[]>([]);
  const [sos, setSOs] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [invoicePayments, setInvoicePayments] = useState<any[]>([]);
  const [billPayments, setBillPayments] = useState<any[]>([]);

  useEffect(() => {
    if (!effectiveTenantId) return;
    (async () => {
      setLoading(true);
      const [acc, ent, it, po, so, emp, ip, bp] = await Promise.all([
        supabase.from("accounts").select("*").eq("tenant_id", effectiveTenantId),
        supabase.from("journal_entries").select("id, entry_date, memo, journal_lines(*)").eq("tenant_id", effectiveTenantId),
        supabase.from("items").select("*").eq("tenant_id", effectiveTenantId),
        supabase.from("purchase_orders").select("*, vendors(name)").eq("tenant_id", effectiveTenantId),
        supabase.from("sales_orders").select("*, customers(name)").eq("tenant_id", effectiveTenantId),
        supabase.from("employees").select("*").eq("tenant_id", effectiveTenantId),
        supabase.from("invoice_payments").select("*").eq("tenant_id", effectiveTenantId),
        supabase.from("bill_payments").select("*").eq("tenant_id", effectiveTenantId),
      ]);
      setAccounts((acc.data as Account[]) ?? []);
      setEntries((ent.data as any as EntryWithLines[]) ?? []);
      setItems(it.data ?? []);
      setPOs(po.data ?? []);
      setSOs(so.data ?? []);
      setEmployees(emp.data ?? []);
      setInvoicePayments(ip.data ?? []);
      setBillPayments(bp.data ?? []);
      setLoading(false);
    })();
  }, [effectiveTenantId]);

  const entriesInRange = useMemo(() => entries.filter((e) => (!from || e.entry_date >= from) && (!to || e.entry_date <= to)), [entries, from, to]);
  const bal = useMemo(() => computeAccountBalances(entriesInRange), [entriesInRange]);

  const revenueLines = accounts.filter((a) => a.type === "revenue").map((a) => ({ ...a, amount: -(bal[a.id] || 0) }));
  const expenseLines = accounts.filter((a) => a.type === "expense").map((a) => ({ ...a, amount: bal[a.id] || 0 }));
  const totalRevenue = revenueLines.reduce((s, l) => s + l.amount, 0);
  const totalExpenses = expenseLines.reduce((s, l) => s + l.amount, 0);
  const netIncome = totalRevenue - totalExpenses;

  const assetLines = accounts.filter((a) => a.type === "asset").map((a) => ({ ...a, amount: bal[a.id] || 0 }));
  const liabilityLines = accounts.filter((a) => a.type === "liability").map((a) => ({ ...a, amount: -(bal[a.id] || 0) }));
  const equityLines = accounts.filter((a) => a.type === "equity").map((a) => ({ ...a, amount: -(bal[a.id] || 0) }));
  const totalAssets = assetLines.reduce((s, l) => s + l.amount, 0);
  const totalLiabilities = liabilityLines.reduce((s, l) => s + l.amount, 0);
  const totalEquity = equityLines.reduce((s, l) => s + l.amount, 0) + netIncome;
  const balanceCheck = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;

  const trialRows = accounts.map((a) => {
    const v = bal[a.id] || 0;
    const debitNormal = a.type === "asset" || a.type === "expense";
    return { code: a.code, name: a.name, debit: debitNormal ? Math.max(v, 0) : Math.max(-v, 0), credit: debitNormal ? Math.max(-v, 0) : Math.max(v, 0) };
  });
  const trialDebits = trialRows.reduce((s, r) => s + r.debit, 0);
  const trialCredits = trialRows.reduce((s, r) => s + r.credit, 0);

  const inventoryRows = [...items].sort((a, b) => b.qty_on_hand * b.unit_cost - a.qty_on_hand * a.unit_cost);
  const inventoryTotalValue = inventoryRows.reduce((s, i) => s + i.qty_on_hand * i.unit_cost, 0);
  const lowStockCount = inventoryRows.filter((i) => i.qty_on_hand <= i.reorder_point).length;

  const vendorSpend: Record<string, number> = {};
  pos.filter((p) => p.status === "received").forEach((p) => { const n = p.vendors?.name ?? "Unknown"; vendorSpend[n] = (vendorSpend[n] || 0) + p.total; });
  const vendorRows = Object.entries(vendorSpend).sort(([, a], [, b]) => b - a).map(([name, total]) => ({ name, total }));
  const totalSpend = vendorRows.reduce((s, v) => s + v.total, 0);

  const customerRevenue: Record<string, number> = {};
  sos.filter((s) => s.status === "fulfilled").forEach((s) => { const n = s.customers?.name ?? "Unknown"; customerRevenue[n] = (customerRevenue[n] || 0) + s.total; });
  const customerRows = Object.entries(customerRevenue).sort(([, a], [, b]) => b - a).map(([name, total]) => ({ name, total }));
  const totalFulfilledSales = customerRows.reduce((s, c) => s + c.total, 0);

  const deptCost: Record<string, number> = {};
  employees.forEach((e) => { const d = e.department || "Unassigned"; deptCost[d] = (deptCost[d] || 0) + (e.salary || 0); });
  const deptRows = Object.entries(deptCost).sort(([, a], [, b]) => b - a).map(([name, total]) => ({ name, total }));
  const totalAnnualPayroll = deptRows.reduce((s, d) => s + d.total, 0);

  // A/R and A/P aging
  const arRows = sos.filter((s) => s.status === "fulfilled").map((s) => {
    const paid = invoicePayments.filter((p) => p.sales_order_id === s.id).reduce((sum, p) => sum + p.amount, 0);
    const balance = round2(s.total - paid);
    return { name: s.customers?.name ?? "Unknown", dueDate: s.due_date, balance, bucket: agingBucket(s.due_date) };
  }).filter((r) => r.balance > 0.005);
  const arByBucket = ["Current", "1-30", "31-60", "61-90", "90+"].map((b) => ({ bucket: b, total: round2(arRows.filter((r) => r.bucket === b).reduce((s, r) => s + r.balance, 0)) }));
  const totalAR = arRows.reduce((s, r) => s + r.balance, 0);

  const apRows = pos.filter((p) => p.status === "received").map((p) => {
    const paid = billPayments.filter((bp) => bp.purchase_order_id === p.id).reduce((sum, bp) => sum + bp.amount, 0);
    const balance = round2(p.total - paid);
    return { name: p.vendors?.name ?? "Unknown", dueDate: p.due_date, balance, bucket: agingBucket(p.due_date) };
  }).filter((r) => r.balance > 0.005);
  const apByBucket = ["Current", "1-30", "31-60", "61-90", "90+"].map((b) => ({ bucket: b, total: round2(apRows.filter((r) => r.bucket === b).reduce((s, r) => s + r.balance, 0)) }));
  const totalAP = apRows.reduce((s, r) => s + r.balance, 0);

  const exportCSV = () => {
    let rows: (string | number)[][] = [];
    if (report === "pnl") {
      rows = [["Income Statement"], ["Account", "Amount"], ...revenueLines.map((l) => [l.name, l.amount.toFixed(2)]), ["Total Revenue", totalRevenue.toFixed(2)],
        ...expenseLines.map((l) => [l.name, l.amount.toFixed(2)]), ["Total Expenses", totalExpenses.toFixed(2)], ["Net Income", netIncome.toFixed(2)]];
    } else if (report === "balance") {
      rows = [["Balance Sheet"], ["Account", "Amount"], ...assetLines.map((l) => [l.name, l.amount.toFixed(2)]), ["Total Assets", totalAssets.toFixed(2)],
        ...liabilityLines.map((l) => [l.name, l.amount.toFixed(2)]), ...equityLines.map((l) => [l.name, l.amount.toFixed(2)]),
        ["Retained Earnings", netIncome.toFixed(2)], ["Total Liabilities + Equity", (totalLiabilities + totalEquity).toFixed(2)]];
    } else if (report === "trial") {
      rows = [["Trial Balance"], ["Code", "Account", "Debit", "Credit"], ...trialRows.map((r) => [r.code, r.name, r.debit.toFixed(2), r.credit.toFixed(2)]), ["", "Total", trialDebits.toFixed(2), trialCredits.toFixed(2)]];
    } else if (report === "arAging") {
      rows = [["A/R Aging"], ["Customer", "Due date", "Bucket", "Balance"], ...arRows.map((r) => [r.name, r.dueDate ?? "", r.bucket, r.balance.toFixed(2)]), ["", "", "Total", totalAR.toFixed(2)]];
    } else if (report === "apAging") {
      rows = [["A/P Aging"], ["Vendor", "Due date", "Bucket", "Balance"], ...apRows.map((r) => [r.name, r.dueDate ?? "", r.bucket, r.balance.toFixed(2)]), ["", "", "Total", totalAP.toFixed(2)]];
    } else if (report === "inventory") {
      rows = [["Inventory Valuation"], ["SKU", "Item", "Qty", "Unit cost", "Value"], ...inventoryRows.map((i) => [i.sku, i.name, i.qty_on_hand, i.unit_cost.toFixed(2), (i.qty_on_hand * i.unit_cost).toFixed(2)]), ["", "Total", "", "", inventoryTotalValue.toFixed(2)]];
    } else if (report === "procurement") {
      rows = [["Spend by Vendor"], ["Vendor", "Total received"], ...vendorRows.map((v) => [v.name, v.total.toFixed(2)]), ["Total spend", totalSpend.toFixed(2)]];
    } else if (report === "sales") {
      rows = [["Revenue by Customer"], ["Customer", "Total"], ...customerRows.map((c) => [c.name, c.total.toFixed(2)]), ["Total sales", totalFulfilledSales.toFixed(2)]];
    } else {
      rows = [["Payroll Cost by Department"], ["Department", "Annual cost"], ...deptRows.map((d) => [d.name, d.total.toFixed(2)]), ["Total annual payroll", totalAnnualPayroll.toFixed(2)]];
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${report}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;

  return (
    <>
      <div className="flex gap-2 flex-wrap items-center">
        {REPORTS.map((r) => (
          <button key={r.key} onClick={() => setReport(r.key)}
            className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold border"
            style={report === r.key ? { background: TEAL, color: "#fff", borderColor: TEAL } : { background: "#fff", color: TEAL, borderColor: TEAL }}>
            {r.icon} {r.label}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={exportCSV} className="flex items-center gap-1.5 bg-gold text-white rounded-md px-3 py-2 text-xs font-semibold"><Download size={14} /> Export CSV</button>
      </div>

      {report === "pnl" && (
        <div className="grid grid-cols-2 gap-2.5">
          <div><label className="text-xs font-semibold text-[#5c5548]">From</label><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="text-xs font-semibold text-[#5c5548]">To</label><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      )}

      {report === "pnl" && (
        <Panel title={`Income statement ${from || to ? `(${from || "start"} – ${to || "now"})` : "(all time)"}`}>
          <ReportSection heading="Revenue" lines={revenueLines} total={totalRevenue} totalLabel="Total revenue" />
          <ReportSection heading="Expenses" lines={expenseLines} total={totalExpenses} totalLabel="Total expenses" />
          <GrandTotal label="Net income" value={netIncome} color={netIncome >= 0 ? TEAL : RED} />
        </Panel>
      )}

      {report === "balance" && (
        <Panel title="Balance sheet (as of today)">
          <ReportSection heading="Assets" lines={assetLines} total={totalAssets} totalLabel="Total assets" />
          <ReportSection heading="Liabilities" lines={liabilityLines} total={totalLiabilities} totalLabel="Total liabilities" />
          <ReportSection heading="Equity" lines={[...equityLines, { code: "—", name: "Retained earnings", amount: netIncome }] as any} total={totalEquity} totalLabel="Total equity" />
          <GrandTotal label="Assets = Liabilities + Equity" value={0} display={balanceCheck ? "Balanced ✓" : `Off by ${money(totalAssets - (totalLiabilities + totalEquity))}`} color={balanceCheck ? TEAL : RED} />
        </Panel>
      )}

      {report === "trial" && (
        <Panel title="Trial balance (as of today)">
          <table>
            <thead><tr><th>Code</th><th>Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
            <tbody>{trialRows.map((r) => (
              <tr key={r.code}><td style={{ color: GOLD, fontWeight: 600 }}>{r.code}</td><td>{r.name}</td>
                <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{r.debit ? money(r.debit) : ""}</td>
                <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{r.credit ? money(r.credit) : ""}</td></tr>
            ))}</tbody>
          </table>
          <GrandTotal label="Totals" value={0} display={`${money(trialDebits)} / ${money(trialCredits)}`} color={Math.abs(trialDebits - trialCredits) < 0.01 ? TEAL : RED} />
        </Panel>
      )}

      {report === "arAging" && (
        <Panel title="Accounts receivable aging">
          {arRows.length === 0 ? <Empty>No outstanding invoices.</Empty> : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={arByBucket} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={LINE} vertical={false} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: INK }} axisLine={{ stroke: LINE }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: INK }} axisLine={{ stroke: LINE }} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
                  <Bar dataKey="total" fill={TEAL} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <table className="mt-3.5">
                <thead><tr><th>Customer</th><th>Due date</th><th>Bucket</th><th className="text-right">Balance</th></tr></thead>
                <tbody>{arRows.map((r, i) => (
                  <tr key={i}><td>{r.name}</td><td>{r.dueDate || "—"}</td><td>{r.bucket}</td>
                    <td className="text-right" style={{ fontVariantNumeric: "tabular-nums", color: r.bucket !== "Current" ? RED : INK }}>{money(r.balance)}</td></tr>
                ))}</tbody>
              </table>
              <GrandTotal label="Total receivable" value={totalAR} color={INK} />
            </>
          )}
        </Panel>
      )}

      {report === "apAging" && (
        <Panel title="Accounts payable aging">
          {apRows.length === 0 ? <Empty>No outstanding bills.</Empty> : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={apByBucket} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={LINE} vertical={false} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: INK }} axisLine={{ stroke: LINE }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: INK }} axisLine={{ stroke: LINE }} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
                  <Bar dataKey="total" fill={GOLD} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <table className="mt-3.5">
                <thead><tr><th>Vendor</th><th>Due date</th><th>Bucket</th><th className="text-right">Balance</th></tr></thead>
                <tbody>{apRows.map((r, i) => (
                  <tr key={i}><td>{r.name}</td><td>{r.dueDate || "—"}</td><td>{r.bucket}</td>
                    <td className="text-right" style={{ fontVariantNumeric: "tabular-nums", color: r.bucket !== "Current" ? RED : INK }}>{money(r.balance)}</td></tr>
                ))}</tbody>
              </table>
              <GrandTotal label="Total payable" value={totalAP} color={INK} />
            </>
          )}
        </Panel>
      )}

      {report === "inventory" && (
        <Panel title="Inventory valuation">
          {inventoryRows.length === 0 ? <Empty>No inventory items yet.</Empty> : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={inventoryRows.slice(0, 8).map((i) => ({ name: i.name.length > 12 ? i.name.slice(0, 11) + "…" : i.name, Value: round2(i.qty_on_hand * i.unit_cost) }))} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={LINE} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: INK }} axisLine={{ stroke: LINE }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: INK }} axisLine={{ stroke: LINE }} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
                  <Bar dataKey="Value" fill={TEAL} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <table className="mt-3.5">
                <thead><tr><th>SKU</th><th>Item</th><th className="text-right">Qty</th><th className="text-right">Unit cost</th><th className="text-right">Value</th></tr></thead>
                <tbody>{inventoryRows.map((i) => (
                  <tr key={i.id}><td style={{ color: GOLD, fontWeight: 600 }}>{i.sku}</td><td>{i.name}</td>
                    <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{i.qty_on_hand}</td>
                    <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(i.unit_cost)}</td>
                    <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(i.qty_on_hand * i.unit_cost)}</td></tr>
                ))}</tbody>
              </table>
              <GrandTotal label={`Total inventory value (${lowStockCount} low stock)`} value={inventoryTotalValue} color={INK} />
            </>
          )}
        </Panel>
      )}

      {report === "procurement" && (
        <Panel title="Spend by vendor (received POs only)">
          {vendorRows.length === 0 ? <Empty>No received purchase orders yet.</Empty> : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={vendorRows.map((v) => ({ name: v.name.length > 14 ? v.name.slice(0, 13) + "…" : v.name, Spend: round2(v.total) }))} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={LINE} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: INK }} axisLine={{ stroke: LINE }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: INK }} axisLine={{ stroke: LINE }} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
                  <Bar dataKey="Spend" fill={GOLD} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <table className="mt-3.5"><thead><tr><th>Vendor</th><th className="text-right">Total received</th></tr></thead>
                <tbody>{vendorRows.map((v) => <tr key={v.name}><td>{v.name}</td><td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(v.total)}</td></tr>)}</tbody>
              </table>
              <GrandTotal label="Total spend" value={totalSpend} color={INK} />
            </>
          )}
        </Panel>
      )}

      {report === "sales" && (
        <Panel title="Revenue by customer (fulfilled orders only)">
          {customerRows.length === 0 ? <Empty>No fulfilled sales orders yet.</Empty> : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={customerRows.map((c) => ({ name: c.name, value: round2(c.total) }))} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                    {customerRows.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <table className="mt-3.5"><thead><tr><th>Customer</th><th className="text-right">Total sales</th></tr></thead>
                <tbody>{customerRows.map((c) => <tr key={c.name}><td>{c.name}</td><td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(c.total)}</td></tr>)}</tbody>
              </table>
              <GrandTotal label="Total fulfilled sales" value={totalFulfilledSales} color={INK} />
            </>
          )}
        </Panel>
      )}

      {report === "hr" && (
        <Panel title="Payroll cost by department (annualized)">
          {deptRows.length === 0 ? <Empty>No employees yet.</Empty> : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={deptRows.map((d) => ({ name: d.name, Cost: round2(d.total) }))} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={LINE} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: INK }} axisLine={{ stroke: LINE }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: INK }} axisLine={{ stroke: LINE }} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
                  <Bar dataKey="Cost" fill={TEAL} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <table className="mt-3.5"><thead><tr><th>Department</th><th className="text-right">Annual cost</th></tr></thead>
                <tbody>{deptRows.map((d) => <tr key={d.name}><td>{d.name}</td><td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(d.total)}</td></tr>)}</tbody>
              </table>
              <GrandTotal label="Total annual payroll" value={totalAnnualPayroll} color={INK} />
            </>
          )}
        </Panel>
      )}
      <style jsx global>{`.input { font-size: 14px; padding: 9px 11px; border-radius: 8px; border: 1px solid #DDD8CC; background: #fff; color: #1B2430; outline: none; width: 100%; }`}</style>
    </>
  );
}

function ReportSection({ heading, lines, total, totalLabel }: { heading: string; lines: { code: string; name: string; amount: number }[]; total: number; totalLabel: string }) {
  return (
    <div className="mb-3.5">
      <div className="text-[11.5px] font-bold uppercase tracking-wide text-[#8a8172] mb-1.5">{heading}</div>
      {lines.length === 0 ? <div className="text-[13px] text-[#8a8172] py-1.5">None recorded</div> : (
        lines.map((l) => (
          <div key={l.code} className="flex justify-between text-[13px] py-1.5">
            <span>{l.name}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{money(l.amount)}</span>
          </div>
        ))
      )}
      <div className="flex justify-between font-bold pt-1.5 mt-1 border-t border-hairline text-[13px]">
        <span>{totalLabel}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{money(total)}</span>
      </div>
    </div>
  );
}

function GrandTotal({ label, value, display, color }: { label: string; value: number; display?: string; color: string }) {
  return (
    <div className="flex justify-between text-[14.5px] font-bold mt-3.5 pt-2.5" style={{ borderTop: `2px solid ${INK}` }}>
      <span>{label}</span><span style={{ color }}>{display ?? money(value)}</span>
    </div>
  );
}
