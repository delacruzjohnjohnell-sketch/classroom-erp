"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Panel, Empty, Label, GoldBtn, OutlineBtn, TinyBtn, ConfirmDialog, FormStyles } from "@/components/ui";
import { Chip, statusTone } from "@/components/ListReport";
import { useLookups } from "@/components/mfg/useLookups";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { BOM_KINDS, bomSchema, firstError } from "@/lib/mfgMaster";

type Line = { component_item_id: string; qty: string; uom: string; scrap_pct: string; is_phantom: boolean; kind: keyof typeof BOM_KINDS; cost_share_pct: string };
type Head = { item_id: string; alt_no: string; base_qty: string; valid_from: string; valid_to: string; description: string };
type Meta = { id: string; document_number: string | null; version: number; status: string };
type ExplodeRow = { seq: number; level: number; path: string; item_id: string; qty: number; uom: string; base_qty: number; base_uom: string; scrap_pct: number; is_phantom: boolean; has_bom: boolean };
type UsedRow = { lvl: number; bom_id: string; document_number: string; parent_name: string; version: number; alt_no: number; status: string; qty: number; uom: string };
type CompareRow = { component_item_id: string; component_name: string; kind: string; change: string; qty_a: number | null; uom_a: string | null; scrap_a: number | null; qty_b: number | null; uom_b: string | null; scrap_b: number | null };

const today = () => new Date().toISOString().slice(0, 10);
const blankLine = (): Line => ({ component_item_id: "", qty: "1", uom: "", scrap_pct: "0", is_phantom: false, kind: "COMPONENT", cost_share_pct: "0" });
const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(Number(v)));
const CHANGE_TONE = { ADDED: "good", REMOVED: "bad", CHANGED: "warn", SAME: "muted" } as const;

export default function BomPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>}>
        <BomBody />
      </Suspense>
    </AppShell>
  );
}

function BomBody() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { effectiveTenantId, profile } = useSession();
  const { data: lk, loading: lkLoading } = useLookups();
  const isNew = id === "new";
  const isTeacher = profile?.role === "teacher";

  const [loading, setLoading] = useState(!isNew);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [head, setHead] = useState<Head>({ item_id: search.get("item") ?? "", alt_no: "1", base_qty: "1", valid_from: today(), valid_to: "", description: "" });
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [dirty, setDirty] = useState(isNew);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | "activate" | "obsolete" | "delete">(null);
  const [siblings, setSiblings] = useState<{ id: string; document_number: string | null; version: number; alt_no: number; status: string }[]>([]);

  const [exQty, setExQty] = useState("1");
  const [exDate, setExDate] = useState(today());
  const [exRows, setExRows] = useState<ExplodeRow[] | null>(null);
  const [multi, setMulti] = useState(false);
  const [used, setUsed] = useState<UsedRow[] | null>(null);
  const [cmpWith, setCmpWith] = useState("");
  const [cmp, setCmp] = useState<CompareRow[] | null>(null);

  const editable = !isTeacher && (isNew || meta?.status === "DRAFT");
  const item = (itemId: string) => lk.items.find((i) => i.item_id === itemId);

  const load = useCallback(async () => {
    if (isNew || !effectiveTenantId) return;
    setLoading(true);
    const [b, l] = await Promise.all([
      supabase.from("mfg_boms").select("*").eq("id", id).maybeSingle(),
      supabase.from("mfg_bom_items").select("*").eq("bom_id", id).order("line_no"),
    ]);
    const row = b.data as (Meta & { item_id: string; alt_no: number; base_qty: number; valid_from: string; valid_to: string | null; description: string | null }) | null;
    if (row) {
      setMeta({ id: row.id, document_number: row.document_number, version: row.version, status: row.status });
      setHead({ item_id: row.item_id, alt_no: String(row.alt_no), base_qty: String(Number(row.base_qty)), valid_from: row.valid_from, valid_to: row.valid_to ?? "", description: row.description ?? "" });
      setLines(((l.data as Record<string, unknown>[]) ?? []).map((x) => ({
        component_item_id: String(x.component_item_id), qty: String(Number(x.qty)), uom: String(x.uom), scrap_pct: String(Number(x.scrap_pct)),
        is_phantom: !!x.is_phantom, kind: x.kind as Line["kind"], cost_share_pct: String(Number(x.cost_share_pct)),
      })));
      const sib = await supabase.from("mfg_boms").select("id, document_number, version, alt_no, status").eq("item_id", row.item_id).neq("id", id).order("version");
      setSiblings((sib.data as typeof siblings) ?? []);
    }
    setDirty(false);
    setLoading(false);
  }, [id, isNew, effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const setH = (patch: Partial<Head>) => { setHead({ ...head, ...patch }); setDirty(true); };
  const setL = (i: number, patch: Partial<Line>) => { setLines(lines.map((x, j) => (j === i ? { ...x, ...patch } : x))); setDirty(true); };

  const makeItems = useMemo(() => lk.items.filter((i) => i.make_or_buy === "MAKE" && i.active), [lk.items]);
  const partItems = useMemo(() => lk.items.filter((i) => i.active && i.item_id !== head.item_id), [lk.items, head.item_id]);

  const save = async () => {
    if (busy || !editable) return;
    const parsed = bomSchema.safeParse({ ...head, lines });
    if (!parsed.success) { toast.error(firstError(parsed.error)); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_save_bom", { p_bom_id: isNew ? null : id, p_data: parsed.data }), { successMessage: "Saved as a draft." });
    setBusy(false);
    if (!ok(res)) return;
    if (isNew) router.replace(`/mfg/master/bom/${res.data as string}`);
    else await load();
  };

  const act = async (what: "activate" | "obsolete" | "delete" | "copy") => {
    if (busy || isNew) return;
    setBusy(true);
    const fn = { activate: "mfg_activate_bom", obsolete: "mfg_obsolete_bom", delete: "mfg_delete_bom", copy: "mfg_copy_bom" }[what];
    const res = await mutate(supabase.rpc(fn, { p_bom_id: id }), {
      successMessage: { activate: "Activated.", obsolete: "Made obsolete.", delete: "Draft deleted.", copy: "New version created as a draft." }[what],
    });
    setBusy(false);
    setConfirm(null);
    if (!ok(res)) return;
    if (what === "delete") router.replace("/mfg/master?tab=boms");
    else if (what === "copy") router.push(`/mfg/master/bom/${res.data as string}`);
    else await load();
  };

  const explode = async () => {
    const res = await mutate(supabase.rpc("mfg_explode_bom", { p_item: head.item_id, p_qty: Number(exQty), p_date: exDate, p_alt: Number(head.alt_no) || 1 }));
    setExRows(ok(res) ? (res.data as ExplodeRow[]) : null);
  };
  const whereUsed = async (multilevel: boolean) => {
    setMulti(multilevel);
    const res = await mutate(supabase.rpc("mfg_where_used", { p_item: head.item_id, p_multilevel: multilevel }));
    setUsed(ok(res) ? (res.data as UsedRow[]) : null);
  };
  const compare = async (otherId: string) => {
    setCmpWith(otherId);
    if (!otherId) { setCmp(null); return; }
    const res = await mutate(supabase.rpc("mfg_compare_boms", { p_a: id, p_b: otherId }));
    setCmp(ok(res) ? (res.data as CompareRow[]) : null);
  };

  if (loading || lkLoading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>;
  if (!isNew && !meta) return <Panel title="Bill of materials"><Empty>That bill of materials was not found.</Empty></Panel>;

  const parentItem = item(head.item_id);
  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <OutlineBtn onClick={() => router.push("/mfg/master?tab=boms")}><ArrowLeft size={13} /> All BOMs</OutlineBtn>
        <h1 className="text-[20px] font-semibold">{isNew ? "New bill of materials" : `${meta?.document_number} · version ${meta?.version}`}</h1>
        {meta && <Chip label={meta.status} tone={statusTone(meta.status)} />}
        {parentItem && <span className="text-[12.5px] text-[#A3B1C2]">{parentItem.name} · low-level code {parentItem.low_level_code}</span>}
        <div className="ml-auto flex gap-2 flex-wrap">
          {editable && <GoldBtn onClick={save} disabled={busy || !dirty}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Save draft</GoldBtn>}
          {!isNew && !isTeacher && meta?.status === "DRAFT" && <GoldBtn onClick={() => setConfirm("activate")} disabled={busy || dirty} title={dirty ? "Save your changes first" : undefined}>Activate</GoldBtn>}
          {!isNew && !isTeacher && <OutlineBtn onClick={() => act("copy")} disabled={busy || dirty}><Copy size={13} /> New version</OutlineBtn>}
          {!isNew && !isTeacher && meta?.status !== "OBSOLETE" && meta?.status !== "DRAFT" && <OutlineBtn onClick={() => setConfirm("obsolete")} disabled={busy}>Make obsolete</OutlineBtn>}
          {!isNew && !isTeacher && meta?.status === "DRAFT" && <OutlineBtn onClick={() => setConfirm("delete")} disabled={busy} style={{ color: "#FF6B7A", borderColor: "rgba(255,107,122,0.5)" }}><Trash2 size={13} /> Delete draft</OutlineBtn>}
        </div>
      </div>
      {!editable && !isTeacher && !isNew && <div className="text-[12px] text-[#7F8EA0]">Only a draft can be edited. To change this structure, make a new version.</div>}

      <Panel title="Header">
        <div className="grid gap-x-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <div style={{ gridColumn: "span 2" }}><Label>Item this makes</Label>
            <select className="input" disabled={!isNew || !editable} value={head.item_id} onChange={(e) => setH({ item_id: e.target.value })}>
              <option value="">Choose…</option>
              {makeItems.map((i) => <option key={i.item_id} value={i.item_id}>{i.sku} — {i.name}</option>)}
            </select>
          </div>
          <div><Label>Alternative</Label><input className="input" type="number" min={1} step={1} disabled={!isNew || !editable} value={head.alt_no} onChange={(e) => setH({ alt_no: e.target.value })} /></div>
          <div><Label>Quantity made {parentItem ? `(${parentItem.base_uom})` : ""}</Label><input className="input" type="number" min={0} step="any" disabled={!editable} value={head.base_qty} onChange={(e) => setH({ base_qty: e.target.value })} /></div>
          <div><Label>Valid from</Label><input className="input" type="date" disabled={!editable} value={head.valid_from} onChange={(e) => setH({ valid_from: e.target.value })} /></div>
          <div><Label>Valid to (optional)</Label><input className="input" type="date" disabled={!editable} value={head.valid_to} onChange={(e) => setH({ valid_to: e.target.value })} /></div>
        </div>
        <Label>Note</Label>
        <input className="input" disabled={!editable} value={head.description} onChange={(e) => setH({ description: e.target.value })} placeholder="What changed in this version?" />
      </Panel>

      <Panel title="Components and outputs">
        <div className="overflow-x-auto">
          <table style={{ minWidth: 820 }}>
            <thead><tr><th style={{ width: 30 }}>#</th><th>Item</th><th style={{ width: 130 }}>Type</th><th style={{ width: 100 }}>Quantity</th><th style={{ width: 90 }}>Unit</th><th style={{ width: 80 }}>Scrap %</th><th style={{ width: 80 }}>Phantom</th><th style={{ width: 90 }}>Cost share %</th>{editable && <th style={{ width: 40 }} />}</tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <select className="input" disabled={!editable} value={l.component_item_id} aria-label={`Item on line ${i + 1}`}
                      onChange={(e) => setL(i, { component_item_id: e.target.value, uom: item(e.target.value)?.base_uom ?? l.uom })}>
                      <option value="">Choose…</option>
                      {partItems.map((p) => <option key={p.item_id} value={p.item_id}>{p.sku} — {p.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="input" disabled={!editable} value={l.kind} onChange={(e) => setL(i, { kind: e.target.value as Line["kind"], is_phantom: false })}>
                      {Object.entries(BOM_KINDS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                    </select>
                  </td>
                  <td><input className="input" type="number" min={0} step="any" disabled={!editable} value={l.qty} onChange={(e) => setL(i, { qty: e.target.value })} /></td>
                  <td>
                    <select className="input" disabled={!editable} value={l.uom} onChange={(e) => setL(i, { uom: e.target.value })}>
                      <option value="">—</option>
                      {lk.uoms.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
                    </select>
                  </td>
                  <td><input className="input" type="number" min={0} step="any" disabled={!editable || l.kind !== "COMPONENT"} value={l.scrap_pct} onChange={(e) => setL(i, { scrap_pct: e.target.value })} /></td>
                  <td style={{ textAlign: "center" }}><input type="checkbox" disabled={!editable || l.kind !== "COMPONENT"} checked={l.is_phantom} onChange={(e) => setL(i, { is_phantom: e.target.checked })} aria-label="Phantom" /></td>
                  <td><input className="input" type="number" min={0} max={100} step="any" disabled={!editable || l.kind === "COMPONENT"} value={l.cost_share_pct} onChange={(e) => setL(i, { cost_share_pct: e.target.value })} /></td>
                  {editable && <td><TinyBtn onClick={() => { setLines(lines.filter((_, j) => j !== i)); setDirty(true); }} aria-label={`Remove line ${i + 1}`}><Trash2 size={11} /></TinyBtn></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable && <div className="mt-3"><OutlineBtn onClick={() => { setLines([...lines, blankLine()]); setDirty(true); }}><Plus size={13} /> Add line</OutlineBtn></div>}
        <div className="text-[11.5px] text-[#7F8EA0] mt-3">
          Scrap % adds that share on top of the quantity (5% scrap on 4 pieces needs 4.2). A phantom is built on the way and not stocked, so its own parts are needed instead.
          Co-products and by-products are outputs, not requirements; their cost shares split the cost of making them.
        </div>
      </Panel>

      {!isNew && (
        <>
          <Panel title="Explode the structure">
            <div className="flex flex-wrap gap-3 items-end">
              <div><Label>Quantity to make {parentItem ? `(${parentItem.base_uom})` : ""}</Label><input className="input" style={{ width: 120 }} type="number" min={0} step="any" value={exQty} onChange={(e) => setExQty(e.target.value)} /></div>
              <div><Label>On date</Label><input className="input" style={{ width: 160 }} type="date" value={exDate} onChange={(e) => setExDate(e.target.value)} /></div>
              <GoldBtn onClick={explode}>Explode</GoldBtn>
            </div>
            <div className="text-[11.5px] text-[#7F8EA0] mt-2">Uses the <b>active</b> structure on that date, all the way down, including parts of sub-assemblies. Draft versions are not used.</div>
            {exRows && (
              <table className="mt-3">
                <thead><tr><th>Item</th><th style={{ textAlign: "right" }}>Needed</th><th>Unit</th><th style={{ textAlign: "right" }}>In stock unit</th><th>Notes</th></tr></thead>
                <tbody>
                  {exRows.map((r) => (
                    <tr key={r.seq}>
                      <td style={{ paddingLeft: 10 + r.level * 18 }}>{r.level > 0 && <span className="text-[#7F8EA0]">└ </span>}{item(r.item_id)?.name ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>{n(r.qty)}</td><td>{r.uom}</td>
                      <td style={{ textAlign: "right" }}>{r.level === 0 ? "—" : `${n(r.base_qty)} ${r.base_uom}`}</td>
                      <td className="text-[12px] text-[#A3B1C2]">{[r.level === 0 ? "the item itself" : "", r.is_phantom ? "phantom" : "", r.has_bom && r.level > 0 ? "made in-house" : "", r.scrap_pct > 0 ? `${n(r.scrap_pct)}% scrap` : ""].filter(Boolean).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title="Where this item is used">
            <div className="flex gap-2">
              <OutlineBtn onClick={() => whereUsed(false)}>Direct uses</OutlineBtn>
              <OutlineBtn onClick={() => whereUsed(true)}>All levels up</OutlineBtn>
            </div>
            {used && (used.length === 0 ? <Empty>{parentItem?.name} is not a component of any other bill of materials.</Empty> : (
              <table className="mt-3">
                <thead><tr><th>Level</th><th>BOM</th><th>Item it goes into</th><th>Version</th><th>Status</th><th style={{ textAlign: "right" }}>Quantity</th></tr></thead>
                <tbody>
                  {used.map((u, i) => (
                    <tr key={i} onClick={() => router.push(`/mfg/master/bom/${u.bom_id}`)} style={{ cursor: "pointer" }}>
                      <td>{multi ? u.lvl : "—"}</td><td>{u.document_number}</td><td>{u.parent_name}</td><td>v{u.version}{u.alt_no > 1 ? ` · alt ${u.alt_no}` : ""}</td>
                      <td><Chip label={u.status} tone={statusTone(u.status)} /></td><td style={{ textAlign: "right" }}>{n(u.qty)} {u.uom}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
            <div className="text-[11.5px] text-[#7F8EA0] mt-2">This shows where <b>{parentItem?.name}</b> is a component, so you can see what a change to it would reach.</div>
          </Panel>

          <Panel title="Compare with another version">
            {siblings.length === 0 ? <Empty>There is no other version of this item&rsquo;s bill of materials to compare with yet.</Empty> : (
              <>
                <select className="input" style={{ maxWidth: 360 }} value={cmpWith} onChange={(e) => compare(e.target.value)}>
                  <option value="">Choose a version…</option>
                  {siblings.map((s) => <option key={s.id} value={s.id}>{s.document_number} · v{s.version}{s.alt_no > 1 ? ` · alt ${s.alt_no}` : ""} · {s.status}</option>)}
                </select>
                {cmp && (
                  <table className="mt-3">
                    <thead><tr><th>Component</th><th>Change</th><th style={{ textAlign: "right" }}>This version (per 1)</th><th style={{ textAlign: "right" }}>Other version (per 1)</th></tr></thead>
                    <tbody>
                      {cmp.map((c, i) => (
                        <tr key={i}>
                          <td>{c.component_name}{c.kind !== "COMPONENT" ? <span className="text-[#7F8EA0]"> ({BOM_KINDS[c.kind as keyof typeof BOM_KINDS]})</span> : null}</td>
                          <td><Chip label={c.change} tone={CHANGE_TONE[c.change as keyof typeof CHANGE_TONE] ?? "muted"} /></td>
                          <td style={{ textAlign: "right" }}>{c.qty_a === null ? "—" : `${n(c.qty_a)} ${c.uom_a}${Number(c.scrap_a) > 0 ? ` (+${n(c.scrap_a)}%)` : ""}`}</td>
                          <td style={{ textAlign: "right" }}>{c.qty_b === null ? "—" : `${n(c.qty_b)} ${c.uom_b}${Number(c.scrap_b) > 0 ? ` (+${n(c.scrap_b)}%)` : ""}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </Panel>
        </>
      )}

      {confirm === "activate" && <ConfirmDialog title="Activate this bill of materials" confirmLabel="Activate" busy={busy} onConfirm={() => act("activate")} onCancel={() => setConfirm(null)}
        message="Once active it can't be edited, only copied to a new version. If it starts after an older active version, that older one will end the day before." />}
      {confirm === "obsolete" && <ConfirmDialog title="Make obsolete" confirmLabel="Make obsolete" danger busy={busy} onConfirm={() => act("obsolete")} onCancel={() => setConfirm(null)}
        message="Are you sure? An obsolete version is kept for history but can't be used for production." />}
      {confirm === "delete" && <ConfirmDialog title="Delete this draft" confirmLabel="Delete" danger busy={busy} onConfirm={() => act("delete")} onCancel={() => setConfirm(null)}
        message="Are you sure you want to delete this draft? This can't be undone." />}
      <FormStyles />
    </>
  );
}
