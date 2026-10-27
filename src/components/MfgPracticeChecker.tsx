"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { CheckResult } from "@/lib/practiceCheck";
import { toast } from "@/lib/toast";
import { netIncome, runMfgPracticeChecks, summarizeMfg, type MfgPracticeSet, type MfgSnapshot } from "@/lib/mfgPracticeCheck";

const TEAL = "#22D3C5", RED = "#FF6B7A";

function Row({ r }: { r: CheckResult }) {
  return (
    <div className="flex gap-2.5 py-2 border-b border-hairline text-[12.5px]">
      {r.pass ? <CheckCircle2 size={15} color={TEAL} className="mt-0.5 shrink-0" /> : <XCircle size={15} color={RED} className="mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <div className="font-semibold">{r.label}</div>
        <div className="text-[#A3B1C2] break-words">Expected {r.expected}<br />Found {r.actual}</div>
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

/** The teacher's "Check" for a Manufacturing company: reads the company as one snapshot and compares it with the chosen practice set. */
export default function MfgPracticeCheckModal({ tenant, onClose }: { tenant: { id: string; name: string }; onClose: () => void }) {
  const [snap, setSnap] = useState<MfgSnapshot | null>(null);
  const [error, setError] = useState("");
  const [showPassed, setShowPassed] = useState(false);
  const [sets, setSets] = useState<{ id: string; name: string; summary: string }[]>([]);
  const [setId, setSetId] = useState("");
  const [practiceSet, setPracticeSet] = useState<MfgPracticeSet | null>(null);
  const [rel, setRel] = useState<{ class: boolean; owner: boolean; has_owner: boolean } | null>(null);
  const [relBusy, setRelBusy] = useState(false);
  const ACTIVITY = "activity-1-manufacturing";

  const loadRelease = async () => {
    const r = await supabase.rpc("mfg_activity_release_state", { p_activity: ACTIVITY, p_tenant: tenant.id });
    if (!r.error) setRel(r.data as { class: boolean; owner: boolean; has_owner: boolean });
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadRelease(); }, [tenant.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const release = async (who: "owner" | "class", on: boolean) => {
    if (relBusy) return;
    setRelBusy(true);
    const r = who === "class"
      ? await supabase.rpc("mfg_activity_release", { p_activity: ACTIVITY, p_user: null, p_release: on })
      : await supabase.rpc("mfg_activity_release_company", { p_activity: ACTIVITY, p_tenant: tenant.id, p_release: on });
    setRelBusy(false);
    if (r.error) { toast.error(r.error.message); return; }
    toast.success(on ? (who === "class" ? "Answer key released to the whole class." : "Answer key released to the student(s) of this company.") : "Answer key taken back.");
    loadRelease();
  };

  useEffect(() => {
    let live = true;
    (async () => {
      const r = await supabase.rpc("mfg_practice_snapshot", { p_tenant: tenant.id });
      if (!live) return;
      if (r.error) setError(r.error.message || "Could not read this company's data.");
      else setSnap(r.data as MfgSnapshot);
    })();
    return () => { live = false; };
  }, [tenant.id]);

  // The expected figures are fetched from the database (teacher only); they are not part of the website's code.
  useEffect(() => {
    let live = true;
    (async () => {
      const r = await supabase.rpc("mfg_practice_set_list");
      if (!live) return;
      if (r.error) { setError(r.error.message || "Could not load the practice sets."); return; }
      const list = (r.data as { id: string; name: string; summary: string }[]) ?? [];
      setSets(list);
      if (list[0]) setSetId((cur) => cur || list[0].id);
    })();
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!setId) return;
    let live = true;
    (async () => {
      const r = await supabase.rpc("mfg_practice_set_get", { p_id: setId });
      if (!live) return;
      if (r.error) setError(r.error.message || "Could not load the practice set.");
      else setPracticeSet(r.data as MfgPracticeSet);
    })();
    return () => { live = false; };
  }, [setId]);

  const results = useMemo(() => (snap && practiceSet ? runMfgPracticeChecks(snap, practiceSet) : null), [snap, practiceSet]);
  const s = results ? summarizeMfg(results) : null;
  const failed = results?.filter((r) => !r.pass) ?? [];
  const passed = results?.filter((r) => r.pass) ?? [];
  const net = snap ? netIncome(snap.gl) : 0;

  return (
    <Modal title={`Practice set check — ${tenant.name}`} onClose={onClose} wide>
      <label className="block text-[11px] font-bold uppercase tracking-wide text-[#7F8EA0] mt-3 mb-1" htmlFor="mfg-practice-set-select">Practice set</label>
      <select id="mfg-practice-set-select" className="input" value={setId} onChange={(e) => { setPracticeSet(null); setSetId(e.target.value); setShowPassed(false); }}>
        {sets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <div className="text-[12px] text-[#A3B1C2] mt-1.5">{practiceSet?.summary}</div>

      {!results && !error && <div className="py-10 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>}
      {error && <div className="mt-3 text-[13px]" style={{ color: RED }}>{error}</div>}
      {results && s && (
        <>
          <div className="mt-4 mb-3 flex items-baseline gap-3 flex-wrap">
            <div className="text-[22px] font-bold" style={{ color: s.failed === 0 ? TEAL : RED }}>{s.passed} / {s.total}</div>
            <div className="text-[12.5px] text-[#A3B1C2]">checks passed · {net >= 0 ? "net profit" : "net loss"} so far</div>
          </div>
          {s.failed === 0 && <div className="text-[13px] mb-2" style={{ color: TEAL }}>Everything matches the practice set.</div>}

          {grouped(failed).map(({ group, rows }) => (
            <div key={group} className="mb-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#7F8EA0] mb-1">Needs attention · {group}</div>
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
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#7F8EA0] mb-1">{group}</div>
              {rows.map((r) => <Row key={r.group + r.label} r={r} />)}
            </div>
          ))}
          <div className="mt-5 pt-4 border-t border-hairline">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#7F8EA0] mb-2">Answer key for students</div>
            <div className="text-[12.5px] text-[#A3B1C2] mb-2">
              Students see nothing until you release it. Then they can load the Activity 1 answer key into a new, empty company and compare it with their own.
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              {rel?.has_owner && (
                <button disabled={relBusy} onClick={() => release("owner", !rel.owner)} className="rounded-md px-3 py-2 text-xs font-semibold border border-hairline disabled:opacity-50"
                  style={{ color: TEAL }}>{rel.owner ? "Take the key back from this company's student(s)" : "Release the key to this company's student(s)"}</button>
              )}
              <button disabled={relBusy || !rel} onClick={() => release("class", !rel?.class)} className="rounded-md px-3 py-2 text-xs font-semibold border border-hairline disabled:opacity-50"
                style={{ color: TEAL }}>{rel?.class ? "Take the key back from the whole class" : "Release the key to the whole class"}</button>
              {rel && <span className="text-[12px] text-[#A3B1C2]">{rel.class ? "Released to the whole class." : rel.owner ? "Released to this company's student(s)." : "Not released."}</span>}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
