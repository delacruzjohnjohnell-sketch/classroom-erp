"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Users, Wallet } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Empty, FormStyles, GoldBtn, KpiCard, Label, Modal, OutlineBtn, Panel, TinyBtn } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { showQueryErrors } from "@/lib/queryErrors";
import { money } from "@/lib/aisDesk";
import { PR_LABEL, PR_TONE, prRunStep, prUndecided, type PrTask } from "@/lib/aisSales";
import DeskPrimer from "@/components/ais/DeskPrimer";

type Employee = { id: string; code: string; name: string; monthly_rate: number; active: boolean };
type State = { phase: "ACCOUNTING" | "AUDIT" | "CLOSED"; solo: boolean; employees: Employee[]; tasks: PrTask[] };
type Score = { visible: boolean; points?: number; max?: number; rows?: { seq: number; ref_no: string; points: number; max: number; message: string; why: string }[] };

const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export default function AisPayrollPage() {
  return <AppShell><Payroll /></AppShell>;
}

function Payroll() {
  const { effectiveTenantId } = useSession();
  const [st, setSt] = useState<State | null | undefined>(undefined);
  const [score, setScore] = useState<Score | null>(null);
  const [deciding, setDeciding] = useState<{ task: PrTask; kind: "approve" | "reject" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    // the state call creates the company's employees and cards the first time, so the score is asked for after it
    const s = await supabase.rpc("ais_pr_state");
    if (showQueryErrors(s)) { setSt(null); return; }
    const sc = await supabase.rpc("ais_pr_my_score");
    const raw = s.data as State;
    setSt({
      ...raw,
      employees: raw.employees.map((e) => ({ ...e, monthly_rate: Number(e.monthly_rate) })),
      tasks: raw.tasks.map((t) => ({ ...t, hours: numOrNull(t.hours), ot_hours: numOrNull(t.ot_hours), new_rate: numOrNull(t.new_rate), gross: numOrNull(t.gross), deductions: numOrNull(t.deductions), net: numOrNull(t.net), current_rate: numOrNull(t.current_rate) })),
    });
    setScore((sc.data as Score | null) ?? null);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (effectiveTenantId) load(); }, [effectiveTenantId, load]);

  if (st === undefined) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin" size={20} color="#9D7CFF" /></div>;
  if (st === null) return <div className="px-7 py-6 max-w-[900px]"><Panel title="Payroll desk"><Empty>The Payroll desk opens once your teacher has assigned a practice set to this company and you hold the Accounting seat.</Empty></Panel></div>;

  const open = st.phase === "ACCOUNTING";
  const undecided = prUndecided(st.tasks);
  const runStep = prRunStep(st.tasks);
  const finished = st.tasks.filter((t) => ["CLEAN", "ACCEPTED", "REJECTED", "POSTED", "PAID", "DONE"].includes(t.state)).length;
  const posted = st.tasks.filter((t) => t.kind === "TIME" && (t.state === "POSTED" || t.state === "PAID"));
  const netTotal = posted.reduce((s, t) => s + (t.net ?? 0), 0);

  const check = async (t: PrTask) => {
    setBusy(true);
    const r = await mutate(supabase.rpc("ais_pr_check", { p_task: t.id }));
    if (ok(r)) {
      const d = r.data as unknown as { ok: boolean; reason: string | null };
      setNote(d.ok ? `Check passed for ${t.emp_name}: the HR file and approvals support this card.` : `Check HELD ${t.emp_name}: ${d.reason}. Approve it only if you are the right person to; otherwise reject it.`);
    }
    setBusy(false);
    await load();
  };
  const post = async () => { setBusy(true); await mutate(supabase.rpc("ais_pr_post"), { successMessage: "Payroll vouchers posted to the ledger." }); setBusy(false); await load(); };
  const pay = async () => { setBusy(true); await mutate(supabase.rpc("ais_pr_pay"), { successMessage: "Net pay paid from cash." }); setBusy(false); await load(); };

  return (
    <div className="px-7 py-6 max-w-[1200px] flex flex-col gap-5">
      <FormStyles />
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7F8EA0]">Accounting seat · Payroll cycle workbench</div>
        <h1 className="text-[20px] font-bold mt-1">Payroll desk</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1 max-w-[860px]">
          Work the January 2027 payroll cards. For each timecard or pay-rate change: <b>check it</b> against the HR master file and its approvals, then <b>approve or reject</b> anything the check holds.
          When every card is decided, <b>post the payroll</b> (one voucher per employee) and <b>pay the net pay</b>. Pay only people who are on the HR file, still employed, for hours that are possible, and at rates and overtime that someone authorized.
        </div>
      </div>

      <DeskPrimer desk="payroll" />
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <KpiCard icon={<CheckCircle2 size={14} />} label="Cards decided" value={`${finished} of ${st.tasks.length}`} accent="#22D3C5" />
        <KpiCard icon={<Users size={14} />} label="Employees on file" value={st.employees.filter((e) => e.active).length} accent="#F2B13C" />
        <KpiCard icon={<Wallet size={14} />} label="Net pay posted" value={money(netTotal)} accent="#9D7CFF" />
        <KpiCard icon={<CheckCircle2 size={14} />} label="Score" value={score?.visible ? `${score.points} / ${score.max}` : "after close"} accent="#9D7CFF" />
      </div>

      {note && <div className="rounded-lg border border-hairline bg-panel px-4 py-3 text-[12.5px] text-[#C8D3E0]" role="status">{note} <button className="underline ml-2 text-[#7F8EA0]" onClick={() => setNote(null)}>Dismiss</button></div>}
      {!open && <div className="rounded-lg border border-hairline bg-panel px-4 py-3 text-[12.5px] text-[#A3B1C2]">The Accounting phase is closed, so the Payroll desk is read-only now.</div>}

      <Panel title="Payroll cards (work these in order)">
        <table>
          <thead><tr><th style={{ width: 36 }}>#</th><th>Card</th><th>What it says</th><th>Where it stands</th><th /></tr></thead>
          <tbody>
            {st.tasks.map((t) => (
              <tr key={t.id}>
                <td>{t.seq}</td>
                <td><b>{t.kind === "TIME" ? "Timecard" : t.kind === "RATE_CHANGE" ? "Pay-rate change request" : "Payroll run"}</b><div className="text-[11px] text-[#7F8EA0]">{t.emp_name}</div></td>
                <td style={{ fontSize: 12 }}>
                  {t.kind === "TIME" && <>{t.hours} regular hours{t.ot_hours ? `, ${t.ot_hours} overtime hours (${t.ot_approved ? "slip approved" : "no approved slip"})` : ""}</>}
                  {t.kind === "RATE_CHANGE" && <>From {money(t.current_rate)} to {money(t.new_rate)} a month ({t.form_attached ? "personnel action attached" : "no personnel action form"})</>}
                  {t.kind === "RUN" && <>{runStep === "wait" ? `Waiting for ${undecided} card(s) to be decided` : runStep === "post" ? "All cards decided: ready to post" : runStep === "pay" ? "Posted: ready to pay" : "Done"}</>}
                  {t.note && <div className="text-[11px] text-[#A3B1C2] mt-0.5">{t.note}</div>}
                  {t.state === "HELD" && t.flag_text && <div className="text-[11.5px] text-[#FF6B7A] mt-1">{t.flag_text}</div>}
                  {t.gross !== null && t.kind === "TIME" && <div className="text-[11px] text-[#7F8EA0] mt-1">Gross {money(t.gross)} · deductions {money(t.deductions)} · net {money(t.net)}</div>}
                </td>
                <td style={{ fontSize: 12, color: PR_TONE[t.state] }}>● {PR_LABEL[t.state]}{t.self_approved && <div className="text-[11px] text-[#FF6B7A]">approved by the same person who ran the check</div>}{t.decision_note && <div className="text-[11px] text-[#7F8EA0]">{t.decision_note}</div>}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {open && t.kind !== "RUN" && t.state === "NEW" && <><TinyBtn type="button" onClick={() => { if (!busy) check(t); }}>Check against the HR file</TinyBtn>{" "}<TinyBtn type="button" onClick={() => setDeciding({ task: t, kind: "reject" })}>Reject…</TinyBtn></>}
                  {open && t.kind !== "RUN" && t.state === "HELD" && <><TinyBtn type="button" onClick={() => setDeciding({ task: t, kind: "approve" })}>Approve…</TinyBtn>{" "}<TinyBtn type="button" onClick={() => setDeciding({ task: t, kind: "reject" })}>Reject…</TinyBtn></>}
                  {open && t.kind === "RUN" && runStep === "post" && <TinyBtn type="button" onClick={() => { if (!busy) post(); }}>Post the payroll</TinyBtn>}
                  {open && t.kind === "RUN" && runStep === "pay" && <TinyBtn type="button" onClick={() => { if (!busy) pay(); }}>Pay the net pay</TinyBtn>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="HR master file">
        <table>
          <thead><tr><th>Code</th><th>Employee</th><th style={{ textAlign: "right" }}>Monthly rate</th><th>Status</th></tr></thead>
          <tbody>{st.employees.map((e) => (<tr key={e.id}><td>{e.code}</td><td>{e.name}</td><td style={{ textAlign: "right" }}>{money(e.monthly_rate)}</td><td style={{ color: e.active ? "#22D3C5" : "#FF6B7A" }}>{e.active ? "Active" : "Resigned"}</td></tr>))}</tbody>
        </table>
        <div className="text-[11px] text-[#7F8EA0] mt-2">Contributions use simplified classroom rates (SSS 4.5% employee and 9.5% employer, PhilHealth 2.5% each, Pag-IBIG 100 each, withholding tax 15% over 20,833 of taxable pay), not the legal tables.</div>
      </Panel>

      {score?.visible && score.rows && (
        <Panel title={`How you did: ${score.points} of ${score.max}`}>
          <table>
            <thead><tr><th>Card</th><th>Points</th><th>Result</th><th>What the card was hiding</th></tr></thead>
            <tbody>{score.rows.map((r) => (<tr key={r.seq}><td>{r.seq} · {r.ref_no}</td><td>{r.points} / {r.max}</td><td style={{ fontSize: 12 }}>{r.message}</td><td style={{ fontSize: 12, color: "#A3B1C2" }}>{r.why}</td></tr>))}</tbody>
          </table>
        </Panel>
      )}

      {deciding && <Decide task={deciding.task} kind={deciding.kind} solo={st.solo} onClose={() => setDeciding(null)} onDone={async () => { setDeciding(null); await load(); }} />}
    </div>
  );
}

function Decide({ task, kind, solo, onClose, onDone }: { task: PrTask; kind: "approve" | "reject"; solo: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await mutate(supabase.rpc(kind === "approve" ? "ais_pr_approve" : "ais_pr_reject", { p_task: task.id, p_reason: reason }), { successMessage: kind === "approve" ? "Approved." : "Rejected." });
    setBusy(false);
    if (ok(r)) await onDone();
  };
  return (
    <Modal title={`${kind === "approve" ? "Approve" : "Reject"} the card for ${task.emp_name}`} onClose={onClose}>
      {task.flag_text && <div className="text-[12.5px] text-[#C8D3E0] mb-2">{task.flag_text}</div>}
      {kind === "approve" && <div className="text-[12px] text-[#A3B1C2] mb-2">{task.checked_by_me ? (solo ? "You ran the check on this card. This company allows solo work, so you can approve it yourself, but a self-approval is exactly what an auditor looks for." : "You ran the check on this card, so a different person must approve it (segregation of duties).") : "You did not run the check on this card, so you may act as the approver."}</div>}
      <Label>{kind === "approve" ? "Why is this pay justified? (at least ten characters)" : "Why are you rejecting it? (at least ten characters)"}</Label>
      <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2 justify-end mt-4"><OutlineBtn type="button" onClick={onClose} disabled={busy}>Cancel</OutlineBtn><GoldBtn type="button" onClick={save} disabled={busy || reason.trim().length < 10}>{kind === "approve" ? "Approve" : "Reject"}</GoldBtn></div>
    </Modal>
  );
}
