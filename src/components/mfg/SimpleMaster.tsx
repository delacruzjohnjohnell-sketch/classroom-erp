"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { ZodType } from "zod";
import { Panel, Modal, ConfirmDialog, Label, GoldBtn, OutlineBtn, TinyBtn, FormStyles } from "../ui";
import ListReport, { type ListColumn } from "../ListReport";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";
import { firstError, WEEKDAYS } from "@/lib/mfgMaster";

export type Field = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "checkbox" | "days";
  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: string;
  /** Can't be changed after the row exists (the row's key). */
  lockOnEdit?: boolean;
};

type Row = Record<string, unknown>;
type FormState = Record<string, string | boolean>;

/**
 * A small master table you can add to, edit and delete from: units, storage locations, cost centers,
 * holidays, the costing sheet. The teacher sees the same table read-only.
 */
export default function SimpleMaster({
  table, title, hint, fields, schema, columns, orderBy, keyCol = "id", defaults, addLabel = "Add", readOnly, onChanged, extraRows, prepare,
}: {
  table: string;
  title: string;
  hint?: string;
  fields: Field[];
  schema: ZodType;
  columns: ListColumn<Row>[];
  orderBy: string;
  keyCol?: string;
  defaults?: FormState;
  addLabel?: string;
  readOnly?: boolean;
  onChanged?: () => void;
  /** Rows to show that come from somewhere other than this table's plain select. */
  extraRows?: Row[];
  /** Adjusts the typed values (and the row being edited, if any) just before they are checked and saved. */
  prepare?: (input: Row, row: Row | null) => Row;
}) {
  const { effectiveTenantId } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [modal, setModal] = useState<{ row: Row | null } | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!effectiveTenantId) return;
    const { data } = await supabase.from(table).select("*").eq("tenant_id", effectiveTenantId).order(orderBy);
    setRows((data as Row[]) ?? []);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [effectiveTenantId, table]);

  const blank = (): FormState => ({ ...Object.fromEntries(fields.map((f) => [f.key, f.type === "checkbox" ? false : ""])), ...defaults });
  const open = (row: Row | null) => {
    setForm(row ? Object.fromEntries(fields.map((f) => [f.key,
      f.type === "checkbox" ? !!row[f.key]
        : f.type === "days" ? ((row[f.key] as number[] | null) ?? []).join("")
        : row[f.key] == null ? "" : String(row[f.key])])) : blank());
    setModal({ row });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveTenantId || busy || !modal) return;
    // weekday pickers are kept as "12345" while typing and sent as [1,2,3,4,5]
    let input: Row = { ...form };
    for (const f of fields) if (f.type === "days") input[f.key] = String(form[f.key] ?? "").split("").map(Number);
    if (prepare) input = prepare(input, modal.row);
    const parsed = schema.safeParse(input);
    if (!parsed.success) { toast.error(firstError(parsed.error)); return; }
    setBusy(true);
    const values = parsed.data as Row;
    const res = modal.row
      ? await mutate(supabase.from(table).update(values).eq("tenant_id", effectiveTenantId).eq(keyCol, modal.row[keyCol] as string), { successMessage: "Saved." })
      : await mutate(supabase.from(table).insert({ ...values, tenant_id: effectiveTenantId }), { successMessage: "Added." });
    setBusy(false);
    if (ok(res)) { setModal(null); await load(); onChanged?.(); }
  };

  const remove = async () => {
    if (!deleting || !effectiveTenantId) return;
    setBusy(true);
    const res = await mutate(supabase.from(table).delete().eq("tenant_id", effectiveTenantId).eq(keyCol, deleting[keyCol] as string), { successMessage: "Deleted." });
    setBusy(false);
    if (ok(res)) { setDeleting(null); await load(); onChanged?.(); }
  };

  const all = extraRows ?? rows;
  const cols: ListColumn<Row>[] = readOnly ? columns : [
    ...columns,
    {
      key: "_actions", label: "", width: 80,
      value: () => "",
      render: (r) => (
        <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
          <TinyBtn onClick={() => open(r)} aria-label="Edit"><Pencil size={11} /></TinyBtn>
          <TinyBtn onClick={() => setDeleting(r)} aria-label="Delete"><Trash2 size={11} /></TinyBtn>
        </span>
      ),
    },
  ];

  return (
    <Panel title={title}>
      {hint && <div className="text-[12px] text-[#7F8EA0] mb-3">{hint}</div>}
      <ListReport
        listKey={`master-${table}`} rows={all} columns={cols} rowKey={(r) => String(r[keyCol])} exportName={table.replace("mfg_", "")}
        toolbar={!readOnly ? <GoldBtn onClick={() => open(null)}><Plus size={13} /> {addLabel}</GoldBtn> : undefined}
      />
      {modal && (
        <Modal title={modal.row ? `Edit ${title.toLowerCase()}` : addLabel} onClose={() => setModal(null)} wide>
          <form onSubmit={save}>
            {fields.map((f) => (
              <div key={f.key}>
                {f.type === "checkbox" ? (
                  <label className="flex items-center gap-2 text-[13px] mt-3.5">
                    <input type="checkbox" checked={!!form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} /> {f.label}
                  </label>
                ) : f.type === "days" ? (
                  <>
                    <Label>{f.label}</Label>
                    <div className="flex gap-3 flex-wrap">
                      {WEEKDAYS.map(([n, name]) => {
                        const on = String(form[f.key] ?? "").includes(String(n));
                        return (
                          <label key={n} className="flex items-center gap-1 text-[13px]">
                            <input type="checkbox" checked={on} onChange={() => {
                              const set = new Set(String(form[f.key] ?? "").split("").filter(Boolean));
                              if (on) set.delete(String(n)); else set.add(String(n));
                              setForm({ ...form, [f.key]: [...set].sort().join("") });
                            }} /> {name}
                          </label>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <Label>{f.label}</Label>
                    {f.type === "select" ? (
                      <select className="input" value={String(form[f.key] ?? "")} disabled={!!modal.row && f.lockOnEdit}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                        <option value="">Choose…</option>
                        {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <input className="input" type={f.type} step={f.type === "number" ? "any" : undefined} placeholder={f.placeholder}
                        value={String(form[f.key] ?? "")} disabled={!!modal.row && f.lockOnEdit}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                    )}
                  </>
                )}
                {f.help && <div className="text-[11.5px] text-[#7F8EA0] mt-1">{f.help}</div>}
              </div>
            ))}
            <div className="flex gap-2 justify-end mt-5">
              <OutlineBtn type="button" onClick={() => setModal(null)} disabled={busy}>Cancel</OutlineBtn>
              <GoldBtn type="submit" disabled={busy}>Save</GoldBtn>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog title={`Delete ${title.toLowerCase()}`} danger busy={busy} confirmLabel="Delete"
          message="Are you sure you want to delete this? If something else uses it, the app will tell you and keep it."
          onConfirm={remove} onCancel={() => setDeleting(null)} />
      )}
      <FormStyles />
    </Panel>
  );
}
