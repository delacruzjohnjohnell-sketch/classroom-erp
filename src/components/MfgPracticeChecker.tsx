"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { CheckResult } from "@/lib/practiceCheck";
import { MFG_PRACTICE_SETS, netIncome, runMfgPracticeChecks, summarizeMfg, type MfgSnapshot } from "@/lib/mfgPracticeCheck";

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
  const [setId, setSetId] = useState(MFG_PRACTICE_SETS[0].id);

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

  const practiceSet = MFG_PRACTICE_SETS.find((p) => p.id === setId) ?? MFG_PRACTICE_SETS[0];
  const results = useMemo(() => (snap ? runMfgPracticeChecks(snap, practiceSet) : null), [snap, practiceSet]);
  const s = results ? summarizeMfg(results) : null;
  const failed = results?.filter((r) => !r.pass) ?? [];
  const passed = results?.filter((r) => r.pass) ?? [];
  const net = snap ? netIncome(snap.gl) : 0;

  return (
    <Modal title={`Practice set check — ${tenant.name}`} onClose={onClose} wide>
      <label className="block text-[11px] font-bold uppercase tracking-wide text-[#7F8EA0] mt-3 mb-1" htmlFor="mfg-practice-set-select">Practice set</label>
      <select id="mfg-practice-set-select" className="input" value={setId} onChange={(e) => { setSetId(e.target.value); setShowPassed(false); }}>
        {MFG_PRACTICE_SETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <div className="text-[12px] text-[#A3B1C2] mt-1.5">{practiceSet.summary}</div>

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
        </>
      )}
    </Modal>
  );
}
