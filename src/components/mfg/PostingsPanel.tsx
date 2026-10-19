"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Empty } from "../ui";
import VoucherView from "@/components/mfg/VoucherView";
import { supabase } from "@/lib/supabase";
import { showQueryErrors } from "@/lib/queryErrors";
import { useSession } from "@/lib/session";
import { money } from "@/lib/costing";

type Entry = { id: string; entry_date: string; memo: string | null; source_id: string | null };
type Vch = { id: string; voucher_no: string; journal_entry_id: string };
type Line = { journal_entry_id: string; account_id: string; debit: number; credit: number };

/**
 * The journal entries that stock and production documents posted: for each document, the account, debit and credit.
 * The books are never typed in by hand here — every line below was written by the posting itself.
 */
export default function PostingsPanel({ sourceIds, reloadKey }: { sourceIds: string[]; reloadKey?: unknown }) {
  const { effectiveTenantId } = useSession();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [accounts, setAccounts] = useState<Record<string, { code: string; name: string }>>({});
  const [vouchers, setVouchers] = useState<Record<string, Vch>>({});
  const [viewing, setViewing] = useState<string | null>(null);
  const key = sourceIds.join(",");

  useEffect(() => {
    if (!effectiveTenantId || sourceIds.length === 0) return;
    (async () => {
      const [e, a] = await Promise.all([
        supabase.from("journal_entries").select("id, entry_date, memo, source_id").eq("tenant_id", effectiveTenantId).in("source_id", sourceIds).order("entry_date").order("created_at"),
        supabase.from("accounts").select("id, code, name").eq("tenant_id", effectiveTenantId),
      ]);
      showQueryErrors(e, a);
      const es = (e.data as Entry[]) ?? [];
      setEntries(es);
      setAccounts(Object.fromEntries(((a.data as { id: string; code: string; name: string }[]) ?? []).map((x) => [x.id, x])));
      if (es.length) {
        const [l, v] = await Promise.all([
          supabase.from("journal_lines").select("journal_entry_id, account_id, debit, credit").in("journal_entry_id", es.map((x) => x.id)),
          supabase.from("mfg_vouchers").select("id, voucher_no, journal_entry_id").in("journal_entry_id", es.map((x) => x.id)),
        ]);
        showQueryErrors(l, v);
        setLines((l.data as Line[]) ?? []);
        setVouchers(Object.fromEntries(((v.data as Vch[]) ?? []).map((x) => [x.journal_entry_id, x])));
      } else { setLines([]); setVouchers({}); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTenantId, key, reloadKey]);

  if (sourceIds.length === 0 || entries.length === 0) return <Empty>Nothing has been posted to the books yet.</Empty>;
  return (
    <div className="flex flex-col gap-3">
      {entries.map((e) => {
        const ls = lines.filter((l) => l.journal_entry_id === e.id);
        return (
          <details key={e.id} className="border border-hairline rounded-md" open>
            <summary className="px-3 py-2 text-[12.5px] cursor-pointer flex gap-3 flex-wrap">
              <span className="text-[#7F8EA0]">{e.entry_date}</span><span>{e.memo}</span>
              <span className="ml-auto text-[#A3B1C2]">{money(ls.reduce((s, l) => s + Number(l.debit), 0))}</span>
              {vouchers[e.id] && (
                <button type="button" onClick={(ev) => { ev.preventDefault(); setViewing(vouchers[e.id].id); }}
                  className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-gold border border-hairline rounded px-2 py-0.5" aria-label={`View journal voucher ${vouchers[e.id].voucher_no}`}>
                  <FileText size={11} /> View {vouchers[e.id].voucher_no}
                </button>
              )}
            </summary>
            <table>
              <thead><tr><th>Account</th><th style={{ textAlign: "right" }}>Debit</th><th style={{ textAlign: "right" }}>Credit</th></tr></thead>
              <tbody>
                {ls.map((l, i) => (
                  <tr key={i}>
                    <td style={{ paddingLeft: Number(l.credit) > 0 ? 28 : 10 }}>{accounts[l.account_id] ? `${accounts[l.account_id].code} ${accounts[l.account_id].name}` : "—"}</td>
                    <td style={{ textAlign: "right" }}>{Number(l.debit) ? money(l.debit) : ""}</td>
                    <td style={{ textAlign: "right" }}>{Number(l.credit) ? money(l.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        );
      })}
      {viewing && <VoucherView voucherId={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
