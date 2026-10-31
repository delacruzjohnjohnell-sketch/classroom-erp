"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Inbox, Loader2, Lock } from "lucide-react";
import AppShell from "@/components/AppShell";
import { ConfirmDialog, Empty, GoldBtn, KpiCard, Panel } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { showQueryErrors } from "@/lib/queryErrors";
import { nextPending, progress, statusText, type InboxRow } from "@/lib/aisDesk";

type Instance = { title: string; topic: string | null; summary: string | null; mode: "IMMEDIATE" | "AFTER_CLOSE"; phase: "ACCOUNTING" | "AUDIT" | "CLOSED"; lock_date: string | null; total: number; pending: number; posted: number; held: number };
type Score = { visible: boolean; points?: number; max?: number; message?: string };

export default function AisInboxPage() {
  return <AppShell><Inbox_ /></AppShell>;
}

function Inbox_() {
  const router = useRouter();
  const { effectiveTenantId } = useSession();
  const [inst, setInst] = useState<Instance | null | undefined>(undefined);
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [score, setScore] = useState<Score | null>(null);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [i, r, s] = await Promise.all([supabase.rpc("ais_my_instance"), supabase.rpc("ais_inbox"), supabase.rpc("ais_my_score")]);
    showQueryErrors(i, r);
    setInst((i.data as Instance | null) ?? null);
    setRows(((r.data as InboxRow[]) ?? []).map((x) => ({ ...x, seq: Number(x.seq), wrong_attempts: Number(x.wrong_attempts), points: x.points === null ? null : Number(x.points), max_points: x.max_points === null ? null : Number(x.max_points) })));
    setScore((s.data as Score | null) ?? null);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (effectiveTenantId) load(); }, [effectiveTenantId, load]);

  const closePhase = async () => {
    setBusy(true);
    const res = await mutate(supabase.rpc("ais_close_accounting", { p_force: true }), { successMessage: "The Accounting phase is closed. Your scores are shown." });
    setBusy(false);
    if (ok(res)) { setClosing(false); await load(); }
  };

  if (inst === undefined) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin" size={20} color="#9D7CFF" /></div>;
  if (inst === null) return (
    <div className="px-7 py-6 max-w-[900px]"><Panel title="Document inbox"><Empty>No practice set has been assigned to this company yet. Your teacher will assign one.</Empty></Panel></div>
  );

  const p = progress(rows);
  const open = inst.phase === "ACCOUNTING";
  const next = nextPending(rows);
  const showPoints = rows.some((r) => r.points !== null);

  return (
    <div className="px-7 py-6 max-w-[1100px] flex flex-col gap-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7F8EA0]">Accounting seat · {inst.topic ?? "Practice set"}</div>
        <h1 className="text-[20px] font-bold mt-1">{inst.title}</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1 max-w-[780px]">{inst.summary}</div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <KpiCard icon={<Inbox size={14} />} label="Documents" value={p.total} />
        <KpiCard icon={<CheckCircle2 size={14} />} label="Decided" value={`${p.decided} of ${p.total}`} accent="#22D3C5" />
        <KpiCard icon={<Lock size={14} />} label="Phase" value={inst.phase === "ACCOUNTING" ? "Open" : "Closed"} accent={open ? "#F2B13C" : "#9D7CFF"} />
        <KpiCard icon={<CheckCircle2 size={14} />} label="Score" value={score?.visible ? `${score.points} / ${score.max}` : "after close"} accent="#9D7CFF" />
      </div>

      <div className="text-[12px] text-[#7F8EA0]">
        {inst.mode === "IMMEDIATE"
          ? "Practice round: you see whether each decision was right straight away, and a wrong journal for a valid document is refused."
          : "Graded round: every decision is final and posts as you chose. Nothing is revealed until you close the Accounting phase."}
      </div>

      <Panel title="Documents to review">
        <div className="h-1.5 rounded-full bg-[#1B2733] mb-3 overflow-hidden"><div className="h-full" style={{ width: `${p.pct}%`, background: "#22D3C5" }} /></div>
        <table>
          <thead><tr><th style={{ width: 44 }}>#</th><th>Document</th><th>Dated</th><th>Status</th>{showPoints && <th style={{ textAlign: "right" }}>Points</th>}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => router.push(`/ais/inbox/${r.id}`)} style={{ cursor: "pointer" }}>
                <td>{r.seq}</td>
                <td><b>{r.title}</b>{r.wrong_attempts > 0 && r.status === "PENDING" && <span className="text-[11px] text-[#FF6B7A]"> · {r.wrong_attempts} refused {r.wrong_attempts === 1 ? "try" : "tries"}</span>}</td>
                <td>{r.doc_date}</td>
                <td><span className="text-[11.5px] font-semibold" style={{ color: statusText(r).tone }}>● {statusText(r).label}</span></td>
                {showPoints && <td style={{ textAlign: "right" }}>{r.points === null ? "" : `${r.points} / ${r.max_points}`}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-2 mt-4 flex-wrap">
          {open && next && <GoldBtn onClick={() => router.push(`/ais/inbox/${next}`)}>Review the next document</GoldBtn>}
          {open && <button onClick={() => setClosing(true)} className="border border-hairline rounded-md px-3 py-1.5 text-[12.5px] text-[#A3B1C2]">Close the Accounting phase…</button>}
        </div>
      </Panel>

      {!open && (
        <Panel title="The Accounting phase is closed">
          <div className="text-[12.5px] text-[#A3B1C2]">
            The books are locked through {inst.lock_date ?? "the end of the period"}. Everything you posted is now the population the Audit seat will test. Wrongly posted documents are for the Audit seat to find.
          </div>
        </Panel>
      )}

      {closing && (
        <ConfirmDialog title="Close the Accounting phase?" confirmLabel="Close it" busy={busy} onConfirm={closePhase} onCancel={() => setClosing(false)}
          message={<>You will not be able to decide any more documents. {p.pending > 0 ? <b>{p.pending} document{p.pending === 1 ? " is" : "s are"} still waiting and will score 0.</b> : "All documents are decided."} The books will be locked and your scores shown.</>} />
      )}
    </div>
  );
}
