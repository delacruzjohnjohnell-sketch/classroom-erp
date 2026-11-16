"use client";
// A student's way into the AIS system without waiting to be added to a company: the practice sets the teacher has opened (migration 0088).
// Starting a set gives the student their own company, both seats and their own numbers; opening it again later goes back to the same company.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { useAccessGuard } from "@/lib/useAccess";

type OpenSet = { id: string; title: string; topic: string | null; summary: string | null; documents: number; mode: "IMMEDIATE" | "AFTER_CLOSE"; started: string | null };
const VIOLET = "#9D7CFF";

export default function AisStartPage() {
  const router = useRouter();
  const { loading, userId, profile, refresh, switchCompany } = useSession();
  const blocked = useAccessGuard("ais");
  const [sets, setSets] = useState<OpenSet[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!userId) { router.replace("/login"); return; }
    if (profile?.role === "teacher") router.replace("/ais/teams");
  }, [loading, userId, profile, router]);

  const load = useCallback(async () => {
    const r = await supabase.rpc("ais_open_sets");
    setSets(r.error ? [] : (((r.data as OpenSet[]) ?? []).map((x) => ({ ...x, documents: Number(x.documents) }))));
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!loading && userId && profile && profile.role !== "teacher") load(); }, [loading, userId, profile, load]);

  const start = async (s: OpenSet) => {
    if (busy) return;
    setBusy(s.id);
    try {
      let company = s.started;
      if (!company) {
        const r = await supabase.rpc("ais_start_set", { p_set: s.id });
        if (r.error) { toast.error(r.error.message); return; }
        company = r.data as string;
        await refresh();
      }
      if (!(await switchCompany(company))) { toast.error("Couldn't open your company. Please try again."); return; }
      router.push("/ais");
    } finally { setBusy(null); }
  };

  if (loading || !profile || blocked || profile.role === "teacher" || sets === null) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={20} color={VIOLET} /></div>;
  }
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-hairline bg-panel">
        <div className="font-mono text-[14px] font-bold">JJ and Co.</div>
        <button onClick={() => router.push("/choose")} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs text-[#A3B1C2]"><ArrowLeft size={14} /> Choose ERP</button>
      </div>
      <div className="px-4 py-8 max-w-[760px] w-full mx-auto flex flex-col gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7F8EA0]">Accounting Information Systems</div>
          <h1 className="text-[22px] font-bold mt-1">Choose a practice set</h1>
          <p className="text-[13px] text-[#A3B1C2] mt-1">Starting a set gives you your own company with both seats, Accounting and Audit, and numbers that are yours alone. Come back here any time to continue it.</p>
        </div>
        {sets.length === 0 && <div className="rounded-xl border border-hairline bg-panel p-5 text-[13px] text-[#A3B1C2]">No practice set is open yet. Your teacher will open one; it will appear here.</div>}
        {sets.map((s) => (
          <div key={s.id} className="rounded-xl border border-hairline bg-panel p-5 flex flex-col gap-2">
            <div className="font-semibold text-[15px]">{s.title}</div>
            <div className="text-[12px] text-[#7F8EA0]">{s.topic} · {s.documents} documents · {s.mode === "IMMEDIATE" ? "Practice: each answer is explained straight away" : "Graded: results after the Audit closes"}</div>
            {s.summary && <p className="text-[13px] text-[#A3B1C2]">{s.summary}</p>}
            <div><button type="button" disabled={busy !== null} onClick={() => start(s)} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: VIOLET }}>
              {busy === s.id ? "Opening…" : s.started ? "Continue" : "Start this practice set"}
            </button></div>
          </div>
        ))}
      </div>
    </div>
  );
}
