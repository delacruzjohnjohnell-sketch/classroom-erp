"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Empty, Panel } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { showQueryErrors } from "@/lib/queryErrors";
import { money } from "@/lib/aisDesk";

type Line = { debit: number; credit: number; accounts: { code: string; name: string } | null };
type Entry = { id: string; entry_date: string; memo: string | null; source_table: string | null; created_at: string; journal_lines: Line[] };

export default function AisLedgerPage() {
  return <AppShell><Ledger /></AppShell>;
}

function Ledger() {
  const { effectiveTenantId } = useSession();
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    if (!effectiveTenantId) return;
    let live = true;
    (async () => {
      const r = await supabase.from("journal_entries")
        .select("id, entry_date, memo, source_table, created_at, journal_lines(debit, credit, accounts(code, name))")
        .eq("tenant_id", effectiveTenantId).order("entry_date", { ascending: true }).order("created_at", { ascending: true });
      if (!live) return;
      showQueryErrors(r);
      setEntries((r.data as unknown as Entry[]) ?? []);
    })();
    return () => { live = false; };
  }, [effectiveTenantId]);

  const trial = useMemo(() => {
    const m = new Map<string, { code: string; name: string; debit: number; credit: number }>();
    for (const e of entries ?? []) for (const l of e.journal_lines) {
      if (!l.accounts) continue;
      const row = m.get(l.accounts.code) ?? { code: l.accounts.code, name: l.accounts.name, debit: 0, credit: 0 };
      row.debit += Number(l.debit); row.credit += Number(l.credit);
      m.set(l.accounts.code, row);
    }
    return [...m.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [entries]);
  const totalD = trial.reduce((s, r) => s + r.debit, 0), totalC = trial.reduce((s, r) => s + r.credit, 0);

  if (entries === null) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin" size={20} color="#9D7CFF" /></div>;

  return (
    <div className="px-7 py-6 max-w-[1100px] flex flex-col gap-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7F8EA0]">Accounting Information Systems</div>
        <h1 className="text-[20px] font-bold mt-1">General ledger</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1">Every entry posted from a document, with its lines. Entries cannot be edited or deleted; a mistake is corrected by a reversing entry.</div>
      </div>

      <Panel title="Trial balance">
        {trial.length === 0 ? <Empty>Nothing has been posted yet.</Empty> : (
          <table>
            <thead><tr><th>Account</th><th style={{ textAlign: "right" }}>Debit</th><th style={{ textAlign: "right" }}>Credit</th></tr></thead>
            <tbody>
              {trial.map((r) => <tr key={r.code}><td>{r.code} {r.name}</td><td style={{ textAlign: "right" }}>{r.debit ? money(r.debit) : ""}</td><td style={{ textAlign: "right" }}>{r.credit ? money(r.credit) : ""}</td></tr>)}
              <tr><td><b>Total</b></td><td style={{ textAlign: "right", fontWeight: 700 }}>{money(totalD)}</td><td style={{ textAlign: "right", fontWeight: 700 }}>{money(totalC)}</td></tr>
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title={`Journal entries (${entries.length})`}>
        {entries.length === 0 ? <Empty>No entries yet.</Empty> : entries.map((e) => (
          <div key={e.id} className="mb-4">
            <div className="text-[12.5px]"><b>{e.entry_date}</b> · {e.memo ?? "(no memo)"}</div>
            <table style={{ margin: "4px 0 0" }}>
              <tbody>
                {e.journal_lines.map((l, i) => (
                  <tr key={i}><td style={{ paddingLeft: Number(l.credit) > 0 ? 28 : 8 }}>{l.accounts ? `${l.accounts.code} ${l.accounts.name}` : "—"}</td>
                    <td style={{ textAlign: "right", width: 140 }}>{Number(l.debit) ? money(Number(l.debit)) : ""}</td>
                    <td style={{ textAlign: "right", width: 140 }}>{Number(l.credit) ? money(Number(l.credit)) : ""}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Panel>
    </div>
  );
}
