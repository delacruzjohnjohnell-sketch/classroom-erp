"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal, Label, GoldBtn, OutlineBtn, FormStyles } from "./ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { isDateLocked } from "@/lib/periods";

/**
 * Asks for the date an action should be recorded on (void, reverse, post rent,
 * depreciation, goods receipt …) instead of silently using today. It reads the
 * company's books lock so a locked date is explained up front.
 */
export default function DatePromptDialog({
  title, message, label = "Date", defaultDate, confirmLabel, danger, onConfirm, onCancel,
}: {
  title: string;
  message?: React.ReactNode;
  label?: string;
  defaultDate: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: (date: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const { effectiveTenantId } = useSession();
  const [date, setDate] = useState(defaultDate);
  const [lockedThrough, setLockedThrough] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!effectiveTenantId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("tenants").select("books_locked_through").eq("id", effectiveTenantId).single();
      if (!cancelled) setLockedThrough((data as { books_locked_through: string | null } | null)?.books_locked_through ?? null);
    })();
    return () => { cancelled = true; };
  }, [effectiveTenantId]);

  const locked = !!date && isDateLocked(date, lockedThrough);

  return (
    <Modal title={title} onClose={onCancel}>
      {message && <div className="text-[13px] text-[#A3B1C2] leading-relaxed mt-2">{message}</div>}
      <Label>{label}</Label>
      <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      {locked && (
        <div className="text-[12px] mt-2" style={{ color: "#FF6B7A" }}>
          The books are locked through {lockedThrough}, so nothing can be dated on or before that day. Pick a later date, or move the lock under Financials → Journal entries.
        </div>
      )}
      <div className="flex gap-2 justify-end mt-5">
        <OutlineBtn onClick={onCancel} disabled={busy}>Cancel</OutlineBtn>
        <GoldBtn
          disabled={busy || !date || locked}
          style={danger ? { background: "#FF6B7A", color: "#04121A", borderColor: "#FF6B7A" } : undefined}
          onClick={async () => {
            setBusy(true);
            try { await onConfirm(date); } finally { setBusy(false); }
          }}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : null} {confirmLabel}
        </GoldBtn>
      </div>
      <FormStyles />
    </Modal>
  );
}
