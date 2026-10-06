"use client";

import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { Label } from "./ui";
import DueDateField from "./DueDateField";
import { money, todayStr, round2 } from "@/lib/types";
import { CUSTOM_TERMS, DEFAULT_TERMS, dueFromTerms, termsFor } from "@/lib/terms";

type Party = { id: string; name: string };
type ItemOption = { id: string; name: string; unit_cost: number; qty_on_hand: number };
export type FormLine = { desc: string; qty: number; price: number; item_id?: string };
export type LineFormInitial = { partyId: string; date: string; due: string | null; taxRate: number; lines: FormLine[] };

export default function LineItemForm({
  partyLabel, parties, priceLabel, itemOptions, dueDate: showDueDate, initial, submitLabel = "Save", onClose, onSubmit,
}: {
  partyLabel: string;
  parties: Party[];
  priceLabel: string;
  itemOptions?: ItemOption[];
  dueDate?: boolean;
  initial?: LineFormInitial;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (partyId: string, date: string, lines: FormLine[], subtotal: number, dueDate: string | null, taxRate: number, taxAmount: number) => void | Promise<void>;
}) {
  const [partyId, setPartyId] = useState(initial?.partyId ?? parties[0]?.id ?? "");
  const [date, setDate] = useState(initial?.date ?? todayStr());
  const startDue = initial ? (initial.due ?? initial.date) : dueFromTerms(todayStr(), DEFAULT_TERMS);
  const [due, setDue] = useState(startDue);
  const [terms, setTerms] = useState(initial ? termsFor(initial.date, startDue) : DEFAULT_TERMS);
  const [taxRate, setTaxRate] = useState(initial && initial.taxRate ? String(initial.taxRate) : "");
  const [submitting, setSubmitting] = useState(false);
  // Selling price is deliberately NOT pre-filled from the item's cost — a blank box
  // makes the student decide the price instead of silently selling at cost.
  const blankLine = () => ({ desc: itemOptions?.[0]?.name ?? "", item_id: itemOptions?.[0]?.id, qty: "1", price: "" });
  const [lines, setLines] = useState<{ desc: string; item_id?: string; qty: string; price: string }[]>(
    initial && initial.lines.length > 0
      ? initial.lines.map((l) => ({ desc: l.desc, item_id: l.item_id, qty: String(l.qty), price: String(l.price) }))
      : [blankLine()]
  );
  const subtotal = lines.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.price) || 0), 0);
  const taxAmount = round2(subtotal * ((parseFloat(taxRate) || 0) / 100));
  const total = subtotal + taxAmount;

  const update = (i: number, field: "desc" | "qty" | "price" | "item_id", value: string) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));

  // Changing the document date moves the due date along unless it was typed in by hand.
  const changeDate = (d: string) => {
    setDate(d);
    if (terms !== CUSTOM_TERMS) setDue(dueFromTerms(d, terms));
  };

  const problem =
    !partyId ? `Choose a ${partyLabel.toLowerCase()} first — add one on the ${partyLabel}s tab if the list is empty.`
    : lines.some((l) => !(parseFloat(l.qty) > 0)) ? "Every line needs a quantity greater than 0."
    : lines.some((l) => l.price.trim() === "" || !(parseFloat(l.price) >= 0)) ? `Enter a ${priceLabel.toLowerCase()} on every line (use 0 for a free item).`
    : subtotal <= 0 ? "The total has to be more than 0."
    : showDueDate && !due ? "Choose a due date."
    : "";

  const shortStock = itemOptions
    ? lines.map((l) => {
        const it = itemOptions.find((o) => o.id === l.item_id);
        return it && (parseFloat(l.qty) || 0) > it.qty_on_hand ? it : null;
      }).filter(Boolean) as ItemOption[]
    : [];

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (problem || submitting) return;
        setSubmitting(true);
        try {
          await onSubmit(partyId, date, lines.map((l) => ({ desc: l.desc, qty: parseFloat(l.qty) || 0, price: parseFloat(l.price) || 0, item_id: l.item_id })), round2(subtotal), showDueDate ? due || null : null, parseFloat(taxRate) || 0, taxAmount);
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <Label>{partyLabel}</Label>
          <select className="input" value={partyId} onChange={(e) => setPartyId(e.target.value)} required>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div><Label>Date</Label><input className="input" type="date" value={date} onChange={(e) => changeDate(e.target.value)} required /></div>
      </div>
      {showDueDate && (
        <DueDateField baseDate={date} terms={terms} due={due} onChange={(t, d) => { setTerms(t); setDue(d); }} />
      )}

      <div className="mt-2.5">
        {lines.map((l, i) => (
          <div key={i} className="flex gap-2 mb-2 items-center">
            {itemOptions && itemOptions.length > 0 ? (
              <select className="input flex-[2]" value={l.item_id} onChange={(e) => {
                const chosen = itemOptions.find((it) => it.id === e.target.value);
                update(i, "item_id", e.target.value);
                if (chosen) update(i, "desc", chosen.name);
              }}>
                {itemOptions.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.qty_on_hand} in stock · cost {money(it.unit_cost)})</option>)}
              </select>
            ) : (
              <input className="input flex-[2]" placeholder="Item description" value={l.desc} onChange={(e) => update(i, "desc", e.target.value)} required />
            )}
            <input className="input flex-1" type="number" min="0.01" step="any" placeholder="Qty" value={l.qty} onChange={(e) => update(i, "qty", e.target.value)} required />
            <input className="input flex-1" type="number" min="0" step="0.01" placeholder={priceLabel} value={l.price} onChange={(e) => update(i, "price", e.target.value)} required />
            {lines.length > 1 && <button type="button" onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}><X size={14} /></button>}
          </div>
        ))}
        <button type="button" className="text-xs text-teal border border-dashed border-hairline rounded-md px-2.5 py-1.5 flex items-center gap-1"
          onClick={() => setLines((prev) => [...prev, blankLine()])}>
          <Plus size={13} /> Add line
        </button>
      </div>

      <div className="flex items-end gap-2.5 mt-2.5">
        <div className="flex-1">
          <Label>Tax rate % (optional — e.g. 12 for PH VAT)</Label>
          <input className="input" type="number" min="0" max="100" step="0.01" placeholder="0" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
        </div>
      </div>
      <div className="text-[12.5px] text-[#6b6357] mt-2 flex justify-between"><span>Subtotal</span><span>{money(subtotal)}</span></div>
      {taxAmount > 0 && <div className="text-[12.5px] text-[#6b6357] flex justify-between"><span>Tax ({taxRate}%)</span><span>{money(taxAmount)}</span></div>}
      <div className="text-[12.5px] font-semibold flex justify-between"><span>Total</span><span>{money(total)}</span></div>
      {shortStock.length > 0 && (
        <div className="text-[12px] mt-2" style={{ color: "#7a4d00" }}>
          Not enough stock of {Array.from(new Set(shortStock.map((s) => s.name))).join(", ")} — posting will take it down to 0.
        </div>
      )}
      <button type="submit" disabled={!!problem || submitting} className="primary-btn mt-2">
        {submitting ? <Loader2 size={14} className="animate-spin" /> : null} {submitting ? "Saving…" : submitLabel}
      </button>
      {problem && <div className="text-[12px] mt-1.5" style={{ color: "#A6402F" }}>{problem}</div>}
      <style jsx global>{`
        .input { font-size: 14px; padding: 9px 11px; border-radius: 8px; border: 1px solid #DDD8CC; background: #F5F3EE; color: #1B2430; outline: none; width: 100%; }
        .primary-btn { display: flex; align-items: center; justify-content: center; gap: 6px; background: #12524F; color: #fff; border: none; padding: 11px 14px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; width: 100%; }
        .primary-btn:disabled { opacity: 0.5; }
      `}</style>
    </form>
  );
}
