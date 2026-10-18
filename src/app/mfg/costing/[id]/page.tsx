"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Panel, Empty, Label, GoldBtn, OutlineBtn, ConfirmDialog, FormStyles, KpiCard } from "@/components/ui";
import ListReport, { Chip, type ListColumn } from "@/components/ListReport";
import { useLookups } from "@/components/mfg/useLookups";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { showQueryErrors } from "@/lib/queryErrors";
import { mutate, ok } from "@/lib/mutate";
import {
  ELEMENT_LABEL, ESTIMATE_STATUS_TONE, elementTotals, money, percentOf, revaluationEntry, sentenceFor, unitMoney, type Element,
} from "@/lib/costing";
import { POSTING_LABEL } from "@/lib/mfgMaster";

type Estimate = {
  id: string; document_number: string | null; item_id: string; lot_size: number; costing_date: string; status: string; costing_method: string;
  total_cost: number; unit_cost: number; main_share_pct: number; warnings: string[]; release_entry_id: string | null; created_at: string;
};
type Line = {
  id: string; seq: number; level: number; item_id: string | null; component_item_id: string | null; op_no: number | null; element: Element;
  description: string | null; qty: number | null; uom: string | null; rate: number | null; amount: number;
};
type EItem = { item_id: string; level: number; qty: number; total_cost: number; unit_cost: number };
type RLine = { item_id: string; item_name: string; item_type: string; old_cost: number; new_cost: number; qty_on_hand: number; value_change: number; account_key: string | null };

const BAR: Record<Element, string> = { MATERIAL: "#22D3C5", LABOR: "#F2B13C", MACHINE: "#5AA9FF", VAR_OH: "#B58CFF", FIX_OH: "#FF8FA3" };
const today = () => new Date().toISOString().slice(0, 10);

export default function EstimatePage() {
  return <AppShell><EstimateBody /></AppShell>;
}

function EstimateBody() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { effectiveTenantId, profile } = useSession();
  const { data: lk, loading: lkLoading } = useLookups();
  const readOnly = profile?.role === "teacher";

  const [loading, setLoading] = useState(true);
  const [e, setE] = useState<Estimate | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [items, setItems] = useState<EItem[]>([]);
  const [changes, setChanges] = useState<RLine[]>([]);
  const [accounts, setAccounts] = useState<Record<string, { code: string; name: string }>>({});
  const [explain, setExplain] = useState(true);
  const [date, setDate] = useState(today());
  const [confirm, setConfirm] = useState<null | "mark" | "release">(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    const [h, l, it, rl, det, acc, st] = await Promise.all([
      supabase.from("mfg_cost_estimates").select("*").eq("id", id).maybeSingle(),
      supabase.from("mfg_cost_estimate_lines").select("*").eq("estimate_id", id).order("seq"),
      supabase.from("mfg_cost_estimate_items").select("item_id, level, qty, total_cost, unit_cost").eq("estimate_id", id).order("level"),
      supabase.rpc("mfg_release_lines", { p_est: id }),
      supabase.from("mfg_account_determination").select("key, account_id").eq("tenant_id", effectiveTenantId),
      supabase.from("accounts").select("id, code, name").eq("tenant_id", effectiveTenantId),
      supabase.from("mfg_company_settings").select("explain_postings").eq("tenant_id", effectiveTenantId).maybeSingle(),
    ]);
    showQueryErrors(h, l, it, rl, det, acc, st);
    setE((h.data as Estimate | null) ?? null);
    setLines((l.data as Line[]) ?? []);
    setItems((it.data as EItem[]) ?? []);
    setChanges((rl.data as RLine[]) ?? []);
    const byId = new Map(((acc.data as { id: string; code: string; name: string }[]) ?? []).map((a) => [a.id, a]));
    setAccounts(Object.fromEntries(((det.data as { key: string; account_id: string }[]) ?? []).map((d) => [d.key, byId.get(d.account_id) ?? { code: "?", name: d.key }])));
    setExplain((st.data as { explain_postings?: boolean } | null)?.explain_postings ?? true);
    setLoading(false);
  }, [id, effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const name = (itemId: string | null) => (itemId ? lk.items.find((i) => i.item_id === itemId)?.name ?? "—" : "—");
  const totals = useMemo(() => elementTotals(lines), [lines]);
  const grand = totals.reduce((s, t) => s + t.amount, 0);
  const entry = useMemo(() => revaluationEntry(changes), [changes]);

  const act = async (what: "mark" | "release") => {
    if (busy || !e) return;
    setBusy(true);
    const res = what === "mark"
      ? await mutate(supabase.rpc("mfg_mark_cost_estimate", { p_est: id }), { successMessage: "Marked. The new costs are waiting to be released." })
      : await mutate(supabase.rpc("mfg_release_cost_estimate", { p_est: id, p_date: date }), { successMessage: "Released. The new standard costs are now in force." });
    setBusy(false);
    setConfirm(null);
    if (ok(res)) await load();
  };

  const lineCols: ListColumn<Line>[] = [
    { key: "lvl", label: "Level", value: (l) => l.level, align: "right", width: 70 },
    { key: "item", label: "For item", value: (l) => name(l.item_id), width: 170, filter: true },
    { key: "el", label: "Cost element", value: (l) => ELEMENT_LABEL[l.element] ?? l.element, width: 150, filter: true },
    { key: "desc", label: "What", value: (l) => l.description ?? "", width: 290 },
    { key: "qty", label: "Quantity", value: (l) => (l.qty === null ? null : Number(l.qty)), align: "right", width: 110, render: (l) => (l.qty === null ? "—" : `${Number(l.qty).toLocaleString("en-PH", { maximumFractionDigits: 4 })} ${l.uom ?? ""}`) },
    { key: "rate", label: "Rate", value: (l) => (l.rate === null ? null : Number(l.rate)), align: "right", width: 110, render: (l) => (l.rate === null ? "—" : unitMoney(l.rate)) },
    { key: "amt", label: "Amount", value: (l) => Number(l.amount), align: "right", width: 130, render: (l) => money(l.amount) },
  ];

  if (loading || lkLoading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>;
  if (!e) return <Panel title="Cost estimate"><Empty>That cost estimate was not found.</Empty></Panel>;

  const standard = e.costing_method === "STANDARD";
  const hasWarnings = (e.warnings?.length ?? 0) > 0;
  const movers = changes.filter((c) => Number(c.old_cost) !== Number(c.new_cost));
  const acct = (key: string) => accounts[key] ? `${accounts[key].code} ${accounts[key].name}` : POSTING_LABEL[key] ?? key;

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <OutlineBtn onClick={() => router.push("/mfg/costing")}><ArrowLeft size={13} /> All estimates</OutlineBtn>
        <h1 className="text-[20px] font-semibold">{e.document_number} · {name(e.item_id)}</h1>
        <Chip label={e.status} tone={ESTIMATE_STATUS_TONE[e.status] ?? "muted"} />
        <div className="ml-auto flex gap-2 flex-wrap">
          {!readOnly && e.status === "DRAFT" && <GoldBtn onClick={() => setConfirm("mark")} disabled={busy || !standard || hasWarnings}
            title={!standard ? "Estimates only set standard costs under standard costing" : hasWarnings ? "Fix the warnings first" : undefined}>Mark this cost</GoldBtn>}
          {!readOnly && e.status === "MARKED" && <GoldBtn onClick={() => setConfirm("release")} disabled={busy}>Release as standard cost</GoldBtn>}
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <KpiCard icon={<span>₱</span>} label="Unit cost" value={unitMoney(e.unit_cost)} accent="#F2B13C" />
        <KpiCard icon={<span>Σ</span>} label={`Cost of ${Number(e.lot_size).toLocaleString("en-PH")} units`} value={money(e.total_cost)} />
        <KpiCard icon={<span>#</span>} label="Costing date" value={e.costing_date} />
        <KpiCard icon={<span>%</span>} label="Carried by this item" value={`${Number(e.main_share_pct)}%`} />
      </div>
      {Number(e.main_share_pct) < 100 && (
        <div className="text-[12px] text-[#A3B1C2]">The other {100 - Number(e.main_share_pct)}% of the lot&rsquo;s cost belongs to its co-products and by-products, which are listed below with their own unit costs.</div>
      )}
      {!standard && <div className="text-[12.5px] px-3 py-2 rounded-md border border-[rgba(242,177,60,0.4)] bg-[rgba(242,177,60,0.08)]">Your company uses actual costing, so this estimate is for planning only. It can&rsquo;t be marked or released.</div>}

      {hasWarnings && (
        <Panel title="Warnings">
          <div className="text-[12px] text-[#7F8EA0] mb-2">The estimate was still worked out, but these gaps mean it is not complete. Fix them, then make a new estimate.</div>
          <ul className="flex flex-col gap-1.5">
            {e.warnings.map((w, i) => <li key={i} className="flex gap-2 text-[13px]"><AlertTriangle size={14} className="shrink-0 mt-0.5" color="#F2B13C" />{w}</li>)}
          </ul>
        </Panel>
      )}

      <Panel title="Where the cost comes from">
        {totals.length === 0 ? <Empty>No cost lines.</Empty> : (
          <div className="flex flex-col gap-2.5">
            {totals.map((t) => (
              <div key={t.element} className="grid items-center gap-3" style={{ gridTemplateColumns: "150px 1fr 130px 60px" }}>
                <div className="text-[13px]">{ELEMENT_LABEL[t.element]}</div>
                <div className="h-2.5 rounded-full bg-[#1B2634] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${percentOf(t.amount, grand)}%`, background: BAR[t.element] }} /></div>
                <div className="text-right text-[13px]" style={{ fontVariantNumeric: "tabular-nums" }}>{money(t.amount)}</div>
                <div className="text-right text-[12px] text-[#A3B1C2]">{percentOf(t.amount, grand)}%</div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Cost of each item in the structure">
        <table>
          <thead><tr><th>Item</th><th style={{ textAlign: "right" }}>Made in this estimate</th><th style={{ textAlign: "right" }}>Cost per unit</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.item_id}>
                <td style={{ paddingLeft: 10 + i.level * 18 }}>{i.level > 0 && <span className="text-[#7F8EA0]">└ </span>}{name(i.item_id)}{i.item_id === e.item_id ? <span className="text-[#7F8EA0]"> (the item itself)</span> : null}</td>
                <td style={{ textAlign: "right" }}>{Number(i.qty).toLocaleString("en-PH", { maximumFractionDigits: 4 })}</td>
                <td style={{ textAlign: "right" }}>{unitMoney(i.unit_cost)}</td>
                <td style={{ textAlign: "right" }}>{money(i.total_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Every cost line">
        <ListReport listKey="mfg-estimate-lines" rows={lines} columns={lineCols} rowKey={(l) => l.id} exportName={`${e.document_number ?? "estimate"}-lines`} emptyText="No lines." />
      </Panel>

      {(e.status === "MARKED" || e.status === "RELEASED") && movers.length > 0 && (
        <Panel title={e.status === "MARKED" ? "What releasing will change" : "What this release changed"}>
          <table>
            <thead><tr><th>Item</th><th style={{ textAlign: "right" }}>{e.status === "MARKED" ? "Standard now" : "Standard before"}</th><th style={{ textAlign: "right" }}>New standard</th><th style={{ textAlign: "right" }}>On hand</th><th style={{ textAlign: "right" }}>Stock value change</th></tr></thead>
            <tbody>
              {movers.map((c) => (
                <tr key={c.item_id}>
                  <td>{c.item_name}</td><td style={{ textAlign: "right" }}>{unitMoney(c.old_cost)}</td><td style={{ textAlign: "right" }}>{unitMoney(c.new_cost)}</td>
                  <td style={{ textAlign: "right" }}>{Number(c.qty_on_hand).toLocaleString("en-PH")}</td>
                  <td style={{ textAlign: "right" }}>{Number(c.value_change) === 0 ? "—" : money(c.value_change)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {e.status === "MARKED" && !readOnly && (
        <Panel title="Release">
          <div className="grid gap-x-3" style={{ gridTemplateColumns: "minmax(180px, 220px) 1fr", alignItems: "end" }}>
            <div><Label>New costs start on</Label><input className="input" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} /></div>
            <div className="text-[12px] text-[#7F8EA0] pb-2">Releasing makes these the standard costs for every item above and revalues stock you already hold on that date.</div>
          </div>
          {explain && (
            <div className="mt-4">
              <div className="text-[11.5px] uppercase tracking-[0.08em] text-[#7F8EA0] mb-1.5" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>Journal entry this will post</div>
              {entry.length === 0 ? (
                <div className="text-[13px] text-[#A3B1C2]">None. You hold no stock of these items yet, so there is nothing to revalue; only the standard costs change.</div>
              ) : (
                <table>
                  <thead><tr><th>Account</th><th style={{ textAlign: "right" }}>Debit</th><th style={{ textAlign: "right" }}>Credit</th><th>In plain words</th></tr></thead>
                  <tbody>
                    {entry.map((l) => (
                      <tr key={l.account_key}>
                        <td>{acct(l.account_key)}</td>
                        <td style={{ textAlign: "right" }}>{l.debit ? money(l.debit) : ""}</td><td style={{ textAlign: "right" }}>{l.credit ? money(l.credit) : ""}</td>
                        <td className="text-[12px] text-[#A3B1C2]">{sentenceFor(l, acct(l.account_key))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </Panel>
      )}

      {e.status === "RELEASED" && e.release_entry_id && <div className="text-[12.5px] text-[#A3B1C2]">This release posted a revaluation entry to the general ledger (see Finance → Journal).</div>}

      {confirm === "mark" && <ConfirmDialog title="Mark this cost" confirmLabel="Mark" busy={busy} onConfirm={() => act("mark")} onCancel={() => setConfirm(null)}
        message="Marking saves these costs as the future standard cost of each item, ready to release. Nothing in your books changes yet. Marking another estimate of the same item replaces this one." />}
      {confirm === "release" && <ConfirmDialog title="Release as standard cost" confirmLabel="Release" busy={busy} onConfirm={() => act("release")} onCancel={() => setConfirm(null)}
        message={<>From <b>{date}</b> these become the standard costs. {entry.length > 0 ? "Stock you hold is revalued with the journal entry shown on the page." : "No stock is held, so no journal entry is made."} This can&rsquo;t be undone; to change a cost later, make and release a new estimate.</>} />}
      <FormStyles />
    </>
  );
}
