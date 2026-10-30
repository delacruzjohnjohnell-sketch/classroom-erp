"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, LogOut, Plus, Trash2, Users } from "lucide-react";
import { Empty, FormStyles, GoldBtn, Label, Modal, OutlineBtn, Panel, TinyBtn } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { showQueryErrors } from "@/lib/queryErrors";
import { SEATS, seatsText, toggleSeat, type Seat } from "@/lib/aisSeats";

type Company = { tenant_id: string; name: string; members: number; created_at: string };
type Member = { user_id: string; full_name: string | null; seats: Seat[] };
type Student = { id: string; full_name: string | null };

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
  const [addSeats, setAddSeats] = useState<Seat[]>(["ACCOUNTING", "AUDIT"]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!userId) { router.replace("/login"); return; }
    if (profile && !isTeacher) router.replace("/choose");
  }, [loading, userId, profile, isTeacher, router]);

  const loadCompanies = useCallback(async () => {
    const [c, s] = await Promise.all([supabase.rpc("ais_companies_list"), supabase.rpc("ais_class_students")]);
    showQueryErrors(c, s);
    setCompanies(((c.data as Company[]) ?? []).map((x) => ({ ...x, members: Number(x.members) })));
    setStudents((s.data as Student[]) ?? []);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!loading && isTeacher) loadCompanies(); }, [loading, isTeacher, loadCompanies]);

  const loadRoster = useCallback(async (tenant: string) => {
    const [r, s] = await Promise.all([
      supabase.rpc("ais_roster", { p_tenant: tenant }),
      supabase.from("ais_company_settings").select("sod_mode").eq("tenant_id", tenant).maybeSingle(),
    ]);
    if (showQueryErrors(r)) return;
    const list = (r.data as Member[]) ?? [];
    setRoster(list);
    setDraft(Object.fromEntries(list.map((m) => [m.user_id, m.seats])));
    setSod(((s.data as { sod_mode?: "ENFORCE" | "ALLOW_LOGGED" } | null)?.sod_mode) ?? "ENFORCE");
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("ais_create_company", { p_name: name.trim(), p_fiscal_year_start: fy }), { successMessage: "AIS company created. Add the students next." });
    setBusy(false);
    if (ok(res)) { setCreating(false); setName(""); await loadCompanies(); }
  };

  const openManage = async (c: Company) => { setManage(c); setAdding(""); setAddSeats(["ACCOUNTING", "AUDIT"]); await loadRoster(c.tenant_id); };
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
            <div className="text-[11.5px] text-[#7F8EA0] mt-2">The company starts with a merchandising chart of accounts and an empty ledger. You are not a member of it; add the students on the next step.</div>
            <div className="flex gap-2 justify-end mt-5"><OutlineBtn type="button" onClick={() => setCreating(false)} disabled={busy}>Cancel</OutlineBtn><GoldBtn type="submit" disabled={busy || !name.trim()}>Create</GoldBtn></div>
          </form>
        </Modal>
      )}

      {manage && (
        <Modal title={`${manage.name} — members and seats`} onClose={() => setManage(null)} wide>
          <div className="border border-hairline rounded-md p-3 mb-4">
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
