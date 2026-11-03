"use client";
// The teacher's approvals: every new sign-up waits here. Tick the systems the student may use and approve, or reject with a message the student will see.
// An approved student's ticks can be changed later. Only the teacher can open this page, and the database refuses anyone else.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { MODULES, type ModuleId } from "@/lib/access";
import { toast } from "@/lib/toast";

interface Row { id: string; full_name: string; email: string; created_at: string; approval: "pending" | "approved" | "rejected"; modules: string[]; approval_note: string | null; decided_at: string | null }

const when = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });

function StudentCard({ row, onDone }: { row: Row; onDone: () => void }) {
  const [picked, setPicked] = useState<string[]>(row.modules);
  const [note, setNote] = useState(row.approval_note ?? "");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const toggle = (m: string) => setPicked((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));

  const decide = async (approve: boolean) => {
    if (approve && picked.length === 0) { toast.error("Tick at least one system."); return; }
    setBusy(true);
    const { error } = await supabase.rpc("decide_student", { p_user: row.id, p_approve: approve, p_modules: picked, p_note: note });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(approve ? `${row.full_name || row.email} can now use the ticked systems.` : "Rejected. The student will see your message.");
    onDone();
  };

  return (
    <div className="rounded-xl border border-hairline bg-panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-semibold text-ink">{row.full_name || "(no name)"}</div>
          <div className="text-[12.5px] text-[#6B7A92]">{row.email} · signed up {when(row.created_at)}</div>
        </div>
        {row.approval !== "pending" && <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${row.approval === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{row.approval}{row.decided_at ? ` ${when(row.decided_at)}` : ""}</span>}
      </div>
      <fieldset className="mt-3 flex flex-wrap gap-2">
        <legend className="mb-1 text-[12px] font-semibold text-[#6B7A92]">Systems this student may use</legend>
        {MODULES.map((m) => (
          <label key={m.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] ${picked.includes(m.id) ? "border-[#2F6BFF] bg-[#EEF4FF] text-[#2457D6]" : "border-hairline bg-white text-ink"}`}>
            <input type="checkbox" checked={picked.includes(m.id as ModuleId)} onChange={() => toggle(m.id)} />{m.label}
          </label>
        ))}
      </fieldset>
      {rejecting && (
        <label className="mt-3 flex flex-col gap-1 text-[12px] font-semibold text-[#6B7A92]">Message the student will see (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="For example: Please use your school email" className="input" />
        </label>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => decide(true)} className="flex items-center gap-1.5 rounded-lg bg-[#2F6BFF] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"><Check size={15} /> {row.approval === "approved" ? "Save access" : "Approve"}</button>
        {row.approval !== "rejected" && (rejecting
          ? <button type="button" disabled={busy} onClick={() => decide(false)} className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"><X size={15} /> Confirm reject</button>
          : <button type="button" onClick={() => setRejecting(true)} className="flex items-center gap-1.5 rounded-lg border border-hairline px-4 py-2 text-[13px] font-semibold text-[#6B7A92]"><X size={15} /> Reject</button>)}
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  const router = useRouter();
  const { loading, profile } = useSession();
  const [rows, setRows] = useState<Row[] | null | undefined>(undefined);
  const isTeacher = profile?.role === "teacher";

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("access_requests");
    setRows(error ? null : ((data as Row[]) ?? []));
  }, []);
  useEffect(() => {
    if (loading) return;
    if (!isTeacher) { router.replace("/choose"); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [loading, isTeacher, router, load]);

  if (loading || !isTeacher) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={20} color="#2F6BFF" /></div>;
  const group = (s: Row["approval"]) => (rows ?? []).filter((r) => r.approval === s);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-5">
      <button type="button" onClick={() => router.push("/choose")} className="flex items-center gap-1.5 text-[13px] font-semibold text-[#2F6BFF]"><ArrowLeft size={14} /> Back</button>
      <div>
        <h1 className="text-2xl font-bold text-ink">Sign-up approvals</h1>
        <p className="mt-1 text-sm text-[#6B7A92]">New students wait here. Tick the systems each student may use, then approve. Students who were already in the system before approvals began are approved for everything.</p>
      </div>
      {rows === undefined && <Loader2 className="animate-spin" size={18} color="#2F6BFF" />}
      {rows === null && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">The list could not be loaded. The approvals update (migration 0085) may not be applied yet.</p>}
      {rows && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-ink">Waiting ({group("pending").length})</h2>
            {group("pending").length === 0 && <p className="text-sm text-[#6B7A92]">Nobody is waiting.</p>}
            {group("pending").map((r) => <StudentCard key={r.id} row={r} onDone={load} />)}
          </section>
          <details className="space-y-3">
            <summary className="cursor-pointer text-lg font-bold text-ink">Approved ({group("approved").length})</summary>
            <div className="mt-3 space-y-3">{group("approved").map((r) => <StudentCard key={r.id} row={r} onDone={load} />)}</div>
          </details>
          {group("rejected").length > 0 && (
            <details className="space-y-3">
              <summary className="cursor-pointer text-lg font-bold text-ink">Rejected ({group("rejected").length})</summary>
              <div className="mt-3 space-y-3">{group("rejected").map((r) => <StudentCard key={r.id} row={r} onDone={load} />)}</div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
