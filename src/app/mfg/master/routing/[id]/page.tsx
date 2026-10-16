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
import { CONTROL_KEYS, firstError, routingSchema } from "@/lib/mfgMaster";

type Op = { op_no: string; description: string; work_center_id: string; setup_min: string; run_min_per_unit: string; labor_min_per_unit: string; machine_min_per_unit: string; teardown_min: string; queue_min: string; move_min: string; control_key: keyof typeof CONTROL_KEYS };
type Head = { item_id: string; alt_no: string; description: string };
type Meta = { id: string; document_number: string | null; version: number; status: string };
type LoadRow = { op_no: number; description: string | null; work_center_id: string; work_min: number; wait_min: number; setup_min: number; run_min: number; teardown_min: number };

const blankOp = (no: number): Op => ({ op_no: String(no), description: "", work_center_id: "", setup_min: "0", run_min_per_unit: "0", labor_min_per_unit: "", machine_min_per_unit: "", teardown_min: "0", queue_min: "0", move_min: "0", control_key: "PP01" });
const hm = (min: number) => `${Math.floor(min / 60)} h ${Math.round(min % 60)} min`;

export default function RoutingPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>}>
        <RoutingBody />
      </Suspense>
    </AppShell>
  );
}

function RoutingBody() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { effectiveTenantId, profile } = useSession();
  const { data: lk, loading: lkLoading } = useLookups();
  const isNew = id === "new";
  const isTeacher = profile?.role === "teacher";

  const [loading, setLoading] = useState(!isNew);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [head, setHead] = useState<Head>({ item_id: search.get("item") ?? "", alt_no: "1", description: "" });
  const [ops, setOps] = useState<Op[]>([blankOp(10)]);
  const [lineNos, setLineNos] = useState<Record<number, number[]>>({});
  const [dirty, setDirty] = useState(isNew);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | "activate" | "obsolete" | "delete">(null);
  const [qty, setQty] = useState("1");
  const [loadRows, setLoadRows] = useState<LoadRow[] | null>(null);

  const editable = !isTeacher && (isNew || meta?.status === "DRAFT");
  const makeItems = useMemo(() => lk.items.filter((i) => i.make_or_buy === "MAKE" && i.active), [lk.items]);
  const activeCenters = useMemo(() => lk.workCenters.filter((w) => w.active), [lk.workCenters]);

  const load = useCallback(async () => {
    if (isNew || !effectiveTenantId) return;
    setLoading(true);
    const [r, o] = await Promise.all([
      supabase.from("mfg_routings").select("*").eq("id", id).maybeSingle(),
      supabase.from("mfg_routing_ops").select("*").eq("routing_id", id).order("op_no"),
    ]);
    const row = r.data as (Meta & { item_id: string; alt_no: number; description: string | null }) | null;
    if (row) {
      setMeta({ id: row.id, document_number: row.document_number, version: row.version, status: row.status });
      setHead({ item_id: row.item_id, alt_no: String(row.alt_no), description: row.description ?? "" });
      const raw = (o.data as Record<string, unknown>[]) ?? [];
      setOps(raw.map((x) => ({
        op_no: String(x.op_no), description: String(x.description ?? ""), work_center_id: String(x.work_center_id), setup_min: String(Number(x.setup_min)),
        run_min_per_unit: String(Number(x.run_min_per_unit)),
        labor_min_per_unit: x.labor_min_per_unit == null ? "" : String(Number(x.labor_min_per_unit)),
        machine_min_per_unit: x.machine_min_per_unit == null ? "" : String(Number(x.machine_min_per_unit)), teardown_min: String(Number(x.teardown_min)), queue_min: String(Number(x.queue_min)),
        move_min: String(Number(x.move_min)), control_key: x.control_key as Op["control_key"],
      })));
      setLineNos(Object.fromEntries(raw.map((x) => [Number(x.op_no), (x.component_line_nos as number[]) ?? []])));
    }
    setDirty(false);
    setLoading(false);
  }, [id, isNew, effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const setH = (patch: Partial<Head>) => { setHead({ ...head, ...patch }); setDirty(true); };
  const setO = (i: number, patch: Partial<Op>) => { setOps(ops.map((x, j) => (j === i ? { ...x, ...patch } : x))); setDirty(true); };

  const save = async () => {
    if (busy || !editable) return;
    const input = { ...head, ops: ops.map((o) => ({ ...o, component_line_nos: lineNos[Number(o.op_no)] ?? [] })) };
    const parsed = routingSchema.safeParse(input);
    if (!parsed.success) { toast.error(firstError(parsed.error)); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_save_routing", { p_routing_id: isNew ? null : id, p_data: parsed.data }), { successMessage: "Saved as a draft." });
    setBusy(false);
    if (!ok(res)) return;
    if (isNew) router.replace(`/mfg/master/routing/${res.data as string}`);
    else await load();
  };

  const act = async (what: "activate" | "obsolete" | "delete" | "copy") => {
    if (busy || isNew) return;
    setBusy(true);
    const fn = { activate: "mfg_activate_routing", obsolete: "mfg_obsolete_routing", delete: "mfg_delete_routing", copy: "mfg_copy_routing" }[what];
    const res = await mutate(supabase.rpc(fn, { p_routing_id: id }), {
      successMessage: { activate: "Activated.", obsolete: "Made obsolete.", delete: "Draft deleted.", copy: "New version created as a draft." }[what],
    });
    setBusy(false);
    setConfirm(null);
    if (!ok(res)) return;
    if (what === "delete") router.replace("/mfg/master?tab=routings");
    else if (what === "copy") router.push(`/mfg/master/routing/${res.data as string}`);
    else await load();
  };

  const calc = async () => {
    const res = await mutate(supabase.rpc("mfg_routing_load", { p_routing_id: id, p_qty: Number(qty) }));
    setLoadRows(ok(res) ? (res.data as LoadRow[]) : null);
  };

  if (loading || lkLoading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>;
  if (!isNew && !meta) return <Panel title="Routing"><Empty>That routing was not found.</Empty></Panel>;

  const wcName = (wid: string) => lk.workCenters.find((w) => w.id === wid)?.name ?? "—";
  const numCell = (i: number, k: keyof Op, w = 90) => (
    <input className="input" style={{ width: w }} type="number" min={0} step="any" disabled={!editable} value={ops[i][k]} onChange={(e) => setO(i, { [k]: e.target.value } as Partial<Op>)} aria-label={`${k} on operation ${ops[i].op_no}`} />
  );

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <OutlineBtn onClick={() => router.push("/mfg/master?tab=routings")}><ArrowLeft size={13} /> All routings</OutlineBtn>
        <h1 className="text-[20px] font-semibold">{isNew ? "New routing" : `${meta?.document_number} · version ${meta?.version}`}</h1>
        {meta && <Chip label={meta.status} tone={statusTone(meta.status)} />}
        <div className="ml-auto flex gap-2 flex-wrap">
          {editable && <GoldBtn onClick={save} disabled={busy || !dirty}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Save draft</GoldBtn>}
          {!isNew && !isTeacher && meta?.status === "DRAFT" && <GoldBtn onClick={() => setConfirm("activate")} disabled={busy || dirty} title={dirty ? "Save your changes first" : undefined}>Activate</GoldBtn>}
          {!isNew && !isTeacher && <OutlineBtn onClick={() => act("copy")} disabled={busy || dirty}><Copy size={13} /> New version</OutlineBtn>}
          {!isNew && !isTeacher && meta?.status === "ACTIVE" && <OutlineBtn onClick={() => setConfirm("obsolete")} disabled={busy}>Make obsolete</OutlineBtn>}
          {!isNew && !isTeacher && meta?.status === "DRAFT" && <OutlineBtn onClick={() => setConfirm("delete")} disabled={busy} style={{ color: "#FF6B7A", borderColor: "rgba(255,107,122,0.5)" }}><Trash2 size={13} /> Delete draft</OutlineBtn>}
        </div>
      </div>
      {!editable && !isTeacher && !isNew && <div className="text-[12px] text-[#7F8EA0]">Only a draft can be edited. To change this routing, make a new version.</div>}

      <Panel title="Header">
        <div className="grid gap-x-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <div style={{ gridColumn: "span 2" }}><Label>Item this routing makes</Label>
            <select className="input" disabled={!isNew || !editable} value={head.item_id} onChange={(e) => setH({ item_id: e.target.value })}>
              <option value="">Choose…</option>
              {makeItems.map((i) => <option key={i.item_id} value={i.item_id}>{i.sku} — {i.name}</option>)}
            </select>
          </div>
          <div><Label>Alternative</Label><input className="input" type="number" min={1} step={1} disabled={!isNew || !editable} value={head.alt_no} onChange={(e) => setH({ alt_no: e.target.value })} /></div>
        </div>
        <Label>Note</Label>
        <input className="input" disabled={!editable} value={head.description} onChange={(e) => setH({ description: e.target.value })} placeholder="What is special about this version?" />
      </Panel>

      <Panel title="Operations">
        <div className="overflow-x-auto">
          <table style={{ minWidth: 1180 }}>
            <thead><tr><th>Op</th><th>What is done</th><th>Work center</th><th>Setup (min)</th><th>Run (min / unit)</th><th>Labor (min / unit)</th><th>Machine (min / unit)</th><th>Teardown (min)</th><th>Queue (min)</th><th>Move (min)</th><th>Control key</th>{editable && <th />}</tr></thead>
            <tbody>
              {ops.map((o, i) => (
                <tr key={i}>
                  <td><input className="input" style={{ width: 64 }} type="number" min={1} step={1} disabled={!editable} value={o.op_no} onChange={(e) => setO(i, { op_no: e.target.value })} aria-label={`Operation number ${i + 1}`} /></td>
                  <td><input className="input" style={{ minWidth: 140 }} disabled={!editable} value={o.description} onChange={(e) => setO(i, { description: e.target.value })} aria-label={`Description of operation ${o.op_no}`} /></td>
                  <td>
                    <select className="input" style={{ minWidth: 150 }} disabled={!editable} value={o.work_center_id} onChange={(e) => setO(i, { work_center_id: e.target.value })} aria-label={`Work center of operation ${o.op_no}`}>
                      <option value="">Choose…</option>
                      {(editable ? activeCenters : lk.workCenters).map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
                    </select>
                  </td>
                  <td>{numCell(i, "setup_min")}</td><td>{numCell(i, "run_min_per_unit")}</td><td>{numCell(i, "labor_min_per_unit")}</td><td>{numCell(i, "machine_min_per_unit")}</td><td>{numCell(i, "teardown_min")}</td>
                  <td>{numCell(i, "queue_min")}</td><td>{numCell(i, "move_min")}</td>
                  <td>
                    <select className="input" disabled={!editable} value={o.control_key} onChange={(e) => setO(i, { control_key: e.target.value as Op["control_key"] })}>
                      {Object.entries(CONTROL_KEYS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                    </select>
                  </td>
                  {editable && <td><TinyBtn onClick={() => { setOps(ops.filter((_, j) => j !== i)); setDirty(true); }} aria-label={`Remove operation ${o.op_no}`}><Trash2 size={11} /></TinyBtn></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable && (
          <div className="mt-3">
            <OutlineBtn onClick={() => { const next = Math.max(0, ...ops.map((o) => Number(o.op_no) || 0)) + 10; setOps([...ops, blankOp(next)]); setDirty(true); }}><Plus size={13} /> Add operation</OutlineBtn>
          </div>
        )}
        <div className="text-[11.5px] text-[#7F8EA0] mt-3">
          Labor and machine minutes are what is charged to the work center&rsquo;s labor and machine rates (leave both blank to charge the whole run time as labor). Work time is setup + run × quantity + teardown. Queue and move time are waiting time between operations. The planned rate for each hour comes from the work center&rsquo;s activity rates.
        </div>
      </Panel>

      {!isNew && (
        <Panel title="Time for a quantity">
          <div className="flex flex-wrap gap-3 items-end">
            <div><Label>Quantity</Label><input className="input" style={{ width: 120 }} type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            <GoldBtn onClick={calc}>Calculate</GoldBtn>
          </div>
          {loadRows && (
            <table className="mt-3">
              <thead><tr><th>Op</th><th>Work center</th><th style={{ textAlign: "right" }}>Work time</th><th style={{ textAlign: "right" }}>Waiting time</th></tr></thead>
              <tbody>
                {loadRows.map((r) => (
                  <tr key={r.op_no}><td>{r.op_no} {r.description}</td><td>{wcName(r.work_center_id)}</td><td style={{ textAlign: "right" }}>{hm(Number(r.work_min))}</td><td style={{ textAlign: "right" }}>{hm(Number(r.wait_min))}</td></tr>
                ))}
                <tr><td colSpan={2}><b>Total</b></td>
                  <td style={{ textAlign: "right" }}><b>{hm(loadRows.reduce((s, r) => s + Number(r.work_min), 0))}</b></td>
                  <td style={{ textAlign: "right" }}><b>{hm(loadRows.reduce((s, r) => s + Number(r.wait_min), 0))}</b></td></tr>
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {confirm === "activate" && <ConfirmDialog title="Activate this routing" confirmLabel="Activate" busy={busy} onConfirm={() => act("activate")} onCancel={() => setConfirm(null)}
        message="Once active it can't be edited, only copied to a new version. Any other active routing for this item and alternative becomes obsolete." />}
      {confirm === "obsolete" && <ConfirmDialog title="Make obsolete" confirmLabel="Make obsolete" danger busy={busy} onConfirm={() => act("obsolete")} onCancel={() => setConfirm(null)}
        message="Are you sure? An obsolete routing is kept for history but can't be used for production." />}
      {confirm === "delete" && <ConfirmDialog title="Delete this draft" confirmLabel="Delete" danger busy={busy} onConfirm={() => act("delete")} onCancel={() => setConfirm(null)}
        message="Are you sure you want to delete this draft? This can't be undone." />}
      <FormStyles />
    </>
  );
}
