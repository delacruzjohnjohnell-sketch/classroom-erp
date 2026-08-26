"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Landmark, CheckCircle2, Circle } from "lucide-react";
import AppShell from "@/components/AppShell";
import { KpiCard, Panel, Empty, Modal, Label, GoldBtn, OutlineBtn, FormStyles } from "@/components/ui";
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
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [txns, setTxns] = useState<any[]>([]);
  const [ledgerBalance, setLedgerBalance] = useState(0);
  const [modal, setModal] = useState<null | "txn" | "account">(null);

  const load = async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    const { data: accounts } = await supabase.from("accounts").select("*").eq("tenant_id", effectiveTenantId).eq("is_bank", true).order("code");
    setBankAccounts(accounts ?? []);
    const activeId = selectedAccountId || accounts?.[0]?.id || "";
    setSelectedAccountId(activeId);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [effectiveTenantId]);

  const loadAccountDetail = async (accountId: string) => {
    if (!accountId) return;
    const [t, lines] = await Promise.all([
      supabase.from("bank_transactions").select("*").eq("tenant_id", effectiveTenantId).eq("account_id", accountId).order("txn_date", { ascending: false }),
      supabase.from("journal_lines").select("debit, credit").eq("account_id", accountId),
    ]);
    setTxns(t.data ?? []);
    const bal = (lines.data ?? []).reduce((s: number, l: any) => s + (l.debit || 0) - (l.credit || 0), 0);
    setLedgerBalance(bal);
  };
  useEffect(() => { if (selectedAccountId) loadAccountDetail(selectedAccountId); /* eslint-disable-next-line */ }, [selectedAccountId]);

  const unreconciledCount = txns.filter((t) => !t.reconciled).length;
  const bankBalance = txns.reduce((s, t) => s + t.amount, 0);

  const toggleReconciled = async (id: string, current: boolean) => {
    await supabase.from("bank_transactions").update({ reconciled: !current }).eq("id", id);
    loadAccountDetail(selectedAccountId);
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;

  return (
    <>
      <div className="flex gap-2 flex-wrap items-center">
        <GoldBtn onClick={() => setModal("account")}><Plus size={14} /> New bank account</GoldBtn>
        {bankAccounts.length > 0 && (
          <OutlineBtn onClick={() => setModal("txn")}><Plus size={14} /> Add transaction</OutlineBtn>
        )}
        <div className="flex-1" />
        {bankAccounts.length > 0 && (
          <select className="input" style={{ width: 240 }} value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
            {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </select>
        )}
      </div>

      {bankAccounts.length === 0 ? (
        <Panel title="No bank accounts yet">
          <Empty>Add a bank account (e.g. "BDO Checking", "Cash on hand") to start logging and reconciling transactions.</Empty>
        </Panel>
      ) : (
        <>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <KpiCard icon={<Landmark size={16} />} label="Ledger balance" value={money(ledgerBalance)} />
            <KpiCard icon={<Landmark size={16} />} label="Bank statement balance" value={money(bankBalance)} />
            <KpiCard icon={<Circle size={16} />} label="Unreconciled" value={unreconciledCount} accent={unreconciledCount > 0 ? RED : TEAL} />
          </div>

          {Math.abs(ledgerBalance - bankBalance) > 0.01 && (
            <div className="text-[12.5px] font-semibold px-4 py-3 rounded-lg" style={{ background: "#FBF0E4", color: "#8a5a1e" }}>
              Ledger and bank statement don't match — off by {money(ledgerBalance - bankBalance)}. Normal until every line below is entered and reconciled.
            </div>
          )}

          <Panel title="Bank transactions">
            {txns.length === 0 ? <Empty>No transactions logged for this account yet.</Empty> : (
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
        </>
      )}

      {modal === "account" && (
        <Modal title="New bank account" onClose={() => setModal(null)}>
          <BankAccountForm onClose={() => setModal(null)} onSaved={load} />
        </Modal>
      )}
      {modal === "txn" && selectedAccountId && (
        <Modal title="Add bank transaction" onClose={() => setModal(null)}>
          <BankTxnForm accountId={selectedAccountId} onClose={() => setModal(null)} onSaved={() => loadAccountDetail(selectedAccountId)} />
        </Modal>
      )}
    </>
  );
}

function BankAccountForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { effectiveTenantId } = useSession();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      await supabase.from("accounts").insert({ tenant_id: effectiveTenantId, code: code || String(1000 + Math.floor(Math.random() * 900)), name, type: "asset", is_bank: true });
      onClose(); onSaved();
    }}>
      <Label>Account name</Label>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. BDO Checking" required />
      <Label>Account code (optional)</Label>
      <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 1010 — auto-assigned if blank" />
      <button type="submit" className="primary-btn mt-4">Save</button>
      <FormStyles />
    </form>
  );
}

function BankTxnForm({ accountId, onClose, onSaved }: { accountId: string; onClose: () => void; onSaved: () => void }) {
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
        tenant_id: effectiveTenantId, account_id: accountId, txn_date: date, description, amount: kind === "withdrawal" ? -Math.abs(n) : Math.abs(n),
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
