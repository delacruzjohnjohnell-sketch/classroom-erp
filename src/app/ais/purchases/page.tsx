"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Package, Receipt, Users } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Empty, FormStyles, GoldBtn, KpiCard, Label, Modal, OutlineBtn, Panel, TinyBtn } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { showQueryErrors } from "@/lib/queryErrors";
import { money } from "@/lib/aisDesk";
import { matchRows, payableBills, pwNextStep, PW_LABEL, PW_STEP_BUTTON, PW_TONE, type PwBill, type PwTask } from "@/lib/aisSales";

type Vendor = { id: string; name: string; approved: boolean; owed: number };
type State = { phase: "ACCOUNTING" | "AUDIT" | "CLOSED"; solo: boolean; vendors: Vendor[]; tasks: PwTask[]; bills: PwBill[]; items: { id: string; sku: string; name: string; on_hand: number }[] };
type Score = { visible: boolean; points?: number; max?: number; rows?: { seq: number; ref_no: string; points: number; max: number; message: string; why: string }[] };

const num = (v: unknown) => Number(v ?? 0);
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export default function AisPurchasesPage() {
  return <AppShell><Purchases /></AppShell>;
}

function Purchases() {
  const { effectiveTenantId } = useSession();
  const [st, setSt] = useState<State | null | undefined>(undefined);
  const [score, setScore] = useState<Score | null>(null);
  const [invoicing, setInvoicing] = useState<PwTask | null>(null);
  const [paying, setPaying] = useState<PwTask | null>(null);
  const [deciding, setDeciding] = useState<{ bill: PwBill; kind: "approve" | "reject" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    // the state call creates the company's vendor cards the first time, so the score must be asked for after it
    const s = await supabase.rpc("ais_pw_state");
    if (showQueryErrors(s)) { setSt(null); return; }
    const sc = await supabase.rpc("ais_pw_my_score");
    const raw = s.data as State;
    setSt({
      ...raw,
      vendors: raw.vendors.map((v) => ({ ...v, owed: num(v.owed) })),
      items: raw.items.map((i) => ({ ...i, on_hand: num(i.on_hand) })),
      tasks: raw.tasks.map((t) => ({ ...t, po_qty: numOrNull(t.po_qty), po_price: numOrNull(t.po_price), rr_qty: numOrNull(t.rr_qty), inv_qty: numOrNull(t.inv_qty), inv_price: numOrNull(t.inv_price), amount: numOrNull(t.amount) })),
      bills: raw.bills.map((b) => ({ ...b, inv_qty: num(b.inv_qty), inv_price: num(b.inv_price), net: num(b.net), vat: num(b.vat), gross: num(b.gross), paid: num(b.paid), po_qty: numOrNull(b.po_qty), po_price: numOrNull(b.po_price), rec_qty: numOrNull(b.rec_qty) })),
    });
    setScore((sc.data as Score | null) ?? null);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (effectiveTenantId) load(); }, [effectiveTenantId, load]);

  if (st === undefined) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin" size={20} color="#9D7CFF" /></div>;
  if (st === null) return <div className="px-7 py-6 max-w-[900px]"><Panel title="Purchases desk"><Empty>The Purchases desk opens once your teacher has assigned a practice set to this company and you hold the Accounting seat.</Empty></Panel></div>;

  const open = st.phase === "ACCOUNTING";
  const finished = st.tasks.filter((t) => t.status === "DONE" || t.status === "REJECTED").length;
  const owed = st.vendors.reduce((s, v) => s + v.owed, 0);

  const receive = async (t: PwTask) => {
    setBusy(true);
    await mutate(supabase.rpc("ais_pw_receive", { p_task: t.id, p_qty: t.rr_qty }), { successMessage: "Receipt recorded. Inventory went up and the goods are waiting for the invoice (GR/IR)." });
    setBusy(false);
    await load();
  };
  const stepBill = async (b: PwBill) => {
    setBusy(true);
    const kind = pwNextStep(b.status);
    if (kind === "match") {
      const r = await mutate(supabase.rpc("ais_pw_match", { p_bill: b.id }));
      if (ok(r)) {
        const d = r.data as unknown as { ok: boolean; reason: string | null };
        setNote(d.ok ? `Three-way match passed for ${b.inv_no}: the purchase order, receiving report and invoice agree and the vendor is approved.` : `Three-way match HELD ${b.inv_no}: ${d.reason}. Approve it only if you are the right person to; otherwise reject it.`);
      }
    } else if (kind === "post") {
      await mutate(supabase.rpc("ais_pw_post", { p_bill: b.id }), { successMessage: "Posted to payables." });
    }
    setBusy(false);
    await load();
  };

  return (
    <div className="px-7 py-6 max-w-[1200px] flex flex-col gap-5">
      <FormStyles />
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7F8EA0]">Accounting seat · Expenditure cycle workbench</div>
        <h1 className="text-[20px] font-bold mt-1">Purchases desk</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1 max-w-[860px]">
          Work the vendor cards in order. For each purchase: <b>record the receipt</b> of the goods, <b>enter the vendor invoice</b> as printed, <b>run the three-way match</b> (purchase order against receiving report against invoice), <b>approve or reject</b> anything the match holds, then <b>post it to payables</b>. For each payment voucher: <b>pay the vendor</b>.
          Never pay for more than arrived, at more than was agreed, to a vendor nobody approved, or twice.
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <KpiCard icon={<CheckCircle2 size={14} />} label="Cards finished" value={`${finished} of ${st.tasks.length}`} accent="#22D3C5" />
        <KpiCard icon={<Users size={14} />} label="You owe vendors" value={money(owed)} accent="#F2B13C" />
        <KpiCard icon={<Package size={14} />} label="Stock (sacks)" value={st.items.reduce((s, i) => s + i.on_hand, 0)} accent="#9D7CFF" />
        <KpiCard icon={<Receipt size={14} />} label="Score" value={score?.visible ? `${score.points} / ${score.max}` : "after close"} accent="#9D7CFF" />
      </div>

      {note && <div className="rounded-lg border border-hairline bg-panel px-4 py-3 text-[12.5px] text-[#C8D3E0]" role="status">{note} <button className="underline ml-2 text-[#7F8EA0]" onClick={() => setNote(null)}>Dismiss</button></div>}
      {!open && <div className="rounded-lg border border-hairline bg-panel px-4 py-3 text-[12.5px] text-[#A3B1C2]">The Accounting phase is closed, so the Purchases desk is read-only now.</div>}

      <Panel title="Vendor cards (work these in order)">
        <table>
          <thead><tr><th style={{ width: 36 }}>#</th><th>Packet</th><th>Vendor</th><th>The three documents</th><th>Where it stands</th><th /></tr></thead>
          <tbody>
            {st.tasks.map((t) => {
              const b = st.bills.find((x) => x.task_id === t.id);
              return (
                <tr key={t.id}>
                  <td>{t.seq}</td>
                  <td><b>{t.kind === "PURCHASE" ? "Purchase packet" : "Payment voucher"}</b><div className="text-[11px] text-[#7F8EA0]">{t.kind === "PURCHASE" ? `PO ${t.ref_no}` : t.ref_no} · {t.doc_date}</div></td>
                  <td>{t.vendor}{!t.vendor_approved && <div className="text-[11px] text-[#FF6B7A]">not on the approved vendor list</div>}</td>
                  <td style={{ fontSize: 12 }}>
                    {t.kind === "PURCHASE" ? (
                      <table style={{ margin: 0, fontSize: 11.5 }}>
                        <thead><tr><th /><th>Purchase order</th><th>Receiving report{t.rr_no ? ` ${t.rr_no}` : ""}</th><th>Invoice {t.inv_no}</th></tr></thead>
                        <tbody>{matchRows(t).map((r) => (
                          <tr key={r.label}><td style={{ color: "#7F8EA0" }}>{r.label}</td><td>{r.po}</td><td>{r.rr}</td><td style={{ color: r.differs ? "#F2B13C" : undefined }}>{r.inv}</td></tr>
                        ))}</tbody>
                      </table>
                    ) : <>Authorizes {money(t.amount)}</>}
                    {t.note && <div className="text-[11px] text-[#A3B1C2] mt-1">{t.note}</div>}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {t.status === "NEW" && <span style={{ color: "#F2B13C" }}>● Not started</span>}
                    {t.status === "RECEIVED" && <span style={{ color: "#F2B13C" }}>● Goods received: needs the invoice</span>}
                    {t.status === "INVOICED" && b && <span style={{ color: PW_TONE[b.status] }}>● {PW_LABEL[b.status]}</span>}
                    {t.status === "REJECTED" && <span style={{ color: "#7F8EA0" }}>● Rejected</span>}
                    {t.status === "DONE" && <span style={{ color: "#22D3C5" }}>● {t.kind === "PURCHASE" ? "Posted to payables" : "Paid"}</span>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {open && t.kind === "PURCHASE" && t.status === "NEW" && <>{t.rr_qty !== null && <><TinyBtn type="button" onClick={() => { if (!busy) receive(t); }}>Record the receipt</TinyBtn>{" "}</>}<TinyBtn type="button" onClick={() => setInvoicing(t)}>Enter the invoice</TinyBtn></>}
                    {open && t.kind === "PURCHASE" && t.status === "RECEIVED" && <TinyBtn type="button" onClick={() => setInvoicing(t)}>Enter the invoice</TinyBtn>}
                    {open && t.kind === "PAYMENT" && t.status === "NEW" && <TinyBtn type="button" onClick={() => setPaying(t)}>Pay the vendor</TinyBtn>}
                    {open && t.status === "INVOICED" && b && <BillActions b={b} busy={busy} onStep={() => stepBill(b)} onDecide={(kind) => setDeciding({ bill: b, kind })} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      {st.bills.some((b) => b.status === "HELD") && (
        <Panel title="Held by the three-way match">
          {st.bills.filter((b) => b.status === "HELD").map((b) => (
            <div key={b.id} className="text-[12.5px] text-[#C8D3E0] mb-2"><b>{b.inv_no} · {b.vendor}</b> ({money(b.gross)}): {b.hold_reason}. {b.entered_by_me ? (st.solo ? "You entered this invoice. This company allows solo work, so you can approve it yourself, but a self-approval is exactly what an auditor looks for." : "You entered this invoice, so a different person must approve it (segregation of duties).") : "You did not enter this invoice, so you may act as the approver."}</div>
          ))}
        </Panel>
      )}

      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", alignItems: "start" }}>
        <Panel title="Vendors: who is approved and what you owe">
          <table>
            <thead><tr><th>Vendor</th><th>Approved</th><th style={{ textAlign: "right" }}>You owe</th></tr></thead>
            <tbody>{st.vendors.map((v) => (<tr key={v.id}><td>{v.name}</td><td style={{ color: v.approved ? "#22D3C5" : "#FF6B7A" }}>{v.approved ? "Yes" : "No"}</td><td style={{ textAlign: "right" }}>{money(v.owed)}</td></tr>))}</tbody>
          </table>
        </Panel>
        <Panel title="Invoices and payables">
          {st.bills.length === 0 ? <Empty>No vendor invoices entered yet.</Empty> : (
            <table>
              <thead><tr><th>Invoice</th><th>Vendor</th><th style={{ textAlign: "right" }}>Total</th><th style={{ textAlign: "right" }}>Paid</th><th>Status</th></tr></thead>
              <tbody>{st.bills.map((b) => (
                <tr key={b.id}><td>{b.inv_no}</td><td>{b.vendor}</td><td style={{ textAlign: "right" }}>{money(b.gross)}</td><td style={{ textAlign: "right" }}>{b.paid ? money(b.paid) : ""}</td>
                  <td style={{ color: PW_TONE[b.status], fontSize: 12 }}>{PW_LABEL[b.status]}{b.self_approved && <div className="text-[11px] text-[#FF6B7A]">approved by the same person who entered it</div>}{b.decision_note && <div className="text-[11px] text-[#7F8EA0]">{b.decision_note}</div>}</td></tr>
              ))}</tbody>
            </table>
          )}
        </Panel>
      </div>

      {score?.visible && score.rows && (
        <Panel title={`How you did: ${score.points} of ${score.max}`}>
          <table>
            <thead><tr><th>Card</th><th>Points</th><th>Result</th><th>What the card was hiding</th></tr></thead>
            <tbody>{score.rows.map((r) => (<tr key={r.seq}><td>{r.seq} · {r.ref_no}</td><td>{r.points} / {r.max}</td><td style={{ fontSize: 12 }}>{r.message}</td><td style={{ fontSize: 12, color: "#A3B1C2" }}>{r.why}</td></tr>))}</tbody>
          </table>
        </Panel>
      )}

      {invoicing && <EnterInvoice task={invoicing} onClose={() => setInvoicing(null)} onDone={async () => { setInvoicing(null); await load(); }} />}
      {paying && <PayVendor task={paying} st={st} onClose={() => setPaying(null)} onDone={async () => { setPaying(null); await load(); }} />}
      {deciding && <Decide bill={deciding.bill} kind={deciding.kind} solo={st.solo} onClose={() => setDeciding(null)} onDone={async () => { setDeciding(null); await load(); }} />}
    </div>
  );
}

function BillActions({ b, busy, onStep, onDecide }: { b: PwBill; busy: boolean; onStep: () => void; onDecide: (k: "approve" | "reject") => void }) {
  const s = pwNextStep(b.status);
  if (s === "done") return null;
  if (s === "decide") return <><TinyBtn type="button" onClick={() => onDecide("approve")}>Approve…</TinyBtn>{" "}<TinyBtn type="button" onClick={() => onDecide("reject")}>Reject…</TinyBtn></>;
  return <><TinyBtn type="button" onClick={() => { if (!busy) onStep(); }}>{PW_STEP_BUTTON[s]}</TinyBtn>{s === "match" && <>{" "}<TinyBtn type="button" onClick={() => onDecide("reject")}>Reject…</TinyBtn></>}</>;
}

function EnterInvoice({ task, onClose, onDone }: { task: PwTask; onClose: () => void; onDone: () => Promise<void> }) {
  const [no, setNo] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await mutate(supabase.rpc("ais_pw_enter_invoice", { p_task: task.id, p_inv_no: no, p_qty: Number(qty), p_price: Number(price) }), { successMessage: "Invoice entered. Next: run the three-way match." });
    setBusy(false);
    if (ok(r)) await onDone();
  };
  return (
    <Modal title={`Enter the vendor invoice ${task.inv_no}`} onClose={onClose}>
      <div className="rounded-md border border-hairline px-3 py-2 text-[12.5px] mb-2" style={{ background: "rgba(157,124,255,0.08)" }}>
        <b>{task.vendor}</b> · invoice {task.inv_no} · {task.doc_date}<div>{task.inv_qty} × {task.item} at {money(task.inv_price)} each</div>{task.note && <div className="text-[#A3B1C2] mt-1">{task.note}</div>}
      </div>
      <div className="text-[12px] text-[#A3B1C2]">Copy the invoice exactly as it is printed. The match step then compares it to the purchase order and the receiving report.</div>
      <Label>Vendor invoice number</Label><input className="input" value={no} onChange={(e) => setNo(e.target.value)} />
      <Label>Quantity billed</Label><input className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
      <Label>Unit price billed</Label><input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      <div className="flex gap-2 justify-end mt-4"><OutlineBtn type="button" onClick={onClose} disabled={busy}>Cancel</OutlineBtn><GoldBtn type="button" onClick={save} disabled={busy || !no.trim() || !(Number(qty) > 0) || !(Number(price) > 0)}>Enter the invoice</GoldBtn></div>
    </Modal>
  );
}

function PayVendor({ task, st, onClose, onDone }: { task: PwTask; st: State; onClose: () => void; onDone: () => Promise<void> }) {
  const bills = payableBills(st.bills, task.vendor_id);
  const [bill, setBill] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await mutate(supabase.rpc("ais_pw_pay", { p_task: task.id, p_bill: bill, p_amount: Number(amount) }), { successMessage: "Payment recorded. Payables and cash went down." });
    setBusy(false);
    if (ok(r)) await onDone();
  };
  return (
    <Modal title={`Pay the vendor: ${task.ref_no}`} onClose={onClose}>
      <div className="rounded-md border border-hairline px-3 py-2 text-[12.5px] mb-2" style={{ background: "rgba(157,124,255,0.08)" }}>
        <b>{task.vendor}</b> · {task.ref_no} · {task.doc_date}<div>Authorized amount: {money(task.amount)}</div>{task.note && <div className="text-[#A3B1C2] mt-1">{task.note}</div>}
      </div>
      <Label>Invoice being paid</Label>
      <select className="input" value={bill} onChange={(e) => setBill(e.target.value)}>
        <option value="">{bills.length ? "Choose…" : "No posted, unpaid invoice for this vendor yet"}</option>
        {bills.map((b) => <option key={b.id} value={b.id}>{b.inv_no} · owes {money(b.gross - b.paid)}</option>)}
      </select>
      <Label>Amount paid</Label><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <div className="flex gap-2 justify-end mt-4"><OutlineBtn type="button" onClick={onClose} disabled={busy}>Cancel</OutlineBtn><GoldBtn type="button" onClick={save} disabled={busy || !bill || !(Number(amount) > 0)}>Pay the vendor</GoldBtn></div>
    </Modal>
  );
}

function Decide({ bill, kind, solo, onClose, onDone }: { bill: PwBill; kind: "approve" | "reject"; solo: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await mutate(supabase.rpc(kind === "approve" ? "ais_pw_approve" : "ais_pw_reject", { p_bill: bill.id, p_reason: reason }), { successMessage: kind === "approve" ? "Approved." : "Rejected." });
    setBusy(false);
    if (ok(r)) await onDone();
  };
  return (
    <Modal title={`${kind === "approve" ? "Approve" : "Reject"} ${bill.inv_no} · ${bill.vendor}`} onClose={onClose}>
      {bill.hold_reason && <div className="text-[12.5px] text-[#C8D3E0] mb-2">{bill.hold_reason}</div>}
      {kind === "approve" && <div className="text-[12px] text-[#A3B1C2] mb-2">{bill.entered_by_me ? (solo ? "You entered this invoice. Approving it yourself is a self-approval, which an auditor will look for." : "You entered this invoice, so a different person must approve it.") : "You did not enter this invoice, so you may act as the approver."}</div>}
      <Label>{kind === "approve" ? "Why is this payment justified? (at least ten characters)" : "Why are you rejecting it? (at least ten characters)"}</Label>
      <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2 justify-end mt-4"><OutlineBtn type="button" onClick={onClose} disabled={busy}>Cancel</OutlineBtn><GoldBtn type="button" onClick={save} disabled={busy || reason.trim().length < 10}>{kind === "approve" ? "Approve" : "Reject"}</GoldBtn></div>
    </Modal>
  );
}
