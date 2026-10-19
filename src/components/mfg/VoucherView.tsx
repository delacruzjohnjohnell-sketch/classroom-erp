"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, RotateCcw, Undo2 } from "lucide-react";
import { Modal, Label, GoldBtn, OutlineBtn, ConfirmDialog } from "@/components/ui";
import ReportSheet from "@/components/mfg/ReportSheet";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { showQueryErrors } from "@/lib/queryErrors";
import { fmtAmount, longDate } from "@/lib/mfgStatements";
import { jvTypeLabel, STATUS_LABEL, type VoucherStatus } from "@/lib/mfgVouchers";

type Who = { name: string | null; at: string | null };
type View = {
  id: string; voucher_no: string; kind: "MANUAL" | "SYSTEM"; voucher_type: string; jv_type: string | null; voucher_date: string; period: string; reference: string | null;
  particulars: string | null; status: VoucherStatus; override: boolean; override_reason: string | null; reject_note: string | null; reversal_reason: string | null;
  reverses: { id: string | null; no: string | null }; reversed_by: { id: string | null; no: string | null };
  lines: { account_code: string; account_name: string; cost_center?: string | null; order_no?: string | null; description?: string | null; debit: number; credit: number }[];
  debit: number; credit: number; source: { label: string; number: string | null; path: string | null; table: string } | null;
  signoff: { prepared: Who; reviewed: Who; approved: Who }; can_reverse: boolean;
};
const today = () => new Date().toISOString().slice(0, 10);
const TONE: Record<VoucherStatus, string> = { DRAFT: "#6b7280", PENDING_APPROVAL: "#9a6700", POSTED: "#1a7f37", REVERSED: "#cf222e" };

/** The printable voucher: header, lines, particulars, linked documents, sign-off, and the actions that belong to its status. */
export default function VoucherView({ voucherId, onClose, onChanged }: { voucherId: string; onClose: () => void; onChanged?: () => void }) {
  const { effectiveTenantId, tenants, profile } = useSession();
  const isTeacher = profile?.role === "teacher";
  const company = tenants.find((t) => t.id === effectiveTenantId)?.name ?? "Company";
  const [v, setV] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [rDate, setRDate] = useState(today());
  const [rReason, setRReason] = useState("");
  const [sendBack, setSendBack] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const r = await supabase.rpc("mfg_voucher_view", { p_voucher: voucherId });
    if (showQueryErrors(r)) return;
    setV(r.data as View);
  }, [voucherId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const done = async () => { await load(); onChanged?.(); };
  const reverse = async () => {
    if (!v || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_reverse_voucher", { p_id: v.id, p_date: rDate, p_reason: rReason }), { successMessage: "Reversed. A new voucher was posted; the original stays on the record." });
    setBusy(false);
    if (ok(res)) { setReversing(false); setRReason(""); await done(); }
  };
  const approve = async () => {
    if (!v || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_approve_voucher", { p_id: v.id }), { successMessage: "Approved and posted." });
    setBusy(false);
    if (ok(res)) await done();
  };
  const reject = async () => {
    if (!v || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_reject_voucher", { p_id: v.id, p_note: note }), { successMessage: "Sent back to the student." });
    setBusy(false);
    if (ok(res)) { setSendBack(false); setNote(""); await done(); }
  };

  return (
    <Modal title={v ? `${v.voucher_type} ${v.voucher_no}` : "Voucher"} onClose={onClose} wide>
      {!v ? <div className="py-10 text-center text-[13px] text-[#7F8EA0]">Loading…</div> : (
        <>
          <ReportSheet company={company} title={v.voucher_type} period={`Voucher no. ${v.voucher_no} · ${longDate(v.voucher_date)}`} exportName={v.voucher_no}
            badge={<span style={{ fontSize: 11.5, fontWeight: 700, color: TONE[v.status], border: `1px solid ${TONE[v.status]}`, borderRadius: 4, padding: "1px 8px" }}>{STATUS_LABEL[v.status]}</span>}
            csv={[["Account code", "Account title", "Cost center", "Order", "Description", "Debit", "Credit"], ...v.lines.map((l) => [l.account_code, l.account_name, l.cost_center ?? "", l.order_no ?? "", l.description ?? "", Number(l.debit).toFixed(2), Number(l.credit).toFixed(2)])]}
            signoff={[
              { role: v.kind === "SYSTEM" ? "Posted by (automatic from the document)" : "Prepared by", name: v.signoff.prepared.name, at: v.signoff.prepared.at },
              { role: "Reviewed / checked by", name: v.signoff.reviewed.name, at: v.signoff.reviewed.at },
              { role: v.kind === "SYSTEM" ? "Approved by" : "Approved / posted by", name: v.signoff.approved.name, at: v.signoff.approved.at },
            ]}
            actions={!isTeacher && v.can_reverse ? <button type="button" onClick={() => setReversing(true)} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#FF6B7A] border border-hairline rounded px-2.5 py-1.5"><Undo2 size={13} /> Reverse voucher</button>
              : isTeacher && v.status === "PENDING_APPROVAL" ? (<>
                  <button type="button" onClick={approve} disabled={busy} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#22D3C5] border border-hairline rounded px-2.5 py-1.5"><Check size={13} /> Approve and post</button>
                  <button type="button" onClick={() => setSendBack(true)} disabled={busy} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#F2B13C] border border-hairline rounded px-2.5 py-1.5"><RotateCcw size={13} /> Send back</button>
                </>) : null}>
            <table className="rs-table">
              <thead><tr><th>Account code</th><th>Account title</th><th>Cost center</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
              <tbody>
                {v.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.account_code}</td>
                    <td style={{ paddingLeft: Number(l.credit) > 0 ? 24 : undefined }}>{l.account_name}
                      {(l.description || l.order_no) && <div style={{ fontSize: 11, color: "#666" }}>{[l.description, l.order_no ? `Order ${l.order_no}` : null].filter(Boolean).join(" · ")}</div>}</td>
                    <td>{l.cost_center ?? ""}</td>
                    <td className="num">{Number(l.debit) ? fmtAmount(l.debit) : ""}</td><td className="num">{Number(l.credit) ? fmtAmount(l.credit) : ""}</td>
                  </tr>
                ))}
                <tr className="tot"><td colSpan={3}>Total</td><td className="num">{fmtAmount(v.debit)}</td><td className="num">{fmtAmount(v.credit)}</td></tr>
              </tbody>
            </table>
            <div style={{ marginTop: 14, border: "1px solid #ccc", borderRadius: 4, padding: "8px 10px", fontSize: 12.5 }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>Particulars / explanation</div>
              <div>{v.particulars ?? "—"}</div>
              <div style={{ marginTop: 6, color: "#444", fontSize: 12 }}>
                {v.kind === "MANUAL" && <>Kind: {jvTypeLabel(v.jv_type)} · </>}Period {v.period}
                {v.reference && <> · Reference: {v.reference}</>}
              </div>
              {v.source && (
                <div style={{ marginTop: 6, fontSize: 12 }}>Supporting document: <b>{v.source.label}{v.source.number ? ` ${v.source.number}` : ""}</b>
                  {v.source.path && <> — <Link href={v.source.path} className="report-actions" style={{ color: "#0b5fff", textDecoration: "underline" }}>open it <ExternalLink size={11} style={{ display: "inline" }} /></Link></>}</div>
              )}
              {v.override && <div style={{ marginTop: 6, fontSize: 12, color: "#9a6700" }}><b>System override / audit adjustment:</b> {v.override_reason}</div>}
              {v.reject_note && <div style={{ marginTop: 6, fontSize: 12, color: "#cf222e" }}><b>Sent back:</b> {v.reject_note}</div>}
              {v.reverses.no && <div style={{ marginTop: 6, fontSize: 12 }}>This voucher reverses <b>{v.reverses.no}</b>.</div>}
              {v.reversed_by.no && <div style={{ marginTop: 6, fontSize: 12, color: "#cf222e" }}>Reversed by <b>{v.reversed_by.no}</b>{v.reversal_reason ? ` — ${v.reversal_reason}` : ""}.</div>}
              {v.kind === "SYSTEM" && v.status === "POSTED" && v.source && <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>This voucher was written by the document above. To undo it, reverse the document; the books and the stock are then corrected together.</div>}
            </div>
          </ReportSheet>

          {reversing && (
            <ConfirmDialog title={`Reverse ${v.voucher_no}`} confirmLabel="Post the reversal" danger busy={busy} onConfirm={reverse} onCancel={() => setReversing(false)}
              message={<div>
                <div className="text-[12.5px] mb-2">A new voucher with the debits and credits swapped is posted on the date you choose. The original is marked reversed and stays on the record.</div>
                <Label>Reversal date</Label><input className="input" type="date" min={v.voucher_date} value={rDate} onChange={(e) => setRDate(e.target.value)} />
                <Label>Reason</Label><input className="input" value={rReason} onChange={(e) => setRReason(e.target.value)} placeholder="e.g. accrued twice by mistake" />
              </div>} />
          )}
          {sendBack && (
            <Modal title={`Send ${v.voucher_no} back`} onClose={() => setSendBack(false)}>
              <Label>What should the student fix?</Label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex gap-2 justify-end mt-4"><OutlineBtn type="button" onClick={() => setSendBack(false)}>Cancel</OutlineBtn><GoldBtn type="button" onClick={reject} disabled={busy || note.trim().length < 3}>Send back</GoldBtn></div>
            </Modal>
          )}
        </>
      )}
    </Modal>
  );
}
