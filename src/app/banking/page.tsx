"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Landmark, CheckCircle2, Circle } from "lucide-react";
import AppShell from "@/components/AppShell";
import { KpiCard, Panel, Empty, Modal, Label, GoldBtn, FormStyles } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { money, todayStr } from "@/lib/types";

const TEAL = "#12524F", RED = "#A6402F";

export default function BankingPage() {
  return <AppShell><BankingBody /></AppShell>;
}

function BankingBody() {
  const { effectiveTenantId } = useSession();
  const [loading, setLoading] = useState(true);
  const [txns, setTxns] = useState<any[]>([]);
  const [cashBalance, setCashBalance] = useState(0);
  const [modal, setModal] = useState(false);

  const load = async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    const [t, acc] = await Promise.all([
      supabase.from("bank_transactions").select("*").eq("tenant_id", effectiveTenantId).order("txn_date", { ascending: false }),
      supabase.from("accounts").select("id").eq("tenant_id", effectiveTenantId).eq("code", "1000").single(),
    ]);
    setTxns(t.data ?? []);
    if (acc.data) {
      const { data: lines } = await supabase.from("journal_lines").select("debit, credit, journal_entries!inner(tenant_id)").eq("account_id", acc.data.id);
      const bal = (lines ?? []).reduce((s: number, l: any) => s + (l.debit || 0) - (l.credit || 0), 0);
      setCashBalance(bal);
    }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [effectiveTenantId]);

  const unreconciledCount = txns.filter((t) => !t.reconciled).length;
  const bankBalance = txns.reduce((s, t) => s + t.amount, 0);

  const toggleReconciled = async (id: string, current: boolean) => {
    await supabase.from("bank_transactions").update({ reconciled: !current }).eq("id", id);
    load();
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;

  return (
    <>
      <div className="flex gap-2"><GoldBtn onClick={() => setModal(true)}><Plus size={14} /> Add bank transaction</GoldBtn></div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <KpiCard icon={<Landmark size={16} />} label="Ledger cash balance" value={money(cashBalance)} />
        <KpiCard icon={<Landmark size={16} />} label="Bank statement balance" value={money(bankBalance)} />
        <KpiCard icon={<Circle size={16} />} label="Unreconciled transactions" value={unreconciledCount} accent={unreconciledCount > 0 ? RED : TEAL} />
      </div>

      {Math.abs(cashBalance - bankBalance) > 0.01 && (
        <div className="text-[12.5px] font-semibold px-4 py-3 rounded-lg" style={{ background: "#FBF0E4", color: "#8a5a1e" }}>
          Your ledger cash balance and bank statement balance don't match — off by {money(cashBalance - bankBalance)}.
          That's normal until every transaction below is entered and reconciled.
        </div>
      )}

      <Panel title="Bank transactions">
        {txns.length === 0 ? <Empty>No bank transactions logged yet. Add each line from your bank statement to reconcile against your books.</Empty> : (
          <table>
            <thead><tr><th>Date</th><th>Description</th><th className="text-right">Amount</th><th>Reconciled</th></tr></thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id}>
                  <td>{t.txn_date}</td><td>{t.description}</td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums", color: t.amount < 0 ? RED : TEAL }}>{money(t.amount)}</td>
                  <td>
                    <button onClick={() => toggleReconciled(t.id, t.reconciled)} className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: t.reconciled ? TEAL : "#8a8172" }}>
                      {t.reconciled ? <CheckCircle2 size={14} /> : <Circle size={14} />} {t.reconciled ? "Reconciled" : "Mark reconciled"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {modal && (
        <Modal title="Add bank transaction" onClose={() => setModal(false)}>
          <BankTxnForm onClose={() => setModal(false)} onSaved={load} />
        </Modal>
      )}
    </>
  );
}

function BankTxnForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { effectiveTenantId } = useSession();
  const [date, setDate] = useState(todayStr());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"deposit" | "withdrawal">("deposit");

  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      const n = parseFloat(amount);
      if (!n) return;
      await supabase.from("bank_transactions").insert({
        tenant_id: effectiveTenantId, txn_date: date, description, amount: kind === "withdrawal" ? -Math.abs(n) : Math.abs(n),
      });
      onClose(); onSaved();
    }}>
      <Label>Date</Label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      <Label>Description</Label><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Wire from customer" required />
      <div className="grid grid-cols-2 gap-2.5">
        <div><Label>Type</Label>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as any)}>
            <option value="deposit">Deposit (money in)</option><option value="withdrawal">Withdrawal (money out)</option>
          </select>
        </div>
        <div><Label>Amount</Label><input className="input" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
      </div>
      <button type="submit" className="primary-btn mt-4">Save</button>
      <FormStyles />
    </form>
  );
}
