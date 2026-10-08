"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal, ConfirmDialog } from "./ui";
import LineItemForm, { type FormLine } from "./LineItemForm";
import DueDateField from "./DueDateField";
import { supabase } from "@/lib/supabase";
import { mutate, ok, friendlyError } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { replaceLines } from "@/lib/docEdit";
import { termsFor } from "@/lib/terms";
import { money, round2 } from "@/lib/types";

export type DocKind = "invoice" | "quote" | "order" | "bill" | "po";

type DocConfig = {
  noun: string;
  table: string; linesTable: string; fk: string;
  dateCol: string; partyCol: string; partyLabel: string;
  priceCol: string; priceLabel: string;
  hasItem: boolean; hasDue: boolean;
  editable: string[];
};

// Which documents can still be changed or deleted: only ones that haven't been booked
// to the ledger or turned into the next document in the chain. Posted documents are
// voided or reversed, never rewritten.
export const DOC_CONFIG: Record<DocKind, DocConfig> = {
  invoice: { noun: "invoice", table: "invoices", linesTable: "invoice_lines", fk: "invoice_id", dateCol: "order_date", partyCol: "customer_id", partyLabel: "Customer", priceCol: "unit_price", priceLabel: "Unit price", hasItem: true, hasDue: true, editable: ["draft", "pending_approval"] },
  quote: { noun: "quote", table: "quotes", linesTable: "quote_lines", fk: "quote_id", dateCol: "quote_date", partyCol: "customer_id", partyLabel: "Customer", priceCol: "unit_price", priceLabel: "Unit price", hasItem: true, hasDue: false, editable: ["draft", "accepted"] },
  order: { noun: "sales order", table: "sales_orders", linesTable: "sales_order_lines", fk: "sales_order_id", dateCol: "order_date", partyCol: "customer_id", partyLabel: "Customer", priceCol: "unit_price", priceLabel: "Unit price", hasItem: true, hasDue: false, editable: ["draft", "confirmed"] },
  bill: { noun: "bill", table: "bills", linesTable: "bill_lines", fk: "bill_id", dateCol: "order_date", partyCol: "vendor_id", partyLabel: "Vendor", priceCol: "unit_cost", priceLabel: "Unit cost", hasItem: false, hasDue: true, editable: ["draft", "pending_approval"] },
  po: { noun: "purchase order", table: "purchase_orders", linesTable: "purchase_order_lines", fk: "purchase_order_id", dateCol: "order_date", partyCol: "vendor_id", partyLabel: "Vendor", priceCol: "unit_cost", priceLabel: "Unit cost", hasItem: false, hasDue: false, editable: ["draft", "sent"] },
};

export const canChange = (kind: DocKind, status: string) => DOC_CONFIG[kind].editable.includes(status);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function EditDocumentModal({ kind, row, parties, itemOptions, onClose, onSaved }: {
  kind: DocKind; row: any; parties: { id: string; name: string }[]; itemOptions?: any[]; onClose: () => void; onSaved: () => void;
}) {
  const cfg = DOC_CONFIG[kind];
  const [lines, setLines] = useState<FormLine[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await mutate(supabase.from(cfg.linesTable).select("*").eq(cfg.fk, row.id));
      setLines((data ?? []).map((l: any) => ({ desc: l.description, qty: Number(l.qty), price: Number(l[cfg.priceCol]), item_id: l.item_id ?? undefined })));
    })();
  }, [cfg.linesTable, cfg.fk, cfg.priceCol, row.id]);

  return (
    <Modal title={`Edit ${cfg.noun} ${row.document_number ?? ""}`} onClose={onClose} wide>
      {lines === null ? (
        <div className="py-10 flex justify-center"><Loader2 className="animate-spin" size={18} /></div>
      ) : (
        <LineItemForm
          partyLabel={cfg.partyLabel} parties={parties} priceLabel={cfg.priceLabel}
          itemOptions={cfg.hasItem ? itemOptions : undefined} dueDate={cfg.hasDue}
          submitLabel="Save changes" onClose={onClose}
          initial={{ partyId: row[cfg.partyCol], date: row[cfg.dateCol], due: row.due_date ?? null, taxRate: Number(row.tax_rate) || 0, lines }}
          onSubmit={async (partyId, date, newLines, subtotal, dueDate, taxRate, taxAmount) => {
            const header: Record<string, unknown> = {
              [cfg.partyCol]: partyId, [cfg.dateCol]: date,
              total: round2(subtotal + taxAmount), tax_rate: taxRate, tax_amount: taxAmount,
            };
            if (cfg.hasDue) header.due_date = dueDate;
            const res = await mutate(supabase.from(cfg.table).update(header).eq("id", row.id));
            if (!ok(res)) return;
            const rows = newLines.map((l) => ({
              ...(cfg.hasItem ? { item_id: l.item_id ?? null } : {}),
              description: l.desc, qty: l.qty, [cfg.priceCol]: l.price,
            }));
            const lr = await replaceLines(cfg.linesTable, cfg.fk, row.id, rows);
            if (lr.error) { toast.error(friendlyError(lr.error.message)); return; }
            toast.success(`${cap(cfg.noun)} updated.`);
            onClose();
            onSaved();
          }}
        />
      )}
    </Modal>
  );
}

export function DeleteDocumentDialog({ kind, row, onClose, onDeleted }: {
  kind: DocKind; row: any; onClose: () => void; onDeleted: () => void;
}) {
  const cfg = DOC_CONFIG[kind];
  const [busy, setBusy] = useState(false);
  return (
    <ConfirmDialog
      title={`Delete this ${cfg.noun}?`}
      danger busy={busy} confirmLabel={`Delete ${cfg.noun}`}
      message={<><strong>{row.document_number}</strong> ({money(row.total)}) hasn&apos;t been posted to the books, so it can simply be removed. This can&apos;t be undone.</>}
      onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        const res = await mutate(supabase.from(cfg.table).delete().eq("id", row.id), { successMessage: `${cap(cfg.noun)} deleted.` });
        setBusy(false);
        if (ok(res)) { onClose(); onDeleted(); }
      }}
    />
  );
}

// Posted invoices and bills can't be rewritten, but the due date can be changed.
export function DueDateEditor({ table, id, baseDate, due, onSaved }: {
  table: "invoices" | "bills"; id: string; baseDate: string; due: string | null; onSaved: (due: string) => void;
}) {
  const start = due ?? baseDate;
  const [value, setValue] = useState(start);
  const [terms, setTerms] = useState(termsFor(baseDate, start));
  const [busy, setBusy] = useState(false);
  const changed = value !== start || due === null;
  return (
    <div className="mb-3 p-3 rounded-md" style={{ background: "#0D1319", border: "1px solid #243140" }}>
      <DueDateField baseDate={baseDate} terms={terms} due={value} label="Payment terms / due date" onChange={(t, d) => { setTerms(t); setValue(d); }} />
      <button type="button" disabled={busy || !value || !changed} className="primary-btn mt-2"
        onClick={async () => {
          setBusy(true);
          const res = await mutate(supabase.from(table).update({ due_date: value }).eq("id", id), { successMessage: "Due date updated." });
          setBusy(false);
          if (ok(res)) onSaved(value);
        }}>
        {busy ? "Saving…" : "Save due date"}
      </button>
    </div>
  );
}
