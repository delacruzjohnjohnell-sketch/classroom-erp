"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Panel, Modal, Label, GoldBtn, OutlineBtn, TinyBtn, Empty } from "@/components/ui";
import ListReport, { Chip, type ListColumn } from "@/components/ListReport";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { showQueryErrors } from "@/lib/queryErrors";
import { money } from "@/lib/costing";
import { blankLines, totals, typeAmount, type DraftLine } from "@/lib/mfgVouchers";

type Acc = { account_id: string; code: string; name: string; type: string; closing: number };
type AccRow = { id: string; code: string; name: string; type: string; is_bank: boolean };
const today = () => new Date().toISOString().slice(0, 10);

/** The chart of accounts with each account's balance to date. */
export function ChartOfAccountsPanel({ readOnly }: { readOnly: boolean }) {
  const { effectiveTenantId } = useSession();
  const [rows, setRows] = useState<Acc[]>([]);
  const [flags, setFlags] = useState<Record<string, AccRow>>({});
  const [edit, setEdit] = useState<AccRow | "new" | null>(null);
  const [form, setForm] = useState({ code: "", name: "", type: "asset", is_bank: false });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const [b, a] = await Promise.all([
      supabase.rpc("mfg_account_balances", { p_tenant: effectiveTenantId, p_from: null, p_to: null }),
      supabase.from("accounts").select("id, code, name, type, is_bank").eq("tenant_id", effectiveTenantId),
    ]);
    showQueryErrors(b, a);
    setRows(((b.data as Acc[]) ?? []).map((r) => ({ ...r, closing: Number(r.closing) })));
    setFlags(Object.fromEntries(((a.data as AccRow[]) ?? []).map((x) => [x.id, x])));
  }, [effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const open = (a: AccRow | "new") => { setEdit(a); setForm(a === "new" ? { code: "", name: "", type: "asset", is_bank: false } : { code: a.code, name: a.name, type: a.type, is_bank: a.is_bank }); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !edit) return;
    setBusy(true);
    const res = edit === "new"
      ? await mutate(supabase.from("accounts").insert({ tenant_id: effectiveTenantId, ...form }), { successMessage: "Account added." })
      : await mutate(supabase.from("accounts").update(form).eq("id", edit.id), { successMessage: "Account updated." });
    setBusy(false);
    if (ok(res)) { setEdit(null); await load(); }
  };
  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    const res = await mutate(supabase.from("accounts").delete().eq("id", id), { successMessage: "Account deleted." });
    if (ok(res)) await load();
  };

  const signed = (r: Acc) => (r.type === "asset" || r.type === "expense" ? r.closing : -r.closing);
  const columns: ListColumn<Acc>[] = [
    { key: "code", label: "Code", value: (r) => r.code, width: 90 },
    { key: "name", label: "Account", value: (r) => r.name, width: 280 },
    { key: "type", label: "Type", value: (r) => r.type, filter: true, width: 110, render: (r) => <span className="capitalize">{r.type}</span> },
    { key: "bal", label: "Balance", value: signed, align: "right", width: 140, render: (r) => money(signed(r)) },
    ...(readOnly ? [] : [{
      key: "_a", label: "", width: 80, value: () => "",
      render: (r: Acc) => flags[r.account_id] ? (
        <span className="inline-flex gap-2">
          <button onClick={() => open(flags[r.account_id])} className="text-[#7F8EA0]" aria-label={`Edit ${r.name}`}><Pencil size={13} /></button>
          <button onClick={() => remove(r.account_id, r.name)} className="text-[#7F8EA0]" aria-label={`Delete ${r.name}`}><Trash2 size={13} /></button>
        </span>
      ) : null,
    } as ListColumn<Acc>]),
  ];

  return (
    <Panel title="Chart of accounts">
      <ListReport listKey="mfg-coa" rows={rows} columns={columns} rowKey={(r) => r.account_id} exportName="chart-of-accounts" emptyText="No accounts."
        toolbar={!readOnly ? <GoldBtn onClick={() => open("new")}><Plus size={14} /> New account</GoldBtn> : undefined} />
      <div className="text-[11.5px] text-[#7F8EA0] mt-2">Inventory, work in process, GR/IR and applied-cost accounts are run by the system. Posting to them by hand needs a voucher marked as an audit adjustment.</div>
      {edit && (
        <Modal title={edit === "new" ? "New account" : "Edit account"} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <Label>Code</Label><input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. 1050" required />
            <Label>Name</Label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. BDO Checking" required />
            <Label>Type</Label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {["asset", "liability", "equity", "revenue", "expense"].map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
            </select>
            <label className="flex items-center gap-2 text-[13px] mt-3"><input type="checkbox" checked={form.is_bank} onChange={(e) => setForm({ ...form, is_bank: e.target.checked })} /> A bank account</label>
            <div className="flex gap-2 justify-end mt-5"><OutlineBtn type="button" onClick={() => setEdit(null)} disabled={busy}>Cancel</OutlineBtn><GoldBtn type="submit" disabled={busy}>Save</GoldBtn></div>
          </form>
        </Modal>
      )}
    </Panel>
  );
}

type Rec = { id: string; memo: string; frequency: string; next_run_date: string; active: boolean };
/** Entries that repeat (rent, subscriptions): what is due, post it with one click, add a new one. Each posting becomes a voucher. */
export function RecurringPanel({ readOnly }: { readOnly: boolean }) {
  const { effectiveTenantId } = useSession();
  const [rows, setRows] = useState<Rec[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [posting, setPosting] = useState<Rec | null>(null);
  const [postDate, setPostDate] = useState(today());
  const [adding, setAdding] = useState(false);
  const [memo, setMemo] = useState("");
  const [freq, setFreq] = useState("monthly");
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(blankLines());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const [r, a] = await Promise.all([
      supabase.from("recurring_entries").select("id, memo, frequency, next_run_date, active").eq("tenant_id", effectiveTenantId).order("next_run_date"),
      supabase.from("accounts").select("id, code, name").eq("tenant_id", effectiveTenantId).order("code"),
    ]);
    showQueryErrors(r, a);
    setRows((r.data as Rec[]) ?? []);
    setAccounts((a.data as { id: string; code: string; name: string }[]) ?? []);
  }, [effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const postNow = async () => {
    if (!posting || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("post_recurring_entry", { target_recurring_id: posting.id, post_date: postDate }), { successMessage: "Recurring entry posted. Find it in the voucher register." });
    setBusy(false);
    if (ok(res)) { setPosting(null); await load(); }
  };
  const t = totals(lines);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !memo.trim() || !t.balanced || t.debit <= 0) return;
    setBusy(true);
    const rec = await mutate(supabase.from("recurring_entries").insert({ tenant_id: effectiveTenantId, memo: memo.trim(), frequency: freq, start_date: start, next_run_date: start, end_date: end || null }).select().single());
    if (!ok(rec) || !rec.data) { setBusy(false); return; }
    const used = lines.filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0));
    const res = await mutate(supabase.from("recurring_entry_lines").insert(used.map((l) => ({ recurring_entry_id: (rec.data as { id: string }).id, account_id: l.account_id, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 }))), { successMessage: "Recurring entry saved." });
    setBusy(false);
    if (ok(res)) { setAdding(false); setMemo(""); setLines(blankLines()); await load(); }
  };

  return (
    <Panel title="Recurring entries">
      <div className="text-[12px] text-[#7F8EA0] mb-3">Posting isn&rsquo;t automatic. This tracks what is due and posts it in one click; each posting gets its own voucher number and moves the next due date forward.</div>
      {!readOnly && <div className="mb-3"><GoldBtn onClick={() => setAdding(true)}><Plus size={14} /> New recurring entry</GoldBtn></div>}
      {rows.length === 0 ? <Empty>No recurring entries yet — for example monthly rent or a subscription.</Empty> : (
        <table>
          <thead><tr><th>Memo</th><th>Frequency</th><th>Next due</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const due = r.active && r.next_run_date <= today();
              return (
                <tr key={r.id}>
                  <td>{r.memo}</td><td className="capitalize">{r.frequency}</td><td style={{ color: due ? "#FF6B7A" : undefined, fontWeight: due ? 600 : 400 }}>{r.next_run_date}</td>
                  <td>{!r.active ? <Chip label="Ended" tone="muted" /> : due ? <Chip label="Due" tone="bad" /> : <Chip label="Scheduled" tone="good" />}</td>
                  <td>{!readOnly && r.active && <TinyBtn onClick={() => { setPosting(r); setPostDate(r.next_run_date); }}>Post now</TinyBtn>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {posting && (
        <Modal title={`Post “${posting.memo}”`} onClose={() => setPosting(null)}>
          <Label>Post on date</Label><input className="input" type="date" value={postDate} onChange={(e) => setPostDate(e.target.value)} />
          <div className="flex gap-2 justify-end mt-5"><OutlineBtn type="button" onClick={() => setPosting(null)} disabled={busy}>Cancel</OutlineBtn><GoldBtn type="button" onClick={postNow} disabled={busy}>Post entry</GoldBtn></div>
        </Modal>
      )}
      {adding && (
        <Modal title="New recurring entry" onClose={() => setAdding(false)} wide>
          <form onSubmit={create}>
            <Label>Memo</Label><input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. Monthly factory rent" required />
            <div className="grid grid-cols-3 gap-2.5">
              <div><Label>Frequency</Label><select className="input" value={freq} onChange={(e) => setFreq(e.target.value)}><option value="monthly">Monthly</option><option value="weekly">Weekly</option></select></div>
              <div><Label>Starts</Label><input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></div>
              <div><Label>Ends (optional)</Label><input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            </div>
            <div className="mt-2.5">
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2 mb-2 items-center">
                  <select className="input flex-[2]" value={l.account_id} onChange={(e) => setLines((p) => p.map((x, j) => (j === i ? { ...x, account_id: e.target.value } : x)))} aria-label={`Account on line ${i + 1}`}>
                    <option value="">Choose an account…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                  </select>
                  <input className="input flex-1" type="number" min={0} step="0.01" placeholder="Debit" value={l.debit} onChange={(e) => setLines((p) => p.map((x, j) => (j === i ? typeAmount(x, "debit", e.target.value) : x)))} />
                  <input className="input flex-1" type="number" min={0} step="0.01" placeholder="Credit" value={l.credit} onChange={(e) => setLines((p) => p.map((x, j) => (j === i ? typeAmount(x, "credit", e.target.value) : x)))} />
                </div>
              ))}
            </div>
            <div className="text-[12.5px] font-semibold" style={{ color: t.balanced && t.debit > 0 ? "#22D3C5" : "#FF6B7A" }}>Debits {money(t.debit)} · Credits {money(t.credit)} {t.balanced && t.debit > 0 ? "· Balanced" : "· Must balance to save"}</div>
            <div className="flex gap-2 justify-end mt-4"><OutlineBtn type="button" onClick={() => setAdding(false)} disabled={busy}>Cancel</OutlineBtn><GoldBtn type="submit" disabled={busy || !t.balanced || t.debit <= 0 || !memo.trim()}>Save</GoldBtn></div>
          </form>
        </Modal>
      )}
    </Panel>
  );
}
