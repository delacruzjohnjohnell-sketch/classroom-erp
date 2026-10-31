"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSearch, Loader2, Plus } from "lucide-react";
import AppShell from "@/components/AppShell";
import { ConfirmDialog, Empty, FormStyles, GoldBtn, KpiCard, Label, Modal, OutlineBtn, Panel, TinyBtn } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { friendlyError, mutate, ok } from "@/lib/mutate";
import { showQueryErrors } from "@/lib/queryErrors";
import { money } from "@/lib/aisDesk";
import {
  benfordRows, emptyFinding, findingProblem, reversalDate, scoreSentence, SEVERITIES, SEVERITY_TONE, STATUS_WORDS, TESTS, typeForTest,
  type AuditScore, type BenfordDigit, type FindingForm, type TestDef, type TestKind,
} from "@/lib/aisAudit";

type Overview = { phase: "AUDIT" | "CLOSED"; lock_date: string | null; entries: number; total_debits: number; first_date: string; last_date: string; tests_run: number; samples: number; workpapers: number; signed: number; findings: number; reversed: number };
type EntryRow = { entry_id: string; entry_date: string; created_at: string; posted_day: string; memo: string; amount: number; reversed: boolean };
type Vouch = { entry_id: string; entry_date: string; memo: string; source: "DESK" | "POPULATION" | "REVERSAL"; posted_at: string; packet: { docs: { type: string; fields: Record<string, string> }[] } | null; note: string | null; lines: { acct: string; name: string; debit: number; credit: number }[] };
type TestRow = { entry_id: string | null; entry_date: string | null; memo: string; amount: number | null; reason: string };
type TestResult = { kind: TestKind; flagged: number; rows: TestRow[]; population: number; stats: { n?: number; digits?: BenfordDigit[]; mad?: number; conformity?: string } };
type Sample = { id: string; method: "RANDOM" | "MUS"; params: { n?: number; interval?: number }; seed: number; created_at: string };
type SampleItem = { item_id: string; entry_id: string; entry_date: string; memo: string; amount: number; selection_reason: string; result: "PASS" | "EXCEPTION" | null; note: string | null };
type Workpaper = { id: string; ref_no: string; title: string; objective: string | null; procedure_text: string | null; conclusion: string | null; sample_id: string | null; status: "DRAFT" | "SIGNED" };
type Finding = { id: string; entry_id: string | null; exception_type: string; condition_text: string; severity: FindingForm["severity"]; status: "OPEN" | "REVERSED"; reversal_entry_id: string | null; workpaper_id: string | null };
type FType = { tag: string; label: string; category: string };

const TABS = ["Ledger", "Tests", "Sampling", "Workpapers", "Findings", "Close the audit"] as const;
type Tab = (typeof TABS)[number];
const VIOLET = "#9D7CFF";

type ProcessScore = { visible: boolean; points?: number; max?: number; rows?: { label: string; points: number; max: number; message: string }[] };

export default function AisAuditPage() {
  return <AppShell><Audit /></AppShell>;
}

function Audit() {
  const { effectiveTenantId } = useSession();
  const [ov, setOv] = useState<Overview | null | undefined>(undefined);
  const [lockedMsg, setLockedMsg] = useState("");
  const [tab, setTab] = useState<Tab>("Ledger");
  const [types, setTypes] = useState<FType[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [wps, setWps] = useState<Workpaper[]>([]);
  const [finds, setFinds] = useState<Finding[]>([]);
  const [score, setScore] = useState<AuditScore | null>(null);
  const [proc, setProc] = useState<ProcessScore | null>(null);
  const [finding, setFinding] = useState<FindingForm | null>(null);

  const load = useCallback(async () => {
    const o = await supabase.rpc("ais_audit_overview");
    if (o.error) { setLockedMsg(friendlyError(o.error.message)); setOv(null); return; }
    setOv(o.data as Overview);
    const [ft, sm, wp, fd, sc, pr] = await Promise.all([
      supabase.from("ais_finding_types").select("tag, label, category"),
      supabase.from("ais_samples").select("id, method, params, seed, created_at").eq("tenant_id", effectiveTenantId ?? "").order("created_at", { ascending: false }),
      supabase.from("ais_workpapers").select("id, ref_no, title, objective, procedure_text, conclusion, sample_id, status").eq("tenant_id", effectiveTenantId ?? "").order("ref_no"),
      supabase.from("ais_findings").select("id, entry_id, exception_type, condition_text, severity, status, reversal_entry_id, workpaper_id").eq("tenant_id", effectiveTenantId ?? "").order("created_at"),
      supabase.rpc("ais_audit_score"),
      supabase.rpc("ais_my_audit_process"),   // how you worked; shown once the audit is closed (needs migration 0082)
    ]);
    showQueryErrors(ft, sm, wp, fd);
    setTypes((ft.data as FType[]) ?? []); setSamples((sm.data as Sample[]) ?? []); setWps((wp.data as Workpaper[]) ?? []); setFinds((fd.data as Finding[]) ?? []);
    setScore((sc.data as AuditScore | null) ?? null);
    setProc(pr.error ? null : ((pr.data as ProcessScore | null) ?? null));
  }, [effectiveTenantId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (effectiveTenantId) load(); }, [effectiveTenantId, load]);

  if (ov === undefined) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin" size={20} color={VIOLET} /></div>;
  if (ov === null) return (
    <div className="px-7 py-6 max-w-[900px]"><Panel title="Audit room"><Empty>{lockedMsg || "The Audit phase is not open yet."}</Empty></Panel></div>
  );
  const open = ov.phase === "AUDIT";
  const typeLabel = (tag: string) => types.find((x) => x.tag === tag)?.label ?? tag;

  return (
    <div className="px-7 py-6 max-w-[1250px] flex flex-col gap-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7F8EA0]">Audit seat</div>
        <h1 className="text-[20px] font-bold mt-1 flex items-center gap-2"><FileSearch size={20} color={VIOLET} /> Audit room</h1>
        <div className="text-[12.5px] text-[#A3B1C2] mt-1 max-w-[820px]">
          The Accounting seat has closed the books through {ov.lock_date ?? "the period end"}. Your job is to test what was posted, document your work, report what is wrong and reverse entries that should not stand. Planted exceptions are hidden in the ledger: find as many as you can, and report only what you can support.
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <KpiCard icon={<FileSearch size={14} />} label="Entries" value={ov.entries} />
        <KpiCard icon={<FileSearch size={14} />} label="Total debits" value={money(Number(ov.total_debits))} />
        <KpiCard icon={<FileSearch size={14} />} label="Tests run" value={ov.tests_run} accent="#22D3C5" />
        <KpiCard icon={<FileSearch size={14} />} label="Workpapers" value={`${ov.signed} / ${ov.workpapers} signed`} accent="#F2B13C" />
        <KpiCard icon={<FileSearch size={14} />} label="Findings" value={`${ov.findings} (${ov.reversed} reversed)`} accent={VIOLET} />
      </div>

      <div className="flex gap-1.5 flex-wrap border-b border-hairline pb-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="px-3 py-1.5 rounded-md text-[12.5px] font-semibold border"
            style={{ color: tab === t ? VIOLET : "#7F8EA0", borderColor: tab === t ? "rgba(157,124,255,0.6)" : "#243140", background: tab === t ? "rgba(157,124,255,0.1)" : "transparent" }}>{t}</button>
        ))}
      </div>

      {tab === "Ledger" && <LedgerTab open={open} onReport={(entryId, memo) => setFinding({ ...emptyFinding(), entryId, condition: memo ? `Entry "${memo}": ` : "" })} />}
      {tab === "Tests" && <TestsTab open={open} onReport={(entryId, type, memo, reason) => setFinding({ ...emptyFinding(), entryId: entryId ?? "", type, condition: `${memo}: ${reason}` })} />}
      {tab === "Sampling" && <SamplingTab open={open} samples={samples} onChanged={load} onReport={(entryId, memo) => setFinding({ ...emptyFinding(), entryId, condition: `Sampled entry "${memo}": ` })} />}
      {tab === "Workpapers" && <WorkpapersTab open={open} wps={wps} samples={samples} onChanged={load} />}
      {tab === "Findings" && <FindingsTab open={open} finds={finds} lock={ov.lock_date} typeLabel={typeLabel} wps={wps} onNew={() => setFinding(emptyFinding())} onChanged={load} />}
      {tab === "Close the audit" && <CloseTab open={open} ov={ov} score={score} proc={proc} onChanged={load} />}

      {finding && <FindingModal form={finding} types={types} wps={wps} onClose={() => setFinding(null)} onSaved={async () => { setFinding(null); setTab("Findings"); await load(); }} />}
      <FormStyles />
    </div>
  );
}

/* ---------------------------------------------------------------- ledger */
function LedgerTab({ open, onReport }: { open: boolean; onReport: (entryId: string, memo: string) => void }) {
  const [rows, setRows] = useState<EntryRow[] | null>(null);
  const [q, setQ] = useState(""); const [min, setMin] = useState(""); const [max, setMax] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [vouch, setVouch] = useState<Vouch | null>(null);

  const search = useCallback(async () => {
    const r = await supabase.rpc("ais_audit_entries", { p_from: from || null, p_to: to || null, p_min: min ? Number(min) : null, p_max: max ? Number(max) : null, p_search: q || null, p_limit: 300 });
    if (showQueryErrors(r)) return;
    setRows(((r.data as EntryRow[]) ?? []).map((x) => ({ ...x, amount: Number(x.amount) })));
  }, [q, min, max, from, to]);
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { search(); }, []);   // the first load only; later searches are on the button

  const openVouch = async (id: string) => {
    const r = await supabase.rpc("ais_audit_vouch", { p_entry: id });
    if (showQueryErrors(r)) return;
    setVouch(r.data as Vouch);
  };

  return (
    <Panel title="The ledger">
      <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <div><Label>Search the memo</Label><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="customer or INV-9040" /></div>
        <div><Label>From</Label><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>To</Label><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div><Label>Amount at least</Label><input className="input" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} /></div>
        <div><Label>Amount at most</Label><input className="input" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} /></div>
      </div>
      <div className="mb-3"><GoldBtn onClick={search}>Search</GoldBtn></div>
      {rows === null ? <div className="py-6 flex justify-center"><Loader2 className="animate-spin" size={18} color={VIOLET} /></div> : rows.length === 0 ? <Empty>No entries match.</Empty> : (
        <>
          <div className="text-[11.5px] text-[#7F8EA0] mb-1">{rows.length} entries shown (up to 300). Click one to vouch it to its documents.</div>
          <table>
            <thead><tr><th>Document date</th><th>Posted</th><th>Entry</th><th style={{ textAlign: "right" }}>Amount</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.entry_id} onClick={() => openVouch(r.entry_id)} style={{ cursor: "pointer" }}>
                  <td>{r.entry_date}</td><td>{r.posted_day}</td><td>{r.memo}{r.reversed && <span className="text-[11px] text-[#FF6B7A]"> · reversed</span>}</td>
                  <td style={{ textAlign: "right" }}>{money(r.amount)}</td>
                  <td>{open && <TinyBtn type="button" onClick={(e) => { e.stopPropagation(); onReport(r.entry_id, r.memo); }}>Report</TinyBtn>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {vouch && (
        <Modal title={vouch.memo} onClose={() => setVouch(null)} wide>
          <div className="text-[12px] text-[#7F8EA0] mb-2">Document date {vouch.entry_date} · posted {new Date(vouch.posted_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} · source: {vouch.source === "DESK" ? "posted from a document at the Accounting desk" : vouch.source === "REVERSAL" ? "an audit reversal" : "the sales population"}</div>
          {vouch.packet ? vouch.packet.docs.map((d, i) => (
            <div key={i} className="rounded-lg border border-hairline bg-panel overflow-hidden mb-2">
              <div className="px-3 py-1.5 text-[12px] font-semibold border-b border-hairline" style={{ background: "rgba(157,124,255,0.1)", color: "#C8B6FF" }}>{d.type}</div>
              <table style={{ margin: 0 }}><tbody>{Object.entries(d.fields).map(([k, v]) => <tr key={k}><td style={{ width: "42%", color: "#7F8EA0", fontSize: 12 }}>{k}</td><td style={{ fontSize: 12.5 }}>{v}</td></tr>)}</tbody></table>
            </div>
          )) : <div className="text-[12.5px] text-[#A3B1C2] mb-2">{vouch.note}</div>}
          <table><thead><tr><th>Account</th><th style={{ textAlign: "right" }}>Debit</th><th style={{ textAlign: "right" }}>Credit</th></tr></thead>
            <tbody>{vouch.lines.map((l, i) => <tr key={i}><td>{l.acct} {l.name}</td><td style={{ textAlign: "right" }}>{Number(l.debit) ? money(Number(l.debit)) : ""}</td><td style={{ textAlign: "right" }}>{Number(l.credit) ? money(Number(l.credit)) : ""}</td></tr>)}</tbody></table>
          <div className="flex gap-2 justify-end mt-4">
            {open && <GoldBtn type="button" onClick={() => { onReport(vouch.entry_id, vouch.memo); setVouch(null); }}>Report a finding</GoldBtn>}
            <OutlineBtn type="button" onClick={() => setVouch(null)}>Close</OutlineBtn>
          </div>
        </Modal>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- tests */
function TestsTab({ open, onReport }: { open: boolean; onReport: (entryId: string | null, type: string, memo: string, reason: string) => void }) {
  const [sel, setSel] = useState<TestDef>(TESTS[0]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [res, setRes] = useState<TestResult | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (t: TestDef) => { setSel(t); setVals({}); setRes(null); };
  const run = async () => {
    setBusy(true);
    const params = Object.fromEntries(sel.params.map((p) => [p.key, Number(vals[p.key] ?? p.default)]));
    const r = await mutate(supabase.rpc("ais_test_run", { p_kind: sel.kind, p_params: params }));
    setBusy(false);
    if (ok(r)) setRes(r.data as TestResult);
  };

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", alignItems: "start" }}>
      <Panel title="Choose a test">
        <div className="flex flex-col gap-1.5">
          {TESTS.map((t) => (
            <button key={t.kind} onClick={() => pick(t)} className="text-left rounded-md border px-3 py-2 text-[12.5px]"
              style={{ borderColor: sel.kind === t.kind ? VIOLET : "#243140", background: sel.kind === t.kind ? "rgba(157,124,255,0.08)" : "transparent" }}>
              <b>{t.label}</b>
            </button>
          ))}
        </div>
      </Panel>
      <div className="flex flex-col gap-4" style={{ gridColumn: "span 2" }}>
        <Panel title={sel.label}>
          <div className="text-[12.5px] text-[#A3B1C2] mb-3">{sel.what}</div>
          {sel.params.length > 0 && (
            <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              {sel.params.map((p) => <div key={p.key}><Label>{p.label}</Label><input className="input" inputMode="decimal" value={vals[p.key] ?? String(p.default)} onChange={(e) => setVals({ ...vals, [p.key]: e.target.value })} /></div>)}
            </div>
          )}
          <GoldBtn onClick={run} disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Run this test</GoldBtn>
        </Panel>

        {res && res.kind === "BENFORD" && res.stats.digits && (
          <Panel title="Benford result">
            <div className="text-[12.5px] mb-2"><b>{res.stats.conformity}</b> · {res.stats.n} entries · mean absolute deviation {res.stats.mad}</div>
            <table>
              <thead><tr><th>First digit</th><th style={{ textAlign: "right" }}>Entries</th><th style={{ textAlign: "right" }}>Actual</th><th style={{ textAlign: "right" }}>Expected</th><th style={{ textAlign: "right" }}>Difference</th><th /></tr></thead>
              <tbody>{benfordRows(res.stats.digits, res.stats.n ?? 0).map((d) => (
                <tr key={d.digit}><td>{d.digit}</td><td style={{ textAlign: "right" }}>{d.actual}</td><td style={{ textAlign: "right" }}>{(d.actualPct * 100).toFixed(1)}%</td><td style={{ textAlign: "right" }}>{(d.expectedPct * 100).toFixed(1)}%</td>
                  <td style={{ textAlign: "right", color: d.look ? "#F2B13C" : undefined }}>{d.diffPts > 0 ? "+" : ""}{d.diffPts} pts</td><td>{d.look ? "worth a look" : ""}</td></tr>
              ))}</tbody>
            </table>
            <div className="text-[11.5px] text-[#7F8EA0] mt-2">Benford shows where to dig. Find the entries behind a surprising digit with the Ledger tab, then run the other tests.</div>
          </Panel>
        )}

        {res && res.kind !== "BENFORD" && (
          <Panel title={`${res.flagged} flagged of ${res.population} entries`}>
            {res.rows.length === 0 ? <Empty>Nothing was flagged by this test.</Empty> : (
              <table>
                <thead><tr><th>Entry</th><th style={{ textAlign: "right" }}>Amount</th><th>Why it was flagged</th><th /></tr></thead>
                <tbody>{res.rows.map((r, i) => (
                  <tr key={i}><td>{r.entry_date ? `${r.entry_date} · ` : ""}{r.memo}</td><td style={{ textAlign: "right" }}>{r.amount === null ? "" : money(Number(r.amount))}</td><td style={{ fontSize: 12 }}>{r.reason}</td>
                    <td>{open && <TinyBtn type="button" onClick={() => onReport(r.entry_id, typeForTest(res.kind), r.memo, r.reason)}>Report</TinyBtn>}</td></tr>
                ))}</tbody>
              </table>
            )}
            <div className="text-[11.5px] text-[#7F8EA0] mt-2">A flag is a lead, not a conclusion. Some flagged entries are perfectly normal (a customer paying a round amount, for instance); reporting something that is fine counts against you.</div>
          </Panel>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- sampling */
function SamplingTab({ open, samples, onChanged, onReport }: { open: boolean; samples: Sample[]; onChanged: () => Promise<void>; onReport: (entryId: string, memo: string) => void }) {
  const [method, setMethod] = useState<"RANDOM" | "MUS">("RANDOM");
  const [n, setN] = useState("15"); const [seed, setSeed] = useState(""); const [interval, setInterval_] = useState("500000");
  const [cur, setCur] = useState<string | null>(null);
  const [items, setItems] = useState<SampleItem[]>([]);
  const [busy, setBusy] = useState(false);

  const loadItems = useCallback(async (id: string) => {
    const r = await supabase.rpc("ais_sample_items", { p_sample: id });
    if (showQueryErrors(r)) return;
    setItems(((r.data as SampleItem[]) ?? []).map((x) => ({ ...x, amount: Number(x.amount) })));
  }, []);
  const draw = async () => {
    setBusy(true);
    const r = await mutate(supabase.rpc("ais_sample_draw", { p_method: method, p_n: method === "RANDOM" ? Number(n) : null, p_seed: seed.trim() ? Number(seed) : null, p_interval: method === "MUS" ? Number(interval) : null }), { successMessage: "Sample drawn." });
    setBusy(false);
    if (ok(r)) { await onChanged(); const id = r.data as unknown as string; setCur(id); await loadItems(id); }
  };
  const [exc, setExc] = useState<SampleItem | null>(null);
  const [excNote, setExcNote] = useState("");
  const mark = async (it: SampleItem, result: "PASS" | "EXCEPTION", note = "") => {
    const r = await mutate(supabase.rpc("ais_sample_mark", { p_item: it.item_id, p_result: result, p_note: note }));
    if (ok(r) && cur) await loadItems(cur);
  };

  return (
    <div className="flex flex-col gap-4">
      {open && (
        <Panel title="Draw a sample">
          <div className="text-[12.5px] text-[#A3B1C2] mb-3">The same seed always draws the same sample, so your work can be re-performed. <b>Random</b> gives every entry the same chance. <b>Monetary-unit</b> sampling gives every peso the same chance, so large entries are picked more often.</div>
          <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            <div><Label>Method</Label><select className="input" value={method} onChange={(e) => setMethod(e.target.value as "RANDOM" | "MUS")}><option value="RANDOM">Random</option><option value="MUS">Monetary unit</option></select></div>
            {method === "RANDOM" ? <div><Label>Sample size</Label><input className="input" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} /></div>
              : <div><Label>Sampling interval (₱)</Label><input className="input" inputMode="decimal" value={interval} onChange={(e) => setInterval_(e.target.value)} /></div>}
            <div><Label>Seed (optional)</Label><input className="input" inputMode="numeric" value={seed} placeholder="random" onChange={(e) => setSeed(e.target.value)} /></div>
          </div>
          <GoldBtn onClick={draw} disabled={busy}>Draw the sample</GoldBtn>
        </Panel>
      )}
      <Panel title="Samples">
        {samples.length === 0 ? <Empty>No sample drawn yet.</Empty> : (
          <table>
            <thead><tr><th>Drawn</th><th>Method</th><th>Seed</th><th /></tr></thead>
            <tbody>{samples.map((s) => (
              <tr key={s.id}><td>{new Date(s.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</td><td>{s.method === "RANDOM" ? `Random, ${s.params.n} entries` : `Monetary unit, every ₱${s.params.interval}`}</td><td>{s.seed}</td>
                <td><TinyBtn type="button" onClick={() => { setCur(s.id); loadItems(s.id); }}>Open</TinyBtn></td></tr>
            ))}</tbody>
          </table>
        )}
      </Panel>
      {cur && (
        <Panel title="Sample items: vouch each one, then mark it">
          <table>
            <thead><tr><th>Entry</th><th style={{ textAlign: "right" }}>Amount</th><th>Result</th><th /></tr></thead>
            <tbody>{items.map((it) => (
              <tr key={it.item_id}><td>{it.entry_date} · {it.memo}<div className="text-[11px] text-[#7F8EA0]">{it.selection_reason}</div></td><td style={{ textAlign: "right" }}>{money(it.amount)}</td>
                <td>{it.result ? <b style={{ color: it.result === "PASS" ? "#22D3C5" : "#FF6B7A" }}>{it.result}</b> : "not tested"}{it.note ? <div className="text-[11px] text-[#7F8EA0]">{it.note}</div> : null}</td>
                <td style={{ whiteSpace: "nowrap" }}>{open && <><TinyBtn type="button" onClick={() => mark(it, "PASS")}>Pass</TinyBtn>{" "}<TinyBtn type="button" onClick={() => { setExc(it); setExcNote(""); }}>Exception</TinyBtn>{" "}{it.result === "EXCEPTION" && <TinyBtn type="button" onClick={() => onReport(it.entry_id, it.memo)}>Report</TinyBtn>}</>}</td></tr>
            ))}</tbody>
          </table>
        </Panel>
      )}
      {exc && (
        <Modal title="Mark as an exception" onClose={() => setExc(null)}>
          <div className="text-[12.5px] text-[#A3B1C2] mb-2">{exc.memo}</div>
          <Label>What was wrong with this entry?</Label>
          <textarea className="input" rows={3} value={excNote} onChange={(e) => setExcNote(e.target.value)} />
          <div className="flex gap-2 justify-end mt-4"><OutlineBtn type="button" onClick={() => setExc(null)}>Cancel</OutlineBtn><GoldBtn type="button" onClick={async () => { const it = exc; setExc(null); await mark(it, "EXCEPTION", excNote.trim()); }}>Mark exception</GoldBtn></div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- workpapers */
function WorkpapersTab({ open, wps, samples, onChanged }: { open: boolean; wps: Workpaper[]; samples: Sample[]; onChanged: () => Promise<void> }) {
  const [edit, setEdit] = useState<Partial<Workpaper> | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!edit) return;
    setBusy(true);
    const r = await mutate(supabase.rpc("ais_save_workpaper", { p_id: edit.id ?? null, p_ref: edit.ref_no ?? "", p_title: edit.title ?? "", p_objective: edit.objective ?? null, p_procedure: edit.procedure_text ?? null, p_conclusion: edit.conclusion ?? null, p_sample: edit.sample_id ?? null }), { successMessage: "Workpaper saved." });
    setBusy(false);
    if (ok(r)) { setEdit(null); await onChanged(); }
  };
  const sign = async (w: Workpaper) => {
    const r = await mutate(supabase.rpc("ais_sign_workpaper", { p_id: w.id }), { successMessage: "Workpaper signed. It is now frozen." });
    if (ok(r)) await onChanged();
  };
  return (
    <Panel title="Workpapers">
      <div className="text-[12.5px] text-[#A3B1C2] mb-3">A workpaper records what you set out to do, what you did and what you concluded, so another auditor could follow it. Sign it when it is complete: a signed workpaper cannot be changed.</div>
      {open && <div className="mb-3"><GoldBtn onClick={() => setEdit({ ref_no: `A-${wps.length + 1}`, title: "", objective: "", procedure_text: "", conclusion: "", sample_id: null })}><Plus size={14} /> New workpaper</GoldBtn></div>}
      {wps.length === 0 ? <Empty>No workpapers yet.</Empty> : (
        <table>
          <thead><tr><th>Ref</th><th>Title</th><th>Status</th><th /></tr></thead>
          <tbody>{wps.map((w) => (
            <tr key={w.id}><td><b>{w.ref_no}</b></td><td>{w.title}<div className="text-[11.5px] text-[#7F8EA0]">{w.conclusion}</div></td><td style={{ color: w.status === "SIGNED" ? "#22D3C5" : "#F2B13C" }}>{w.status === "SIGNED" ? "Signed" : "Draft"}</td>
              <td style={{ whiteSpace: "nowrap" }}><TinyBtn type="button" onClick={() => setEdit(w)}>{w.status === "SIGNED" || !open ? "View" : "Open"}</TinyBtn>{open && w.status === "DRAFT" && <>{" "}<TinyBtn type="button" onClick={() => sign(w)}>Sign</TinyBtn></>}</td></tr>
          ))}</tbody>
        </table>
      )}
      {edit && (
        <Modal title={edit.id ? `Workpaper ${edit.ref_no}` : "New workpaper"} onClose={() => setEdit(null)} wide>
          <fieldset disabled={edit.status === "SIGNED" || !open} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="grid gap-2" style={{ gridTemplateColumns: "120px 1fr" }}>
              <div><Label>Reference</Label><input className="input" value={edit.ref_no ?? ""} onChange={(e) => setEdit({ ...edit, ref_no: e.target.value })} /></div>
              <div><Label>Title</Label><input className="input" value={edit.title ?? ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
            </div>
            <Label>Objective: what are you trying to establish?</Label><textarea className="input" rows={2} value={edit.objective ?? ""} onChange={(e) => setEdit({ ...edit, objective: e.target.value })} />
            <Label>Procedure: what did you do?</Label><textarea className="input" rows={3} value={edit.procedure_text ?? ""} onChange={(e) => setEdit({ ...edit, procedure_text: e.target.value })} />
            <Label>Conclusion: what did you find out?</Label><textarea className="input" rows={3} value={edit.conclusion ?? ""} onChange={(e) => setEdit({ ...edit, conclusion: e.target.value })} />
            <Label>Sample used (optional)</Label>
            <select className="input" value={edit.sample_id ?? ""} onChange={(e) => setEdit({ ...edit, sample_id: e.target.value || null })}>
              <option value="">None</option>{samples.map((s) => <option key={s.id} value={s.id}>{s.method === "RANDOM" ? "Random" : "Monetary unit"} sample, seed {s.seed}</option>)}
            </select>
          </fieldset>
          <div className="flex gap-2 justify-end mt-4"><OutlineBtn type="button" onClick={() => setEdit(null)}>Close</OutlineBtn>{open && edit.status !== "SIGNED" && <GoldBtn type="button" onClick={save} disabled={busy}>Save</GoldBtn>}</div>
        </Modal>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- findings */
function FindingsTab({ open, finds, lock, typeLabel, wps, onNew, onChanged }: { open: boolean; finds: Finding[]; lock: string | null; typeLabel: (t: string) => string; wps: Workpaper[]; onNew: () => void; onChanged: () => Promise<void> }) {
  const [rev, setRev] = useState<Finding | null>(null);
  const [date, setDate] = useState(reversalDate(lock)); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const reverse = async () => {
    if (!rev) return;
    setBusy(true);
    const r = await mutate(supabase.rpc("ais_reverse_finding", { p_finding: rev.id, p_date: date, p_reason: reason }), { successMessage: "The entry was reversed." });
    setBusy(false);
    if (ok(r)) { setRev(null); setReason(""); await onChanged(); }
  };
  return (
    <Panel title="Findings">
      <div className="text-[12.5px] text-[#A3B1C2] mb-3">A finding states the <b>condition</b> (what you found), the <b>criteria</b> (what it should have been), the <b>cause</b>, the <b>effect</b> and your <b>recommendation</b>. If a wrongly posted entry should not stand, reverse it from here. The reversal is dated after the closed period.</div>
      {open && <div className="mb-3"><GoldBtn onClick={onNew}><Plus size={14} /> New finding</GoldBtn></div>}
      {finds.length === 0 ? <Empty>No findings yet.</Empty> : (
        <table>
          <thead><tr><th>Type</th><th>Condition</th><th>Severity</th><th>Workpaper</th><th>Status</th><th /></tr></thead>
          <tbody>{finds.map((f) => (
            <tr key={f.id}><td><b>{typeLabel(f.exception_type)}</b></td><td style={{ fontSize: 12 }}>{f.condition_text}</td><td style={{ color: SEVERITY_TONE[f.severity] }}>{f.severity.toLowerCase()}</td>
              <td>{wps.find((w) => w.id === f.workpaper_id)?.ref_no ?? ""}</td><td>{f.status === "REVERSED" ? "Reversed" : "Open"}</td>
              <td>{open && f.entry_id && f.status === "OPEN" && <TinyBtn type="button" onClick={() => { setRev(f); setDate(reversalDate(lock)); }}>Reverse the entry…</TinyBtn>}</td></tr>
          ))}</tbody>
        </table>
      )}
      {rev && (
        <Modal title="Reverse the entry" onClose={() => setRev(null)}>
          <div className="text-[12.5px] text-[#A3B1C2] mb-2">This posts an equal and opposite entry that cancels the original. Both stay in the ledger. The period through {lock ?? "the close"} is closed, so date it after that.</div>
          <Label>Reversal date</Label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Label>Reason (at least ten characters)</Label><textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2 justify-end mt-4"><OutlineBtn type="button" onClick={() => setRev(null)} disabled={busy}>Cancel</OutlineBtn><GoldBtn type="button" onClick={reverse} disabled={busy || reason.trim().length < 10}>Post the reversal</GoldBtn></div>
        </Modal>
      )}
    </Panel>
  );
}

function FindingModal({ form, types, wps, onClose, onSaved }: { form: FindingForm; types: FType[]; wps: Workpaper[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [f, setF] = useState(form);
  const [busy, setBusy] = useState(false);
  const problem = findingProblem(f);
  const groups = useMemo(() => {
    const m = new Map<string, FType[]>();
    for (const t of types) m.set(t.category, [...(m.get(t.category) ?? []), t]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [types]);
  const save = async () => {
    setBusy(true);
    const r = await mutate(supabase.rpc("ais_save_finding", {
      p_entry: f.entryId || null, p_type: f.type, p_condition: f.condition, p_criteria: f.criteria || null, p_cause: f.cause || null, p_effect: f.effect || null,
      p_recommendation: f.recommendation || null, p_severity: f.severity, p_workpaper: f.workpaperId || null,
    }), { successMessage: "Finding recorded." });
    setBusy(false);
    if (ok(r)) await onSaved();
  };
  return (
    <Modal title="Report a finding" onClose={onClose} wide>
      {f.entryId ? <div className="text-[11.5px] text-[#7F8EA0] mb-1">About one ledger entry.</div> : <div className="text-[11.5px] text-[#7F8EA0] mb-1">Not tied to one entry (for example a gap in the sequence).</div>}
      <Label>Type of exception</Label>
      <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
        <option value="">Choose…</option>{groups.map(([cat, ts]) => <optgroup key={cat} label={cat}>{ts.map((t) => <option key={t.tag} value={t.tag}>{t.label}</option>)}</optgroup>)}
      </select>
      <Label>Condition: what did you find?</Label><textarea className="input" rows={2} value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })} />
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div><Label>Criteria: what should it have been?</Label><textarea className="input" rows={2} value={f.criteria} onChange={(e) => setF({ ...f, criteria: e.target.value })} /></div>
        <div><Label>Cause: why did it happen?</Label><textarea className="input" rows={2} value={f.cause} onChange={(e) => setF({ ...f, cause: e.target.value })} /></div>
        <div><Label>Effect: why does it matter?</Label><textarea className="input" rows={2} value={f.effect} onChange={(e) => setF({ ...f, effect: e.target.value })} /></div>
        <div><Label>Recommendation</Label><textarea className="input" rows={2} value={f.recommendation} onChange={(e) => setF({ ...f, recommendation: e.target.value })} /></div>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div><Label>Severity</Label><select className="input" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value as FindingForm["severity"] })}>{SEVERITIES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</select></div>
        <div><Label>Supporting workpaper</Label><select className="input" value={f.workpaperId} onChange={(e) => setF({ ...f, workpaperId: e.target.value })}><option value="">None</option>{wps.map((w) => <option key={w.id} value={w.id}>{w.ref_no} {w.title}</option>)}</select></div>
      </div>
      {problem && <div className="text-[12px] mt-2" style={{ color: "#F2B13C" }}>{problem}</div>}
      <div className="flex gap-2 justify-end mt-4"><OutlineBtn type="button" onClick={onClose} disabled={busy}>Cancel</OutlineBtn><GoldBtn type="button" onClick={save} disabled={busy || !!problem}>Record the finding</GoldBtn></div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- close */
function CloseTab({ open, ov, score, proc, onChanged }: { open: boolean; ov: Overview; score: AuditScore | null; proc: ProcessScore | null; onChanged: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false);
  const close = async () => {
    setBusy(true);
    const r = await mutate(supabase.rpc("ais_close_audit"), { successMessage: "The audit is closed. Your score is shown." });
    setBusy(false);
    if (ok(r)) { setConfirm(false); await onChanged(); }
  };
  return (
    <div className="flex flex-col gap-4">
      {open && (
        <Panel title="Close the audit">
          <div className="text-[12.5px] text-[#A3B1C2] mb-3">You have run {ov.tests_run} test{ov.tests_run === 1 ? "" : "s"}, drawn {ov.samples} sample{ov.samples === 1 ? "" : "s"}, signed {ov.signed} of {ov.workpapers} workpaper{ov.workpapers === 1 ? "" : "s"} and reported {ov.findings} finding{ov.findings === 1 ? "" : "s"}. Closing ends your work and reveals what was planted and how you did.</div>
          <GoldBtn onClick={() => setConfirm(true)}>Close the audit…</GoldBtn>
        </Panel>
      )}
      {score?.visible && (
        <Panel title="How you did">
          <div className="text-[13px] mb-3"><b>{scoreSentence(score)}</b></div>
          <table>
            <thead><tr><th>Planted exception</th><th>Result</th></tr></thead>
            <tbody>{(score.details ?? []).map((d, i) => (
              <tr key={i}><td><b>{d.type.replace(/_/g, " ").toLowerCase()}</b><div className="text-[11.5px] text-[#7F8EA0]">{d.memo}</div></td>
                <td style={{ color: d.status === "found" ? "#22D3C5" : d.status === "wrong_type" ? "#F2B13C" : "#FF6B7A" }}>{STATUS_WORDS[d.status]}{d.reversed ? " · reversed" : ""}</td></tr>
            ))}</tbody>
          </table>
          {(score.false_positive_details ?? []).length > 0 && (
            <div className="mt-3"><div className="text-[12px] font-semibold mb-1">Reported, but not planted</div>
              {(score.false_positive_details ?? []).map((d, i) => <div key={i} className="text-[12px] text-[#A3B1C2]">{d.memo ?? "(no entry)"}: {d.condition}</div>)}</div>
          )}
        </Panel>
      )}
      {proc?.visible && proc.rows && (
        <Panel title={`How you worked: ${proc.points} of ${proc.max}`}>
          <div className="text-[12.5px] text-[#A3B1C2] mb-3">Finding the problems is only half of an audit. This is how well you did the work: the tests you chose, how carefully you sampled, whether your workpapers could be followed by someone else, and whether your findings were written out in full.</div>
          <table>
            <thead><tr><th>What</th><th>Points</th><th>What the system saw</th></tr></thead>
            <tbody>{proc.rows.map((r) => (<tr key={r.label}><td><b>{r.label}</b></td><td>{r.points} / {r.max}</td><td style={{ fontSize: 12, color: "#A3B1C2" }}>{r.message}</td></tr>))}</tbody>
          </table>
        </Panel>
      )}
      {confirm && <ConfirmDialog title="Close the audit?" confirmLabel="Close it" busy={busy} onConfirm={close} onCancel={() => setConfirm(false)} message="You will not be able to run tests, sign workpapers, report findings or reverse entries any more. Your score will be shown." />}
    </div>
  );
}
