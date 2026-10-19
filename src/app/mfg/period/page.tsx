"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarCheck, CheckCircle2, Loader2, Lock, TriangleAlert } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Empty, GoldBtn, KpiCard, Label, OutlineBtn, Panel, TinyBtn } from "@/components/ui";
import { Chip } from "@/components/ListReport";
import ReverseModal from "@/components/mfg/ReverseModal";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import {
  acct, allocationText, blocks, infos, monthAction, monthEnd, monthLabel, monthStart, STATUS_LABEL, STATUS_TONE, tiesOut, warnings,
  type PeriodCheck, type PeriodRow, type StatementLine, type TieOut,
} from "@/lib/mfgPeriod";

type Preview = {
  period_start: string; period_end: string; costing: string;
  labor: { hours: number; applied: number; actual: number; variance: number };
  machine?: { hours: number; applied: number; actual: number; variance: number; assets: number };
  variances: { code: string; name: string; amount: number; method: "COGS" | "PRORATE"; wip: number; fg: number; cogs: number }[];
  to_wip: number; to_fg: number; to_cogs: number;
  bases: { wip: number; fg: number; cogs: number };
  methods: { variance: "COGS" | "PRORATE"; overhead: "COGS" | "PRORATE" };
  display: { entry: "labor" | "machine" | "variances"; code: string; name: string; debit: number; credit: number }[];
};
type Cogm = { lines: StatementLine[]; checks: TieOut[]; cogs: StatementLine[]; allocated: { wip: number; fg: number; cogs: number } };

const TABS = [["months", "Months"], ["cogm", "Cost of goods manufactured"]] as const;
const MONO = 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';
const today = () => new Date().toISOString().slice(0, 10);

export default function PeriodPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>}>
        <PeriodBody />
      </Suspense>
    </AppShell>
  );
}

function PeriodBody() {
  const router = useRouter();
  const params = useSearchParams();
  const { effectiveTenantId, profile } = useSession();
  const isTeacher = profile?.role === "teacher";
  const tab = TABS.find((t) => t[0] === params.get("tab"))?.[0] ?? "months";

  const [rows, setRows] = useState<PeriodRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [wizard, setWizard] = useState<string | null>(null);          // the month being settled
  const [checks, setChecks] = useState<PeriodCheck[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [note, setNote] = useState("");
  const [undo, setUndo] = useState<PeriodRow | null>(null);
  const [reopen, setReopen] = useState<PeriodRow | null>(null);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cogm, setCogm] = useState<Cogm | null>(null);

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const r = await supabase.rpc("mfg_period_list", { p_tenant: effectiveTenantId });
    if (r.error) { toast.error(r.error.message); setRows([]); return; }
    setRows((r.data as PeriodRow[]) ?? []);
  }, [effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // the statement covers one month by default: the latest month that has activity
  const latest = useMemo(() => (rows ?? []).find((r) => r.entries > 0)?.period_start ?? monthStart(today()), [rows]);
  const fromShown = from || latest;
  const toShown = to || latest;

  useEffect(() => {
    if (!effectiveTenantId || tab !== "cogm" || rows === null) return;
    let live = true;
    (async () => {
      const a = monthStart(fromShown), b = monthEnd(toShown);
      const res = await supabase.rpc("mfg_cogm", { p_tenant: effectiveTenantId, p_from: a, p_to: b });
      if (!live) return;
      if (res.error) { toast.error(res.error.message); setCogm(null); return; }
      setCogm(res.data as Cogm);
    })();
    return () => { live = false; };
  }, [effectiveTenantId, tab, fromShown, toShown, rows]);

  const openWizard = async (start: string) => {
    if (!effectiveTenantId) return;
    setWizard(start); setChecks(null); setPreview(null); setNote("");
    const [c, p] = await Promise.all([
      supabase.rpc("mfg_period_checks", { p_tenant: effectiveTenantId, p_start: start }),
      supabase.rpc("mfg_period_preview", { p_tenant: effectiveTenantId, p_start: start }),
    ]);
    if (c.error) toast.error(c.error.message);
    if (p.error) toast.error(p.error.message);
    setChecks((c.data as PeriodCheck[]) ?? []);
    setPreview((p.data as Preview) ?? null);
  };

  const settle = async () => {
    if (!wizard || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_settle_period", { p_start: wizard, p_note: note || null }), { successMessage: `${monthLabel(wizard)} settled. Close it to lock the books.` });
    setBusy(false);
    if (ok(res)) { setWizard(null); await load(); }
  };
  const close = async (start: string) => {
    if (busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_close_period", { p_start: start }), { successMessage: `${monthLabel(start)} is closed. Nothing more can be posted to it.` });
    setBusy(false);
    if (ok(res)) await load();
  };
  const doUndo = async (reason: string) => {
    if (!undo || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_undo_period_settlement", { p_start: undo.period_start, p_reason: reason }), { successMessage: "The month-end entries were reversed." });
    setBusy(false);
    if (ok(res)) { setUndo(null); await load(); }
  };
  const doReopen = async (reason: string) => {
    if (!reopen || busy || !effectiveTenantId) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_reopen_period", { p_tenant: effectiveTenantId, p_start: reopen.period_start, p_reason: reason }), { successMessage: "The month is open again." });
    setBusy(false);
    if (ok(res)) { setReopen(null); await load(); }
  };

  if (rows === null) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>;

  const closed = rows.filter((r) => r.status === "CLOSED").length;
  const settled = rows.filter((r) => r.status === "SETTLED").length;
  const next = [...rows].reverse().find((r) => r.status !== "CLOSED" && r.entries > 0);
  const lockedThrough = rows.filter((r) => r.status === "CLOSED").map((r) => r.period_end).sort().pop();

  return (
    <>
      <div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-[#7F8EA0]" style={{ fontFamily: MONO }}>Manufacturing</div>
        <h1 className="text-[20px] font-semibold">Period end</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1 max-w-[800px]">
          At the end of each month you <b>settle</b> it: production labor is restated at the wage actually paid, machine cost at the depreciation actually recorded, and the cost variances that built up in the month are closed to cost of goods sold or shared out over inventory.
          Then you <b>close</b> it, which locks the books through the last day so nothing can be posted into it. Months are closed oldest first.
          {isTeacher && " You are looking at a student’s company; only you can re-open a closed month."}
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <KpiCard icon={<CheckCircle2 size={14} />} label="Months closed" value={closed} accent="#22D3C5" />
        <KpiCard icon={<CalendarCheck size={14} />} label="Settled, waiting to close" value={settled} accent={settled ? "#F2B13C" : "#22D3C5"} />
        <KpiCard icon={<TriangleAlert size={14} />} label="Next month to do" value={next ? monthLabel(next.period_start) : "None"} accent="#5AA9FF" />
        <KpiCard icon={<Lock size={14} />} label="Books locked through" value={lockedThrough ?? "Not locked"} accent="#7F8EA0" />
      </div>

      <div className="flex gap-1 flex-wrap border-b border-hairline" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => router.replace(`/mfg/period?tab=${id}`)}
            className={`px-3 py-2 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors ${tab === id ? "text-gold border-[#F2B13C]" : "text-[#A3B1C2] border-transparent hover:text-ink"}`}>{label}</button>
        ))}
      </div>

      {tab === "months" && (
        <>
          <Panel title="Months">
            {rows.length === 0 ? <Empty>No months yet.</Empty> : (
              <div className="overflow-x-auto">
                <table style={{ minWidth: 720 }}>
                  <thead><tr><th>Month</th><th>Status</th><th style={{ textAlign: "right" }}>Journal vouchers</th><th style={{ textAlign: "right" }}>Variances closed</th><th /></tr></thead>
                  <tbody>
                    {rows.map((r) => {
                      const act = monthAction(rows, r.period_start);
                      const closedTotal = Number(r.to_cogs) + Number(r.to_wip) + Number(r.to_fg);
                      return (
                        <tr key={r.period_start}>
                          <td><b>{monthLabel(r.period_start)}</b></td>
                          <td><Chip label={STATUS_LABEL[r.status]} tone={STATUS_TONE[r.status]} /></td>
                          <td style={{ textAlign: "right" }}>{r.entries > 0 ? <Link href={`/mfg/finance?tab=vouchers&period=${r.period_start.slice(0, 7)}`} className="text-gold underline" aria-label={`Vouchers of ${monthLabel(r.period_start)}`}>{r.entries}</Link> : r.entries}</td>
                          <td style={{ textAlign: "right" }}>{r.status === "OPEN" ? "—" : acct(closedTotal)}</td>
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            {!isTeacher && act === "settle" && <TinyBtn type="button" disabled={busy} onClick={() => openWizard(r.period_start)}>Settle…</TinyBtn>}
                            {!isTeacher && act === "close" && <><TinyBtn type="button" disabled={busy} onClick={() => close(r.period_start)}>Close month</TinyBtn>{" "}</>}
                            {!isTeacher && r.status === "SETTLED" && <TinyBtn type="button" disabled={busy} onClick={() => setUndo(r)}>Undo</TinyBtn>}
                            {isTeacher && r.status !== "OPEN" && <TinyBtn type="button" disabled={busy} onClick={() => setReopen(r)}>Re-open…</TinyBtn>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="text-[11.5px] text-[#7F8EA0] mt-2">Only the latest month can be re-opened, and only by the teacher. The month-end entries are reversed, never deleted.</div>
          </Panel>

          {wizard && (
            <Panel title={`Settle ${monthLabel(wizard)}`}>
              {checks === null || preview === null ? <div className="py-6 flex justify-center"><Loader2 className="animate-spin" size={18} color="#F2B13C" /></div> : (
                <>
                  <div className="text-[12px] uppercase tracking-[0.08em] text-[#7F8EA0] mb-1" style={{ fontFamily: MONO }}>1 · Checks</div>
                  {checks.length === 0 && <div className="text-[12.5px]" style={{ color: "#22D3C5" }}>Everything checks out.</div>}
                  <ul className="text-[12.5px] space-y-1">
                    {blocks(checks).map((c) => <li key={c.code} style={{ color: "#FF6B7A" }}><b>Must fix:</b> {c.message}</li>)}
                    {warnings(checks).map((c) => <li key={c.code} style={{ color: "#F2B13C" }}><b>Look at:</b> {c.message}</li>)}
                    {infos(checks).map((c) => <li key={c.code} className="text-[#A3B1C2]">{c.message}</li>)}
                  </ul>

                  <div className="text-[12px] uppercase tracking-[0.08em] text-[#7F8EA0] mt-4 mb-1" style={{ fontFamily: MONO }}>2 · What will be posted, dated {monthEnd(wizard)}</div>
                  {preview.display.length === 0 ? <Empty>Nothing to post: there are no variances to close and no production labor or machine cost to restate.</Empty> : (
                    <div className="overflow-x-auto">
                      <table style={{ minWidth: 560, fontFamily: MONO, fontSize: 12 }}>
                        <thead><tr><th>Entry</th><th>Account</th><th style={{ textAlign: "right" }}>Debit</th><th style={{ textAlign: "right" }}>Credit</th></tr></thead>
                        <tbody>
                          {preview.display.map((d, i) => (
                            <tr key={i}>
                              <td>{d.entry === "labor" ? "Labor at the real wage" : d.entry === "machine" ? "Machine cost at the real depreciation" : "Close the variances"}</td>
                              <td>{d.code} {d.name}</td>
                              <td style={{ textAlign: "right" }}>{Number(d.debit) ? acct(d.debit) : ""}</td>
                              <td style={{ textAlign: "right" }}>{Number(d.credit) ? acct(d.credit) : ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="text-[12px] text-[#A3B1C2] mt-2 max-w-[860px] space-y-1">
                    {Number(preview.labor.hours) > 0 && (
                      <div><b>Labor:</b> {Number(preview.labor.hours)} h on orders that name the employee were costed at {acct(preview.labor.applied)}; at the wages actually paid they cost {acct(preview.labor.actual)}. The {acct(preview.labor.variance)} difference is the labor rate variance.</div>
                    )}
                    {preview.machine && Number(preview.machine.assets) > 0 && (
                      <div><b>Machines:</b> production absorbed {acct(preview.machine.applied)} of machine cost over {Number(preview.machine.hours)} machine hours at the planned rate; the machines’ depreciation actually recorded for the month is {acct(preview.machine.actual)}. The {acct(preview.machine.variance)} difference is closed with the overhead variances. See Reports → Machine cost for the real rate per machine hour.</div>
                    )}
                    {preview.variances.length > 0 && (
                      <div><b>Variances:</b> {preview.variances.map((v) => `${v.name} ${acct(v.amount)}`).join(" · ")}. Material and labor variances follow the company’s <i>{preview.methods.variance === "COGS" ? "close to cost of goods sold" : "prorate"}</i> setting, overhead variances its <i>{preview.methods.overhead === "COGS" ? "close to cost of goods sold" : "prorate"}</i> setting. {allocationText(preview.methods.variance === "PRORATE" || preview.methods.overhead === "PRORATE" ? "PRORATE" : "COGS", preview.to_wip, preview.to_fg, preview.to_cogs)}</div>
                    )}
                  </div>

                  <div className="text-[12px] uppercase tracking-[0.08em] text-[#7F8EA0] mt-4 mb-1" style={{ fontFamily: MONO }}>3 · Post it</div>
                  <Label>Note (optional)</Label>
                  <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For your own records" />
                  <div className="flex gap-2 mt-3">
                    <GoldBtn type="button" disabled={busy || blocks(checks).length > 0} onClick={settle}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Post the month-end entries</GoldBtn>
                    <OutlineBtn type="button" disabled={busy} onClick={() => setWizard(null)}>Cancel</OutlineBtn>
                  </div>
                </>
              )}
            </Panel>
          )}
        </>
      )}

      {tab === "cogm" && (
        <>
          <Panel title="Period">
            <div className="grid gap-x-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 240px))", alignItems: "end" }}>
              <div><Label>From month</Label>
                <select className="input" value={monthStart(fromShown)} onChange={(e) => { setFrom(e.target.value); if (e.target.value > toShown) setTo(e.target.value); }}>
                  {[...rows].reverse().map((r) => <option key={r.period_start} value={r.period_start}>{monthLabel(r.period_start)}</option>)}
                </select></div>
              <div><Label>To month</Label>
                <select className="input" value={monthStart(toShown)} onChange={(e) => { setTo(e.target.value); if (e.target.value < fromShown) setFrom(e.target.value); }}>
                  {[...rows].reverse().map((r) => <option key={r.period_start} value={r.period_start}>{monthLabel(r.period_start)}</option>)}
                </select></div>
            </div>
          </Panel>

          {cogm === null ? <div className="py-10 flex justify-center"><Loader2 className="animate-spin" size={18} color="#F2B13C" /></div> : (
            <>
              <Panel title={`Statement of cost of goods manufactured · ${fromShown === toShown ? monthLabel(fromShown) : `${monthLabel(fromShown)} to ${monthLabel(toShown)}`}`}>
                <Statement lines={cogm.lines} />
                <div className="text-[11.5px] text-[#7F8EA0] mt-2 max-w-[820px]">
                  Materials and the work-in-process balances come from the ledger (the account balances). Labor and overhead are what the confirmations added to the orders; the checks below show that the two sources agree.
                  Amounts in brackets are deductions.
                </div>
              </Panel>

              <Panel title="Does it agree with the production records?">
                <div className="overflow-x-auto">
                  <table style={{ minWidth: 640 }}>
                    <thead><tr><th>Check</th><th style={{ textAlign: "right" }}>Ledger / statement</th><th style={{ textAlign: "right" }}>Production records</th><th style={{ textAlign: "right" }}>Difference</th><th /></tr></thead>
                    <tbody>
                      {cogm.checks.map((c) => (
                        <tr key={c.key}>
                          <td>{c.label}</td>
                          <td style={{ textAlign: "right", fontFamily: MONO }}>{acct(c.a)}</td>
                          <td style={{ textAlign: "right", fontFamily: MONO }}>{acct(c.b)}</td>
                          <td style={{ textAlign: "right", fontFamily: MONO }}>{acct(c.diff)}</td>
                          <td><Chip label={tiesOut(c) ? "Agrees" : "Differs"} tone={tiesOut(c) ? "good" : "bad"} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="From finished goods to cost of goods sold">
                <Statement lines={cogm.cogs} />
                <div className="text-[11.5px] text-[#7F8EA0] mt-2 max-w-[820px]">
                  What left finished goods is the cost of goods sold. Anything besides deliveries — scrapping from stock, count differences, by-products — shows on the “Other” line.
                </div>
              </Panel>
            </>
          )}
        </>
      )}

      {undo && (
        <ReverseModal title={`Undo ${monthLabel(undo.period_start)}`} what="The month-end entries are reversed and the month goes back to open."
          explain="The original entries stay in the journal; new entries cancel them." verb="undoing" submitLabel="Undo the month end" busy={busy}
          onCancel={() => setUndo(null)} onSubmit={(reason) => doUndo(reason)} />
      )}
      {reopen && (
        <ReverseModal title={`Re-open ${monthLabel(reopen.period_start)}`} what="The month-end entries are reversed, the books lock goes back to where it was, and the month is open again."
          explain="Only the latest month can be re-opened. The original entries stay in the journal; new entries cancel them." verb="re-opening" submitLabel="Re-open the month" busy={busy}
          onCancel={() => setReopen(null)} onSubmit={(reason) => doReopen(reason)} />
      )}
    </>
  );
}

function Statement({ lines }: { lines: StatementLine[] }) {
  return (
    <div className="overflow-x-auto">
      <table style={{ minWidth: 520, fontFamily: MONO, fontSize: 12.5 }}>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} title={l.note}
              style={{ borderTop: l.kind === "line" ? undefined : "1px solid rgba(197,208,226,0.25)", fontWeight: l.kind === "line" ? 400 : 600, background: l.kind === "total" ? "rgba(242,177,60,0.08)" : undefined }}>
              <td style={{ paddingLeft: l.kind === "line" ? 18 : 6 }}>{l.label}{l.note && <span className="text-[#7F8EA0] font-normal"> — {l.note}</span>}</td>
              <td style={{ textAlign: "right", width: 150 }}>{acct(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
