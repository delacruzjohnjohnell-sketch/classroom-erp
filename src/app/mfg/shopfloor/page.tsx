"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Clock, Gauge, ListChecks, Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Empty, GoldBtn, KpiCard, Label, Panel, TinyBtn, FormStyles } from "@/components/ui";
import ListReport, { Chip, type ListColumn } from "@/components/ListReport";
import ReverseModal from "@/components/mfg/ReverseModal";
import { useLookups } from "@/components/mfg/useLookups";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { qtyText } from "@/lib/mfgOps";
import { bucketHeading } from "@/lib/mfgPlanning";
import {
  biggestLoss, DOWNTIME_CATEGORIES, DOWNTIME_LABEL, LOSS_HELP, LOSS_LABEL, oeeOf, OEE_TONE_COLOR, OEE_TONE_LABEL, oeeTone, pct, totals, weekRange, type OeeRow,
} from "@/lib/mfgOee";

type Dispatch = {
  work_center_id: string; order_id: string; order_no: string; item_id: string; op_no: number; description: string | null; priority: number;
  planned_start: string | null; planned_end: string | null; qty_planned: number; qty_done: number; qty_ready: number; remaining_h: number;
  status: string; late: boolean; previous_op: number | null;
};
type Downtime = { id: string; work_center_id: string; event_date: string; hours: number; category: string; note: string | null; voided_at: string | null; void_reason: string | null };

const TABS = [["dispatch", "Dispatch list"], ["oee", "OEE"], ["downtime", "Downtime"]] as const;
const today = () => new Date().toISOString().slice(0, 10);
const MONO = 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';

export default function ShopFloorPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>}>
        <ShopFloorBody />
      </Suspense>
    </AppShell>
  );
}

function ShopFloorBody() {
  const router = useRouter();
  const params = useSearchParams();
  const { effectiveTenantId, profile } = useSession();
  const readOnly = profile?.role === "teacher";
  const { data: lk, loading } = useLookups();
  const tab = TABS.find((t) => t[0] === params.get("tab"))?.[0] ?? "dispatch";

  const [rows, setRows] = useState<Dispatch[]>([]);
  const [downtime, setDowntime] = useState<Downtime[]>([]);
  const [oee, setOee] = useState<OeeRow[] | null>(null);
  const [wcFilter, setWcFilter] = useState("");
  const [weeks, setWeeks] = useState("4");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [form, setForm] = useState({ wc: "", date: today(), hours: "", category: "BREAKDOWN", note: "" });
  const [voiding, setVoiding] = useState<Downtime | null>(null);

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const t = effectiveTenantId;
    const [d, dt] = await Promise.all([
      supabase.rpc("mfg_dispatch_list", { p_tenant: t, p_work_center: null }),
      supabase.from("mfg_downtime").select("id, work_center_id, event_date, hours, category, note, voided_at, void_reason").eq("tenant_id", t).order("event_date", { ascending: false }).order("created_at", { ascending: false }).limit(500),
    ]);
    if (d.error) toast.error(d.error.message);
    setRows((d.data as Dispatch[]) ?? []);
    setDowntime((dt.data as Downtime[]) ?? []);
    setTick((n) => n + 1);
  }, [effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // OEE for the chosen number of weeks
  useEffect(() => {
    if (!effectiveTenantId) return;
    let live = true;
    (async () => {
      const r = weekRange(today(), Number(weeks));
      const res = await supabase.rpc("mfg_oee", { p_tenant: effectiveTenantId, p_from: r.from, p_days: r.days, p_bucket: 7 });
      if (!live) return;
      if (res.error) { toast.error(res.error.message); setOee([]); return; }
      setOee((res.data as OeeRow[]) ?? []);
    })();
    return () => { live = false; };
  }, [effectiveTenantId, weeks, tick]);

  const centres = useMemo(() => lk.workCenters.filter((w) => w.active), [lk.workCenters]);
  const wcName = (id: string) => lk.workCenters.find((w) => w.id === id)?.name ?? "—";
  const itemName = (id: string) => lk.items.find((i) => i.item_id === id)?.name ?? "—";
  const shown = wcFilter ? rows.filter((r) => r.work_center_id === wcFilter) : rows;
  const ready = rows.filter((r) => Number(r.qty_ready) > 0).length;
  const late = rows.filter((r) => r.late).length;
  const weekAgo = new Date(Date.parse(today() + "T00:00:00Z") - 7 * 86400000).toISOString().slice(0, 10);
  const downWeek = downtime.filter((d) => !d.voided_at && d.category !== "PLANNED_STOP" && d.event_date >= weekAgo).reduce((s, d) => s + Number(d.hours), 0);
  const allOee = oeeOf(totals(oee ?? []));

  const setPriority = async (r: Dispatch, p: number) => {
    if (busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_set_order_priority", { p_order: r.order_id, p_priority: p }), { successMessage: `${r.order_no} is now priority ${p}.` });
    setBusy(false);
    if (ok(res)) await load();
  };

  const logDowntime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!form.wc) { toast.error("Choose the work centre."); return; }
    if (!form.date) { toast.error("Choose the day."); return; }
    const h = Number(form.hours);
    if (!(h > 0) || h > 24) { toast.error("Enter how many hours it stood still (more than 0, at most 24)."); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_log_downtime", { p_wc: form.wc, p_date: form.date, p_hours: h, p_category: form.category, p_note: form.note || null }), { successMessage: "Downtime logged." });
    setBusy(false);
    if (ok(res)) { setForm({ ...form, hours: "", note: "" }); await load(); }
  };
  const voidIt = async (reason: string) => {
    if (!voiding || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_void_downtime", { p_id: voiding.id, p_reason: reason }), { successMessage: "Entry voided. It no longer counts." });
    setBusy(false);
    if (ok(res)) { setVoiding(null); await load(); }
  };

  const dispatchCols: ListColumn<Dispatch>[] = [
    { key: "pri", label: "Priority", value: (r) => r.priority, align: "right", width: 90,
      render: (r) => readOnly ? String(r.priority) : (
        <select className="input" style={{ width: 64, padding: "4px 6px" }} value={r.priority} disabled={busy} onClick={(e) => e.stopPropagation()} onChange={(e) => setPriority(r, Number(e.target.value))} aria-label={`Priority of ${r.order_no}`}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>) },
    { key: "wc", label: "Work centre", value: (r) => wcName(r.work_center_id), filter: true, width: 130 },
    { key: "ord", label: "Order", value: (r) => r.order_no, width: 100, render: (r) => <Link href={`/mfg/production/${r.order_id}`} className="underline" onClick={(e) => e.stopPropagation()}>{r.order_no}</Link> },
    { key: "item", label: "Product", value: (r) => itemName(r.item_id), width: 170 },
    { key: "op", label: "Operation", value: (r) => `${r.op_no} ${r.description ?? ""}`.trim(), width: 150 },
    { key: "ready", label: "Ready to work", value: (r) => Number(r.qty_ready), align: "right", width: 120,
      render: (r) => Number(r.qty_ready) > 0 ? <b>{qtyText(r.qty_ready)}</b> : <Chip label="Waiting for the step before" tone="muted" /> },
    { key: "left", label: "Still to make", value: (r) => Number(r.qty_planned) - Number(r.qty_done), align: "right", width: 110, render: (r) => qtyText(Number(r.qty_planned) - Number(r.qty_done)) },
    { key: "h", label: "Hours left", value: (r) => Number(r.remaining_h), align: "right", width: 90, render: (r) => qtyText(r.remaining_h) },
    { key: "due", label: "Due", value: (r) => r.planned_end ?? "", width: 130, render: (r) => r.late ? <Chip label={`Late · ${r.planned_end}`} tone="bad" /> : (r.planned_end ?? "—") },
    { key: "go", label: "", value: () => "", width: 90, render: (r) => !readOnly ? <Link href={`/mfg/production/${r.order_id}`} onClick={(e) => e.stopPropagation()}><TinyBtn type="button">Confirm</TinyBtn></Link> : null },
  ];
  const downCols: ListColumn<Downtime>[] = [
    { key: "date", label: "Day", value: (r) => r.event_date, width: 110 },
    { key: "wc", label: "Work centre", value: (r) => wcName(r.work_center_id), filter: true, width: 140 },
    { key: "cat", label: "Reason", value: (r) => DOWNTIME_LABEL[r.category] ?? r.category, filter: true, width: 170 },
    { key: "h", label: "Hours", value: (r) => Number(r.hours), align: "right", width: 80, render: (r) => qtyText(r.hours) },
    { key: "note", label: "Note", value: (r) => r.note ?? "", width: 240 },
    { key: "st", label: "Status", value: (r) => (r.voided_at ? "Voided" : "Counts"), filter: true, width: 150,
      render: (r) => r.voided_at ? <span title={r.void_reason ?? ""} className="text-[#7F8EA0]">Voided{r.void_reason ? `: ${r.void_reason}` : ""}</span> : !readOnly ? <span onClick={(e) => e.stopPropagation()}><TinyBtn type="button" disabled={busy} onClick={() => setVoiding(r)}>Void</TinyBtn></span> : "Counts" },
  ];

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>;

  return (
    <>
      <div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-[#7F8EA0]" style={{ fontFamily: MONO }}>Manufacturing</div>
        <h1 className="text-[20px] font-semibold">Shop floor</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1 max-w-[800px]">
          The <b>dispatch list</b> tells each work centre what to run next: most urgent orders first, then the earliest due date. A step is <b>ready</b> only for the units the step before has finished.
          <b> OEE</b> shows how well each work centre used its time: how much it was available, how fast it ran, and how many of its units were good.
          {readOnly && " You are looking at a student’s shop floor."}
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <KpiCard icon={<ListChecks size={14} />} label="Operations ready to run" value={ready} accent="#5AA9FF" />
        <KpiCard icon={<AlertTriangle size={14} />} label="Late operations" value={late} accent={late ? "#FF6B7A" : "#22D3C5"} />
        <KpiCard icon={<Clock size={14} />} label="Stopped in the last 7 days" value={`${qtyText(downWeek)} h`} accent="#F2B13C" />
        <KpiCard icon={<Gauge size={14} />} label={`OEE, last ${weeks} weeks`} value={pct(allOee.oee)} accent={OEE_TONE_COLOR[oeeTone(allOee.oee)]} />
      </div>

      <div className="flex gap-1 flex-wrap border-b border-hairline" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => router.replace(`/mfg/shopfloor?tab=${id}`)}
            className={`px-3 py-2 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors ${tab === id ? "text-gold border-[#F2B13C]" : "text-[#A3B1C2] border-transparent hover:text-ink"}`}>{label}</button>
        ))}
      </div>

      {tab === "dispatch" && (
        <Panel title="What to run next">
          <div className="grid gap-x-3 mb-3" style={{ gridTemplateColumns: "minmax(200px, 320px) 1fr", alignItems: "end" }}>
            <div><Label>Work centre</Label>
              <select className="input" value={wcFilter} onChange={(e) => setWcFilter(e.target.value)}>
                <option value="">All work centres</option>
                {centres.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></div>
            <div className="text-[11.5px] text-[#7F8EA0] pb-2.5">Only released orders appear, and only operations that still have units to make. Priority 1 is the most urgent; 5 is the usual.</div>
          </div>
          <ListReport listKey="mfg-dispatch" rows={shown} columns={dispatchCols} rowKey={(r) => `${r.order_id}:${r.op_no}`} exportName="dispatch-list"
            emptyText="Nothing to run. Release a production order, and its operations appear here at their work centres." />
          <div className="text-[11.5px] text-[#7F8EA0] mt-2">“Confirm” opens the order, where you record units made, scrap and hours for the operation.</div>
        </Panel>
      )}

      {tab === "oee" && (
        <>
          <Panel title="Overall equipment effectiveness">
            <div className="grid gap-x-3" style={{ gridTemplateColumns: "minmax(180px, 260px) 1fr", alignItems: "end" }}>
              <div><Label>Look back</Label>
                <select className="input" value={weeks} onChange={(e) => setWeeks(e.target.value)}>
                  <option value="4">4 weeks</option><option value="8">8 weeks</option><option value="13">13 weeks</option>
                </select></div>
              <div className="text-[11.5px] text-[#7F8EA0] pb-2.5">One column per week, weeks start on Monday.</div>
            </div>
            <div className="text-[12px] text-[#A3B1C2] mt-3 max-w-[860px]">
              <b>Availability</b> = (planned time − stoppages − set-up) ÷ planned time. <b>Performance</b> = the hours the units should have taken ÷ the machine hours actually run. <b>Quality</b> = good units ÷ all units made.
              <b> OEE</b> is the three multiplied. Planned stops (breaks, planned maintenance) are taken off the planned time. Time when nothing was scheduled is not counted as a loss.
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-[#7F8EA0] mt-2">
              {(["world", "typical", "low"] as const).map((t) => <span key={t}><span style={{ display: "inline-block", width: 10, height: 10, background: OEE_TONE_COLOR[t], marginRight: 5, borderRadius: 2 }} />{OEE_TONE_LABEL[t]}</span>)}
            </div>
          </Panel>

          {oee === null ? <div className="py-10 flex justify-center"><Loader2 className="animate-spin" size={18} color="#F2B13C" /></div>
            : centres.length === 0 ? <Panel title="Work centres"><Empty>No work centres yet. Add them under Master Data and give routings operations at them.</Empty></Panel>
            : centres.map((wc) => {
              const list = oee.filter((r) => r.work_center_id === wc.id).sort((a, b) => a.bucket_no - b.bucket_no);
              const t = totals(list);
              const o = oeeOf(t);
              const tone = oeeTone(o.oee);
              const loss = biggestLoss(t);
              const cw = 54, chartH = 120;
              const y = (p: number) => chartH - 22 - (Math.min(p, 1) * (chartH - 40));
              const from = list[0]?.bucket_start ?? "";
              const byCat = DOWNTIME_CATEGORIES.map(([k, label]) => ({
                label, hours: downtime.filter((d) => d.work_center_id === wc.id && !d.voided_at && d.category === k && d.event_date >= from).reduce((s, d) => s + Number(d.hours), 0),
              })).filter((x) => x.hours > 0);
              return (
                <Panel key={wc.id} title={`${wc.code} · ${wc.name}`}>
                  <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.08em] text-[#7F8EA0]" style={{ fontFamily: MONO }}>OEE</div>
                      <div className="text-[34px] font-semibold leading-none" style={{ color: OEE_TONE_COLOR[tone], fontFamily: MONO }}>{pct(o.oee)}</div>
                      <div className="text-[11.5px] text-[#7F8EA0] mt-1">{OEE_TONE_LABEL[tone]}</div>
                    </div>
                    {([["Availability", o.availability], ["Performance", o.performance], ["Quality", o.quality]] as const).map(([label, v]) => (
                      <div key={label}>
                        <div className="text-[11px] uppercase tracking-[0.08em] text-[#7F8EA0]" style={{ fontFamily: MONO }}>{label}</div>
                        <div className="text-[20px] font-semibold" style={{ fontFamily: MONO }}>{pct(v)}</div>
                        {label === "Performance" && v !== null && v > 1.0001 && <div className="text-[11px]" style={{ color: "#F2B13C" }}>Above 100 %: check the standard times</div>}
                      </div>
                    ))}
                  </div>
                  {loss && <div className="text-[12.5px] mt-3"><b>Biggest loss:</b> {LOSS_LABEL[loss.kind]} — about {qtyText(loss.hours)} h. <span className="text-[#7F8EA0]">{LOSS_HELP[loss.kind]}</span></div>}
                  {t.good + t.scrap === 0 && <div className="text-[12.5px] text-[#7F8EA0] mt-3">Nothing was confirmed on this work centre in this period.</div>}

                  <div className="overflow-x-auto mt-3" role="region" aria-label={`OEE by week for ${wc.name}`} tabIndex={0}>
                    <svg width={Math.max(list.length * cw + 40, 200)} height={chartH} style={{ fontFamily: MONO, fontSize: 10.5, display: "block" }}>
                      <line x1={36} x2={list.length * cw + 38} y1={y(0.85)} y2={y(0.85)} stroke="#22D3C5" strokeDasharray="4 3" />
                      <text x={0} y={y(0.85) + 3} fill="#22D3C5">85 %</text>
                      <line x1={36} x2={list.length * cw + 38} y1={y(0)} y2={y(0)} stroke="#C5D0E2" />
                      {list.map((r, i) => {
                        const v = oeeOf(totals([r])).oee;
                        const top = v === null ? y(0) : y(v);
                        return (
                          <g key={r.bucket_no} transform={`translate(${38 + i * cw}, 0)`}>
                            {v !== null && <rect x={6} y={top} width={cw - 14} height={Math.max(y(0) - top, 2)} rx={2} fill={OEE_TONE_COLOR[oeeTone(v)]}><title>{`${bucketHeading(r.bucket_start, 7)}: OEE ${pct(v)}`}</title></rect>}
                            <text x={cw / 2 - 1} y={chartH - 8} textAnchor="middle" fill="#7F8EA0">{bucketHeading(r.bucket_start, 7)}</text>
                            {v !== null && <text x={cw / 2 - 1} y={Math.max(top - 3, 10)} textAnchor="middle" fill="#A3B1C2">{Math.round(v * 100)}</text>}
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  <div className="overflow-x-auto mt-2">
                    <table style={{ minWidth: 640, fontFamily: MONO, fontSize: 12 }}>
                      <thead><tr><th>Week of</th><th style={{ textAlign: "right" }}>Planned h</th><th style={{ textAlign: "right" }}>Stopped h</th><th style={{ textAlign: "right" }}>Set-up h</th><th style={{ textAlign: "right" }}>Ran h</th><th style={{ textAlign: "right" }}>Should have taken h</th><th style={{ textAlign: "right" }}>Good</th><th style={{ textAlign: "right" }}>Scrap</th><th style={{ textAlign: "right" }}>OEE</th></tr></thead>
                      <tbody>
                        {list.map((r) => (
                          <tr key={r.bucket_no}>
                            <td>{bucketHeading(r.bucket_start, 7)}</td>
                            <td style={{ textAlign: "right" }}>{qtyText(r.planned_h)}</td><td style={{ textAlign: "right" }}>{qtyText(r.downtime_h)}</td><td style={{ textAlign: "right" }}>{qtyText(r.setup_h)}</td>
                            <td style={{ textAlign: "right" }}>{qtyText(r.run_h)}</td><td style={{ textAlign: "right" }}>{qtyText(r.ideal_h)}</td>
                            <td style={{ textAlign: "right" }}>{qtyText(r.good_qty)}</td><td style={{ textAlign: "right" }}>{qtyText(r.scrap_qty)}</td>
                            <td style={{ textAlign: "right", fontWeight: 600 }}>{pct(oeeOf(totals([r])).oee)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {byCat.length > 0 && <div className="text-[12px] text-[#A3B1C2] mt-2">Logged stoppages in this period: {byCat.map((x) => `${x.label} ${qtyText(x.hours)} h`).join(" · ")}</div>}
                </Panel>
              );
            })}
        </>
      )}

      {tab === "downtime" && (
        <>
          {!readOnly && (
            <Panel title="Log a stoppage">
              <form onSubmit={logDowntime}>
                <div className="grid gap-x-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", alignItems: "end" }}>
                  <div><Label>Work centre</Label>
                    <select className="input" value={form.wc} onChange={(e) => setForm({ ...form, wc: e.target.value })}>
                      <option value="">Choose…</option>
                      {centres.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select></div>
                  <div><Label>Day</Label><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                  <div><Label>Hours stopped</Label><input className="input" type="number" min={0} max={24} step="any" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></div>
                  <div><Label>Reason</Label>
                    <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      {DOWNTIME_CATEGORIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select></div>
                </div>
                <Label>Note (optional)</Label>
                <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="What happened" />
                <div className="flex gap-3 items-center mt-3 flex-wrap">
                  <GoldBtn type="submit" disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Log it</GoldBtn>
                  <span className="text-[11.5px] text-[#7F8EA0]">{DOWNTIME_CATEGORIES.find(([k]) => k === form.category)?.[2]}</span>
                </div>
              </form>
            </Panel>
          )}
          <Panel title="Stoppages">
            <ListReport listKey="mfg-downtime" rows={downtime} columns={downCols} rowKey={(r) => r.id} exportName="downtime" emptyText="No stoppages logged." />
            <div className="text-[11.5px] text-[#7F8EA0] mt-2">Entries are never edited. A mistake is voided with a reason and then no longer counts toward availability.</div>
          </Panel>
        </>
      )}

      {voiding && (
        <ReverseModal title="Void a stoppage" what={`${wcName(voiding.work_center_id)} · ${voiding.event_date} · ${qtyText(voiding.hours)} h · ${DOWNTIME_LABEL[voiding.category] ?? voiding.category}`}
          explain="The entry stays on the record, marked voided with your reason. It no longer counts toward availability." verb="voiding" submitLabel="Void it" busy={busy}
          onCancel={() => setVoiding(null)} onSubmit={(reason) => voidIt(reason)} />
      )}
      <FormStyles />
    </>
  );
}
