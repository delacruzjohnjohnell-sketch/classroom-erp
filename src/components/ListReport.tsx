"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Columns3, Download, Save, Trash2 } from "lucide-react";
import { SearchBox, OutlineBtn, TinyBtn, Empty, FormStyles } from "./ui";
import {
  applyFilters, clampWidth, distinctValues, matchesSearch, parseVariants, removeVariant, sortRows, toCsv, upsertVariant,
  type Cell, type SortDir, type Variant,
} from "@/lib/listReport";

export type ListColumn<T> = {
  key: string;
  label: string;
  /** The plain value: used for sorting, searching, filtering and CSV export. */
  value: (row: T) => Cell;
  /** How the cell looks on screen (defaults to the plain value). */
  render?: (row: T) => React.ReactNode;
  align?: "left" | "right";
  width?: number;
  /** Show a drop-down of this column's values above the table (good for status and type columns). */
  filter?: boolean;
  /** Hidden until the user turns it on in the column chooser. */
  defaultHidden?: boolean;
};

export type BulkAction<T> = { label: string; onRun: (rows: T[]) => void | Promise<void>; danger?: boolean };

const STORE = "mfg-list:";
const readVariants = (listKey: string): Variant[] => {
  try { return parseVariants(window.localStorage.getItem(STORE + listKey)); } catch { return []; }
};
const writeVariants = (listKey: string, list: Variant[]) => {
  try { window.localStorage.setItem(STORE + listKey, JSON.stringify(list)); } catch { /* private mode: variants just aren't remembered */ }
};

export default function ListReport<T>({
  listKey, rows, columns, rowKey, onRowClick, bulkActions, toolbar, exportName, emptyText = "Nothing here yet.",
}: {
  listKey: string;
  rows: T[];
  columns: ListColumn<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  bulkActions?: BulkAction<T>[];
  toolbar?: React.ReactNode;
  exportName?: string;
  emptyText?: string;
}) {
  const defaultHidden = useMemo(() => columns.filter((c) => c.defaultHidden).map((c) => c.key), [columns]);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<string[]>(defaultHidden);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [chooser, setChooser] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantName, setVariantName] = useState("");
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ key: string; startX: number; startW: number } | null>(null);

  // saved variants live in this browser only; read them after mount so the server and client render the same first paint
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setVariants(readVariants(listKey)); }, [listKey]);

  const shown = columns.filter((c) => !hidden.includes(c.key));
  const byKey = (k: string) => columns.find((c) => c.key === k);
  const valueOf = (row: T, k: string) => byKey(k)?.value(row);

  const visibleRows = useMemo(() => {
    let out = rows.filter((r) => matchesSearch(columns.map((c) => c.value(r)), q));
    out = applyFilters(out, filters, (r, k) => columns.find((c) => c.key === k)?.value(r));
    const sc = sortKey ? columns.find((c) => c.key === sortKey) : null;
    return sc ? sortRows(out, sc.value, sortDir) : out;
  }, [rows, columns, q, filters, sortKey, sortDir]);

  const chosen = visibleRows.filter((r) => picked.has(rowKey(r)));
  const allPicked = visibleRows.length > 0 && chosen.length === visibleRows.length;

  const clickSort = (k: string) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const startResize = (e: React.PointerEvent, key: string, current: number) => {
    e.preventDefault(); e.stopPropagation();
    drag.current = { key, startX: e.clientX, startW: current };
    const move = (ev: PointerEvent) => {
      if (!drag.current) return;
      const w = clampWidth(drag.current.startW + ev.clientX - drag.current.startX);
      setWidths((prev) => ({ ...prev, [drag.current!.key]: w }));
    };
    const up = () => { drag.current = null; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const exportCsv = () => {
    const csv = toCsv(shown.map((c) => c.label), visibleRows.map((r) => shown.map((c) => c.value(r))));
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${exportName ?? listKey}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const saveVariant = () => {
    if (!variantName.trim()) return;
    const next = upsertVariant(variants, { name: variantName, hidden, widths, sortKey, sortDir, filters, q });
    setVariants(next); writeVariants(listKey, next); setVariantName("");
  };
  const applyVariant = (name: string) => {
    const v = variants.find((x) => x.name === name);
    if (!v) return;
    setHidden(v.hidden.filter((k) => columns.some((c) => c.key === k))); setWidths(v.widths);
    setSortKey(v.sortKey && columns.some((c) => c.key === v.sortKey) ? v.sortKey : null); setSortDir(v.sortDir);
    setFilters(v.filters); setQ(v.q);
  };
  const dropVariant = (name: string) => { const next = removeVariant(variants, name); setVariants(next); writeVariants(listKey, next); };

  const runBulk = async (a: BulkAction<T>) => {
    if (busy || chosen.length === 0) return;
    setBusy(true);
    try { await a.onRun(chosen); setPicked(new Set()); } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <SearchBox value={q} onChange={setQ} />
        {columns.filter((c) => c.filter).map((c) => (
          <select key={c.key} className="input" style={{ width: "auto", minWidth: 130, padding: "7px 9px", fontSize: 12.5 }}
            value={filters[c.key] ?? ""} onChange={(e) => setFilters({ ...filters, [c.key]: e.target.value })} aria-label={`Filter by ${c.label}`}>
            <option value="">{c.label}: all</option>
            {distinctValues(rows, c.value).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        ))}
        <div className="relative">
          <OutlineBtn onClick={() => setChooser((o) => !o)} aria-label="Choose columns"><Columns3 size={13} /> Columns</OutlineBtn>
          {chooser && (
            <div className="absolute z-20 mt-1 bg-panel border border-hairline rounded-lg p-3 min-w-[200px] shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
              {columns.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-[12.5px] py-0.5">
                  <input type="checkbox" checked={!hidden.includes(c.key)}
                    onChange={() => setHidden((h) => (h.includes(c.key) ? h.filter((k) => k !== c.key) : [...h, c.key]))} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <OutlineBtn onClick={exportCsv} disabled={visibleRows.length === 0}><Download size={13} /> CSV</OutlineBtn>
        <div className="flex items-center gap-1.5 ml-auto">
          {variants.length > 0 && (
            <select className="input" style={{ width: "auto", padding: "7px 9px", fontSize: 12.5 }} value="" onChange={(e) => e.target.value && applyVariant(e.target.value)} aria-label="Saved views">
              <option value="">Saved views…</option>
              {variants.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
            </select>
          )}
          <input className="input" style={{ width: 130, padding: "7px 9px", fontSize: 12.5 }} placeholder="Name this view" value={variantName}
            onChange={(e) => setVariantName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveVariant()} />
          <TinyBtn onClick={saveVariant} aria-label="Save view"><Save size={12} /></TinyBtn>
          {variants.length > 0 && variantName && variants.some((v) => v.name === variantName) && (
            <TinyBtn onClick={() => dropVariant(variantName)} aria-label="Delete view"><Trash2 size={12} /></TinyBtn>
          )}
        </div>
        {toolbar}
      </div>

      {bulkActions && chosen.length > 0 && (
        <div className="flex items-center gap-2 mb-2 text-[12.5px]">
          <span className="text-[#A3B1C2]">{chosen.length} selected</span>
          {bulkActions.map((a) => (
            <OutlineBtn key={a.label} onClick={() => runBulk(a)} disabled={busy} style={a.danger ? { color: "#FF6B7A", borderColor: "rgba(255,107,122,0.5)" } : undefined}>{a.label}</OutlineBtn>
          ))}
        </div>
      )}

      {visibleRows.length === 0 ? (
        <Empty>{rows.length === 0 ? emptyText : "No rows match your search or filters."}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table style={{ tableLayout: "fixed", minWidth: "100%" }}>
            <thead>
              <tr>
                {bulkActions && (
                  <th style={{ width: 34 }}>
                    <input type="checkbox" checked={allPicked} aria-label="Select all"
                      onChange={() => setPicked(allPicked ? new Set() : new Set(visibleRows.map(rowKey)))} />
                  </th>
                )}
                {shown.map((c) => {
                  const w = widths[c.key] ?? c.width ?? 140;
                  return (
                    <th key={c.key} style={{ width: w, textAlign: c.align ?? "left", position: "relative", cursor: "pointer", userSelect: "none" }} onClick={() => clickSort(c.key)}>
                      <span className="inline-flex items-center gap-1">
                        {c.label}
                        {sortKey === c.key && (sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                      </span>
                      <span onPointerDown={(e) => startResize(e, c.key, w)} onClick={(e) => e.stopPropagation()} aria-hidden
                        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, cursor: "col-resize" }} />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => {
                const id = rowKey(r);
                return (
                  <tr key={id} onClick={onRowClick ? () => onRowClick(r) : undefined} style={{ cursor: onRowClick ? "pointer" : undefined }}>
                    {bulkActions && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={picked.has(id)} aria-label="Select row"
                          onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; })} />
                      </td>
                    )}
                    {shown.map((c) => (
                      <td key={c.key} style={{ textAlign: c.align ?? "left", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {c.render ? c.render(r) : (c.value(r) ?? "—")}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-[11.5px] text-[#7F8EA0] mt-2">{visibleRows.length} of {rows.length}</div>
      <FormStyles />
    </div>
  );
}

/** A coloured status chip for DRAFT / ACTIVE / OBSOLETE and similar. */
export function Chip({ label, tone }: { label: string; tone: "good" | "warn" | "muted" | "bad" }) {
  const color = { good: "#22D3C5", warn: "#F2B13C", muted: "#7F8EA0", bad: "#FF6B7A" }[tone];
  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] border rounded px-2 py-0.5"
      style={{ color, borderColor: `${color}55`, background: `${color}14` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{label}
    </span>
  );
}

export const statusTone = (s: string): "good" | "warn" | "muted" | "bad" => (s === "ACTIVE" ? "good" : s === "DRAFT" ? "warn" : "muted");
