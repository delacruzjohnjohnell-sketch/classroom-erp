"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import VoucherView from "@/components/mfg/VoucherView";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

type Vch = { id: string; voucher_no: string; status: string };

/**
 * "View JV-2026-00012": the voucher(s) a document wrote to the books, one click from the document.
 * A document that was reversed shows both vouchers. Nothing is shown until the document has posted.
 */
export default function VoucherBadge({ sourceId, reloadKey }: { sourceId: string | null | undefined; reloadKey?: unknown }) {
  const { effectiveTenantId } = useSession();
  const [list, setList] = useState<Vch[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceId || !effectiveTenantId) return;
    let live = true;
    supabase.from("mfg_vouchers").select("id, voucher_no, status").eq("tenant_id", effectiveTenantId).eq("source_id", sourceId).order("voucher_no")
      .then((r) => { if (live) setList((r.data as Vch[]) ?? []); });
    return () => { live = false; };
  }, [sourceId, effectiveTenantId, reloadKey]);

  if (!sourceId || list.length === 0) return null;
  return (
    <>
      {list.map((v) => (
        <button key={v.id} type="button" onClick={(e) => { e.stopPropagation(); setOpen(v.id); }} aria-label={`View journal voucher ${v.voucher_no}`}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-gold border border-hairline rounded px-1.5 py-0.5">
          <FileText size={10} /> {v.voucher_no}{v.status === "REVERSED" ? " (reversed)" : ""}
        </button>
      ))}
      {open && <VoucherView voucherId={open} onClose={() => setOpen(null)} />}
    </>
  );
}
