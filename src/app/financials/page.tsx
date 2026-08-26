"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X, Loader2, Pencil, Trash2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Panel, Empty, Modal, Label, GoldBtn, OutlineBtn, FormStyles } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { money, todayStr, type Account } from "@/lib/types";
import { computeAccountBalances, type EntryWithLines } from "@/lib/metrics";

const TEAL = "#12524F", GOLD = "#C08A2E", RED = "#A6402F";

export default function FinancialsPage() {
  return <AppShell><FinancialsBody /></AppShell>;
}

function FinancialsBody() {
  const { effectiveTenantId } = useSession();
  const [tab, setTab] = useState<"journal" | "accounts">("journal");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<EntryWithLines[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | "sale" | "expense" | "manual">(null);
  const [accountModal, setAccountModal] = useState<null | "new" | Account>(null);

  const load = async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    const [acc, ent] = await Promise.all([
      supabase.from("accounts").select("*").eq("tenant_id", effectiveTenantId).order("code"),
      supabase.from("journal_entries").select("id, entry_date, memo, journal_lines(*)").eq("tenant_id", effectiveTenantId).order("entry_date", { ascending: false }),
    ]);
    setAccounts((acc.data as Account[]) ?? []);
    setEntries((ent.data as any as EntryWithLines[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [effectiveTenantId]);

  const balances = useMemo(() => computeAccountBalances(entries), [entries]);
  const accountsById = Object.fromEntries(accounts.map((a) => [a.id, a]));

  const postEntry = async (date: string, memo: string, lines: { account_id: string; debit: number; credit: number }[]) => {
    const { data: je, error } = await supabase.from("journal_entries")
      .insert({ tenant_id: effectiveTenantId, entry_date: date, memo }).select().single();
    if (error || !je) return;
    await supabase.from("journal_lines").insert(lines.map((l) => ({ ...l, journal_entry_id: je.id })));
    setModal(null);
    load();
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setTab("journal")} className={`text-[13px] font-semibold px-3 py-1.5 rounded-md ${tab === "journal" ? "bg-panel border border-hairline" : "text-[#8a8172]"}`}>Journal entries</button>
        <button onClick={() => setTab("accounts")} className={`text-[13px] font-semibold px-3 py-1.5 rounded-md ${tab === "accounts" ? "bg-panel border border-hairline" : "text-[#8a8172]"}`}>Chart of accounts</button>
        <div className="flex-1" />
        <GoldBtn onClick={() => setModal("sale")}><Plus size={14} /> Record sale</GoldBtn>
        <OutlineBtn onClick={() => setModal("expense")}><Plus size={14} /> Record expense</OutlineBtn>
        <OutlineBtn onClick={() => setModal("manual")}>Manual entry</OutlineBtn>
      </div>

      {tab === "journal" && (
        <Panel title="Journal entries">
          {entries.length === 0 ? <Empty>No entries yet — record a sale or expense to get started.</Empty> : (
            <table>
              <thead><tr><th>Date</th><th>Memo</th><th>Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
              <tbody>
                {entries.map((e) => e.journal_lines.map((l, i) => (
                  <tr key={l.id}>
                    {i === 0 ? <><td rowSpan={e.journal_lines.length}>{e.entry_date}</td><td rowSpan={e.journal_lines.length}>{e.memo}</td></> : null}
                    <td>{accountsById[l.account_id]?.name ?? l.account_id}</td>
                    <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{l.debit ? money(l.debit) : ""}</td>
                    <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{l.credit ? money(l.credit) : ""}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {tab === "accounts" && (
        <Panel title="Chart of accounts">
          <div className="flex justify-end mb-3">
            <GoldBtn onClick={() => setAccountModal("new")}><Plus size={14} /> New account</GoldBtn>
          </div>
          <table>
            <thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Bank?</th><th className="text-right">Balance</th><th></th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td style={{ color: GOLD, fontWeight: 600 }}>{a.code}</td>
                  <td>{a.name}</td>
                  <td className="capitalize text-[#6b6357]">{a.type}</td>
                  <td>{(a as any).is_bank ? "Yes" : ""}</td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(balances[a.id] || 0)}</td>
                  <td className="flex gap-2">
                    <button onClick={() => setAccountModal(a)} className="text-[#8a8172]"><Pencil size={13} /></button>
                    <button onClick={async () => { if (confirm(`Delete ${a.name}? This cannot be undone.`)) { await supabase.from("accounts").delete().eq("id", a.id); load(); } }} className="text-red-700" style={{ color: "#A6402F" }}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {accountModal && (
        <AccountModal
          account={accountModal === "new" ? null : accountModal}
          onClose={() => setAccountModal(null)}
          onSave={async (vals) => {
            if (accountModal === "new") {
              await supabase.from("accounts").insert({ tenant_id: effectiveTenantId, code: vals.code, name: vals.name, type: vals.type, is_bank: vals.is_bank });
            } else {
              await supabase.from("accounts").update({ code: vals.code, name: vals.name, type: vals.type, is_bank: vals.is_bank }).eq("id", (accountModal as Account).id);
            }
            setAccountModal(null);
            load();
          }}
        />
      )}

      {modal === "sale" && (
        <QuickModal title="Record a sale" debitDefault={accounts.find((a) => a.code === "1000")?.id} creditDefault={accounts.find((a) => a.code === "4000")?.id}
          debitLabel="Received into" creditLabel="Revenue account" accounts={accounts} onClose={() => setModal(null)}
          onSubmit={(amount, date, memo, debit, credit) => postEntry(date, memo || "Sale", [{ account_id: debit, debit: amount, credit: 0 }, { account_id: credit, debit: 0, credit: amount }])} />
      )}
      {modal === "expense" && (
        <QuickModal title="Record an expense" debitDefault={accounts.find((a) => a.code === "5100")?.id} creditDefault={accounts.find((a) => a.code === "1000")?.id}
          debitLabel="Expense account" creditLabel="Paid from" accounts={accounts} onClose={() => setModal(null)}
          onSubmit={(amount, date, memo, debit, credit) => postEntry(date, memo || "Expense", [{ account_id: debit, debit: amount, credit: 0 }, { account_id: credit, debit: 0, credit: amount }])} />
      )}
      {modal === "manual" && <ManualModal accounts={accounts} onClose={() => setModal(null)} onSubmit={(date, memo, lines) => postEntry(date, memo, lines)} />}
    </>
  );
}

function QuickModal({ title, debitDefault, creditDefault, debitLabel, creditLabel, accounts, onClose, onSubmit }:
  { title: string; debitDefault?: string; creditDefault?: string; debitLabel: string; creditLabel: string; accounts: Account[]; onClose: () => void;
    onSubmit: (amount: number, date: string, memo: string, debit: string, credit: string) => void }) {
  const [amount, setAmount] = useState(""); const [date, setDate] = useState(todayStr()); const [memo, setMemo] = useState("");
  const [debit, setDebit] = useState(debitDefault || ""); const [credit, setCredit] = useState(creditDefault || "");
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); const n = parseFloat(amount); if (!n || n <= 0) return; onSubmit(n, date, memo, debit, credit); }}>
        <Label>Amount</Label>
        <input className="input" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        <Label>Date</Label>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <Label>Memo (optional)</Label>
        <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. Invoice #204" />
        <div className="grid grid-cols-2 gap-2.5">
          <div><Label>{debitLabel}</Label>
            <select className="input" value={debit} onChange={(e) => setDebit(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></div>
          <div><Label>{creditLabel}</Label>
            <select className="input" value={credit} onChange={(e) => setCredit(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></div>
        </div>
        <button type="submit" className="primary-btn mt-4">Save entry</button>
      </form>
      <ModalStyles />
    </Modal>
  );
}

function ManualModal({ accounts, onClose, onSubmit }:
  { accounts: Account[]; onClose: () => void; onSubmit: (date: string, memo: string, lines: { account_id: string; debit: number; credit: number }[]) => void }) {
  const [date, setDate] = useState(todayStr()); const [memo, setMemo] = useState("");
  const [lines, setLines] = useState([{ account_id: accounts[0]?.id ?? "", debit: "", credit: "" }, { account_id: accounts[1]?.id ?? "", debit: "", credit: "" }]);
  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.005;
  const update = (i: number, field: "account_id" | "debit" | "credit", value: string) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));

  return (
    <Modal title="Manual journal entry" onClose={onClose} wide>
      <form onSubmit={(e) => { e.preventDefault(); if (!balanced) return; onSubmit(date, memo || "Manual entry", lines.map((l) => ({ account_id: l.account_id, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 }))); }}>
        <div className="grid grid-cols-2 gap-2.5">
          <div><Label>Date</Label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
          <div><Label>Memo</Label><input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Describe this transaction" /></div>
        </div>
        <div className="mt-2.5">
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2 mb-2 items-center">
              <select className="input flex-[2]" value={l.account_id} onChange={(e) => update(i, "account_id", e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select>
              <input className="input flex-1" type="number" min="0" step="0.01" placeholder="Debit" value={l.debit} onChange={(e) => update(i, "debit", e.target.value)} />
              <input className="input flex-1" type="number" min="0" step="0.01" placeholder="Credit" value={l.credit} onChange={(e) => update(i, "credit", e.target.value)} />
              {lines.length > 2 && <button type="button" onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}><X size={14} /></button>}
            </div>
          ))}
          <button type="button" className="text-xs text-teal border border-dashed border-hairline rounded-md px-2.5 py-1.5 flex items-center gap-1"
            onClick={() => setLines((prev) => [...prev, { account_id: accounts[0]?.id ?? "", debit: "", credit: "" }])}><Plus size={13} /> Add line</button>
        </div>
        <div className="text-[12.5px] font-semibold mt-2.5" style={{ color: balanced ? TEAL : RED }}>
          Debits {money(totalDebit)} · Credits {money(totalCredit)} {balanced ? "· Balanced" : "· Must balance to save"}
        </div>
        <button type="submit" disabled={!balanced} className="primary-btn mt-3" style={{ opacity: balanced ? 1 : 0.5 }}>Save entry</button>
      </form>
      <ModalStyles />
    </Modal>
  );
}

function AccountModal({ account, onClose, onSave }: { account: Account | null; onClose: () => void; onSave: (vals: { code: string; name: string; type: string; is_bank: boolean }) => void }) {
  const [code, setCode] = useState(account?.code ?? "");
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<Account["type"]>(account?.type ?? "asset");
  const [isBank, setIsBank] = useState((account as any)?.is_bank ?? false);

  return (
    <Modal title={account ? "Edit account" : "New account"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave({ code, name, type, is_bank: isBank }); }}>
        <Label>Code</Label>
        <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 1050" required />
        <Label>Name</Label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. BDO Checking" required />
        <Label>Type</Label>
        <select className="input" value={type} onChange={(e) => setType(e.target.value as Account["type"])}>
          <option value="asset">Asset</option><option value="liability">Liability</option>
          <option value="equity">Equity</option><option value="revenue">Revenue</option><option value="expense">Expense</option>
        </select>
        {type === "asset" && (
          <label className="flex items-center gap-2 mt-3.5 text-[13px]">
            <input type="checkbox" checked={isBank} onChange={(e) => setIsBank(e.target.checked)} />
            This is a bank account (shows up in Banking)
          </label>
        )}
        <button type="submit" className="primary-btn mt-4">Save</button>
      </form>
      <ModalStyles />
    </Modal>
  );
}

function ModalStyles() {
  return (
    <style jsx global>{`
      .input { font-size: 14px; padding: 9px 11px; border-radius: 8px; border: 1px solid #DDD8CC; background: #F5F3EE; color: #1B2430; outline: none; width: 100%; }
      .primary-btn { display: flex; align-items: center; justify-content: center; gap: 6px; background: #12524F; color: #fff; border: none; padding: 11px 14px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; width: 100%; }
    `}</style>
  );
}
