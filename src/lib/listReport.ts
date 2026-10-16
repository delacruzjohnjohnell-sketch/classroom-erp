// Pure helpers behind the Manufacturing list screens (src/components/ListReport.tsx). No imports, so they
// run in the unit tests: searching, filtering, sorting, CSV export and saved report "variants".

export type Cell = string | number | boolean | null | undefined;
export type SortDir = "asc" | "desc";

/** A saved layout of a list: which columns, how wide, how sorted and filtered. */
export type Variant = {
  name: string;
  hidden: string[];
  widths: Record<string, number>;
  sortKey: string | null;
  sortDir: SortDir;
  filters: Record<string, string>;
  q: string;
};

export const MIN_COL_WIDTH = 60;
export const MAX_COL_WIDTH = 600;

export const clampWidth = (w: number) => Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, Math.round(w)));

const text = (c: Cell) => (c === null || c === undefined ? "" : String(c));

/** Every word typed must appear somewhere in the row (case-insensitive). */
export function matchesSearch(cells: Cell[], q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = cells.map((c) => text(c).toLowerCase()).join(" ");
  return words.every((w) => hay.includes(w));
}

/** Rows whose value for each filtered column equals the chosen value. An empty choice means "all". */
export function applyFilters<T>(rows: T[], filters: Record<string, string>, valueOf: (row: T, key: string) => Cell): T[] {
  const active = Object.entries(filters).filter(([, v]) => v !== "");
  if (active.length === 0) return rows;
  return rows.filter((r) => active.every(([k, v]) => text(valueOf(r, k)) === v));
}

/** Numbers sort as numbers, text sorts naturally ("Item 2" before "Item 10"), blanks always go last. */
export function compareCells(a: Cell, b: Cell, dir: SortDir): number {
  const aBlank = a === null || a === undefined || a === "";
  const bBlank = b === null || b === undefined || b === "";
  if (aBlank || bBlank) return aBlank === bBlank ? 0 : aBlank ? 1 : -1;
  const sign = dir === "asc" ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * sign;
  return text(a).localeCompare(text(b), undefined, { numeric: true, sensitivity: "base" }) * sign;
}

export function sortRows<T>(rows: T[], valueOf: (row: T) => Cell, dir: SortDir): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((x, y) => compareCells(valueOf(x.r), valueOf(y.r), dir) || x.i - y.i)    // stable
    .map((x) => x.r);
}

/** The distinct values of a column, in a stable order, for a filter drop-down. */
export function distinctValues<T>(rows: T[], valueOf: (row: T) => Cell): string[] {
  return [...new Set(rows.map((r) => text(valueOf(r))).filter((v) => v !== ""))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** One CSV cell. Text that a spreadsheet would run as a formula is neutralised with a leading apostrophe. */
export function csvCell(c: Cell): string {
  let s = text(c);
  if (typeof c === "string" && /^[=+@\t\r]/.test(s)) s = "'" + s;
  if (typeof c === "string" && /^-[^0-9.]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** Reads saved variants back from localStorage text; anything malformed is dropped rather than crashing the page. */
export function parseVariants(raw: string | null): Variant[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter((v) => v && typeof v === "object" && typeof v.name === "string" && v.name.trim() !== "")
      .map((v) => ({
        name: String(v.name).slice(0, 60),
        hidden: Array.isArray(v.hidden) ? v.hidden.filter((k: unknown) => typeof k === "string") : [],
        widths: Object.fromEntries(Object.entries(v.widths && typeof v.widths === "object" ? v.widths : {})
          .filter(([, w]) => typeof w === "number" && Number.isFinite(w)).map(([k, w]) => [k, clampWidth(w as number)])),
        sortKey: typeof v.sortKey === "string" ? v.sortKey : null,
        sortDir: v.sortDir === "desc" ? "desc" : "asc",
        filters: Object.fromEntries(Object.entries(v.filters && typeof v.filters === "object" ? v.filters : {}).filter(([, f]) => typeof f === "string")) as Record<string, string>,
        q: typeof v.q === "string" ? v.q : "",
      }));
  } catch {
    return [];
  }
}

/** Saves (or replaces, by name) a variant. */
export function upsertVariant(list: Variant[], v: Variant): Variant[] {
  const name = v.name.trim();
  return [...list.filter((x) => x.name.toLowerCase() !== name.toLowerCase()), { ...v, name }];
}

export const removeVariant = (list: Variant[], name: string): Variant[] => list.filter((v) => v.name !== name);
