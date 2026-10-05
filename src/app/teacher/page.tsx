"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Building2, TrendingUp, TrendingDown, Wallet, Briefcase, ChevronRight, LogOut, Loader2, ClipboardCheck, Trash2 } from "lucide-react";
import { KpiCard, Panel, Empty, Modal } from "@/components/ui";
import PracticeCheckModal from "@/components/PracticeChecker";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { money, round2, type Account } from "@/lib/types";
import { computeMetrics, type EntryWithLines } from "@/lib/metrics";

const TEAL = "#12524F", GOLD = "#C08A2E", RED = "#A6402F", LINE = "#DDD8CC", INK = "#1B2430";
const tooltipStyle = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 12 };

// Deleting a company is permanent, so the teacher has to type its name to confirm.
function DeleteCompanyModal({ tenant, onClose, onDeleted }: { tenant: { id: string; name: string }; onClose: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const matches = typed.trim() === tenant.name.trim();

  const doDelete = async () => {
    if (!matches || busy) return;
    setBusy(true);
    // Remove the company's uploaded files first (best effort); the database function removes everything else.
    const { data: files } = await supabase.from("attachments").select("file_path").eq("tenant_id", tenant.id);
    const paths = (files ?? []).map((f: any) => f.file_path).filter(Boolean);
    if (paths.length > 0) await supabase.storage.from("attachments").remove(paths);

    const { data, error } = await supabase.rpc("delete_company", { target_tenant: tenant.id });
    setBusy(false);
    if (error) { toast.error(error.message || "Could not delete the company."); return; }
    const released = (data as any)?.students_released ?? 0;
    toast.success(`Deleted "${tenant.name}". ${released} student${released === 1 ? "" : "s"} will be asked to join or start a company.`);
    onDeleted();
  };

  return (
    <Modal title="Delete this company?" onClose={onClose}>
      <div className="text-[13px] text-[#6b6357] leading-relaxed mt-2">
        <strong>{tenant.name}</strong> and everything in it will be permanently deleted: invoices, bills, journal entries, inventory, employees, payroll and attachments. This can&apos;t be undone.
        Students in this company keep their accounts and will be asked to join or start a company the next time they sign in.
      </div>
      <label className="block text-[12px] font-semibold mt-4 mb-1">Type the company name to confirm</label>
      <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={tenant.name} autoFocus />
      <div className="flex gap-2 justify-end mt-5">
        <button onClick={onClose} disabled={busy} className="border border-hairline rounded-md px-3 py-2 text-xs text-[#6b6357]">Cancel</button>
        <button onClick={doDelete} disabled={!matches || busy} className="rounded-md px-3 py-2 text-xs font-semibold text-white disabled:opacity-40" style={{ background: RED }}>
          {busy ? "Deleting…" : "Delete company"}
        </button>
      </div>
    </Modal>
  );
}

export default function TeacherPage() {
  const { loading, userId, profile, tenants, viewTenantId, setViewTenantId, refresh, signOut } = useSession();
  const router = useRouter();
  const [summaries, setSummaries] = useState<{ tenant: any; metrics: any }[]>([]);
  const [fetching, setFetching] = useState(true);
  const [checking, setChecking] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!userId) { router.replace("/login"); return; }
    if (profile && profile.role !== "teacher") { router.replace("/dashboard"); return; }
  }, [loading, userId, profile, router]);

  useEffect(() => {
    if (loading || !profile || profile.role !== "teacher") return;
    (async () => {
      setFetching(true);
      const results = await Promise.all(tenants.map(async (t) => {
        const [acc, ent, items, emp] = await Promise.all([
          supabase.from("accounts").select("*").eq("tenant_id", t.id),
          supabase.from("journal_entries").select("id, entry_date, memo, journal_lines(*)").eq("tenant_id", t.id),
          supabase.from("items").select("qty_on_hand, unit_cost").eq("tenant_id", t.id),
          supabase.from("employees").select("id").eq("tenant_id", t.id),
        ]);
        const accounts = (acc.data as Account[]) ?? [];
        const entries = (ent.data as any as EntryWithLines[]) ?? [];
        const inventoryValue = (items.data ?? []).reduce((s: number, i: any) => s + i.qty_on_hand * i.unit_cost, 0);
        const metrics = computeMetrics(accounts, entries, inventoryValue, emp.data?.length ?? 0);
        return { tenant: t, metrics };
      }));
      setSummaries(results);
      setFetching(false);
    })();
  }, [loading, profile, tenants]);

  if (loading || !profile) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;
  }

  const classRevenue = summaries.reduce((s, x) => s + (x.metrics?.revenue || 0), 0);
  const classExpenses = summaries.reduce((s, x) => s + (x.metrics?.expenses || 0), 0);
  const classNet = classRevenue - classExpenses;
  const classHeadcount = summaries.reduce((s, x) => s + (x.metrics?.headcount || 0), 0);
  const barData = summaries.map((x) => ({ name: x.tenant.name.length > 14 ? x.tenant.name.slice(0, 13) + "…" : x.tenant.name, Revenue: round2(x.metrics?.revenue || 0), Expenses: round2(x.metrics?.expenses || 0) }));

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 bg-panel border-b border-hairline">
        <div>
          <div className="font-serif text-lg font-bold">Class overview</div>
          <div className="text-xs text-[#8a8172]">Teacher · {profile.full_name}</div>
        </div>
        <button onClick={() => signOut()} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs text-[#6b6357]">
          <LogOut size={15} /> Sign out
        </button>
      </div>

      <div className="max-w-[1000px] w-full mx-auto px-5 py-5 flex flex-col gap-4">
        {fetching ? (
          <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>
        ) : (
          <>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
              <KpiCard icon={<Building2 size={16} />} label="Companies" value={tenants.length} />
              <KpiCard icon={<TrendingUp size={16} />} label="Class revenue" value={money(classRevenue)} accent={TEAL} />
              <KpiCard icon={<TrendingDown size={16} />} label="Class expenses" value={money(classExpenses)} accent={RED} />
              <KpiCard icon={<Wallet size={16} />} label="Class net income" value={money(classNet)} accent={classNet >= 0 ? TEAL : RED} />
              <KpiCard icon={<Briefcase size={16} />} label="Total employees" value={classHeadcount} />
            </div>

            {tenants.length > 0 && (
              <Panel title="Revenue & expenses by company">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={barData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={LINE} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: INK }} axisLine={{ stroke: LINE }} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: INK }} axisLine={{ stroke: LINE }} tickLine={false} tickFormatter={(v) => `₱${v}`} />
                    <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Revenue" fill={TEAL} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Expenses" fill={GOLD} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            )}

            <Panel title="Companies">
              {tenants.length === 0 ? <Empty>No student companies yet. They&rsquo;ll appear here once students sign in and create one.</Empty> : (
                <div className="flex flex-col gap-1.5">
                  {summaries.map(({ tenant, metrics }) => (
                    <div key={tenant.id} className="flex items-center gap-2 px-3.5 py-2.5 rounded-md border border-hairline bg-paper">
                      <button onClick={() => { setViewTenantId(tenant.id); router.push("/dashboard"); }}
                        className="flex flex-1 min-w-0 items-center justify-between gap-3 text-left">
                        <div className="text-[13.5px] font-bold truncate">{tenant.name}</div>
                        <div className="flex items-center gap-3.5 text-[12.5px] font-semibold shrink-0">
                          <span style={{ color: TEAL }}>{money(metrics?.revenue || 0)} rev</span>
                          <span style={{ color: (metrics?.netIncome || 0) >= 0 ? TEAL : RED }}>{money(metrics?.netIncome || 0)} net</span>
                          <ChevronRight size={16} color={INK} />
                        </div>
                      </button>
                      <button onClick={() => setChecking({ id: tenant.id, name: tenant.name })} title="Check practice set"
                        className="flex items-center gap-1 border border-hairline rounded-md px-2 py-1.5 text-[11.5px] font-semibold text-teal bg-panel shrink-0">
                        <ClipboardCheck size={13} /> Check
                      </button>
                      <button onClick={() => setDeleting({ id: tenant.id, name: tenant.name })} title="Delete company"
                        className="border border-hairline rounded-md px-2 py-1.5 bg-panel shrink-0" style={{ color: RED }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </>
        )}
      </div>

      {checking && <PracticeCheckModal tenant={checking} onClose={() => setChecking(null)} />}
      {deleting && (
        <DeleteCompanyModal tenant={deleting} onClose={() => setDeleting(null)}
          onDeleted={async () => {
            if (viewTenantId === deleting.id) setViewTenantId(null);
            setDeleting(null);
            await refresh();
          }} />
      )}
    </div>
  );
}
