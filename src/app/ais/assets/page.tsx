"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Landmark, Loader2, Receipt } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Empty, FormStyles, KpiCard, Panel, TinyBtn } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate } from "@/lib/mutate";
import { showQueryErrors } from "@/lib/queryErrors";
import { money } from "@/lib/aisDesk";
import { faReady, type FaAsset, type FaTask } from "@/lib/aisSales";
import DeskPrimer from "@/components/ais/DeskPrimer";

type State = { phase: "ACCOUNTING" | "AUDIT" | "CLOSED"; assets: FaAsset[]; tasks: FaTask[] };
type Score = { visible: boolean; points?: number; max?: number; rows?: { seq: number; ref_no: string; points: number; max: number; message: string; why: string }[] };

const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export default function AisAssetsPage() {
  return <AppShell><Assets /></AppShell>;
}

function Assets() {
  const { effectiveTenantId } = useSession();
  const [st, setSt] = useState<State | null | undefined>(undefined);
  const [score, setScore] = useState<Score | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    // the state call creates the company's register and cards the first time, so the score is asked for after it
    const s = await supabase.rpc("ais_fa_state");
    if (showQueryErrors(s)) { setSt(null); return; }
    const sc = await supabase.rpc("ais_fa_my_score");
    const raw = s.data as State;
    setSt({
      ...raw,
      assets: raw.assets.map((a) => ({ ...a, cost: Number(a.cost), acc_dep: Number(a.acc_dep), nbv: Number(a.nbv) })),
      tasks: raw.tasks.map((t) => ({ ...t, net: numOrNull(t.net), proceeds: numOrNull(t.proceeds) })),
    });
    setScore((sc.data as Score | null) ?? null);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (effectiveTenantId) load(); }, [effectiveTenantId, load]);

  if (st === undefined) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin" size={20} color="#9D7CFF" /></div>;
  if (st === null) return <div className="px-7 py-6 max-w-[900px]"><Panel title="Fixed assets desk"><Empty>The Fixed assets desk opens once your teacher has assigned a practice set to this company and you hold the Accounting seat.</Empty></Panel></div>;

  const open = st.phase === "ACCOUNTING";
  const ready = faReady(st.tasks);
  const done = st.tasks.filter((t) => t.state === "DONE").length;
  const nbv = st.assets.filter((a) => a.status === "ACTIVE").reduce((s, a) => s + a.nbv, 0);

  const run = async (fn: string, args: Record<string, unknown>, msg: string) => {
    setBusy(true);
    await mutate(supabase.rpc(fn, args), { successMessage: msg });
    setBusy(false);
    await load();
  };

  return (
    <div className="px-7 py-6 max-w-[1200px] flex flex-col gap-5">
      <FormStyles />
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7F8EA0]">Accounting seat · Fixed assets workbench</div>
        <h1 className="text-[20px] font-bold mt-1">Fixed assets desk</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1 max-w-[860px]">
          Company policy: spend above <b>15,000</b> that adds an asset or makes it last longer is <b>capitalized</b> (put on the register and depreciated over its life). Routine repairs, servicing and small items are <b>expensed</b> this month.
          Decide each of the five invoices, then <b>run January depreciation</b>, then <b>record the sale</b> of the old forklift. The system posts exactly what you decide, so decide carefully.
        </div>
      </div>

      <DeskPrimer desk="assets" />
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <KpiCard icon={<CheckCircle2 size={14} />} label="Cards finished" value={`${done} of ${st.tasks.length}`} accent="#22D3C5" />
        <KpiCard icon={<Landmark size={14} />} label="Net book value" value={money(nbv)} accent="#F2B13C" />
        <KpiCard icon={<Receipt size={14} />} label="Assets on the register" value={st.assets.filter((a) => a.status === "ACTIVE").length} accent="#9D7CFF" />
        <KpiCard icon={<CheckCircle2 size={14} />} label="Score" value={score?.visible ? `${score.points} / ${score.max}` : "after close"} accent="#9D7CFF" />
      </div>

      {!open && <div className="rounded-lg border border-hairline bg-panel px-4 py-3 text-[12.5px] text-[#A3B1C2]">The Accounting phase is closed, so the Fixed assets desk is read-only now.</div>}

      <Panel title="Cards (work these in order)">
        <table>
          <thead><tr><th style={{ width: 36 }}>#</th><th>Card</th><th>What it says</th><th>Where it stands</th><th /></tr></thead>
          <tbody>
            {st.tasks.map((t) => (
              <tr key={t.id}>
                <td>{t.seq}</td>
                <td><b>{t.kind === "INVOICE" ? "Vendor invoice" : t.kind === "DEPRECIATION" ? "Depreciation run" : "Disposal"}</b><div className="text-[11px] text-[#7F8EA0]">{t.inv_no ? `${t.inv_no} · ` : ""}{t.doc_date}</div></td>
                <td style={{ fontSize: 12 }}>
                  <b>{t.title}</b>{t.vendor && <> from {t.vendor}</>}{t.net !== null && <> · {money(t.net)} before VAT</>}{t.proceeds !== null && <> · sold for {money(t.proceeds)}</>}
                  {t.note && <div className="text-[11px] text-[#A3B1C2] mt-0.5">{t.note}</div>}
                </td>
                <td style={{ fontSize: 12, color: t.state === "DONE" ? "#22D3C5" : "#F2B13C" }}>● {t.state === "DONE" ? (t.decision === "CAPITALIZE" ? "Capitalized" : t.decision === "EXPENSE" ? "Expensed" : "Done") : "Not started"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {open && t.kind === "INVOICE" && t.state === "NEW" && <><TinyBtn type="button" onClick={() => { if (!busy) run("ais_fa_decide", { p_task: t.id, p_decision: "CAPITALIZE" }, "Capitalized and added to the register."); }}>Capitalize</TinyBtn>{" "}<TinyBtn type="button" onClick={() => { if (!busy) run("ais_fa_decide", { p_task: t.id, p_decision: "EXPENSE" }, "Expensed."); }}>Expense</TinyBtn></>}
                  {open && t.kind === "DEPRECIATION" && t.state === "NEW" && <TinyBtn type="button" onClick={() => { if (!busy) run("ais_fa_depreciate", {}, "January depreciation posted."); }}>{ready.depreciate ? "Run January depreciation" : "Run January depreciation (decide the invoices first)"}</TinyBtn>}
                  {open && t.kind === "DISPOSAL" && t.state === "NEW" && <TinyBtn type="button" onClick={() => { if (!busy) run("ais_fa_dispose", { p_task: t.id }, "Sale recorded."); }}>{ready.dispose ? "Record the sale" : "Record the sale (depreciate first)"}</TinyBtn>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Fixed asset register">
        <table>
          <thead><tr><th>Code</th><th>Asset</th><th style={{ textAlign: "right" }}>Cost</th><th>Life</th><th>In service</th><th style={{ textAlign: "right" }}>Accumulated depreciation</th><th style={{ textAlign: "right" }}>Net book value</th><th>Status</th></tr></thead>
          <tbody>{st.assets.map((a) => (
            <tr key={a.id}><td>{a.code}</td><td>{a.name}</td><td style={{ textAlign: "right" }}>{money(a.cost)}</td><td>{a.life_months} months</td><td>{a.in_service}</td><td style={{ textAlign: "right" }}>{money(a.acc_dep)}</td><td style={{ textAlign: "right" }}>{money(a.nbv)}</td>
              <td style={{ color: a.status === "ACTIVE" ? "#22D3C5" : "#7F8EA0" }}>{a.status === "ACTIVE" ? "In use" : "Sold"}</td></tr>
          ))}</tbody>
        </table>
        <div className="text-[11px] text-[#7F8EA0] mt-2">Straight line, no salvage value, a full month of depreciation for assets in service by the 15th.</div>
      </Panel>

      {score?.visible && score.rows && (
        <Panel title={`How you did: ${score.points} of ${score.max}`}>
          <table>
            <thead><tr><th>Card</th><th>Points</th><th>Result</th><th>The reasoning</th></tr></thead>
            <tbody>{score.rows.map((r) => (<tr key={r.seq}><td>{r.seq} · {r.ref_no}</td><td>{r.points} / {r.max}</td><td style={{ fontSize: 12 }}>{r.message}</td><td style={{ fontSize: 12, color: "#A3B1C2" }}>{r.why}</td></tr>))}</tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
