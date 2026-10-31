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
import {
  approvalNote, deskProgress, nextStep, openInvoices, ORDER_LABEL, ORDER_TONE, STEP_BUTTON,
  type WbCustomer, type WbItem, type WbOrder, type WbTask,
} from "@/lib/aisSales";

type State = { phase: "ACCOUNTING" | "AUDIT" | "CLOSED"; mode: string; as_of: string; solo: boolean; customers: WbCustomer[]; items: WbItem[]; tasks: WbTask[]; orders: WbOrder[]; receipts: { id: string; received_on: string; amount: number; customer: string; invoice_no: string }[] };
type Score = { visible: boolean; points?: number; max?: number; rows?: { seq: number; ref_no: string; points: number; max: number; message: string; why: string }[] };

const num = (v: unknown) => Number(v ?? 0);

export default function AisSalesPage() {
  return <AppShell><Sales /></AppShell>;
}

function Sales() {
  const { effectiveTenantId } = useSession();
  const [st, setSt] = useState<State | null | undefined>(undefined);
  const [score, setScore] = useState<Score | null>(null);
  const [entering, setEntering] = useState<WbTask | null>(null);
  const [receiving, setReceiving] = useState<WbTask | null>(null);
  const [deciding, setDeciding] = useState<{ order: WbOrder; kind: "approve" | "reject" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkNote, setCheckNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    // the state call creates the company's cards the first time, so the score must be asked for after it
    const s = await supabase.rpc("ais_wb_state");
    if (showQueryErrors(s)) { setSt(null); return; }
    const sc = await supabase.rpc("ais_wb_my_score");
    const raw = s.data as State;
    setSt({
      ...raw,
      customers: raw.customers.map((c) => ({ ...c, credit_limit: num(c.credit_limit), balance: num(c.balance), committed: num(c.committed), available: num(c.available), aging: { current: num(c.aging.current), d31: num(c.aging.d31), d61: num(c.aging.d61), d90: num(c.aging.d90) } })),
      items: raw.items.map((i) => ({ ...i, list_price: num(i.list_price), unit_cost: num(i.unit_cost), on_hand: num(i.on_hand) })),
      tasks: raw.tasks.map((t) => ({ ...t, qty: t.qty === null ? null : num(t.qty), po_price: t.po_price === null ? null : num(t.po_price), amount: t.amount === null ? null : num(t.amount) })),
      orders: raw.orders.map((o) => ({ ...o, qty: num(o.qty), unit_price: num(o.unit_price), net: num(o.net), vat: num(o.vat), gross: num(o.gross), paid: num(o.paid), balance_seen: o.balance_seen === null ? null : num(o.balance_seen), exposure_seen: o.exposure_seen === null ? null : num(o.exposure_seen) })),
      receipts: raw.receipts.map((r) => ({ ...r, amount: num(r.amount) })),
    });
    setScore((sc.data as Score | null) ?? null);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (effectiveTenantId) load(); }, [effectiveTenantId, load]);

  if (st === undefined) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin" size={20} color="#9D7CFF" /></div>;
  if (st === null) return <div className="px-7 py-6 max-w-[900px]"><Panel title="Sales desk"><Empty>The Sales desk opens once your teacher has assigned a practice set to this company and you hold the Accounting seat.</Empty></Panel></div>;

  const open = st.phase === "ACCOUNTING";
  const p = deskProgress(st.tasks);
  const ar = st.customers.reduce((s, c) => s + c.balance, 0);

  const step = async (o: WbOrder) => {
    setBusy(true);
    const kind = nextStep(o.status);
    if (kind === "check") {
      const r = await mutate(supabase.rpc("ais_wb_credit_check", { p_order: o.id }));
      if (ok(r)) {
        const d = r.data as unknown as { ok: boolean; balance: number; exposure: number; credit_limit: number; reason: string | null };
        setCheckNote(d.ok
          ? `Credit check passed for ${o.customer}: the customer already owes ${money(num(d.balance))}, so with this order the exposure is ${money(num(d.exposure))}, inside the ${money(num(d.credit_limit))} limit.`
          : `Credit check HELD ${o.customer}: ${d.reason}. The customer already owes ${money(num(d.balance))}. Approve it only if you are the right person to; otherwise reject it.`);
      }
    } else if (kind === "ship") {
      await mutate(supabase.rpc("ais_wb_ship", { p_order: o.id }), { successMessage: "Shipped. Cost of sales was recorded and stock went down." });
    } else if (kind === "bill") {
      await mutate(supabase.rpc("ais_wb_bill", { p_order: o.id }), { successMessage: "Billed. The receivable, sales and VAT were recorded." });
    }
    setBusy(false);
    await load();
  };

  return (
    <div className="px-7 py-6 max-w-[1200px] flex flex-col gap-5">
      <FormStyles />
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7F8EA0]">Accounting seat · Revenue cycle workbench</div>
        <h1 className="text-[20px] font-bold mt-1">Sales desk</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1 max-w-[860px]">
          Work the customer cards in order. For each purchase order: <b>enter it</b>, <b>run the credit check</b> (against what the customer already owes), <b>approve or reject</b> anything the check holds, <b>ship</b>, then <b>bill</b>. For each remittance advice: <b>record the cash</b>.
          Every step posts a real entry to the ledger. Some cards hide a problem: stopping a bad order is worth as much as processing a good one.
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <KpiCard icon={<CheckCircle2 size={14} />} label="Cards finished" value={`${p.done} of ${p.total}`} accent="#22D3C5" />
        <KpiCard icon={<Users size={14} />} label="Customers owe you" value={money(ar)} accent="#F2B13C" />
        <KpiCard icon={<Package size={14} />} label="Stock (sacks)" value={st.items.reduce((s, i) => s + i.on_hand, 0)} accent="#9D7CFF" />
        <KpiCard icon={<Receipt size={14} />} label="Score" value={score?.visible ? `${score.points} / ${score.max}` : "after close"} accent="#9D7CFF" />
      </div>

      {checkNote && <div className="rounded-lg border border-hairline bg-panel px-4 py-3 text-[12.5px] text-[#C8D3E0]" role="status">{checkNote} <button className="underline ml-2 text-[#7F8EA0]" onClick={() => setCheckNote(null)}>Dismiss</button></div>}
      {!open && <div className="rounded-lg border border-hairline bg-panel px-4 py-3 text-[12.5px] text-[#A3B1C2]">The Accounting phase is closed, so the Sales desk is read-only now.</div>}

      <Panel title="Customer cards (work these in order)">
        <table>
          <thead><tr><th style={{ width: 36 }}>#</th><th>Card</th><th>Customer</th><th>What it says</th><th>Where it stands</th><th /></tr></thead>
          <tbody>
            {st.tasks.map((t) => {
              const o = st.orders.find((x) => x.task_id === t.id);
              return (
                <tr key={t.id}>
                  <td>{t.seq}</td>
                  <td><b>{t.kind === "ORDER" ? "Purchase order" : "Remittance advice"}</b><div className="text-[11px] text-[#7F8EA0]">{t.ref_no} · {t.doc_date}</div></td>
                  <td>{t.customer}</td>
                  <td style={{ fontSize: 12 }}>
                    {t.kind === "ORDER" ? <>{t.qty} × {t.item} at {money(t.po_price)}</> : <>Customer paid {money(t.amount)}</>}
                    {t.note && <div className="text-[11px] text-[#A3B1C2] mt-0.5">{t.note}</div>}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {t.status === "NEW" && <span style={{ color: "#F2B13C" }}>● Not started</span>}
                    {t.status === "ORDERED" && o && <span style={{ color: ORDER_TONE[o.status] }}>● {ORDER_LABEL[o.status]}</span>}
                    {t.status === "REJECTED" && <span style={{ color: "#7F8EA0" }}>● Rejected</span>}
                    {t.status === "DONE" && <span style={{ color: "#22D3C5" }}>● {t.kind === "ORDER" ? "Billed" : "Cash recorded"}</span>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {open && t.status === "NEW" && t.kind === "ORDER" && <TinyBtn type="button" onClick={() => setEntering(t)}>Enter the order</TinyBtn>}
                    {open && t.status === "NEW" && t.kind === "RECEIPT" && <TinyBtn type="button" onClick={() => setReceiving(t)}>Record the cash</TinyBtn>}
                    {open && t.status === "ORDERED" && o && <OrderActions o={o} busy={busy} onStep={() => step(o)} onDecide={(kind) => setDeciding({ order: o, kind })} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      {st.orders.some((o) => o.status === "HELD") && (
        <Panel title="Held by the credit check">
          {st.orders.filter((o) => o.status === "HELD").map((o) => (
            <div key={o.id} className="text-[12.5px] text-[#C8D3E0] mb-2"><b>SO-{o.seq} · {o.customer}</b> ({money(o.gross)}): {o.hold_reason}. {approvalNote(o, st.solo)}</div>
          ))}
        </Panel>
      )}

      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", alignItems: "start" }}>
        <Panel title="Customers: credit and what they owe">
          <table>
            <thead><tr><th>Customer</th><th style={{ textAlign: "right" }}>Limit</th><th style={{ textAlign: "right" }}>Owes</th><th style={{ textAlign: "right" }}>Credit left</th></tr></thead>
            <tbody>{st.customers.map((c) => (
              <tr key={c.id}><td>{c.name}</td><td style={{ textAlign: "right" }}>{money(c.credit_limit)}</td><td style={{ textAlign: "right" }}>{money(c.balance)}</td>
                <td style={{ textAlign: "right", color: c.available < 0 ? "#FF6B7A" : undefined }}>{money(c.available)}</td></tr>
            ))}</tbody>
          </table>
          <div className="text-[11px] text-[#7F8EA0] mt-2">Aging as of {st.as_of}: {money(st.customers.reduce((s, c) => s + c.aging.current, 0))} current, {money(st.customers.reduce((s, c) => s + c.aging.d31 + c.aging.d61 + c.aging.d90, 0))} older than 30 days.</div>
        </Panel>
        <Panel title="Price list and stock">
          <table>
            <thead><tr><th>Item</th><th style={{ textAlign: "right" }}>List price</th><th style={{ textAlign: "right" }}>In stock</th></tr></thead>
            <tbody>{st.items.map((i) => (<tr key={i.id}><td>{i.name}<div className="text-[11px] text-[#7F8EA0]">{i.sku}</div></td><td style={{ textAlign: "right" }}>{money(i.list_price)}</td><td style={{ textAlign: "right" }}>{i.on_hand}</td></tr>))}</tbody>
          </table>
        </Panel>
      </div>

      <Panel title="Orders and invoices">
        {st.orders.length === 0 ? <Empty>No orders yet. Start with card 1.</Empty> : (
          <table>
            <thead><tr><th>Order</th><th>Customer</th><th style={{ textAlign: "right" }}>Net</th><th style={{ textAlign: "right" }}>VAT</th><th style={{ textAlign: "right" }}>Total</th><th>Invoice</th><th style={{ textAlign: "right" }}>Paid</th><th>Status</th></tr></thead>
            <tbody>{st.orders.map((o) => (
              <tr key={o.id}><td>SO-{o.seq}<div className="text-[11px] text-[#7F8EA0]">{o.qty} × {o.item}</div></td><td>{o.customer}</td>
                <td style={{ textAlign: "right" }}>{money(o.net)}</td><td style={{ textAlign: "right" }}>{money(o.vat)}</td><td style={{ textAlign: "right" }}>{money(o.gross)}</td>
                <td>{o.invoice_no ?? ""}</td><td style={{ textAlign: "right" }}>{o.paid ? money(o.paid) : ""}</td>
                <td style={{ color: ORDER_TONE[o.status], fontSize: 12 }}>{ORDER_LABEL[o.status]}{o.self_approved && <div className="text-[11px] text-[#FF6B7A]">approved by the same person who entered it</div>}{o.decision_note && <div className="text-[11px] text-[#7F8EA0]">{o.decision_note}</div>}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Panel>

      {score?.visible && score.rows && (
        <Panel title={`How you did: ${score.points} of ${score.max}`}>
          <table>
            <thead><tr><th>Card</th><th>Points</th><th>Result</th><th>What the card was hiding</th></tr></thead>
            <tbody>{score.rows.map((r) => (<tr key={r.seq}><td>{r.seq} · {r.ref_no}</td><td>{r.points} / {r.max}</td><td style={{ fontSize: 12 }}>{r.message}</td><td style={{ fontSize: 12, color: "#A3B1C2" }}>{r.why}</td></tr>))}</tbody>
          </table>
        </Panel>
      )}

      {entering && <EnterOrder task={entering} st={st} onClose={() => setEntering(null)} onDone={async () => { setEntering(null); await load(); }} />}
      {receiving && <RecordCash task={receiving} st={st} onClose={() => setReceiving(null)} onDone={async () => { setReceiving(null); await load(); }} />}
      {deciding && <Decide order={deciding.order} kind={deciding.kind} solo={st.solo} onClose={() => setDeciding(null)} onDone={async () => { setDeciding(null); await load(); }} />}
    </div>
  );
}

function OrderActions({ o, busy, onStep, onDecide }: { o: WbOrder; busy: boolean; onStep: () => void; onDecide: (k: "approve" | "reject") => void }) {
  const s = nextStep(o.status);
  if (s === "done") return null;
  if (s === "decide") return <><TinyBtn type="button" onClick={() => onDecide("approve")}>Approve…</TinyBtn>{" "}<TinyBtn type="button" onClick={() => onDecide("reject")}>Reject…</TinyBtn></>;
  return <><TinyBtn type="button" onClick={() => { if (!busy) onStep(); }}>{STEP_BUTTON[s]}</TinyBtn>{s !== "bill" && <>{" "}<TinyBtn type="button" onClick={() => onDecide("reject")}>Reject…</TinyBtn></>}</>;
}

function EnterOrder({ task, st, onClose, onDone }: { task: WbTask; st: State; onClose: () => void; onDone: () => Promise<void> }) {
  const [customer, setCustomer] = useState("");
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await mutate(supabase.rpc("ais_wb_enter_order", { p_task: task.id, p_customer: customer, p_item: item, p_qty: Number(qty), p_price: Number(price) }), { successMessage: "Order entered. Next: run the credit check." });
    setBusy(false);
    if (ok(r)) await onDone();
  };
  return (
    <Modal title={`Enter the order from ${task.ref_no}`} onClose={onClose}>
      <div className="rounded-md border border-hairline px-3 py-2 text-[12.5px] mb-2" style={{ background: "rgba(157,124,255,0.08)" }}>
        <b>{task.customer}</b> · {task.ref_no} · {task.doc_date}<div>{task.qty} × {task.item} at {money(task.po_price)} each</div>{task.note && <div className="text-[#A3B1C2] mt-1">{task.note}</div>}
      </div>
      <div className="text-[12px] text-[#A3B1C2]">Copy what the purchase order says. The system compares the price to the approved price list.</div>
      <Label>Customer</Label>
      <select className="input" value={customer} onChange={(e) => setCustomer(e.target.value)}><option value="">Choose…</option>{st.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <Label>Item</Label>
      <select className="input" value={item} onChange={(e) => setItem(e.target.value)}><option value="">Choose…</option>{st.items.map((i) => <option key={i.id} value={i.id}>{i.name} (list {money(i.list_price)})</option>)}</select>
      <Label>Quantity</Label><input className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
      <Label>Unit price on the purchase order</Label><input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      <div className="flex gap-2 justify-end mt-4"><OutlineBtn type="button" onClick={onClose} disabled={busy}>Cancel</OutlineBtn><GoldBtn type="button" onClick={save} disabled={busy || !customer || !item || !(Number(qty) > 0) || !(Number(price) > 0)}>Enter the order</GoldBtn></div>
    </Modal>
  );
}

function RecordCash({ task, st, onClose, onDone }: { task: WbTask; st: State; onClose: () => void; onDone: () => Promise<void> }) {
  const invoices = openInvoices(st.orders, task.customer_id);
  const [order, setOrder] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await mutate(supabase.rpc("ais_wb_receive", { p_task: task.id, p_order: order, p_amount: Number(amount) }), { successMessage: "Cash recorded and applied to the invoice." });
    setBusy(false);
    if (ok(r)) await onDone();
  };
  return (
    <Modal title={`Record the cash from ${task.ref_no}`} onClose={onClose}>
      <div className="rounded-md border border-hairline px-3 py-2 text-[12.5px] mb-2" style={{ background: "rgba(157,124,255,0.08)" }}>
        <b>{task.customer}</b> · {task.ref_no} · {task.doc_date}<div>Amount received: {money(task.amount)}</div>{task.note && <div className="text-[#A3B1C2] mt-1">{task.note}</div>}
      </div>
      <Label>Invoice being paid</Label>
      <select className="input" value={order} onChange={(e) => setOrder(e.target.value)}>
        <option value="">{invoices.length ? "Choose…" : "No unpaid invoice for this customer yet"}</option>
        {invoices.map((o) => <option key={o.id} value={o.id}>{o.invoice_no} · owes {money(o.gross - o.paid)}</option>)}
      </select>
      <Label>Amount received</Label><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <div className="flex gap-2 justify-end mt-4"><OutlineBtn type="button" onClick={onClose} disabled={busy}>Cancel</OutlineBtn><GoldBtn type="button" onClick={save} disabled={busy || !order || !(Number(amount) > 0)}>Record the cash</GoldBtn></div>
    </Modal>
  );
}

function Decide({ order, kind, solo, onClose, onDone }: { order: WbOrder; kind: "approve" | "reject"; solo: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await mutate(supabase.rpc(kind === "approve" ? "ais_wb_approve" : "ais_wb_reject", { p_order: order.id, p_reason: reason }), { successMessage: kind === "approve" ? "Approved." : "Rejected." });
    setBusy(false);
    if (ok(r)) await onDone();
  };
  return (
    <Modal title={`${kind === "approve" ? "Approve" : "Reject"} SO-${order.seq} · ${order.customer}`} onClose={onClose}>
      {order.hold_reason && <div className="text-[12.5px] text-[#C8D3E0] mb-2">{order.hold_reason}</div>}
      {kind === "approve" && <div className="text-[12px] text-[#A3B1C2] mb-2">{approvalNote(order, solo)}</div>}
      <Label>{kind === "approve" ? "Why is this release justified? (at least ten characters)" : "Why are you rejecting it? (at least ten characters)"}</Label>
      <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2 justify-end mt-4"><OutlineBtn type="button" onClick={onClose} disabled={busy}>Cancel</OutlineBtn><GoldBtn type="button" onClick={save} disabled={busy || reason.trim().length < 10}>{kind === "approve" ? "Approve" : "Reject"}</GoldBtn></div>
    </Modal>
  );
}
