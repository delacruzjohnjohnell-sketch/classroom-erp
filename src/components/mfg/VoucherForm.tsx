"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Modal, Label, GoldBtn, OutlineBtn } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { showQueryErrors } from "@/lib/queryErrors";
import { toast } from "@/lib/toast";
import { money } from "@/lib/costing";
import { blankLine, blankLines, canPost, isControlCode, JV_TYPES, linesForSave, totals, typeAmount, type DraftLine } from "@/lib/mfgVouchers";

type Account = { id: string; code: string; name: string; type: string };
type Opt = { id: string; label: string };
const today = () => new Date().toISOString().slice(0, 10);
const label = (a: Account) => `${a.code} — ${a.name}`;

/** The manual journal voucher: header, a double-entry grid with a live balance bar, draft saving and submission. */
export default function VoucherForm({ voucherId, onClose, onSaved }: { voucherId: string | null; onClose: () => void; onSaved: () => void }) {
  const { effectiveTenantId } = useSession();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [centers, setCenters] = useState<Opt[]>([]);
  const [orders, setOrders] = useState<Opt[]>([]);
  const [date, setDate] = useState(today());
  const [jvType, setJvType] = useState("GENERAL");
  const [reference, setReference] = useState("");
  const [particulars, setParticulars] = useState("");
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(blankLines());
  const [typed, setTyped] = useState<string[]>(["", ""]);         // what is typed in each account box
  const [id, setId] = useState<string | null>(voucherId);
  const [busy, setBusy] = useState(false);
  const [rejectNote, setRejectNote] = useState<string | null>(null);
  const [number, setNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveTenantId) return;
    (async () => {
      const [a, c, o] = await Promise.all([
        supabase.from("accounts").select("id, code, name, type").eq("tenant_id", effectiveTenantId).order("code"),
        supabase.from("mfg_cost_centers").select("id, code, name").eq("tenant_id", effectiveTenantId).order("code"),
        supabase.from("mfg_production_orders").select("id, document_number").eq("tenant_id", effectiveTenantId).order("created_at", { ascending: false }).limit(200),
      ]);
      showQueryErrors(a, c, o);
      const accs = (a.data as Account[]) ?? [];
      setAccounts(accs);
      setCenters(((c.data as { id: string; code: string; name: string }[]) ?? []).map((x) => ({ id: x.id, label: `${x.code} — ${x.name}` })));
      setOrders(((o.data as { id: string; document_number: string | null }[]) ?? []).map((x) => ({ id: x.id, label: x.document_number ?? x.id.slice(0, 6) })));
      if (voucherId) {
        const [v, l] = await Promise.all([
          supabase.from("mfg_vouchers").select("voucher_no, voucher_date, jv_type, reference, particulars, override, override_reason, reject_note").eq("id", voucherId).maybeSingle(),
          supabase.from("mfg_voucher_lines").select("account_id, debit, credit, cost_center_id, order_id, description").eq("voucher_id", voucherId).order("line_no"),
        ]);
        showQueryErrors(v, l);
        const h = v.data as { voucher_no: string; voucher_date: string; jv_type: string | null; reference: string | null; particulars: string | null; override: boolean; override_reason: string | null; reject_note: string | null } | null;
        if (h) {
          setNumber(h.voucher_no); setDate(h.voucher_date); setJvType(h.jv_type ?? "GENERAL"); setReference(h.reference ?? ""); setParticulars(h.particulars ?? "");
          setOverride(h.override); setOverrideReason(h.override_reason ?? ""); setRejectNote(h.reject_note);
        }
        const ls = ((l.data as { account_id: string; debit: number; credit: number; cost_center_id: string | null; order_id: string | null; description: string | null }[]) ?? []).map((x) => ({
          account_id: x.account_id, debit: Number(x.debit) ? String(x.debit) : "", credit: Number(x.credit) ? String(x.credit) : "", cost_center_id: x.cost_center_id ?? "", order_id: x.order_id ?? "", description: x.description ?? "",
        }));
        const padded = ls.length >= 2 ? ls : [...ls, ...blankLines().slice(ls.length)];
        setLines(padded);
        setTyped(padded.map((x) => { const ac = accs.find((q) => q.id === x.account_id); return ac ? label(ac) : ""; }));
      }
    })();
  }, [effectiveTenantId, voucherId]);

  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const t = totals(lines);
  const controlUsed = lines.some((l) => isControlCode(byId.get(l.account_id)?.code));
  const verdict = canPost(lines, { override, overrideReason, controlUsed });

  const pick = (i: number, text: string) => {
    setTyped((p) => p.map((x, j) => (j === i ? text : x)));
    const t2 = text.trim().toLowerCase();
    const hit = accounts.find((a) => label(a).toLowerCase() === t2) ?? accounts.find((a) => a.code === text.trim());
    setLines((p) => p.map((l, j) => (j === i ? { ...l, account_id: hit?.id ?? "" } : l)));
  };
  const setLine = (i: number, patch: Partial<DraftLine>) => setLines((p) => p.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLine = () => { setLines((p) => [...p, blankLine()]); setTyped((p) => [...p, ""]); };
  const removeLine = (i: number) => { setLines((p) => p.filter((_, j) => j !== i)); setTyped((p) => p.filter((_, j) => j !== i)); };

  const payload = () => ({ voucher_date: date, jv_type: jvType, reference, particulars, override, override_reason: overrideReason, lines: linesForSave(lines) });
  const save = async (): Promise<string | null> => {
    const res = await mutate(supabase.rpc("mfg_save_voucher", { p_id: id, p_data: payload() }));
    if (!ok(res)) return null;
    const newId = res.data as string;
    setId(newId);
    return newId;
  };
  const saveDraft = async () => {
    if (busy) return;
    setBusy(true);
    const r = await save();
    setBusy(false);
    if (r) { toast.success("Draft saved."); onSaved(); }
  };
  const submit = async () => {
    if (busy || !verdict.ok) return;
    setBusy(true);
    const vid = await save();
    if (!vid) { setBusy(false); return; }
    const res = await mutate(supabase.rpc("mfg_submit_voucher", { p_id: vid }));
    setBusy(false);
    if (!ok(res)) { onSaved(); return; }
    toast.success(res.data === "PENDING_APPROVAL" ? "Sent to your teacher for approval." : "Voucher posted to the books.");
    onSaved(); onClose();
  };

  return (
    <Modal title={number ? `Journal voucher ${number}` : "New journal voucher"} onClose={onClose} wide>
      <div className="text-[12px] text-[#7F8EA0] -mt-1 mb-2">For adjusting, accrual, depreciation and reclassifying entries. Routine transactions are posted by their own screens (purchasing, inventory, production, sales).</div>
      {rejectNote && <div className="text-[12.5px] mb-2 px-3 py-2 rounded border border-[#FF6B7A] text-[#FF6B7A]">Sent back by your teacher: {rejectNote}</div>}
      <div className="grid gap-x-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <div><Label>Voucher date</Label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label>Accounting period</Label><input className="input" value={date.slice(0, 7)} readOnly aria-label="Accounting period" /></div>
        <div><Label>Kind of voucher</Label>
          <select className="input" value={jvType} onChange={(e) => setJvType(e.target.value)}>{JV_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><Label>Reference / source document no.</Label><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. PO-0007, payroll cut-off" /></div>
      </div>
      <Label>Particulars / explanation</Label>
      <textarea className="input" rows={2} value={particulars} onChange={(e) => setParticulars(e.target.value)} placeholder="What is this entry for, and why?" />

      <div className="mt-3 overflow-x-auto">
        <datalist id="jv-accounts">{accounts.map((a) => <option key={a.id} value={label(a)} />)}</datalist>
        <table style={{ minWidth: 860 }}>
          <thead><tr><th style={{ width: 28 }}>#</th><th style={{ minWidth: 230 }}>Account</th><th>Line description</th><th>Cost center</th><th>Order</th><th style={{ width: 110, textAlign: "right" }}>Debit</th><th style={{ width: 110, textAlign: "right" }}>Credit</th><th style={{ width: 30 }} /></tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const ac = byId.get(l.account_id);
              return (
                <tr key={i}>
                  <td className="text-[#7F8EA0]">{i + 1}</td>
                  <td>
                    <input className="input" list="jv-accounts" value={typed[i] ?? ""} onChange={(e) => pick(i, e.target.value)} placeholder="Type a code or a name…" aria-label={`Account on line ${i + 1}`}
                      style={{ borderColor: typed[i] && !l.account_id ? "#FF6B7A" : undefined }} />
                    {isControlCode(ac?.code) && <div className="text-[10.5px] mt-0.5" style={{ color: "#F2B13C" }}>Control account</div>}
                  </td>
                  <td><input className="input" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} aria-label={`Description on line ${i + 1}`} /></td>
                  <td><select className="input" value={l.cost_center_id} onChange={(e) => setLine(i, { cost_center_id: e.target.value })} aria-label={`Cost center on line ${i + 1}`}><option value="">—</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></td>
                  <td><select className="input" value={l.order_id} onChange={(e) => setLine(i, { order_id: e.target.value })} aria-label={`Production order on line ${i + 1}`}><option value="">—</option>{orders.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></td>
                  <td><input className="input" type="number" min={0} step="0.01" style={{ textAlign: "right" }} value={l.debit} onChange={(e) => setLines((p) => p.map((x, j) => (j === i ? typeAmount(x, "debit", e.target.value) : x)))} aria-label={`Debit on line ${i + 1}`} /></td>
                  <td><input className="input" type="number" min={0} step="0.01" style={{ textAlign: "right" }} value={l.credit} onChange={(e) => setLines((p) => p.map((x, j) => (j === i ? typeAmount(x, "credit", e.target.value) : x)))} aria-label={`Credit on line ${i + 1}`} /></td>
                  <td>{lines.length > 2 && <button type="button" onClick={() => removeLine(i)} aria-label={`Remove line ${i + 1}`} className="text-[#7F8EA0]"><Trash2 size={13} /></button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <OutlineBtn type="button" onClick={addLine}><Plus size={13} /> Add line</OutlineBtn>
      </div>

      {(controlUsed || override) && (
        <div className="mt-3 px-3 py-2 rounded border border-hairline text-[12.5px]">
          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> System override / audit adjustment</label>
          <div className="text-[11.5px] text-[#7F8EA0] mt-1 mb-1.5"><AlertTriangle size={11} style={{ display: "inline" }} /> An inventory, work in process, GR/IR, receivable or payable account is run by its own screen, so the sub-ledger and the ledger move together. Use an override only for an audit adjustment. It is logged, and it waits for your teacher&rsquo;s approval.</div>
          {override && <input className="input" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Why? (at least ten characters)" aria-label="Reason for the override" />}
        </div>
      )}

      <div className="sticky bottom-0 mt-4 -mx-1 px-3 py-2.5 rounded-md border border-hairline" style={{ background: "var(--panel, #11161d)" }}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]" style={{ fontVariantNumeric: "tabular-nums" }}>
          <span>Total debits <b>{money(t.debit)}</b></span><span>Total credits <b>{money(t.credit)}</b></span>
          <span style={{ color: t.balanced && t.debit > 0 ? "#22D3C5" : "#FF6B7A", fontWeight: 600 }}>Out of balance {money(Math.abs(t.diff))}</span>
          <span className="ml-auto flex gap-2">
            <OutlineBtn type="button" onClick={saveDraft} disabled={busy}>Save draft</OutlineBtn>
            <GoldBtn type="button" onClick={submit} disabled={busy || !verdict.ok} title={verdict.reason ?? undefined}>{override ? "Submit for approval" : "Submit / post voucher"}</GoldBtn>
          </span>
        </div>
        {!verdict.ok && <div className="text-[11.5px] text-[#7F8EA0] mt-1">{verdict.reason}</div>}
      </div>
    </Modal>
  );
}
