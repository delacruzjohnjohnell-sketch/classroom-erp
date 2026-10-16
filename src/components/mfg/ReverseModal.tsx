"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { GoldBtn, Label, Modal, OutlineBtn } from "../ui";
import { toast } from "@/lib/toast";
import { firstIssue, reverseSchema } from "@/lib/mfgOps";

/** Asks for the reason and date of a reversal. Nothing is edited or deleted: the system posts a linked opposite document. */
export default function ReverseModal({ title, what, busy, onCancel, onSubmit }: {
  title: string; what: string; busy: boolean; onCancel: () => void; onSubmit: (reason: string, date: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = reverseSchema.safeParse({ reason, posting_date: date });
    if (!parsed.success) { toast.error(firstIssue(parsed.error)); return; }
    onSubmit(parsed.data.reason, parsed.data.posting_date);
  };
  return (
    <Modal title={title} onClose={onCancel}>
      <form onSubmit={submit}>
        <div className="text-[13px] text-[#C9D4E0]">{what}</div>
        <div className="text-[12px] text-[#7F8EA0] mt-1">The original stays on the record. A new reversal document is posted with the opposite stock movement and the opposite journal entry.</div>
        <Label>Why are you reversing it?</Label>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        <Label>Date of the reversal</Label>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="flex gap-2 justify-end mt-5">
          <OutlineBtn type="button" onClick={onCancel} disabled={busy}>Cancel</OutlineBtn>
          <GoldBtn type="submit" disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Post reversal</GoldBtn>
        </div>
      </form>
    </Modal>
  );
}
