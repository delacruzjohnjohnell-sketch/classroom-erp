"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Briefcase, CheckCircle2, CalendarCheck, CircleDashed, ChevronRight, LogOut, Loader2, ClipboardCheck, Trash2, RotateCcw, MessageSquare } from "lucide-react";
import { KpiCard, Panel, Empty, ConfirmDialog } from "@/components/ui";
import PracticeCheckModal from "@/components/PracticeChecker";
import MfgPracticeCheckModal from "@/components/MfgPracticeChecker";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { money, type Account } from "@/lib/types";
import { useUnreadMessages } from "@/lib/useUnreadMessages";
import { computeMetrics, type EntryWithLines } from "@/lib/metrics";
import { runMfgPracticeChecks, summarizeMfg, type MfgPracticeSet, type MfgSnapshot } from "@/lib/mfgPracticeCheck";

const TEAL = "#22D3C5", GOLD = "#F2B13C", RED = "#FF6B7A", INK = "#334155";

type MfgProgress = { setName: string; passed: number; total: number; closed: number };

// Deleting a company is permanent, so it asks once before going ahead.
function DeleteCompanyModal({ tenant, onClose, onDeleted }: { tenant: { id: string; name: string }; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);

  const doDelete = async () => {
    if (busy) return;
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
    <ConfirmDialog
      title="Delete this company?"
      danger
      busy={busy}
      confirmLabel="Yes, delete it"
      message={<>Are you sure you want to delete <strong>{tenant.name}</strong>? Everything in it — invoices, bills, journal entries, inventory, employees and payroll — will be permanently removed and can&apos;t be recovered.</>}
      onConfirm={doDelete}
      onCancel={onClose}
    />
  );
}

// Resetting a student's Manufacturing company is also permanent: the student keeps the same name and settings but starts again with nothing in it.
function ResetCompanyModal({ tenant, onClose, onDone }: { tenant: { id: string; name: string }; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  const doReset = async () => {
    if (busy) return;
    setBusy(true);
    const { data: files } = await supabase.from("attachments").select("file_path").eq("tenant_id", tenant.id);
    const paths = (files ?? []).map((f: any) => f.file_path).filter(Boolean);
    if (paths.length > 0) await supabase.storage.from("attachments").remove(paths);
    const { error } = await supabase.rpc("mfg_reset_company", { p_tenant: tenant.id });
    setBusy(false);
    if (error) { toast.error(error.message || "Could not reset the company."); return; }
    toast.success(`"${tenant.name}" was reset: the student now has a fresh, empty company with the same name and settings.`);
    onDone();
  };

  return (
    <ConfirmDialog
      title="Reset this Manufacturing company?"
      danger
      busy={busy}
      confirmLabel="Yes, reset it"
      message={<>Everything in <strong>{tenant.name}</strong> (items, bills of materials, purchase orders, production, sales, vouchers and the ledger) will be permanently erased. The student keeps the same company name, fiscal year and costing method, and starts again with an empty company, ready for the next activity. This can&apos;t be undone.</>}
      onConfirm={doReset}
      onCancel={onClose}
    />
  );
}

export default function TeacherPage() {
  const { loading, userId, profile, tenants, viewTenantId, setViewTenantId, refresh, signOut } = useSession();
  const unreadMessages = useUnreadMessages(userId);
  const router = useRouter();
  const [summaries, setSummaries] = useState<{ tenant: any; metrics: any; entryCount: number; lastEntry: string | null }[]>([]);
  const [fetching, setFetching] = useState(true);
  const [checking, setChecking] = useState<{ id: string; name: string } | null>(null);
  // Which ERP's companies to show: all, Standard, or Manufacturing. A company with no edition row is Standard.
  const [editionFilter, setEditionFilter] = useState<"ALL" | "STANDARD" | "MANUFACTURING">("ALL");
  const [editions, setEditions] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [resetting, setResetting] = useState<{ id: string; name: string } | null>(null);
  // Manufacturing companies: the best-matching practice set and how many of its checks pass (read in the background, only a few companies)
  const [mfgProgress, setMfgProgress] = useState<Record<string, MfgProgress | null>>({});

  useEffect(() => {
    if (loading) return;
    if (!userId) { router.replace("/login"); return; }
    if (profile && profile.role !== "teacher") { router.replace("/dashboard"); return; }
  }, [loading, userId, profile, router]);

  useEffect(() => {
    // arriving from the ERP chooser with ?edition=STANDARD|MANUFACTURING
    const wanted = new URLSearchParams(window.location.search).get("edition");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (wanted === "STANDARD" || wanted === "MANUFACTURING") setEditionFilter(wanted);
  }, []);

  useEffect(() => {
    if (loading || !profile || profile.role !== "teacher") return;
    (async () => {
      const { data } = await supabase.from("tenant_editions").select("tenant_id, edition");
      setEditions(Object.fromEntries(((data as { tenant_id: string; edition: string }[]) ?? []).map((r) => [r.tenant_id, r.edition])));
    })();
  }, [loading, profile, tenants]);

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
        const dates = entries.map((e) => e.entry_date).filter(Boolean).sort();
        return { tenant: t, metrics, entryCount: entries.length, lastEntry: dates.length ? dates[dates.length - 1] : null };
      }));
      setSummaries(results);
      setFetching(false);
    })();
  }, [loading, profile, tenants]);

  useEffect(() => {
    if (loading || !profile || profile.role !== "teacher" || fetching) return;
    const mfgIds = summaries.map((x) => x.tenant.id).filter((id) => editions[id] === "MANUFACTURING");
    if (mfgIds.length === 0) return;
    let live = true;
    (async () => {
      const list = await supabase.rpc("mfg_practice_set_list");
      const sets: MfgPracticeSet[] = [];
      for (const row of ((list.data as { id: string }[]) ?? [])) {
        const r = await supabase.rpc("mfg_practice_set_get", { p_id: row.id });
        if (!r.error && r.data) sets.push(r.data as MfgPracticeSet);
      }
      const out: Record<string, MfgProgress | null> = {};
      await Promise.all(mfgIds.map(async (id) => {
        let r = await supabase.rpc("mfg_practice_snapshot_a2", { p_tenant: id });
        if (r.error) r = await supabase.rpc("mfg_practice_snapshot", { p_tenant: id });
        if (r.error || !r.data) { out[id] = null; return; }
        const snap = r.data as MfgSnapshot;
        let best: MfgProgress | null = null;
        for (const set of sets) {
          const sum = summarizeMfg(runMfgPracticeChecks(snap, set));
          if (!best || sum.passed / sum.total > best.passed / best.total) best = { setName: set.name.split(" — ")[0], passed: sum.passed, total: sum.total, closed: snap.periods.filter((p) => p.status === "CLOSED").length };
        }
        out[id] = best;
      }));
      if (live) setMfgProgress(out);
    })();
    return () => { live = false; };
  }, [loading, profile, fetching, summaries, editions]);

  if (loading || !profile) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;
  }

  const editionOf = (tenantId: string) => editions[tenantId] ?? "STANDARD";
  const visible = summaries.filter((x) => editionFilter === "ALL" || editionOf(x.tenant.id) === editionFilter);
  const countFor = (e: "STANDARD" | "MANUFACTURING") => summaries.filter((x) => editionOf(x.tenant.id) === e).length;

  const classHeadcount = visible.reduce((s, x) => s + (x.metrics?.headcount || 0), 0);
  const notStarted = visible.filter((x) => x.entryCount === 0).length;
  const mfgVisible = visible.filter((x) => editionOf(x.tenant.id) === "MANUFACTURING");
  const stdVisible = visible.filter((x) => editionOf(x.tenant.id) === "STANDARD");   // AIS companies have their own screen (/ais/teams)
  const mfgComplete = mfgVisible.filter((x) => { const p = mfgProgress[x.tenant.id]; return !!p && p.passed === p.total; }).length;
  const monthsClosed = mfgVisible.reduce((n, x) => n + (mfgProgress[x.tenant.id]?.closed ?? 0), 0);
  const pct = (p: MfgProgress | null | undefined) => (p && p.total ? p.passed / p.total : -1);
  const mfgSorted = [...mfgVisible].sort((a, b) => pct(mfgProgress[b.tenant.id]) - pct(mfgProgress[a.tenant.id]) || a.tenant.name.localeCompare(b.tenant.name));
  const stdSorted = [...stdVisible].sort((a, b) => a.tenant.name.localeCompare(b.tenant.name));
  const open = (id: string) => { setViewTenantId(id); router.push("/dashboard"); };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 bg-panel border-b border-hairline">
        <div>
          <div className="font-serif text-lg font-bold">Class overview</div>
          <div className="text-xs text-[#7F8EA0]">Teacher · {profile.full_name}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/teacher/scores")} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs font-semibold" style={{ color: "#2F6BFF" }}>
            <ClipboardCheck size={15} /> Class scores (Excel)
          </button>
          <button onClick={() => router.push("/teacher/messages")} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs font-semibold" style={{ color: "#2F6BFF" }}>
            <MessageSquare size={15} /> Messages
            {unreadMessages > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10.5px] font-bold flex items-center justify-center" style={{ background: RED }}>{unreadMessages}</span>}
          </button>
          <button onClick={() => signOut()} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs text-[#A3B1C2]">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </div>

      <div className="max-w-[1000px] w-full mx-auto px-5 py-5 flex flex-col gap-4">
        {fetching ? (
          <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>
        ) : (
          <>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
              <KpiCard icon={<Building2 size={16} />} label="Companies" value={visible.length} />
              <KpiCard icon={<CheckCircle2 size={16} />} label="Mfg at 100%" value={`${mfgComplete} of ${mfgVisible.length}`} accent={TEAL} />
              <KpiCard icon={<CalendarCheck size={16} />} label="Mfg months closed" value={monthsClosed} />
              <KpiCard icon={<CircleDashed size={16} />} label="Not started" value={notStarted} accent={notStarted > 0 ? GOLD : undefined} />
              <KpiCard icon={<Briefcase size={16} />} label="Total employees" value={classHeadcount} />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {([["ALL", "All", summaries.length], ["STANDARD", "Standard ERP", countFor("STANDARD")], ["MANUFACTURING", "Manufacturing ERP", countFor("MANUFACTURING")]] as const).map(([key, label, n]) => (
                <button key={key} onClick={() => setEditionFilter(key)}
                  className="font-mono text-[11.5px] uppercase tracking-[0.08em] rounded-md px-3 py-1.5 border transition-colors"
                  style={{ color: editionFilter === key ? (key === "MANUFACTURING" ? "#F2B13C" : "#22D3C5") : "#7F8EA0",
                    borderColor: editionFilter === key ? (key === "MANUFACTURING" ? "rgba(242,177,60,0.6)" : "rgba(34,211,197,0.6)") : "#243140",
                    background: editionFilter === key ? (key === "MANUFACTURING" ? "rgba(242,177,60,0.1)" : "rgba(34,211,197,0.1)") : "transparent" }}>
                  {label} · {n}
                </button>
              ))}
              <span className="ml-auto flex items-center gap-4">
                <button onClick={() => router.push("/mfg/teams")} className="text-[12px] font-semibold text-teal">Team companies →</button>
                <button onClick={() => router.push("/choose")} className="text-[12px] font-semibold text-teal">Open or close the Manufacturing ERP →</button>
              </span>
            </div>

            {tenants.length === 0 && <Panel title="Companies"><Empty>No student companies yet. They&rsquo;ll appear here once students sign in and create one.</Empty></Panel>}

            {editionFilter !== "STANDARD" && mfgSorted.length > 0 && (
              <Panel title={`Manufacturing ERP · ${mfgSorted.length}`}>
                <div className="grid items-center gap-2 px-3.5 pb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-[#7F8EA0]" style={{ gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1.5fr) 80px 110px 100px 130px" }}>
                  <div>Company</div><div>Practice set check</div><div>Months closed</div><div>Net income</div><div>Last entry</div><div />
                </div>
                <div className="flex flex-col gap-1.5">
                  {mfgSorted.map(({ tenant, metrics, entryCount, lastEntry }) => {
                    const pr = mfgProgress[tenant.id];
                    const ratio = pr && pr.total ? pr.passed / pr.total : 0;
                    return (
                      <div key={tenant.id} className="grid items-center gap-2 px-3.5 py-2.5 rounded-md border border-hairline bg-paper text-[12.5px]" style={{ gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1.5fr) 80px 110px 100px 130px" }}>
                        <button onClick={() => open(tenant.id)} className="flex items-center gap-1 min-w-0 text-left font-bold text-[13.5px]"><span className="truncate">{tenant.name}</span><ChevronRight size={14} color={INK} /></button>
                        <div className="min-w-0">
                          {entryCount === 0 ? <span className="text-[#7F8EA0]">Not started</span>
                            : pr === undefined ? <span className="text-[#7F8EA0]">checking…</span>
                            : pr === null ? <span className="text-[#7F8EA0]">no check</span>
                            : (<>
                              <div className="flex items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-[#E4EAF3] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.round(ratio * 100)}%`, background: ratio === 1 ? TEAL : GOLD }} /></div><b style={{ color: ratio === 1 ? TEAL : INK }}>{pr.passed}/{pr.total}</b></div>
                              <div className="text-[11px] text-[#7F8EA0] truncate">{pr.setName}</div>
                            </>)}
                        </div>
                        <div className="font-semibold">{pr ? pr.closed : "—"}</div>
                        <div className="font-semibold" style={{ color: (metrics?.netIncome || 0) >= 0 ? TEAL : RED }}>{money(metrics?.netIncome || 0)}</div>
                        <div className="text-[#7F8EA0]">{lastEntry ?? "—"}</div>
                        <div className="flex gap-1.5 justify-end">
                          <button onClick={() => setChecking({ id: tenant.id, name: tenant.name })} title="Check practice set" className="flex items-center gap-1 border border-hairline rounded-md px-2 py-1.5 text-[11.5px] font-semibold text-teal bg-panel"><ClipboardCheck size={13} /> Check</button>
                          <button onClick={() => setResetting({ id: tenant.id, name: tenant.name })} title="Reset to an empty Manufacturing company" className="border border-hairline rounded-md px-2 py-1.5 bg-panel" style={{ color: GOLD }}><RotateCcw size={13} /></button>
                          <button onClick={() => setDeleting({ id: tenant.id, name: tenant.name })} title="Delete company" className="border border-hairline rounded-md px-2 py-1.5 bg-panel" style={{ color: RED }}><Trash2 size={13} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}

            {editionFilter !== "MANUFACTURING" && stdSorted.length > 0 && (
              <Panel title={`Standard ERP · ${stdSorted.length}`}>
                <div className="grid items-center gap-2 px-3.5 pb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-[#7F8EA0]" style={{ gridTemplateColumns: "minmax(0,1.5fr) 110px 110px 70px 100px 100px" }}>
                  <div>Company</div><div>Revenue</div><div>Net income</div><div>Entries</div><div>Last entry</div><div />
                </div>
                <div className="flex flex-col gap-1.5">
                  {stdSorted.map(({ tenant, metrics, entryCount, lastEntry }) => (
                    <div key={tenant.id} className="grid items-center gap-2 px-3.5 py-2.5 rounded-md border border-hairline bg-paper text-[12.5px]" style={{ gridTemplateColumns: "minmax(0,1.5fr) 110px 110px 70px 100px 100px" }}>
                      <button onClick={() => open(tenant.id)} className="flex items-center gap-1 min-w-0 text-left font-bold text-[13.5px]"><span className="truncate">{tenant.name}</span><ChevronRight size={14} color={INK} /></button>
                      <div className="font-semibold" style={{ color: TEAL }}>{money(metrics?.revenue || 0)}</div>
                      <div className="font-semibold" style={{ color: (metrics?.netIncome || 0) >= 0 ? TEAL : RED }}>{money(metrics?.netIncome || 0)}</div>
                      <div>{entryCount === 0 ? <span className="text-[#7F8EA0]">none</span> : entryCount}</div>
                      <div className="text-[#7F8EA0]">{lastEntry ?? "—"}</div>
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={() => setChecking({ id: tenant.id, name: tenant.name })} title="Check practice set" className="flex items-center gap-1 border border-hairline rounded-md px-2 py-1.5 text-[11.5px] font-semibold text-teal bg-panel"><ClipboardCheck size={13} /> Check</button>
                        <button onClick={() => setDeleting({ id: tenant.id, name: tenant.name })} title="Delete company" className="border border-hairline rounded-md px-2 py-1.5 bg-panel" style={{ color: RED }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </>
        )}
      </div>

      {checking && (editionOf(checking.id) === "MANUFACTURING"
        ? <MfgPracticeCheckModal tenant={checking} onClose={() => setChecking(null)} />
        : <PracticeCheckModal tenant={checking} onClose={() => setChecking(null)} />)}
      {resetting && (
        <ResetCompanyModal tenant={resetting} onClose={() => setResetting(null)}
          onDone={async () => { setResetting(null); await refresh(); }} />
      )}
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
