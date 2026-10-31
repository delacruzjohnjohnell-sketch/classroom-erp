"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { GoldBtn, OutlineBtn, Panel, FormStyles, Label } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { showQueryErrors } from "@/lib/queryErrors";
import {
  cleanLines, emptyLine, groupControls, lineTotals, money, nextPending, postProblem, STATUS_LABEL, STATUS_TONE,
  type Control, type DraftLine, type InboxRow, type Packet,
} from "@/lib/aisDesk";

type PacketResp = {
  id: string; seq: number; title: string; doc_date: string; status: InboxRow["status"]; wrong_attempts: number;
  packet: Packet; decision: "POST" | "HOLD" | null; failed_control: string | null; lines: { acct: string; debit: number; credit: number }[] | null;
};
type Review = { visible: boolean; message?: string; key_decision?: "POST" | "HOLD"; failed_control?: string | null; failed_label?: string | null; explanation?: string | null;
  key_journal?: { acct: string; name: string | null; debit: number; credit: number }[]; your_decision?: string | null; your_control_label?: string | null; points?: number; max?: number; detail?: string | null; correct_decision?: boolean };
type Result = { status: string; result?: string; message?: string; hint?: string | null; wrong_attempts?: number; points?: number | null; max_points?: number | null; detail?: string | null; explanation?: string | null };
type Account = { code: string; name: string };

export default function AisReviewPage() {
  return <AppShell><Review /></AppShell>;
}

function Review() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { effectiveTenantId } = useSession();
  const [data, setData] = useState<PacketResp | null>(null);
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [controls, setControls] = useState<Control[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [choice, setChoice] = useState<"POST" | "HOLD" | "">("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine(), emptyLine()]);
  const [control, setControl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [review, setReview] = useState<Review | null>(null);

  const load = useCallback(async () => {
    const [p, i, c, a] = await Promise.all([
      supabase.rpc("ais_packet", { p_txn: id }),
      supabase.rpc("ais_inbox"),
      supabase.from("ais_controls").select("tag, label, hall_category, description"),
      supabase.from("accounts").select("code, name").eq("tenant_id", effectiveTenantId ?? "").order("code"),
    ]);
    showQueryErrors(p, i, c, a);
    const pd = (p.data as PacketResp | null) ?? null;
    setData(pd);
    if (pd && pd.status !== "PENDING") {
      const rv = await supabase.rpc("ais_doc_review", { p_txn: id });
      setReview(rv.error ? null : (rv.data as Review));
    } else setReview(null);
    setRows(((i.data as InboxRow[]) ?? []).map((x) => ({ ...x, seq: Number(x.seq) })));
    setControls((c.data as Control[]) ?? []);
    setAccounts((a.data as Account[]) ?? []);
  }, [id, effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (effectiveTenantId) load(); }, [effectiveTenantId, load]);

  const known = useMemo(() => accounts.map((a) => a.code), [accounts]);
  const problem = choice === "POST" ? postProblem(lines, known) : "";
  const totals = lineTotals(lines);
  const next = nextPending(rows, id);
  const groups = useMemo(() => groupControls(controls), [controls]);
  const picked = controls.find((c) => c.tag === control);

  const setLine = (i: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    if (!data || busy || !choice) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("ais_decide", {
      p_txn: id, p_decision: choice, p_failed_control: choice === "HOLD" ? control : null, p_lines: choice === "POST" ? cleanLines(lines) : null,
    }));
    setBusy(false);
    if (!ok(res)) return;
    setResult(res.data as Result);
    await load();
  };

  if (!data) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin" size={20} color="#9D7CFF" /></div>;

  const decided = data.status !== "PENDING";
  const codeName = (code: string) => accounts.find((a) => a.code === code)?.name ?? "";

  return (
    <div className="px-7 py-6 max-w-[1250px] flex flex-col gap-4">
      <button onClick={() => router.push("/ais/inbox")} className="flex items-center gap-1.5 text-[12.5px] text-[#A3B1C2] w-fit"><ArrowLeft size={14} /> Back to the inbox</button>
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7F8EA0]">Document {data.seq} · dated {data.doc_date}</div>
        <h1 className="text-[20px] font-bold mt-1">{data.title}</h1>
        <div className="text-[12px] mt-1 font-semibold" style={{ color: STATUS_TONE[data.status] }}>● {STATUS_LABEL[data.status]}</div>
      </div>

      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", alignItems: "start" }}>
        {/* ---------- the packet ---------- */}
        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#7F8EA0]">The document packet — read every page before you decide</div>
          {data.packet.docs.map((d, i) => (
            <div key={i} className="rounded-lg border border-hairline bg-panel overflow-hidden">
              <div className="px-4 py-2 text-[12px] font-semibold border-b border-hairline" style={{ background: "rgba(157,124,255,0.1)", color: "#C8B6FF" }}>{d.type}</div>
              <table style={{ margin: 0 }}>
                <tbody>
                  {Object.entries(d.fields).map(([k, v]) => (
                    <tr key={k}><td style={{ width: "42%", color: "#7F8EA0", fontSize: 12 }}>{k}</td><td style={{ fontSize: 12.5 }}>{v}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* ---------- your decision ---------- */}
        <div className="flex flex-col gap-3">
          {decided ? (
            <Panel title="Your decision">
              <div className="text-[13px]"><b>{data.decision === "POST" ? "You posted this document." : "You held this document."}</b></div>
              {data.decision === "HOLD" && <div className="text-[12.5px] text-[#A3B1C2] mt-1">Control you named: {controls.find((c) => c.tag === data.failed_control)?.label ?? data.failed_control}</div>}
              {data.decision === "POST" && data.lines && (
                <table className="mt-2">
                  <thead><tr><th>Account</th><th style={{ textAlign: "right" }}>Debit</th><th style={{ textAlign: "right" }}>Credit</th></tr></thead>
                  <tbody>{data.lines.map((l, i) => <tr key={i}><td>{l.acct} {codeName(l.acct)}</td><td style={{ textAlign: "right" }}>{l.debit ? money(l.debit) : ""}</td><td style={{ textAlign: "right" }}>{l.credit ? money(l.credit) : ""}</td></tr>)}</tbody>
                </table>
              )}
              {result && result.points !== undefined && result.points !== null && (
                <div className="mt-3 text-[12.5px] rounded-md border border-hairline p-3">
                  <b>{result.points} of {result.max_points} points.</b> {result.detail}
                </div>
              )}
              {result && (result.points === undefined || result.points === null) && <div className="mt-3 text-[12px] text-[#7F8EA0]">Recorded. Your score appears when you close the Accounting phase.</div>}
              {review && review.visible && (
                <div className="mt-4 rounded-md border p-3 text-[12.5px]" style={{ borderColor: "rgba(157,124,255,0.45)", background: "rgba(157,124,255,0.06)" }}>
                  <div className="font-semibold mb-1">Why: what the documents showed</div>
                  <div className="mb-1.5">The right decision was <b>{review.key_decision === "POST" ? "to post it" : `to hold it: ${review.failed_label ?? review.failed_control}`}</b>.
                    {review.correct_decision === false && <span style={{ color: "#FF6B7A" }}> {review.key_decision === "HOLD" ? "A control had failed; the document should not have been posted." : "It was a valid document and should have been posted."}</span>}
                    {review.your_decision === "HOLD" && review.key_decision === "HOLD" && review.your_control_label && review.your_control_label !== review.failed_label && <span> You named “{review.your_control_label}”.</span>}</div>
                  {review.explanation && <div className="text-[#3F4B5E] mb-2">{review.explanation}</div>}
                  {review.key_journal && review.key_journal.length > 0 && (
                    <table style={{ margin: "4px 0" }}>
                      <thead><tr><th>The right journal</th><th style={{ textAlign: "right" }}>Debit</th><th style={{ textAlign: "right" }}>Credit</th></tr></thead>
                      <tbody>{review.key_journal.map((l, i) => <tr key={i}><td>{l.acct} {l.name}</td><td style={{ textAlign: "right" }}>{Number(l.debit) ? money(Number(l.debit)) : ""}</td><td style={{ textAlign: "right" }}>{Number(l.credit) ? money(Number(l.credit)) : ""}</td></tr>)}</tbody>
                    </table>
                  )}
                  <div className="text-[#7F8EA0]">{review.points} of {review.max} points. {review.detail}</div>
                </div>
              )}
              {review && !review.visible && <div className="mt-3 text-[12px] text-[#7F8EA0]">{review.message}</div>}
              <div className="flex gap-2 mt-4">
                {next ? <GoldBtn onClick={() => router.push(`/ais/inbox/${next}`)}>Next document</GoldBtn>
                      : <OutlineBtn onClick={() => router.push("/ais/inbox")}>Back to the inbox</OutlineBtn>}
              </div>
            </Panel>
          ) : (
            <Panel title="Your decision">
              {result?.result === "journal_mismatch" && (
                <div className="mb-3 rounded-md border p-3 text-[12.5px]" style={{ borderColor: "rgba(255,107,122,0.5)", background: "rgba(255,107,122,0.08)" }}>{result.message}{result.hint && <div className="mt-1.5 font-semibold">Hint: {result.hint}</div>}</div>
              )}
              <div className="flex gap-4 mb-3">
                <label className="flex items-center gap-2 text-[13px]"><input type="radio" checked={choice === "POST"} onChange={() => setChoice("POST")} /> <b>Post</b> it to the ledger</label>
                <label className="flex items-center gap-2 text-[13px]"><input type="radio" checked={choice === "HOLD"} onChange={() => setChoice("HOLD")} /> <b>Hold</b> it: a control failed</label>
              </div>

              {choice === "POST" && (
                <>
                  <Label>Journal entry — dated {data.doc_date}</Label>
                  <datalist id="ais-accounts">{accounts.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</datalist>
                  <table style={{ margin: 0 }}>
                    <thead><tr><th>Account</th><th style={{ width: 120, textAlign: "right" }}>Debit</th><th style={{ width: 120, textAlign: "right" }}>Credit</th><th style={{ width: 28 }} /></tr></thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={i}>
                          <td><input className="input" list="ais-accounts" value={l.acct} placeholder="code, e.g. 1100" onChange={(e) => setLine(i, { acct: e.target.value })} />
                            {l.acct && <div className="text-[10.5px] text-[#7F8EA0] mt-0.5">{codeName(l.acct) || "not in the chart of accounts"}</div>}</td>
                          <td><input className="input" style={{ textAlign: "right" }} inputMode="decimal" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value })} /></td>
                          <td><input className="input" style={{ textAlign: "right" }} inputMode="decimal" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value })} /></td>
                          <td>{lines.length > 2 && <button type="button" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}><Trash2 size={12} /></button>}</td>
                        </tr>
                      ))}
                      <tr>
                        <td><button type="button" className="text-[12px] text-teal flex items-center gap-1" onClick={() => setLines((ls) => [...ls, emptyLine()])}><Plus size={12} /> Add line</button></td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{money(totals.debit)}</td><td style={{ textAlign: "right", fontWeight: 600 }}>{money(totals.credit)}</td><td />
                      </tr>
                    </tbody>
                  </table>
                  <div className="text-[12px] mt-2" style={{ color: problem ? "#F2B13C" : "#22D3C5" }}>{problem || "Balanced. Ready to post."}</div>
                  <div className="mt-3"><GoldBtn onClick={submit} disabled={busy || !!problem}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Post to the ledger</GoldBtn></div>
                </>
              )}

              {choice === "HOLD" && (
                <>
                  <Label>Which control failed?</Label>
                  <select className="input" value={control} onChange={(e) => setControl(e.target.value)}>
                    <option value="">Choose the control…</option>
                    {groups.map((g) => <optgroup key={g.category} label={g.category}>{g.items.map((c) => <option key={c.tag} value={c.tag}>{c.label}</option>)}</optgroup>)}
                  </select>
                  {picked && <div className="text-[12px] text-[#A3B1C2] mt-2">{picked.description}</div>}
                  <div className="mt-3"><GoldBtn onClick={submit} disabled={busy || !control}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Hold this document</GoldBtn></div>
                </>
              )}

              {!choice && <div className="text-[12.5px] text-[#7F8EA0]">Compare the documents on the left. Do they agree with each other and carry the right approvals? Then choose to post or hold.</div>}
              <div className="text-[11.5px] text-[#7F8EA0] mt-4">A decision is final. Posting writes to the ledger; holding keeps it out.</div>
            </Panel>
          )}
        </div>
      </div>
      <FormStyles />
    </div>
  );
}
