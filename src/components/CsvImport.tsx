"use client";

import { useState } from "react";
import { Modal, Label, FormStyles } from "./ui";
import { mutate, ok } from "@/lib/mutate";
import { supabase } from "@/lib/supabase";

export type CsvColumn = { key: string; label: string; required?: boolean; type?: "text" | "number" };

/** Minimal RFC4180-ish CSV parser: handles quoted fields, escaped quotes, commas/newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c === "\r") {
      // skip — \r\n line endings handled by the following \n
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * Fixed-template CSV import: the first row must be a header naming each
 * `columns[].key` (any order, extra columns ignored). Bulk-inserts every
 * data row into `table` in one request, tagged with `tenantId` and any
 * `extraFields`.
 */
export function CsvImportModal({
  title, table, columns, tenantId, extraFields, onClose, onImported,
}: {
  title: string;
  table: string;
  columns: CsvColumn[];
  tenantId: string;
  extraFields?: Record<string, any>;
  onClose: () => void;
  onImported: () => void;
}) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setRows(parseCsv(text));
  };

  const header = (rows?.[0] ?? []).map((h) => h.trim().toLowerCase());
  const dataRows = rows?.slice(1) ?? [];
  const missing = columns.filter((c) => c.required && !header.includes(c.key)).map((c) => c.key);
  const ready = !!rows && missing.length === 0 && dataRows.length > 0;

  const doImport = async () => {
    if (!ready || importing) return;
    setImporting(true);
    const records = dataRows
      .map((r) => {
        const obj: Record<string, any> = { tenant_id: tenantId, ...extraFields };
        columns.forEach((c) => {
          const idx = header.indexOf(c.key);
          if (idx === -1) return;
          const raw = (r[idx] ?? "").trim();
          obj[c.key] = c.type === "number" ? (parseFloat(raw) || 0) : (raw || null);
        });
        return obj;
      })
      .filter((r) => columns.some((c) => c.required && r[c.key]));

    const res = await mutate(
      supabase.from(table).insert(records),
      { successMessage: `Imported ${records.length} row${records.length === 1 ? "" : "s"}.` }
    );
    setImporting(false);
    if (ok(res)) { onImported(); onClose(); }
  };

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="text-[12.5px] text-[#6b6357] mb-3 leading-relaxed">
        CSV must have a header row naming these columns (any order — extra columns are ignored):{" "}
        <code className="text-[11.5px]">{columns.map((c) => c.key).join(", ")}</code>.
        {columns.some((c) => c.required) && (
          <> Required: <code className="text-[11.5px]">{columns.filter((c) => c.required).map((c) => c.key).join(", ")}</code>.</>
        )}
      </div>
      <Label>CSV file</Label>
      <input type="file" accept=".csv,text/csv" onChange={handleFile} className="text-[13px]" />
      {rows && (
        <div className="mt-3 text-[12.5px]">
          {missing.length > 0 ? (
            <div style={{ color: "#A6402F" }}>Missing required column{missing.length > 1 ? "s" : ""}: {missing.join(", ")}</div>
          ) : dataRows.length === 0 ? (
            <div style={{ color: "#A6402F" }}>No data rows found below the header.</div>
          ) : (
            <div className="text-[#6b6357]">{fileName} — {dataRows.length} row{dataRows.length === 1 ? "" : "s"} ready to import.</div>
          )}
        </div>
      )}
      <button onClick={doImport} disabled={!ready || importing} className="primary-btn mt-4">
        {importing ? "Importing…" : ready ? `Import ${dataRows.length} row${dataRows.length === 1 ? "" : "s"}` : "Import"}
      </button>
      <FormStyles />
    </Modal>
  );
}
