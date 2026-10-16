"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Panel, Empty, Label, GoldBtn, FormStyles } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { expectedAccountType, POSTING_LABEL } from "@/lib/mfgMaster";

type Settings = {
  costing_method: "STANDARD" | "ACTUAL";
  fiscal_year_start: string;
  variance_close_method: "COGS" | "PRORATE";
  oh_close_method: "COGS" | "PRORATE";
  explain_postings: boolean;
};
type Account = { id: string; code: string; name: string; type: string };
type Mapping = { key: string; account: Account | null };
type LogRow = { id: string; event: string; detail: Record<string, unknown>; created_at: string };

const COSTING_LABEL = { STANDARD: "Standard costing", ACTUAL: "Actual costing" } as const;
const CLOSE_LABEL = { COGS: "Close to Cost of Goods Sold", PRORATE: "Prorate across WIP, finished goods and COGS" } as const;

export default function MfgSettingsPage() {
  return <AppShell><SettingsBody /></AppShell>;
}

function SettingsBody() {
  const { effectiveTenantId, profile } = useSession();
  const isTeacher = profile?.role === "teacher";
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [mapping, setMapping] = useState<Mapping[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [costing, setCosting] = useState<Settings["costing_method"]>("STANDARD");
  const [form, setForm] = useState<Omit<Settings, "costing_method">>({ fiscal_year_start: "", variance_close_method: "COGS", oh_close_method: "COGS", explain_postings: true });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    const [s, d, a, l] = await Promise.all([
      supabase.from("mfg_company_settings").select("costing_method, fiscal_year_start, variance_close_method, oh_close_method, explain_postings").eq("tenant_id", effectiveTenantId).maybeSingle(),
      supabase.from("mfg_account_determination").select("key, account_id").eq("tenant_id", effectiveTenantId).order("key"),
      supabase.from("accounts").select("id, code, name, type").eq("tenant_id", effectiveTenantId).order("code"),
      supabase.from("mfg_audit_log").select("id, event, detail, created_at").eq("tenant_id", effectiveTenantId).order("created_at", { ascending: false }).limit(20),
    ]);
    const row = (s.data as Settings | null) ?? null;
    setSettings(row);
    if (row) {
      setCosting(row.costing_method);
      setForm({ fiscal_year_start: row.fiscal_year_start, variance_close_method: row.variance_close_method, oh_close_method: row.oh_close_method, explain_postings: row.explain_postings });
    }
    const accs = (a.data as Account[]) ?? [];
    setAccounts(accs);
    const byId = new Map(accs.map((x) => [x.id, x]));
    setMapping(((d.data as { key: string; account_id: string }[]) ?? []).map((m) => ({ key: m.key, account: byId.get(m.account_id) ?? null })));
    setLog((l.data as LogRow[]) ?? []);
    setLoading(false);
  };
  // load() sets state synchronously before its first await (fetch-on-mount) — intentional.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [effectiveTenantId]);

  const saveCosting = async () => {
    if (!effectiveTenantId || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("set_mfg_costing_method", { target_tenant: effectiveTenantId, new_method: costing }), { successMessage: "Costing method updated." });
    setBusy(false);
    if (ok(res)) load();
  };
  const changeAccount = async (key: string, accountId: string) => {
    if (!effectiveTenantId || busy || !accountId) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_set_account", { p_tenant: effectiveTenantId, p_key: key, p_account: accountId }), { successMessage: "Account changed." });
    setBusy(false);
    load();   // reload either way, so the table shows what is really saved
    return ok(res);
  };
  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveTenantId || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("update_mfg_settings", {
      target_tenant: effectiveTenantId, new_fiscal_year_start: form.fiscal_year_start || null,
      new_variance_close: form.variance_close_method, new_oh_close: form.oh_close_method, new_explain: form.explain_postings,
    }), { successMessage: "Settings saved." });
    setBusy(false);
    if (ok(res)) load();
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>;
  if (!settings) return <Panel title="Manufacturing settings"><Empty>This company has no Manufacturing settings.</Empty></Panel>;

  return (
    <>
      <Panel title="Company settings">
        <div className="grid gap-x-6 gap-y-2 text-[13px]" style={{ gridTemplateColumns: "minmax(160px, 220px) 1fr" }}>
          <span className="text-[#7F8EA0]">Costing method</span><span className="font-semibold">{COSTING_LABEL[settings.costing_method]}</span>
          <span className="text-[#7F8EA0]">Fiscal year starts</span><span className="font-semibold">{settings.fiscal_year_start}</span>
          <span className="text-[#7F8EA0]">Variances at period end</span><span className="font-semibold">{CLOSE_LABEL[settings.variance_close_method]}</span>
          <span className="text-[#7F8EA0]">Over/under-applied overhead</span><span className="font-semibold">{CLOSE_LABEL[settings.oh_close_method]}</span>
          <span className="text-[#7F8EA0]">“Show journal entry” panel</span><span className="font-semibold">{settings.explain_postings ? "On" : "Off"}</span>
        </div>
        {!isTeacher && <div className="text-[12px] text-[#7F8EA0] mt-3">Your teacher controls these settings so every company is graded the same way.</div>}
      </Panel>

      {isTeacher && (
        <>
          <Panel title="Change the costing method (teacher)">
            <div className="text-[12px] text-[#7F8EA0] mb-2">Allowed only when no production orders are open and every posted entry sits inside a locked period. The change is written to the audit log.</div>
            <div className="flex gap-2 flex-wrap items-center">
              <select className="input" style={{ width: 240 }} value={costing} onChange={(e) => setCosting(e.target.value as Settings["costing_method"])}>
                <option value="STANDARD">Standard costing</option>
                <option value="ACTUAL">Actual costing</option>
              </select>
              <GoldBtn onClick={saveCosting} disabled={busy || costing === settings.costing_method}>Change costing method</GoldBtn>
            </div>
            <FormStyles />
          </Panel>

          <Panel title="Other settings (teacher)">
            <form onSubmit={saveSettings}>
              <Label>Fiscal year starts</Label>
              <input className="input" type="date" style={{ maxWidth: 220 }} value={form.fiscal_year_start} onChange={(e) => setForm({ ...form, fiscal_year_start: e.target.value })} required />
              <Label>Purchase and production variances at period end</Label>
              <select className="input" style={{ maxWidth: 380 }} value={form.variance_close_method} onChange={(e) => setForm({ ...form, variance_close_method: e.target.value as Settings["variance_close_method"] })}>
                <option value="COGS">Close to Cost of Goods Sold</option>
                <option value="PRORATE">Prorate across WIP, finished goods and COGS</option>
              </select>
              <Label>Over/under-applied overhead at period end</Label>
              <select className="input" style={{ maxWidth: 380 }} value={form.oh_close_method} onChange={(e) => setForm({ ...form, oh_close_method: e.target.value as Settings["oh_close_method"] })}>
                <option value="COGS">Close to Cost of Goods Sold</option>
                <option value="PRORATE">Prorate across WIP, finished goods and COGS</option>
              </select>
              <label className="flex items-center gap-2 text-[13px] mt-3.5">
                <input type="checkbox" checked={form.explain_postings} onChange={(e) => setForm({ ...form, explain_postings: e.target.checked })} />
                Show the plain-language “journal entry” panel on posting screens
              </label>
              <div className="mt-3"><GoldBtn type="submit" disabled={busy}>Save settings</GoldBtn></div>
            </form>
          </Panel>
        </>
      )}

      <Panel title="Which account each posting uses">
        <div className="text-[12px] text-[#7F8EA0] mb-2">
          Posting functions look accounts up here instead of hard-coding account numbers.
          {isTeacher ? " As the teacher you can point a posting at a different account of the right type; every change is written to the history below." : " Your teacher can change these; you can see which account each posting will use."}
        </div>
        {mapping.length === 0 ? <Empty>No account mapping found.</Empty> : (
          <table>
            <thead><tr><th>Posting</th><th>Key</th><th>Account</th>{isTeacher && <th>Change to</th>}</tr></thead>
            <tbody>
              {mapping.map((m) => {
                const want = expectedAccountType(m.key);
                return (
                  <tr key={m.key}>
                    <td>{POSTING_LABEL[m.key] ?? m.key}</td>
                    <td style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}>{m.key}</td>
                    <td>{m.account ? <><span style={{ color: "#F2B13C", fontWeight: 600 }}>{m.account.code}</span> {m.account.name}</> : "—"}</td>
                    {isTeacher && (
                      <td>
                        <select className="input" style={{ minWidth: 220 }} disabled={busy} value="" aria-label={`Change the account for ${m.key}`}
                          onChange={(e) => changeAccount(m.key, e.target.value)}>
                          <option value="">{want} accounts…</option>
                          {accounts.filter((x) => x.type === want && x.id !== m.account?.id).map((x) => <option key={x.id} value={x.id}>{x.code} {x.name}</option>)}
                        </select>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {isTeacher && <FormStyles />}
      </Panel>

      <Panel title="Settings history">
        {log.length === 0 ? <Empty>Nothing yet.</Empty> : (
          <table>
            <thead><tr><th>When</th><th>What</th><th>Detail</th></tr></thead>
            <tbody>
              {log.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{new Date(r.created_at).toLocaleString("en-PH")}</td>
                  <td>{r.event.replace(/_/g, " ")}</td>
                  <td className="text-[12px] text-[#A3B1C2]">{Object.entries(r.detail ?? {}).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
