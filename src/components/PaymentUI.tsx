"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Label } from "./ui";
import { money, todayStr } from "@/lib/types";
import { computePaymentStatus, STATUS_COLOR, type PaymentStatus } from "@/lib/payments";

export function PaymentStatusPill({ status }: { status: PaymentStatus }) {
  return (
    <span className="text-[11px] font-semibold border rounded-full px-2.5 py-0.5" style={{ color: STATUS_COLOR[status], borderColor: STATUS_COLOR[status] }}>
      {status}
    </span>
  );
}

export { computePaymentStatus };

export function RecordPaymentForm({ balance, onSubmit }: { balance: number; onSubmit: (amount: number, date: string, method: string) => void | Promise<void> }) {
  const [amount, setAmount] = useState(String(balance.toFixed(2)));
  const [date, setDate] = useState(todayStr());
  const [method, setMethod] = useState("cash");
  const [submitting, setSubmitting] = useState(false);

  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      const n = parseFloat(amount);
      if (!n || n <= 0 || n > balance || submitting) return;
      setSubmitting(true);
      try { await onSubmit(n, date, method); } finally { setSubmitting(false); }
    }}>
      <div className="text-[12.5px] text-[#6b6357] mb-2">Balance due: <strong>{money(balance)}</strong></div>
      <Label>Amount</Label>
      <input className="input" type="number" min="0.01" step="0.01" max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} required />
      {parseFloat(amount) > balance && (
        <div className="text-[11.5px] mt-1" style={{ color: "#A6402F" }}>Can&rsquo;t exceed the remaining balance.</div>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <div><Label>Date</Label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
        <div><Label>Method</Label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option><option value="check">Check</option><option value="card">Card</option><option value="transfer">Bank transfer</option>
          </select>
        </div>
      </div>
      <button type="submit" disabled={submitting || !parseFloat(amount) || parseFloat(amount) > balance} className="primary-btn mt-4">
        {submitting ? <Loader2 size={14} className="animate-spin" /> : null} {submitting ? "Recording…" : "Record payment"}
      </button>
    </form>
  );
}
