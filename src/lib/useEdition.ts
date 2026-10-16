"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Edition } from "./edition";

// A company's edition never changes after it is created, so it is remembered for the life of the page.
// Moving between screens then needs no second lookup (and no loading flash).
const known = new Map<string, Edition>();

/**
 * The edition of the active company. A company with no row in `tenant_editions` is Standard, which
 * is also what is reported if the table can't be read (for example before the migration has run), so
 * the Standard ERP keeps working exactly as before.
 */
export function useEdition(tenantId: string | null): { edition: Edition; ready: boolean } {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!tenantId || known.has(tenantId)) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("tenant_editions").select("edition").eq("tenant_id", tenantId).maybeSingle();
      if (cancelled) return;
      known.set(tenantId, !error && (data as { edition?: string } | null)?.edition === "MANUFACTURING" ? "MANUFACTURING" : "STANDARD");
      setTick((n) => n + 1);
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  const edition = tenantId ? known.get(tenantId) : undefined;
  return { edition: edition ?? "STANDARD", ready: !!edition };
}
