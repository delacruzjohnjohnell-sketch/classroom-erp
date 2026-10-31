"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, LogOut, Plus, Trash2, Users } from "lucide-react";
import { ConfirmDialog, Empty, FormStyles, GoldBtn, Label, Modal, OutlineBtn, Panel, TinyBtn } from "@/components/ui";
import BulkCompanies from "@/components/ais/BulkCompanies";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { showQueryErrors } from "@/lib/queryErrors";
import { toast } from "@/lib/toast";
import { SEATS, seatsText, toggleSeat, type Seat } from "@/lib/aisSeats";

type Company = { tenant_id: string; name: string; members: number; created_at: string };
type Member = { user_id: string; full_name: string | null; seats: Seat[] };
type Student = { id: string; full_name: string | null };
type SetRow = { id: string; title: string; topic: string | null; summary: string | null; txns: number; assigned: number };
type Instance = { set_id: string; mode: "IMMEDIATE" | "AFTER_CLOSE"; phase: string; lock_date: string | null; seed: number };
type AuditReview = { visible: boolean; points: number; max: number; planted: number; found: number; wrong_type: number; missed: number; false_positives: number;
  details: { type: string; memo: string | null; status: "found" | "wrong_type" | "missed"; reversed: boolean }[]; false_positive_details: { type: string; memo: string | null; condition: string }[] };
type ReviewRow = { seq: number; title: string; status: string; key: { decision: string; failed_control: string | null; explanation: string | null }; decision: string | null; failed_control: string | null; points: number | null; detail: string | null; wrong_attempts: number };

const VIOLET = "#9D7CFF";
const yearStart = () => `${new Date().getFullYear()}-01-01`;

function SeatBoxes({ value, onChange, disabled }: { value: Seat[]; onChange: (v: Seat[]) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-x-4 gap-y-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
      {SEATS.map((s) => (
        <label key={s.key} className="flex items-start gap-2 text-[12.5px]" title={s.does}>
          <input type="checkbox" className="mt-0.5" checked={value.includes(s.key)} disabled={disabled} onChange={() => onChange(toggleSeat(value, s.key))} />
          <span><b>{s.label}</b><span className="block text-[11px] text-[#7F8EA0]">{s.does}</span></span>
        </label>
      ))}
    </div>
  );
}

/** The teacher creates AIS companies, adds students and gives them the Accounting and/or Audit seat. Students cannot do any of this. */
export default function AisTeamsPage() {
  const router = useRouter();
  const { loading, userId, profile, signOut, setViewTenantId } = useSession();
  const isTeacher = profile?.role === "teacher";
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [fy, setFy] = useState(yearStart());
  const [manage, setManage] = useState<Company | null>(null);
  const [roster, setRoster] = useState<Member[]>([]);
  const [draft, setDraft] = useState<Record<string, Seat[]>>({});
  const [sod, setSod] = useState<"ENFORCE" | "ALLOW_LOGGED">("ENFORCE");
  const [adding, setAdding] = useState("");
  const [addSeats, setAddSeats] = useState<Seat[]>(["ACCOUNTING"]);
  const [busy, setBusy] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [inst, setInst] = useState<Instance | null>(null);
  const [aSet, setASet] = useState("");
  const [aMode, setAMode] = useState<"IMMEDIATE" | "AFTER_CLOSE">("IMMEDIATE");
  const [aLock, setALock] = useState("");
  const [aSeed, setASeed] = useState("");
  const [review, setReview] = useState<ReviewRow[] | null>(null);
  const [auditRev, setAuditRev] = useState<AuditReview | null>(null);
  const [pairA, setPairA] = useState(""); const [pairU, setPairU] = useState("");
  const [newSet, setNewSet] = useState(""); const [newMode, setNewMode] = useState<"IMMEDIATE" | "AFTER_CLOSE">("IMMEDIATE"); const [newLock, setNewLock] = useState(""); const [newSeed, setNewSeed] = useState("");
  const [solo, setSolo] = useState(false); const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!userId) { router.replace("/login"); return; }
    if (profile && !isTeacher) router.replace("/choose");
  }, [loading, userId, profile, isTeacher, router]);

  const loadCompanies = useCallback(async () => {
    const [c, s, st] = await Promise.all([supabase.rpc("ais_companies_list"), supabase.rpc("ais_class_students"), supabase.rpc("ais_set_list")]);
    showQueryErrors(c, s, st);
    setSets(((st.data as SetRow[]) ?? []).map((x) => ({ ...x, txns: Number(x.txns), assigned: Number(x.assigned) })));
    setCompanies(((c.data as Company[]) ?? []).map((x) => ({ ...x, members: Number(x.members) })));
    setStudents((s.data as Student[]) ?? []);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!loading && isTeacher) loadCompanies(); }, [loading, isTeacher, loadCompanies]);

  const loadRoster = useCallback(async (tenant: string) => {
    const [r, s, i] = await Promise.all([
      supabase.rpc("ais_roster", { p_tenant: tenant }),
      supabase.from("ais_company_settings").select("sod_mode, allow_solo").eq("tenant_id", tenant).maybeSingle(),
      supabase.from("ais_instances").select("set_id, mode, phase, lock_date, seed").eq("tenant_id", tenant).maybeSingle(),
    ]);
    setInst((i.data as Instance | null) ?? null);
    if (showQueryErrors(r)) return;
    const list = (r.data as Member[]) ?? [];
    setRoster(list);
    setDraft(Object.fromEntries(list.map((m) => [m.user_id, m.seats])));
    setSod(((s.data as { sod_mode?: "ENFORCE" | "ALLOW_LOGGED" } | null)?.sod_mode) ?? "ENFORCE");
    setSolo(((s.data as { allow_solo?: boolean } | null)?.allow_solo) ?? false);
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    if (pairA && pairA === pairU) { toast.error("Choose two different students: one for the Accounting seat and one for the Audit seat."); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("ais_create_company", { p_name: name.trim(), p_fiscal_year_start: fy }));
    if (!ok(res)) { setBusy(false); return; }
    const tid = res.data as unknown as string;
    let good = true;
    if (pairA) good = ok(await mutate(supabase.rpc("ais_set_seats", { p_tenant: tid, p_user: pairA, p_seats: ["ACCOUNTING"] })));
    if (good && pairU) good = ok(await mutate(supabase.rpc("ais_set_seats", { p_tenant: tid, p_user: pairU, p_seats: ["AUDIT"] })));
    if (good && newSet) good = ok(await mutate(supabase.rpc("ais_assign_set", { p_tenant: tid, p_set: newSet, p_seed: newSeed.trim() ? Number(newSeed) : null, p_mode: newMode, p_lock: newLock || null })));
    setBusy(false);
    if (good) toast.success(newSet ? "Company created, students seated and the practice set assigned." : "AIS company created. Add the students next.");
    setCreating(false); setName(""); setPairA(""); setPairU(""); setNewSet(""); setNewSeed(""); setNewLock("");
    await loadCompanies();
  };

  const resetDesks = async () => {
    if (!manage) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("ais_reset_desks", { p_tenant: manage.tenant_id }), { successMessage: "The five desks were cleared. Students start them fresh the next time they open them." });
    setBusy(false);
    if (ok(res)) setResetting(false);
  };
  const restart = async () => {
    if (!manage || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("ais_restart_company", { p_tenant: manage.tenant_id, p_set: newSet || null, p_seed: newSeed.trim() ? Number(newSeed) : null, p_mode: newMode, p_lock: newLock || null }), { successMessage: "A new round has started. The members are in it with the same seats." });
    setBusy(false);
    if (ok(res)) { setRestarting(false); setManage(null); setNewSet(""); setNewSeed(""); setNewLock(""); await loadCompanies(); }
  };
  const saveSolo = async (v: boolean) => {
    if (!manage || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("ais_set_solo", { p_tenant: manage.tenant_id, p_allow: v }), { successMessage: v ? "One student may now hold both seats." : "The Accounting and Audit seats must go to two different students." });
    setBusy(false);
    if (ok(res)) setSolo(v);
  };

  const openManage = async (c: Company) => { setManage(c); setAdding(""); setAddSeats(["ACCOUNTING"]); await loadRoster(c.tenant_id); };
  const saveMember = async (memberId: string) => {
    if (!manage || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("ais_set_seats", { p_tenant: manage.tenant_id, p_user: memberId, p_seats: draft[memberId] ?? [] }), { successMessage: "Seats saved." });
    setBusy(false);
    if (ok(res)) { await loadRoster(manage.tenant_id); await loadCompanies(); }
  };
  const addMember = async () => {
    if (!manage || !adding || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("ais_set_seats", { p_tenant: manage.tenant_id, p_user: adding, p_seats: addSeats }), { successMessage: "Student added." });
    setBusy(false);
    if (ok(res)) { setAdding(""); await loadRoster(manage.tenant_id); await loadCompanies(); }
  };
  const removeMember = async (m: Member) => {
    if (!manage || busy || !confirm(`Remove ${m.full_name ?? "this student"} from ${manage.name}?`)) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("ais_remove_member", { p_tenant: manage.tenant_id, p_user: m.user_id }), { successMessage: "Removed." });
    setBusy(false);
    if (ok(res)) { await loadRoster(manage.tenant_id); await loadCompanies(); }
  };
  const saveSod = async (mode: "ENFORCE" | "ALLOW_LOGGED") => {
    if (!manage || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("ais_set_sod_mode", { p_tenant: manage.tenant_id, p_mode: mode }), { successMessage: mode === "ENFORCE" ? "Segregation of duties is enforced." : "Violations are now allowed but logged." });
    setBusy(false);
    if (ok(res)) setSod(mode);
  };
  const importSet = async () => {
    let def: unknown;
    try { def = JSON.parse(jsonText); } catch { toast.error("That is not valid JSON. Paste the whole set file."); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("ais_set_import", { p_def: def }), { successMessage: "Practice set imported." });
    setBusy(false);
    if (ok(res)) { setImporting(false); setJsonText(""); await loadCompanies(); }
  };
  const assign = async () => {
    if (!manage || !aSet || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("ais_assign_set", { p_tenant: manage.tenant_id, p_set: aSet, p_seed: aSeed.trim() ? Number(aSeed) : null, p_mode: aMode, p_lock: aLock || null }), { successMessage: "Practice set assigned. The documents are in the Accounting seat's inbox." });
    setBusy(false);
    if (ok(res)) { await loadRoster(manage.tenant_id); await loadCompanies(); }
  };
  const openReview = async () => {
    if (!manage) return;
    const r = await supabase.rpc("ais_teacher_review", { p_tenant: manage.tenant_id });
    if (showQueryErrors(r)) return;
    setReview(((r.data as ReviewRow[]) ?? []).map((x) => ({ ...x, seq: Number(x.seq), points: x.points === null ? null : Number(x.points) })));
  };
  const openAuditReview = async () => {
    if (!manage) return;
    const r = await supabase.rpc("ais_teacher_audit_score", { p_tenant: manage.tenant_id });
    if (showQueryErrors(r)) return;
    setAuditRev(r.data as AuditReview);
  };
  const openBooks = (c: Company) => { setViewTenantId(c.tenant_id); router.push("/ais"); };

  if (loading || !profile) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={20} color={VIOLET} /></div>;
  if (!isTeacher) return null;

  const inCompany = new Set(roster.map((m) => m.user_id));
  const free = students.filter((s) => !inCompany.has(s.id));

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 bg-panel border-b border-hairline">
        <div>
          <div className="font-serif text-lg font-bold">Accounting Information Systems companies</div>
          <div className="text-xs text-[#7F8EA0]">Teacher · {profile.full_name}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setBulk(true)} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs text-[#A3B1C2]"><Plus size={15} /> Create companies from a list</button>
          <button onClick={() => router.push("/teacher/scores")} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs text-[#A3B1C2]">Class scores (Excel)</button>
          <button onClick={() => router.push("/ais/gradebook")} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs text-[#A3B1C2]">Class gradebook</button>
          <button onClick={() => router.push("/choose")} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs text-[#A3B1C2]"><ArrowLeft size={15} /> Choose ERP</button>
          <button onClick={() => signOut()} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs text-[#A3B1C2]"><LogOut size={14} /> Sign out</button>
        </div>
      </div>

      <div className="px-6 py-6 max-w-[1000px] w-full mx-auto flex flex-col gap-5">
        <div className="text-[12.5px] text-[#A3B1C2] max-w-[780px]">
          An AIS company is a firm whose books students work on. You create it, add students and give each the <b>Accounting</b> seat, the <b>Audit</b> seat, or both.
          Open the AIS edition for students on the Choose ERP page first, or you cannot add anyone. You stay the final override and never hold a seat.
        </div>

        <Panel title="AIS companies">
          <div className="mb-3"><GoldBtn onClick={() => setCreating(true)}><Plus size={14} /> New AIS company</GoldBtn></div>
          {companies === null ? <div className="py-6 flex justify-center"><Loader2 className="animate-spin" size={18} color={VIOLET} /></div>
            : companies.length === 0 ? <Empty>No AIS company yet. Create the first one.</Empty> : (
              <table>
                <thead><tr><th>Company</th><th style={{ textAlign: "right" }}>Members</th><th>Created</th><th /></tr></thead>
                <tbody>
                  {companies.map((c) => (
                    <tr key={c.tenant_id}>
                      <td><b>{c.name}</b></td><td style={{ textAlign: "right" }}>{c.members}</td><td>{c.created_at.slice(0, 10)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <TinyBtn type="button" onClick={() => openManage(c)}><Users size={11} /> Members and seats</TinyBtn>{" "}
                        <TinyBtn type="button" onClick={() => openBooks(c)}>Open the books</TinyBtn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </Panel>

        <Panel title="Practice sets">
          <div className="mb-3"><GoldBtn onClick={() => setImporting(true)}><Plus size={14} /> Import a practice set</GoldBtn></div>
          {sets.length === 0 ? <Empty>No practice set yet. Import one: paste the set&rsquo;s JSON file.</Empty> : (
            <table>
              <thead><tr><th>Set</th><th>Topic</th><th style={{ textAlign: "right" }}>Documents</th><th style={{ textAlign: "right" }}>Assigned to</th></tr></thead>
              <tbody>{sets.map((x) => <tr key={x.id}><td><b>{x.title}</b><div className="text-[11px] text-[#7F8EA0]">{x.id}</div></td><td>{x.topic}</td><td style={{ textAlign: "right" }}>{x.txns}</td><td style={{ textAlign: "right" }}>{x.assigned} compan{x.assigned === 1 ? "y" : "ies"}</td></tr>)}</tbody>
            </table>
          )}
        </Panel>

        <Panel title="The seats">
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            {SEATS.map((s) => <div key={s.key} className="text-[12.5px]"><b>{s.label}</b><div className="text-[#7F8EA0] text-[11.5px]">{s.does}</div></div>)}
          </div>
        </Panel>
      </div>

      {creating && (
        <Modal title="New AIS company" onClose={() => setCreating(false)}>
          <form onSubmit={create}>
            <Label>Company name</Label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sinag Rice Trading Co. — Section A" required />
            <Label>Fiscal year starts</Label><input className="input" type="date" value={fy} onChange={(e) => setFy(e.target.value)} required />
            <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div><Label>Accounting seat (optional)</Label><select className="input" value={pairA} onChange={(e) => setPairA(e.target.value)}><option value="">Add later…</option>{students.map((st) => <option key={st.id} value={st.id}>{st.full_name ?? "Student"}</option>)}</select></div>
              <div><Label>Audit seat (optional)</Label><select className="input" value={pairU} onChange={(e) => setPairU(e.target.value)}><option value="">Add later…</option>{students.map((st) => <option key={st.id} value={st.id}>{st.full_name ?? "Student"}</option>)}</select></div>
            </div>
            <div className="text-[11.5px] text-[#7F8EA0] mt-1">Two different students: the auditor must be independent of the person who posted. You can allow one student to do both later (solo practice).</div>
            <Label>Practice set (optional)</Label>
            <select className="input" value={newSet} onChange={(e) => setNewSet(e.target.value)}><option value="">Assign later…</option>{sets.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
            {newSet && (
              <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                <div><Label>Mode</Label><select className="input" value={newMode} onChange={(e) => setNewMode(e.target.value as "IMMEDIATE" | "AFTER_CLOSE")}><option value="IMMEDIATE">Practice: instant feedback</option><option value="AFTER_CLOSE">Graded: scores after close</option></select></div>
                <div><Label>Lock the books on</Label><input className="input" type="date" value={newLock} onChange={(e) => setNewLock(e.target.value)} /></div>
                <div><Label>Seed (optional)</Label><input className="input" inputMode="numeric" value={newSeed} placeholder="random" onChange={(e) => setNewSeed(e.target.value)} /></div>
              </div>
            )}
            <div className="text-[11.5px] text-[#7F8EA0] mt-2">The company starts with a merchandising chart of accounts and an empty ledger. You are not a member of it. The AIS edition must be open (Choose ERP page) before students can be seated.</div>
            <div className="flex gap-2 justify-end mt-5"><OutlineBtn type="button" onClick={() => setCreating(false)} disabled={busy}>Cancel</OutlineBtn><GoldBtn type="submit" disabled={busy || !name.trim()}>Create</GoldBtn></div>
          </form>
        </Modal>
      )}

      {importing && (
        <Modal title="Import a practice set" onClose={() => setImporting(false)} wide>
          <div className="text-[12px] text-[#7F8EA0] mb-2">Paste the contents of the set&rsquo;s .json file (for example <code>supabase/seed/ais_set_sinag_revenue.json</code>). A set that has already been assigned to a company cannot be replaced; import it under a new id instead.</div>
          <textarea className="input" style={{ minHeight: 260, fontFamily: "monospace", fontSize: 11.5 }} value={jsonText} onChange={(e) => setJsonText(e.target.value)} placeholder='{ "id": "...", "title": "...", "txns": [ ... ] }' />
          <div className="flex gap-2 justify-end mt-4"><OutlineBtn type="button" onClick={() => setImporting(false)} disabled={busy}>Cancel</OutlineBtn><GoldBtn type="button" onClick={importSet} disabled={busy || !jsonText.trim()}>Import</GoldBtn></div>
        </Modal>
      )}

      {bulk && <BulkCompanies students={students.filter((x): x is { id: string; full_name: string } => !!x.full_name)} sets={sets.map((x) => ({ id: x.id, title: x.title }))} onClose={() => setBulk(false)} onDone={loadCompanies} />}
      {resetting && manage && (
        <ConfirmDialog title="Reset the desks?" confirmLabel="Reset the desks" danger busy={busy} onConfirm={resetDesks} onCancel={() => setResetting(false)}
          message={<>This clears the Sales, Purchases, Payroll, Fixed assets and Close desks of <b>{manage.name}</b>: every card the students worked, and every ledger entry those desks posted. The 13 document packets and the sales population stay as they are. It only works while the Accounting phase is open.</>} />
      )}
      {restarting && manage && (
        <Modal title="Start a new round" onClose={() => setRestarting(false)}>
          <div className="text-[12.5px] text-[#A3B1C2] mb-2">This makes a new company with the same members and seats, and assigns the practice set again with fresh numbers. The current company stays as the record of this round.</div>
          <Label>Practice set</Label>
          <select className="input" value={newSet} onChange={(e) => setNewSet(e.target.value)}>{sets.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
          <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            <div><Label>Mode</Label><select className="input" value={newMode} onChange={(e) => setNewMode(e.target.value as "IMMEDIATE" | "AFTER_CLOSE")}><option value="IMMEDIATE">Practice: instant feedback</option><option value="AFTER_CLOSE">Graded: scores after close</option></select></div>
            <div><Label>Lock the books on</Label><input className="input" type="date" value={newLock} onChange={(e) => setNewLock(e.target.value)} /></div>
            <div><Label>Seed (optional)</Label><input className="input" inputMode="numeric" value={newSeed} placeholder="random" onChange={(e) => setNewSeed(e.target.value)} /></div>
          </div>
          <div className="flex gap-2 justify-end mt-4"><OutlineBtn type="button" onClick={() => setRestarting(false)} disabled={busy}>Cancel</OutlineBtn><GoldBtn type="button" onClick={restart} disabled={busy || !newSet}>Start the new round</GoldBtn></div>
        </Modal>
      )}

      {auditRev && manage && (
        <Modal title={`${manage.name} — planted exceptions and audit results`} onClose={() => setAuditRev(null)} wide>
          <div className="text-[12.5px] mb-3"><b>{auditRev.points} of {auditRev.max} points.</b> {auditRev.found} of {auditRev.planted} planted exceptions found with the right type, {auditRev.wrong_type} under the wrong type, {auditRev.missed} missed, {auditRev.false_positives} reported that were not planted. (This is the score as it stands now; the student sees it when they close the audit.)</div>
          <table>
            <thead><tr><th>Planted</th><th>Entry</th><th>Result</th></tr></thead>
            <tbody>{auditRev.details.map((d, i) => <tr key={i}><td><b>{d.type.replace(/_/g, " ").toLowerCase()}</b></td><td style={{ fontSize: 12 }}>{d.memo}</td><td style={{ color: d.status === "found" ? "#22D3C5" : d.status === "wrong_type" ? "#F2B13C" : "#FF6B7A" }}>{d.status === "found" ? "Found" : d.status === "wrong_type" ? "Wrong type" : "Missed"}{d.reversed ? " · reversed" : ""}</td></tr>)}</tbody>
          </table>
          {auditRev.false_positive_details.length > 0 && <div className="mt-3 text-[12px]"><b>Reported, but not planted</b>{auditRev.false_positive_details.map((d, i) => <div key={i} className="text-[#A3B1C2]">{d.memo ?? "(no entry)"}: {d.condition}</div>)}</div>}
          <div className="flex justify-end mt-4"><OutlineBtn type="button" onClick={() => setAuditRev(null)}>Close</OutlineBtn></div>
        </Modal>
      )}

      {review && manage && (
        <Modal title={`${manage.name} — answer key and results`} onClose={() => setReview(null)} wide>
          <table>
            <thead><tr><th>#</th><th>Document</th><th>Key says</th><th>Student did</th><th style={{ textAlign: "right" }}>Points</th></tr></thead>
            <tbody>
              {review.map((r) => (
                <tr key={r.seq}>
                  <td>{r.seq}</td>
                  <td><b>{r.title}</b><div className="text-[11px] text-[#7F8EA0]">{r.key.explanation}</div>{r.detail && <div className="text-[11px] text-[#A3B1C2]">{r.detail}{r.wrong_attempts > 0 ? ` (${r.wrong_attempts} refused tries)` : ""}</div>}</td>
                  <td>{r.key.decision}{r.key.failed_control ? ` · ${r.key.failed_control}` : ""}</td>
                  <td>{r.decision ? `${r.decision}${r.failed_control ? " · " + r.failed_control : ""}` : r.status === "PENDING" ? "not decided" : r.status}</td>
                  <td style={{ textAlign: "right" }}>{r.points ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end mt-4"><OutlineBtn type="button" onClick={() => setReview(null)}>Close</OutlineBtn></div>
        </Modal>
      )}

      {manage && (
        <Modal title={`${manage.name} — members and seats`} onClose={() => setManage(null)} wide>
          <div className="border border-hairline rounded-md p-3 mb-4">
            <div className="text-[13px] font-semibold mb-1">Practice set</div>
            {inst ? (
              <div className="text-[12.5px]">
                <b>{sets.find((x) => x.id === inst.set_id)?.title ?? inst.set_id}</b>
                <div className="text-[#7F8EA0]">{inst.mode === "IMMEDIATE" ? "Practice round" : "Graded round"} · {inst.phase === "ACCOUNTING" ? "Accounting phase open" : "Accounting phase closed"} · seed {inst.seed}{inst.lock_date ? ` · books lock on ${inst.lock_date}` : ""}</div>
                <div className="mt-2"><TinyBtn type="button" onClick={() => { setNewSet(inst.set_id); setNewMode(inst.mode); setRestarting(true); }}>Start a new round…</TinyBtn>{" "}{inst.phase === "ACCOUNTING" && <><TinyBtn type="button" onClick={() => setResetting(true)}>Reset the desks…</TinyBtn>{" "}</>}<TinyBtn type="button" onClick={openReview}>Accounting: answer key and results</TinyBtn>{" "}<TinyBtn type="button" onClick={openAuditReview}>Audit: planted exceptions and results</TinyBtn></div>
              </div>
            ) : (
              <div>
                <select className="input mb-2" value={aSet} onChange={(e) => setASet(e.target.value)}>
                  <option value="">Choose a practice set…</option>
                  {sets.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                </select>
                <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
                  <div><Label>Mode</Label>
                    <select className="input" value={aMode} onChange={(e) => setAMode(e.target.value as "IMMEDIATE" | "AFTER_CLOSE")}>
                      <option value="IMMEDIATE">Practice: instant feedback</option><option value="AFTER_CLOSE">Graded: scores after close</option>
                    </select></div>
                  <div><Label>Lock the books on</Label><input className="input" type="date" value={aLock} onChange={(e) => setALock(e.target.value)} /></div>
                  <div><Label>Seed (optional)</Label><input className="input" inputMode="numeric" value={aSeed} placeholder="random" onChange={(e) => setASeed(e.target.value)} /></div>
                </div>
                <div className="text-[11px] text-[#7F8EA0] mt-1">Same seed, same numbers. Give two companies the same seed for a class-wide worked example. Locking the books closes the period when the Accounting phase ends.</div>
                <div className="mt-2"><GoldBtn type="button" onClick={assign} disabled={busy || !aSet}>Assign this set</GoldBtn></div>
              </div>
            )}
          </div>
          <div className="border border-hairline rounded-md p-3 mb-4">
            <div className="text-[13px] font-semibold mb-1">Who holds the seats</div>
            <label className="flex items-start gap-2 text-[12.5px] mb-3"><input type="checkbox" className="mt-0.5" checked={solo} disabled={busy} onChange={(e) => saveSolo(e.target.checked)} />
              <span><b>Solo practice</b>: allow one student to hold both the Accounting and the Audit seat. Leave it off for a class exercise, so the auditor is independent of the person who posted.</span></label>
            <div className="text-[13px] font-semibold mb-1">Segregation of duties</div>
            <label className="flex items-start gap-2 text-[12.5px] mb-1"><input type="radio" className="mt-0.5" checked={sod === "ENFORCE"} disabled={busy} onChange={() => saveSod("ENFORCE")} />
              <span><b>Enforce</b> (practice rounds): nobody can approve what they entered.</span></label>
            <label className="flex items-start gap-2 text-[12.5px]"><input type="radio" className="mt-0.5" checked={sod === "ALLOW_LOGGED"} disabled={busy} onChange={() => saveSod("ALLOW_LOGGED")} />
              <span><b>Allow but log</b> (graded rounds): the violation goes through and is recorded, so the Audit seat has something to find.</span></label>
          </div>
          {roster.length === 0 && <div className="text-[12.5px] text-[#7F8EA0] mb-3">No members yet. Add students below.</div>}
          {roster.map((m) => (
            <div key={m.user_id} className="border border-hairline rounded-md p-3 mb-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-[13px] font-semibold">{m.full_name ?? "Student"} <span className="text-[11.5px] font-normal text-[#7F8EA0]">· {seatsText(m.seats)}</span></div>
                <div className="flex gap-1.5">
                  <TinyBtn type="button" disabled={busy} onClick={() => saveMember(m.user_id)}>Save seats</TinyBtn>
                  <TinyBtn type="button" disabled={busy} onClick={() => removeMember(m)} aria-label={`Remove ${m.full_name ?? "student"}`}><Trash2 size={11} /></TinyBtn>
                </div>
              </div>
              <SeatBoxes value={draft[m.user_id] ?? []} onChange={(v) => setDraft({ ...draft, [m.user_id]: v })} disabled={busy} />
            </div>
          ))}
          <div className="border border-dashed border-hairline rounded-md p-3">
            <Label>Add a student</Label>
            <select className="input mb-3" value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Choose a student…</option>
              {free.map((s) => <option key={s.id} value={s.id}>{s.full_name ?? "Student"}</option>)}
            </select>
            {adding && <SeatBoxes value={addSeats} onChange={setAddSeats} disabled={busy} />}
            <div className="mt-3"><GoldBtn type="button" onClick={addMember} disabled={busy || !adding}>Add to the company</GoldBtn></div>
          </div>
          <div className="flex justify-end mt-4"><OutlineBtn type="button" onClick={() => setManage(null)}>Close</OutlineBtn></div>
        </Modal>
      )}
      <FormStyles />
    </div>
  );
}
