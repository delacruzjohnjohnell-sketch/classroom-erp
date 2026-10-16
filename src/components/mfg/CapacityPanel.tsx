"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Empty, Label, Panel } from "@/components/ui";
import { Chip } from "@/components/ListReport";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { friendlyError } from "@/lib/mutate";
import { groupByWorkCenter, LOAD_TONE_COLOR, LOAD_TONE_LABEL, loadText, loadTone, summarise, type LoadRow } from "@/lib/mfgCapacity";
import { BUCKET_OPTIONS, HORIZON_OPTIONS, bucketHeading } from "@/lib/mfgPlanning";
import { qtyText } from "@/lib/mfgOps";

type WorkCenter = { id: string; code: string; name: string; shifts: number; hours_per_shift: number; utilization_pct: number; active: boolean };
type Source = { kind: string; doc_no: string; item_id: string; source_id: string; hours: number; start_date: string; finish_date: string };

const MONO = 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';
const today = () => new Date().toISOString().slice(0, 10);

/** How many hours of work each work centre is asked to do in each column, against the hours it has. */
export default function CapacityPanel({ tenantId, workCenters, itemName, refreshKey }: { tenantId: string; workCenters: WorkCenter[]; itemName: (id: string) => string; refreshKey: number }) {
  const [from, setFrom] = useState(today());
  const [days, setDays] = useState("84");
  const [bucket, setBucket] = useState("7");
  const [rows, setRows] = useState<LoadRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);

  useEffect(() => {
    let live = true;
    (async () => {
      const r = await supabase.rpc("mfg_capacity_load", { p_tenant: tenantId, p_from: from, p_days: Number(days), p_bucket: Number(bucket) });
      if (!live) return;
      if (r.error) { toast.error(friendlyError(r.error.message)); setRows([]); return; }
      setRows((r.data as LoadRow[]) ?? []);
    })();
    return () => { live = false; };
  }, [tenantId, from, days, bucket, refreshKey]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    (async () => {
      const r = await supabase.rpc("mfg_capacity_orders", { p_tenant: tenantId, p_work_center: open, p_from: from, p_days: Number(days) });
      if (live) setSources(r.error ? [] : ((r.data as Source[]) ?? []));
    })();
    return () => { live = false; };
  }, [open, tenantId, from, days, refreshKey]);

  const grouped = useMemo(() => groupByWorkCenter(rows ?? []), [rows]);
  const centres = workCenters.filter((w) => w.active);

  return (
    <>
      <Panel title="Capacity — is there enough time at each work centre?">
        <div className="grid gap-x-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", alignItems: "end" }}>
          <div><Label>From</Label><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value || today())} /></div>
          <div><Label>Look ahead</Label>
            <select className="input" value={days} onChange={(e) => setDays(e.target.value)}>
              {HORIZON_OPTIONS.map((o) => <option key={o.days} value={o.days}>{o.label}</option>)}
            </select></div>
          <div><Label>One column is</Label>
            <select className="input" value={bucket} onChange={(e) => setBucket(e.target.value)}>
              {BUCKET_OPTIONS.map((o) => <option key={o.days} value={o.days}>{o.label}</option>)}
            </select></div>
        </div>
        <div className="text-[12px] text-[#A3B1C2] mt-3 max-w-[820px]">
          Each order&rsquo;s work (set-up, run time per unit) is spread over the <b>working days</b> between its start and finish, using each work centre&rsquo;s shifts, hours per shift, utilisation and working weekdays, and skipping company holidays. Planned orders count too, so you can see overload <b>before</b> you make them.
          Planning does not fix overload for you: move an order on the Gantt tab, or change the work centre&rsquo;s hours in Master Data.
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-[#7F8EA0] mt-2">
          {(["ok", "busy", "over"] as const).map((t) => <span key={t}><span style={{ display: "inline-block", width: 10, height: 10, background: LOAD_TONE_COLOR[t], marginRight: 5, borderRadius: 2 }} />{LOAD_TONE_LABEL[t]}{t === "busy" ? " (85 % and up)" : ""}</span>)}
        </div>
      </Panel>

      {rows === null ? <div className="py-10 flex justify-center"><Loader2 className="animate-spin" size={18} color="#F2B13C" /></div>
        : centres.length === 0 ? <Panel title="Work centres"><Empty>No work centres yet. Add them under Master Data, then give routings operations at them.</Empty></Panel>
        : centres.map((wc) => {
          const list = grouped.get(wc.id) ?? [];
          const s = summarise(list);
          const worst = s.overColumns > 0 ? "over" : s.busyColumns > 0 ? "busy" : s.required > 0 ? "ok" : "idle";
          const cols = list.length;
          const cw = cols > 30 ? 28 : 46;
          const chartH = 130;
          const cap = Math.max(160, Math.ceil(s.peakPct / 20) * 20);
          const y = (pct: number) => chartH - 22 - (Math.min(pct, cap) / cap) * (chartH - 40);
          return (
            <Panel key={wc.id} title={`${wc.code} · ${wc.name}`}>
              <div className="flex flex-wrap items-center gap-3 text-[12.5px] mb-2">
                <Chip label={LOAD_TONE_LABEL[worst]} tone={worst === "over" ? "bad" : worst === "busy" ? "warn" : worst === "ok" ? "good" : "muted"} />
                <span className="text-[#A3B1C2]">{wc.shifts} shift{wc.shifts === 1 ? "" : "s"} × {qtyText(wc.hours_per_shift)} h × {qtyText(wc.utilization_pct)} % utilisation</span>
                <span>Work: <b>{qtyText(s.required)} h</b> of <b>{qtyText(s.available)} h</b></span>
                {s.peakPct > 0 && <span>Peak: <b>{qtyText(s.peakPct)} %</b></span>}
                {s.firstOver && <span style={{ color: "#FF6B7A" }}>First overloaded column: {bucketHeading(s.firstOver, Number(bucket))}</span>}
                <button type="button" className="text-[12px] font-semibold underline" onClick={() => setOpen(open === wc.id ? null : wc.id)}>{open === wc.id ? "Hide orders" : "Which orders?"}</button>
              </div>
              <div className="overflow-x-auto" role="region" aria-label={`Load of ${wc.name}`} tabIndex={0}>
                <svg width={Math.max(cols * cw + 40, 200)} height={chartH} style={{ fontFamily: MONO, fontSize: 10.5, display: "block" }}>
                  <line x1={36} x2={cols * cw + 38} y1={y(100)} y2={y(100)} stroke="#FF6B7A" strokeDasharray="4 3" />
                  <text x={0} y={y(100) + 3} fill="#FF6B7A">100 %</text>
                  <line x1={36} x2={cols * cw + 38} y1={y(0)} y2={y(0)} stroke="#C5D0E2" />
                  {list.map((r, i) => {
                    const tone = loadTone(Number(r.required_h), Number(r.available_h));
                    const pct = r.load_pct == null ? (Number(r.required_h) > 0 ? cap : 0) : Number(r.load_pct);
                    const top = y(pct);
                    return (
                      <g key={r.bucket_no} transform={`translate(${38 + i * cw}, 0)`}>
                        <rect x={4} y={top} width={cw - 10} height={Math.max(y(0) - top, pct > 0 ? 2 : 0)} rx={2} fill={LOAD_TONE_COLOR[tone]}>
                          <title>{`${bucketHeading(r.bucket_start, Number(bucket))}: ${qtyText(r.required_h)} h of ${qtyText(r.available_h)} h (${loadText(r)})`}</title>
                        </rect>
                        <text x={cw / 2 - 1} y={chartH - 8} textAnchor="middle" fill="#7F8EA0">{bucketHeading(r.bucket_start, Number(bucket)).replace(" 20", " ’")}</text>
                        {pct > 0 && <text x={cw / 2 - 1} y={Math.max(top - 3, 10)} textAnchor="middle" fill={tone === "over" ? "#FF6B7A" : "#A3B1C2"}>{r.load_pct == null ? "!" : Math.round(pct)}</text>}
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="overflow-x-auto mt-2">
                <table style={{ minWidth: 300, fontFamily: MONO, fontSize: 12 }}>
                  <thead><tr><th>Column</th><th style={{ textAlign: "right" }}>Hours available</th><th style={{ textAlign: "right" }}>Open orders</th><th style={{ textAlign: "right" }}>Planned orders</th><th style={{ textAlign: "right" }}>Load</th></tr></thead>
                  <tbody>
                    {list.filter((r) => Number(r.required_h) > 0 || Number(r.available_h) === 0).map((r) => {
                      const tone = loadTone(Number(r.required_h), Number(r.available_h));
                      return (
                        <tr key={r.bucket_no}>
                          <td>{bucketHeading(r.bucket_start, Number(bucket))}</td>
                          <td style={{ textAlign: "right" }}>{qtyText(r.available_h)}</td>
                          <td style={{ textAlign: "right" }}>{qtyText(r.open_h)}</td>
                          <td style={{ textAlign: "right" }}>{qtyText(r.planned_h)}</td>
                          <td style={{ textAlign: "right", fontWeight: 600, color: tone === "over" ? "#FF6B7A" : tone === "busy" ? "#F2B13C" : undefined }}>{loadText(r)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {list.every((r) => Number(r.required_h) <= 0) && <div className="text-[12px] text-[#7F8EA0] py-2">No work is planned here in this period.</div>}
              </div>
              {open === wc.id && (
                <div className="mt-3">
                  <div className="text-[11.5px] uppercase tracking-[0.08em] text-[#7F8EA0] mb-1.5">Orders that load this work centre</div>
                  {sources.length === 0 ? <div className="text-[12px] text-[#7F8EA0]">None.</div> : (
                    <table style={{ minWidth: 420, fontSize: 12.5 }}>
                      <thead><tr><th>Type</th><th>Order</th><th>Item</th><th style={{ textAlign: "right" }}>Hours</th><th>Spread over</th></tr></thead>
                      <tbody>
                        {sources.map((x) => (
                          <tr key={x.kind + x.source_id}>
                            <td><Chip label={x.kind === "open" ? "Production order" : "Planned order"} tone={x.kind === "open" ? "good" : "warn"} /></td>
                            <td>{x.doc_no}</td><td>{itemName(x.item_id)}</td>
                            <td style={{ textAlign: "right" }}>{qtyText(x.hours)}</td>
                            <td>{x.start_date} to {x.finish_date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </Panel>
          );
        })}
    </>
  );
}
