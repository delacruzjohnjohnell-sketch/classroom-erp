import { supabase } from "./supabase";

type LineRow = Record<string, unknown>;

/**
 * Replaces the lines of a draft document. New lines go in first and the old
 * ones are removed afterwards, so a failed save never leaves the document
 * with no lines.
 */
export async function replaceLines(
  table: string, fk: string, parentId: string, rows: LineRow[]
): Promise<{ error: { message: string } | null }> {
  const { data: old, error: readErr } = await supabase.from(table).select("id").eq(fk, parentId);
  if (readErr) return { error: readErr };
  const ins = await supabase.from(table).insert(rows.map((r) => ({ ...r, [fk]: parentId })));
  if (ins.error) return { error: ins.error };
  const ids = (old ?? []).map((o: { id: string }) => o.id);
  if (ids.length > 0) {
    const del = await supabase.from(table).delete().in("id", ids);
    if (del.error) return { error: del.error };
  }
  return { error: null };
}
