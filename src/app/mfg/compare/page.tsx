"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, LogOut } from "lucide-react";
import { Empty, Panel } from "@/components/ui";
import { Chip } from "@/components/ListReport";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { money } from "@/lib/costing";
import { qtyText } from "@/lib/mfgOps";
import { barShare, pctText } from "@/lib/mfgAnalytics";

type Row = {
  tenant_id: string; company: string; student: string; costing_method: "STANDARD" | "ACTUAL"; revenue: number; cogs: number; gross_margin: number;
  inventory_value: number; orders_made: number; good_qty: number; scrap_pct: number | null; variances: number; months_closed: number; books_tie: boolean; last_activity: string | null;
};
type SortKey = "company" | "revenue" | "gross_margin" | "inventory_value" | "good_qty" | "scrap_pct" | "variances" | "months_closed";

const TEAL = "#22D3C5";
const COLS: [SortKey, string, boolean][] = [
  ["company", "Company", false], ["revenue", "Sales", true], ["gross_margin", "Margin", true], ["inventory_value", "Inventory", true],
  ["good_qty", "Good units", true], ["scrap_pct", "Scrap %", true], ["variances", "Variances", true], ["months_closed", "Months closed", true],
];

// The teacher's side-by-side view of every Manufacturing company in the class.
export default function ComparePage() {
  const router = useRouter();
  const { loading, userId, profile, signOut, setViewTenantId } = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sort, setSort] = useState<SortKey>("gross_margin");
  const [desc, setDesc] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!userId) { router.replace("/login"); return; }
    if (profile && profile.role !== "teacher") router.replace("/mfg");
  }, [loading, userId, profile, router]);

  useEffect(() => {
    if (loading || profile?.role !== "teacher") return;
    (async () => {
      const res = await supabase.rpc("mfg_class_comparison");
      if (res.error) { toast.error(res.error.message); setRows([]); return; }
      setRows(((res.data as Row[]) ?? []).map((r) => ({ ...r, revenue: Number(r.revenue), cogs: Number(r.cogs), gross_margin: Number(r.gross_margin), inventory_value: Number(r.inventory_value), good_qty: Number(r.good_qty), variances: Number(r.variances), scrap_pct: r.scrap_pct === null ? null : Number(r.scrap_pct) })));
    })();
  }, [loading, profile]);

  const sorted = useMemo(() => {
    const list = [...(rows ?? [])];
    list.sort((a, b) => {
      const x = a[sort], y = b[sort];
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      const c = typeof x === "string" ? x.localeCompare(String(y)) : Number(x) - Number(y);
      return desc ? -c : c;
    });
    return list;
  }, [rows, sort, desc]);

  if (loading || !profile) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;
  if (profile.role !== "teacher") return null;

  const top = (k: "revenue" | "gross_margin" | "inventory_value") => Math.max(...(rows ?? []).map((r) => Math.abs(r[k])), 1);
  const open = (id: string, path: string) => { setViewTenantId(id); router.push(path); };
  const pick = (k: SortKey) => { if (k === sort) setDesc(!desc); else { setSort(k); setDesc(k !== "company"); } };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 bg-panel border-b border-hairline">
        <div>
          <div className="font-serif text-lg font-bold">Manufacturing class comparison</div>
          <div className="text-xs text-[#7F8EA0]">Teacher · {profile.full_name}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/teacher")} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs text-[#A3B1C2]"><ArrowLeft size={15} /> Class overview</button>
          <button onClick={() => signOut()} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs text-[#A3B1C2]"><LogOut size={15} /> Sign out</button>
        </div>
      </div>

      <div className="max-w-[1100px] w-full mx-auto px-5 py-5 flex flex-col gap-4">
        <div className="text-[12.5px] text-[#A3B1C2] max-w-[820px]">
          Every Manufacturing company in the class side by side. Sales and margin come from the ledger; scrap and good units from finished production orders; variances are what arose (closing a month does not hide them).
          “Books tie” means the stock, work-in-process and payables records agree with the ledger to within a few centavos. Click a column to sort; open a company to look inside.
        </div>

        {rows === null ? <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div> : (
          <Panel title={`Companies · ${rows.length}`}>
            {rows.length === 0 ? <Empty>No Manufacturing companies yet. Students create one from the ERP chooser.</Empty> : (
              <div className="overflow-x-auto">
                <table style={{ minWidth: 960 }}>
                  <thead>
                    <tr>
                      {COLS.map(([k, label, right]) => (
                        <th key={k} style={{ textAlign: right ? "right" : "left", cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => pick(k)} aria-sort={sort === k ? (desc ? "descending" : "ascending") : "none"}>
                          {label}{sort === k ? (desc ? " ↓" : " ↑") : ""}
                        </th>
                      ))}
                      <th>Books tie</th><th>Last activity</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r) => (
                      <tr key={r.tenant_id}>
                        <td><b>{r.company}</b><div className="text-[11px] text-[#7F8EA0]">{r.student} · {r.costing_method === "STANDARD" ? "Standard costing" : "Actual costing"}</div></td>
                        <td style={{ textAlign: "right" }}>{money(r.revenue)}<div style={{ height: 4, background: "#5AA9FF", width: `${barShare(r.revenue, top("revenue"), 0.02) * 100}%`, marginLeft: "auto", borderRadius: 2 }} /></td>
                        <td style={{ textAlign: "right" }}>{money(r.gross_margin)}<div style={{ height: 4, background: r.gross_margin >= 0 ? TEAL : "#FF6B7A", width: `${barShare(Math.abs(r.gross_margin), top("gross_margin"), 0.02) * 100}%`, marginLeft: "auto", borderRadius: 2 }} /></td>
                        <td style={{ textAlign: "right" }}>{money(r.inventory_value)}<div style={{ height: 4, background: "#F2B13C", width: `${barShare(r.inventory_value, top("inventory_value"), 0.02) * 100}%`, marginLeft: "auto", borderRadius: 2 }} /></td>
                        <td style={{ textAlign: "right" }}>{qtyText(r.good_qty)}<div className="text-[11px] text-[#7F8EA0]">{r.orders_made} order{r.orders_made === 1 ? "" : "s"}</div></td>
                        <td style={{ textAlign: "right" }}>{r.scrap_pct === null ? "—" : <Chip label={pctText(r.scrap_pct)} tone={r.scrap_pct <= 2 ? "good" : r.scrap_pct <= 5 ? "warn" : "bad"} />}</td>
                        <td style={{ textAlign: "right", color: r.variances > 0 ? "#FF6B7A" : undefined }}>{money(r.variances)}</td>
                        <td style={{ textAlign: "right" }}>{r.months_closed}</td>
                        <td><Chip label={r.books_tie ? "Ties" : "Off"} tone={r.books_tie ? "good" : "bad"} /></td>
                        <td className="text-[12px]">{r.last_activity ?? "—"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button onClick={() => open(r.tenant_id, "/mfg/analytics")} className="text-[12px] font-semibold text-teal mr-3">Analytics</button>
                          <button onClick={() => open(r.tenant_id, "/mfg/period")} className="text-[12px] font-semibold text-teal">Period end</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}
