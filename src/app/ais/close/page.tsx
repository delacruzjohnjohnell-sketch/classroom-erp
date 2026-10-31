"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileText, Loader2, Scale } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Empty, FormStyles, KpiCard, Panel, TinyBtn } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate } from "@/lib/mutate";
import { showQueryErrors } from "@/lib/queryErrors";
import { money } from "@/lib/aisDesk";
import { clReady, type ClTask, type Statements } from "@/lib/aisSales";
import DeskPrimer from "@/components/ais/DeskPrimer";

type State = { phase: "ACCOUNTING" | "AUDIT" | "CLOSED"; receivable: number; tasks: ClTask[]; statements: Statements };
type Score = { visible: boolean; points?: number; max?: number; rows?: { seq: number; ref_no: string; points: number; max: number; message: string; why: string }[] };

const n = (v: unknown) => Number(v ?? 0);

export default function AisClosePage() {
  return <AppShell><Close /></AppShell>;
}

function Close() {
  const { effectiveTenantId } = useSession();
  const [st, setSt] = useState<State | null | undefined>(undefined);
  const [score, setScore] = useState<Score | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    // the state call creates the company's closing cards the first time, so the score is asked for after it
    const s = await supabase.rpc("ais_cl_state");
    if (showQueryErrors(s)) { setSt(null); return; }
    const sc = await supabase.rpc("ais_cl_my_score");
    const raw = s.data as State;
    setSt({ ...raw, receivable: n(raw.receivable), tasks: raw.tasks.map((t) => ({ ...t, amount: t.amount === null ? null : n(t.amount) })) });
    setScore((sc.data as Score | null) ?? null);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (effectiveTenantId) load(); }, [effectiveTenantId, load]);

  if (st === undefined) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin" size={20} color="#9D7CFF" /></div>;
  if (st === null) return <div className="px-7 py-6 max-w-[900px]"><Panel title="Close the books"><Empty>This page opens once your teacher has assigned a practice set to this company and you hold the Accounting seat.</Empty></Panel></div>;

  const open = st.phase === "ACCOUNTING";
  const ready = clReady(st.tasks);
  const f = st.statements;
  const done = st.tasks.filter((t) => t.state === "DONE").length;

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
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7F8EA0]">Accounting seat · Period-end close</div>
        <h1 className="text-[20px] font-bold mt-1">Close the books and read the statements</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1 max-w-[860px]">
          Everything the other desks posted is in the ledger. Before the statements are final you record two <b>adjusting entries</b> (an estimate and an accrual) and then the <b>closing entries</b>.
          The trial balance, income statement and balance sheet below update live, so you can see what each step changes. They run through {f.through}.
        </div>
      </div>

      <DeskPrimer desk="close" />
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <KpiCard icon={<CheckCircle2 size={14} />} label="Close steps done" value={`${done} of ${st.tasks.length}`} accent="#22D3C5" />
        <KpiCard icon={<FileText size={14} />} label="Net income" value={money(n(f.income.net_income))} accent="#F2B13C" />
        <KpiCard icon={<Scale size={14} />} label="Balance sheet" value={f.balance.balanced ? "Balances" : "Out of balance"} accent={f.balance.balanced ? "#22D3C5" : "#FF6B7A"} />
        <KpiCard icon={<CheckCircle2 size={14} />} label="Score" value={score?.visible ? `${score.points} / ${score.max}` : "after close"} accent="#9D7CFF" />
      </div>

      {!open && <div className="rounded-lg border border-hairline bg-panel px-4 py-3 text-[12.5px] text-[#A3B1C2]">The Accounting phase is closed, so this page is read-only now.</div>}

      <Panel title="Period-end steps (in order)">
        <table>
          <thead><tr><th style={{ width: 36 }}>#</th><th>Step</th><th>What it says</th><th>Where it stands</th><th /></tr></thead>
          <tbody>
            {st.tasks.map((t) => (
              <tr key={t.id}>
                <td>{t.seq}</td>
                <td><b>{t.title}</b></td>
                <td style={{ fontSize: 12 }}>{t.note}{t.kind === "ALLOWANCE" && <div className="mt-1">Receivable balance at {f.through}: <b>{money(st.receivable)}</b>. Work out 2% of it and enter it to the centavo; the system refuses a wrong figure and does not tell you the right one.</div>}</td>
                <td style={{ fontSize: 12, color: t.state === "DONE" ? "#22D3C5" : "#F2B13C" }}>● {t.state === "DONE" ? (t.kind === "ACCRUAL" ? (t.decision === "ACCRUE" ? "Accrued" : "Skipped") : t.kind === "ALLOWANCE" ? `Recorded: ${money(t.amount)}` : `Closed: net income ${money(t.amount)}`) : "Not started"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {open && t.kind === "ALLOWANCE" && t.state === "NEW" && <span className="inline-flex items-center gap-2"><input className="input" style={{ width: 150, padding: "5px 8px" }} inputMode="decimal" placeholder="Allowance" value={amount} onChange={(e) => setAmount(e.target.value)} /><TinyBtn type="button" onClick={() => { if (!busy) run("ais_cl_allowance", { p_amount: Number(amount) }, "Allowance recorded."); }}>Record</TinyBtn></span>}
                  {open && t.kind === "ACCRUAL" && t.state === "NEW" && <><TinyBtn type="button" onClick={() => { if (!busy) run("ais_cl_accrue", { p_decision: "ACCRUE" }, "Electricity accrued in January."); }}>Accrue it</TinyBtn>{" "}<TinyBtn type="button" onClick={() => { if (!busy) run("ais_cl_accrue", { p_decision: "SKIP" }, "Skipped."); }}>Skip it</TinyBtn></>}
                  {open && t.kind === "CLOSING" && t.state === "NEW" && <TinyBtn type="button" onClick={() => { if (!busy) run("ais_cl_close", {}, "The books are closed for January."); }}>{ready.close ? "Post the closing entries" : "Post the closing entries (adjust first)"}</TinyBtn>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", alignItems: "start" }}>
        <Panel title={`Trial balance ${f.tb_ok ? "(debits equal credits)" : "(OUT OF BALANCE)"}`}>
          <table>
            <thead><tr><th>Account</th><th style={{ textAlign: "right" }}>Debit</th><th style={{ textAlign: "right" }}>Credit</th></tr></thead>
            <tbody>
              {f.trial_balance.map((r) => (<tr key={r.code}><td>{r.code} · {r.name}</td><td style={{ textAlign: "right" }}>{n(r.debit) ? money(n(r.debit)) : ""}</td><td style={{ textAlign: "right" }}>{n(r.credit) ? money(n(r.credit)) : ""}</td></tr>))}
              <tr><td><b>Total</b></td><td style={{ textAlign: "right" }}><b>{money(n(f.td))}</b></td><td style={{ textAlign: "right" }}><b>{money(n(f.tc))}</b></td></tr>
            </tbody>
          </table>
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel title="Income statement">
            <table>
              <tbody>
                <tr><td colSpan={2}><b>Revenue</b></td></tr>
                {f.income.revenue.map((r) => (<tr key={r.code}><td>{r.name}</td><td style={{ textAlign: "right" }}>{money(n(r.amount))}</td></tr>))}
                <tr><td><b>Total revenue</b></td><td style={{ textAlign: "right" }}><b>{money(n(f.income.total_revenue))}</b></td></tr>
                <tr><td colSpan={2}><b>Expenses</b></td></tr>
                {f.income.expenses.map((r) => (<tr key={r.code}><td>{r.name}</td><td style={{ textAlign: "right" }}>{money(n(r.amount))}</td></tr>))}
                <tr><td><b>Total expenses</b></td><td style={{ textAlign: "right" }}><b>{money(n(f.income.total_expenses))}</b></td></tr>
                <tr><td><b>Net income</b></td><td style={{ textAlign: "right" }}><b>{money(n(f.income.net_income))}</b></td></tr>
              </tbody>
            </table>
          </Panel>
          <Panel title={`Balance sheet ${f.balance.balanced ? "(assets equal liabilities plus equity)" : "(OUT OF BALANCE)"}`}>
            <table>
              <tbody>
                <tr><td colSpan={2}><b>Assets</b></td></tr>
                {f.balance.assets.map((r) => (<tr key={r.code}><td>{r.name}</td><td style={{ textAlign: "right" }}>{money(n(r.amount))}</td></tr>))}
                <tr><td><b>Total assets</b></td><td style={{ textAlign: "right" }}><b>{money(n(f.balance.total_assets))}</b></td></tr>
                <tr><td colSpan={2}><b>Liabilities</b></td></tr>
                {f.balance.liabilities.map((r) => (<tr key={r.code}><td>{r.name}</td><td style={{ textAlign: "right" }}>{money(n(r.amount))}</td></tr>))}
                <tr><td><b>Total liabilities</b></td><td style={{ textAlign: "right" }}><b>{money(n(f.balance.total_liabilities))}</b></td></tr>
                <tr><td colSpan={2}><b>Owner&apos;s equity</b></td></tr>
                {f.balance.equity_accounts.map((r) => (<tr key={r.code}><td>{r.name}</td><td style={{ textAlign: "right" }}>{money(n(r.amount))}</td></tr>))}
                {n(f.balance.current_earnings) !== 0 && <tr><td>Net income for the period (not yet closed)</td><td style={{ textAlign: "right" }}>{money(n(f.balance.current_earnings))}</td></tr>}
                <tr><td><b>Total equity</b></td><td style={{ textAlign: "right" }}><b>{money(n(f.balance.total_equity))}</b></td></tr>
                <tr><td><b>Liabilities plus equity</b></td><td style={{ textAlign: "right" }}><b>{money(n(f.balance.total_liabilities) + n(f.balance.total_equity))}</b></td></tr>
              </tbody>
            </table>
          </Panel>
        </div>
      </div>

      {score?.visible && score.rows && (
        <Panel title={`How you did: ${score.points} of ${score.max}`}>
          <table>
            <thead><tr><th>Step</th><th>Points</th><th>Result</th><th>The reasoning</th></tr></thead>
            <tbody>{score.rows.map((r) => (<tr key={r.seq}><td>{r.seq} · {r.ref_no}</td><td>{r.points} / {r.max}</td><td style={{ fontSize: 12 }}>{r.message}</td><td style={{ fontSize: 12, color: "#A3B1C2" }}>{r.why}</td></tr>))}</tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
