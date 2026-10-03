import { supabase } from "./supabase";

// Counts rows in the given tables that point at `id` through the given column. Used to
// decide whether a piece of master data (item, customer, vendor) is tied to document
// history — documents can only be voided/reversed, never rewritten, so anything they
// reference must stay.
export async function countReferences(refs: [table: string, column: string][], id: string): Promise<{ count: number; error: string | null }> {
  const results = await Promise.all(
    refs.map(([table, column]) => supabase.from(table).select("id", { count: "exact", head: true }).eq(column, id))
  );
  const failed = results.find((r) => r.error);
  if (failed) return { count: 0, error: failed.error!.message };
  return { count: results.reduce((s, r) => s + (r.count ?? 0), 0), error: null };
}
