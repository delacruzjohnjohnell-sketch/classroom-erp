"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X, Loader2, Pencil, Trash2, Paperclip } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Panel, Empty, Modal, Label, GoldBtn, OutlineBtn, TinyBtn, SearchBox, FormStyles } from "@/components/ui";
import Attachments from "@/components/Attachments";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { money, todayStr, type Account } from "@/lib/types";
import { computeAccountBalances, type EntryWithLines } from "@/lib/metrics";

const TEAL = "#12524F", GOLD = "#C08A2E", RED = "#A6402F";

export default function FinancialsPage() {
  return <AppShell><FinancialsBody /></AppShell>;
}

function FinancialsBody() {
  const { effectiveTenantId } = useSession();
  const [tab, setTab] = useState<"journal" | "accounts" | "recurring">("journal");
  const [q, setQ] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<EntryWithLines[]>([]);
  const [recurring, setRecurring] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | "sale" | "expense" | "manual" | "recurring">(null);
  const [accountModal, setAccountModal] = useState<null | "new" | Account>(null);
  const [postedByNames, setPostedByNames] = useState<Record<string, string>>({});
  const [lockedThrough, setLockedThrough] = useState<string | null>(null);
  const [reversing, setReversing] = useState<string | null>(null);
  const [attachEntry, setAttachEntry] = useState<{ id: string; memo: string } | null>(null);

  const load = async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    const [acc, ent, tenantRow, rec] = await Promise.all([
      supabase.from("accounts").select("*").eq("tenant_id", effectiveTenantId).order("code"),
      supabase.from("journal_entries").select("id, entry_date, memo, created_by, journal_lines(*)").eq("tenant_id", effectiveTenantId).order("entry_date", { ascending: false }),
      supabase.from("tenants").select("books_locked_through").eq("id", effectiveTenantId).single(),
      supabase.from("recurring_entries").select("*").eq("tenant_id", effectiveTenantId).order("next_run_date"),
    ]);
    setAccounts((acc.data as Account[]) ?? []);
    setEntries((ent.data as any as EntryWithLines[]) ?? []);
    setLockedThrough((tenantRow.data as any)?.books_locked_through ?? null);
    setRecurring(rec.data ?? []);

    const creatorIds = Array.from(new Set(((ent.data as any[]) ?? []).map((e) => e.created_by).filter(Boolean)));
    if (creatorIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", creatorIds);
      setPostedByNames(Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name])));
    }
    setLoading(false);
  };

  // load() sets state synchronously before its first await (fetch-on-mount) — intentional.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [effectiveTenantId]);

  const balances = useMemo(() => computeAccountBalances(entries), [entries]);
  const accountsById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const entriesF = (entries as any[]).filter((e) => {
    if (!q) return true;
    const needle = q.trim().toLowerCase();
    if ((e.memo ?? "").toLowerCase().includes(needle)) return true;
    if ((e.entry_date ?? "").includes(needle)) return true;
    if ((postedByNames[e.created_by] ?? "").toLowerCase().includes(needle)) return true;
    return e.journal_lines.some((l: any) => (accountsById[l.account_id]?.name ?? "").toLowerCase().includes(needle));
  });

  const postEntry = async (date: string, memo: string, lines: { account_id: string; debit: number; credit: number }[]) => {
    const { data: je } = await mutate(supabase.from("journal_entries")
      .insert({ tenant_id: effectiveTenantId, entry_date: date, memo }).select().single());
    if (!je) return;
    const linesRes = await mutate(supabase.from("journal_lines").insert(lines.map((l) => ({ ...l, journal_entry_id: je.id }))), { successMessage: "Entry posted." });
    if (ok(linesRes)) setModal(null);
    load();
  };

  const reverseEntry = async (entryId: string) => {
    setReversing(entryId);
    const res = await mutate(supabase.rpc("reverse_journal_entry", { original_id: entryId, reversal_date: todayStr() }), { successMessage: "Entry reversed." });
    setReversing(null);
    if (!ok(res)) return;
    load();
  };

  const saveLock = async (date: string) => {
    const res = await mutate(supabase.from("tenants").update({ books_locked_through: date || null }).eq("id", effectiveTenantId));
    if (ok(res)) setLockedThrough(date || null);
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;

  return (
    <>
      <ModalStyles />

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setTab("journal")} className={`text-[13px] font-semibold px-3 py-1.5 rounded-md ${tab === "journal" ? "bg-panel border border-hairline" : "text-[#8a8172]"}`}>Journal entries</button>
        <button onClick={() => setTab("accounts")} className={`text-[13px] font-semibold px-3 py-1.5 rounded-md ${tab === "accounts" ? "bg-panel border border-hairline" : "text-[#8a8172]"}`}>Chart of accounts</button>
        <button onClick={() => setTab("recurring")} className={`text-[13px] font-semibold px-3 py-1.5 rounded-md ${tab === "recurring" ? "bg-panel border border-hairline" : "text-[#8a8172]"}`}>Recurring</button>
        <div className="flex-1" />
        <GoldBtn onClick={() => setModal("sale")}><Plus size={14} /> Record sale</GoldBtn>
        <OutlineBtn onClick={() => setModal("expense")}><Plus size={14} /> Record expense</OutlineBtn>
        <OutlineBtn onClick={() => setModal("manual")}>Manual entry</OutlineBtn>
      </div>

      {tab === "journal" && (
        <Panel title="Books lock">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[12.5px] text-[#6b6357]">
              {lockedThrough ? <>Entries dated on or before <strong>{lockedThrough}</strong> can&rsquo;t be posted.</> : "No lock set — entries can be posted to any date."}
            </span>
            <input className="input" style={{ width: 160 }} type="date" defaultValue={lockedThrough ?? ""} onBlur={(e) => saveLock(e.target.value)} />
            {lockedThrough && <button onClick={() => saveLock("")} className="text-[12px] text-teal font-semibold">Clear lock</button>}
          </div>
        </Panel>
      )}

      {tab === "journal" && (
        <>
          <div className="flex justify-end"><SearchBox value={q} onChange={setQ} placeholder="Search journal entries…" /></div>
          <Panel title="Journal entries">
          {entriesF.length === 0 ? <Empty>{entries.length === 0 ? "No entries yet — record a sale or expense to get started." : "No entries match your search."}</Empty> : (
            <table>
              <thead><tr><th>Date</th><th>Memo</th><th>Posted by</th><th>Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th></th></tr></thead>
              <tbody>
                {entriesF.map((e: any) => e.journal_lines.map((l: any, i: number) => (
                  <tr key={l.id}>
                    {i === 0 ? (
                      <>
                        <td rowSpan={e.journal_lines.length}>{e.entry_date}</td>
                        <td rowSpan={e.journal_lines.length}>{e.memo}</td>
                        <td rowSpan={e.journal_lines.length} className="text-[#6b6357]">{postedByNames[e.created_by] ?? "—"}</td>
                      </>
                    ) : null}
                    <td>{accountsById[l.account_id]?.name ?? l.account_id}</td>
                    <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{l.debit ? money(l.debit) : ""}</td>
                    <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{l.credit ? money(l.credit) : ""}</td>
                    {i === 0 ? (
                      <td rowSpan={e.journal_lines.length}>
                        <div className="flex items-center gap-2.5">
                          <button onClick={() => reverseEntry(e.id)} disabled={reversing === e.id} className="text-[11px] font-semibold text-teal">
                            {reversing === e.id ? "…" : "Reverse"}
                          </button>
                          <button onClick={() => setAttachEntry({ id: e.id, memo: e.memo })} className="text-[#8a8172]" title="Attachments">
                            <Paperclip size={13} />
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                )))}
              </tbody>
            </table>
          )}
          </Panel>
        </>
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
                    <button onClick={async () => { if (confirm(`Delete ${a.name}? This cannot be undone.`)) { await mutate(supabase.from("accounts").delete().eq("id", a.id), { successMessage: "Account deleted." }); load(); } }} className="text-red-700" style={{ color: "#A6402F" }}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {tab === "recurring" && (
        <>
          <div className="flex justify-end"><GoldBtn onClick={() => setModal("recurring")}><Plus size={14} /> New recurring entry</GoldBtn></div>
          <Panel title="Recurring entries">
            <div className="text-[12px] text-[#8a8172] mb-3">
              Posting isn&rsquo;t automatic — this tracks what&rsquo;s due and lets you post it in one click. Open this page to check for anything due.
            </div>
            {recurring.length === 0 ? <Empty>No recurring entries yet — e.g. monthly rent or a subscription.</Empty> : (
              <table>
                <thead><tr><th>Memo</th><th>Frequency</th><th>Next due</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {recurring.map((r) => {
                    const due = r.active && r.next_run_date <= todayStr();
                    return (
                      <tr key={r.id}>
                        <td>{r.memo}</td><td className="capitalize">{r.frequency}</td>
                        <td style={{ color: due ? RED : undefined, fontWeight: due ? 600 : 400 }}>{r.next_run_date}</td>
                        <td>{!r.active ? <span className="text-[11px] text-[#8a8172]">Ended</span> : due ? <span className="text-[11px] font-semibold" style={{ color: RED }}>Due</span> : <span className="text-[11px] text-teal">Scheduled</span>}</td>
                        <td>
                          {r.active && (
                            <TinyBtn onClick={async () => { await mutate(supabase.rpc("post_recurring_entry", { target_recurring_id: r.id, post_date: todayStr() }), { successMessage: "Recurring entry posted." }); load(); }}>
                              Post now
                            </TinyBtn>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}

      {accountModal && (
        <AccountModal
          account={accountModal === "new" ? null : accountModal}
          onClose={() => setAccountModal(null)}
          onSave={async (vals) => {
            const res = accountModal === "new"
              ? await mutate(supabase.from("accounts").insert({ tenant_id: effectiveTenantId, code: vals.code, name: vals.name, type: vals.type, is_bank: vals.is_bank }), { successMessage: "Account added." })
              : await mutate(supabase.from("accounts").update({ code: vals.code, name: vals.name, type: vals.type, is_bank: vals.is_bank }).eq("id", (accountModal as Account).id), { successMessage: "Account updated." });
            if (ok(res)) setAccountModal(null);
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
      {modal === "recurring" && (
        <RecurringEntryModal accounts={accounts} onClose={() => setModal(null)}
          onSubmit={async (memo, frequency, startDate, endDate, lines) => {
            const { data: rec } = await mutate(supabase.from("recurring_entries")
              .insert({ tenant_id: effectiveTenantId, memo, frequency, start_date: startDate, next_run_date: startDate, end_date: endDate || null })
              .select().single());
            if (!rec) return;
            const linesRes = await mutate(supabase.from("recurring_entry_lines").insert(lines.map((l) => ({ recurring_entry_id: rec.id, account_id: l.account_id, debit: l.debit, credit: l.credit }))), { successMessage: "Recurring entry saved." });
            if (ok(linesRes)) setModal(null);
            load();
          }} />
      )}
      {attachEntry && (
        <Modal title={`Attachments — ${attachEntry.memo || "Journal entry"}`} onClose={() => setAttachEntry(null)}>
          <Attachments relatedTable="journal_entries" relatedId={attachEntry.id} />
        </Modal>
      )}
    </>
  );
}

function QuickModal({ title, debitDefault, creditDefault, debitLabel, creditLabel, accounts, onClose, onSubmit }:
  { title: string; debitDefault?: string; creditDefault?: string; debitLabel: string; creditLabel: string; accounts: Account[]; onClose: () => void;
    onSubmit: (amount: number, date: string, memo: string, debit: string, credit: string) => void | Promise<void> }) {
  const [amount, setAmount] = useState(""); const [date, setDate] = useState(todayStr()); const [memo, setMemo] = useState("");
  const [debit, setDebit] = useState(debitDefault || ""); const [credit, setCredit] = useState(creditDefault || "");
  const [submitting, setSubmitting] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const n = parseFloat(amount);
        if (!n || n <= 0 || submitting) return;
        setSubmitting(true);
        try { await onSubmit(n, date, memo, debit, credit); } finally { setSubmitting(false); }
      }}>
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
        <button type="submit" disabled={submitting} className="primary-btn mt-4">{submitting ? "Saving…" : "Save entry"}</button>
      </form>
      <ModalStyles />
    </Modal>
  );
}

function ManualModal({ accounts, onClose, onSubmit }:
  { accounts: Account[]; onClose: () => void; onSubmit: (date: string, memo: string, lines: { account_id: string; debit: number; credit: number }[]) => void | Promise<void> }) {
  const [date, setDate] = useState(todayStr()); const [memo, setMemo] = useState("");
  const [lines, setLines] = useState([{ account_id: accounts[0]?.id ?? "", debit: "", credit: "" }, { account_id: accounts[1]?.id ?? "", debit: "", credit: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.005;
  const update = (i: number, field: "account_id" | "debit" | "credit", value: string) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));

  return (
    <Modal title="Manual journal entry" onClose={onClose} wide>
      <form onSubmit={async (e) => {
        e.preventDefault();
        if (!balanced || submitting) return;
        setSubmitting(true);
        try { await onSubmit(date, memo || "Manual entry", lines.map((l) => ({ account_id: l.account_id, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 }))); } finally { setSubmitting(false); }
      }}>
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
        <button type="submit" disabled={!balanced || submitting} className="primary-btn mt-3" style={{ opacity: balanced ? 1 : 0.5 }}>{submitting ? "Saving…" : "Save entry"}</button>
      </form>
      <ModalStyles />
    </Modal>
  );
}

function RecurringEntryModal({ accounts, onClose, onSubmit }:
  { accounts: Account[]; onClose: () => void;
    onSubmit: (memo: string, frequency: "weekly" | "monthly", startDate: string, endDate: string, lines: { account_id: string; debit: number; credit: number }[]) => void | Promise<void> }) {
  const [memo, setMemo] = useState(""); const [frequency, setFrequency] = useState<"weekly" | "monthly">("monthly");
  const [startDate, setStartDate] = useState(todayStr()); const [endDate, setEndDate] = useState("");
  const [lines, setLines] = useState([{ account_id: accounts[0]?.id ?? "", debit: "", credit: "" }, { account_id: accounts[1]?.id ?? "", debit: "", credit: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.005;
  const update = (i: number, field: "account_id" | "debit" | "credit", value: string) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));

  return (
    <Modal title="New recurring entry" onClose={onClose} wide>
      <form onSubmit={async (e) => {
        e.preventDefault();
        if (!balanced || !memo || submitting) return;
        setSubmitting(true);
        try { await onSubmit(memo, frequency, startDate, endDate, lines.map((l) => ({ account_id: l.account_id, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 }))); } finally { setSubmitting(false); }
      }}>
        <Label>Memo</Label>
        <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. Monthly office rent" required />
        <div className="grid grid-cols-3 gap-2.5">
          <div><Label>Frequency</Label>
            <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value as "weekly" | "monthly")}>
              <option value="monthly">Monthly</option><option value="weekly">Weekly</option>
            </select></div>
          <div><Label>Starts</Label><input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></div>
          <div><Label>Ends (optional)</Label><input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
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
        <button type="submit" disabled={!balanced || !memo || submitting} className="primary-btn mt-3" style={{ opacity: balanced && memo ? 1 : 0.5 }}>{submitting ? "Saving…" : "Save template"}</button>
      </form>
      <ModalStyles />
    </Modal>
  );
}

function AccountModal({ account, onClose, onSave }: { account: Account | null; onClose: () => void; onSave: (vals: { code: string; name: string; type: string; is_bank: boolean }) => void | Promise<void> }) {
  const [code, setCode] = useState(account?.code ?? "");
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<Account["type"]>(account?.type ?? "asset");
  const [isBank, setIsBank] = useState((account as any)?.is_bank ?? false);
  const [submitting, setSubmitting] = useState(false);

  return (
    <Modal title={account ? "Edit account" : "New account"} onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        try { await onSave({ code, name, type, is_bank: isBank }); } finally { setSubmitting(false); }
      }}>
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
        <button type="submit" disabled={submitting} className="primary-btn mt-4">{submitting ? "Saving…" : "Save"}</button>
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
