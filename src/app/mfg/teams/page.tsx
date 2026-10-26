"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, LogOut, Plus, Trash2, Users } from "lucide-react";
import { Empty, FormStyles, GoldBtn, Label, Modal, OutlineBtn, Panel, TinyBtn } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { showQueryErrors } from "@/lib/queryErrors";
import { ROLES, rolesText, toggleRole, type TeamRole } from "@/lib/mfgTeams";

type Team = { tenant_id: string; name: string; members: number; created_at: string };
type Member = { user_id: string; full_name: string | null; roles: TeamRole[] };
type Student = { id: string; full_name: string | null };

const TEAL = "#22D3C5";
const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;

function RoleBoxes({ value, onChange, disabled }: { value: TeamRole[]; onChange: (v: TeamRole[]) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-x-4 gap-y-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
      {ROLES.map((r) => (
        <label key={r.key} className="flex items-start gap-2 text-[12.5px]" title={r.does}>
          <input type="checkbox" className="mt-0.5" checked={value.includes(r.key)} disabled={disabled} onChange={() => onChange(toggleRole(value, r.key))} />
          <span><b>{r.label}</b><span className="block text-[11px] text-[#7F8EA0]">{r.does}</span></span>
        </label>
      ))}
    </div>
  );
}

/** The teacher creates team companies, adds students and gives them roles. Students cannot do any of this; they only create their own solo company. */
export default function TeamsPage() {
  const router = useRouter();
  const { loading, userId, profile, signOut, setViewTenantId } = useSession();
  const isTeacher = profile?.role === "teacher";
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [fy, setFy] = useState(yearStart());
  const [costing, setCosting] = useState<"STANDARD" | "ACTUAL">("STANDARD");
  const [manage, setManage] = useState<Team | null>(null);
  const [roster, setRoster] = useState<Member[]>([]);
  const [draft, setDraft] = useState<Record<string, TeamRole[]>>({});
  const [adding, setAdding] = useState("");
  const [addRoles, setAddRoles] = useState<TeamRole[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!userId) { router.replace("/login"); return; }
    if (profile && !isTeacher) router.replace("/mfg");
  }, [loading, userId, profile, isTeacher, router]);

  const loadTeams = useCallback(async () => {
    const [t, s] = await Promise.all([supabase.rpc("mfg_teams_list"), supabase.rpc("mfg_class_students")]);
    showQueryErrors(t, s);
    setTeams(((t.data as Team[]) ?? []).map((x) => ({ ...x, members: Number(x.members) })));
    setStudents((s.data as Student[]) ?? []);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!loading && isTeacher) loadTeams(); }, [loading, isTeacher, loadTeams]);

  const loadRoster = useCallback(async (tenant: string) => {
    const r = await supabase.rpc("mfg_team_roster", { p_tenant: tenant });
    if (showQueryErrors(r)) return;
    const list = (r.data as Member[]) ?? [];
    setRoster(list);
    setDraft(Object.fromEntries(list.map((m) => [m.user_id, m.roles])));
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_create_team_company", { company_name: name.trim(), fiscal_year_start: fy, costing_method: costing }), { successMessage: "Team company created. Add the students next." });
    setBusy(false);
    if (ok(res)) { setCreating(false); setName(""); await loadTeams(); }
  };

  const openManage = async (t: Team) => { setManage(t); setAdding(""); setAddRoles([]); await loadRoster(t.tenant_id); };
  const saveMember = async (memberId: string) => {
    if (!manage || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_team_set_member", { p_tenant: manage.tenant_id, p_user: memberId, p_roles: draft[memberId] ?? [] }), { successMessage: "Roles saved." });
    setBusy(false);
    if (ok(res)) { await loadRoster(manage.tenant_id); await loadTeams(); }
  };
  const addMember = async () => {
    if (!manage || !adding || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_team_set_member", { p_tenant: manage.tenant_id, p_user: adding, p_roles: addRoles }), { successMessage: "Student added to the team." });
    setBusy(false);
    if (ok(res)) { setAdding(""); setAddRoles([]); await loadRoster(manage.tenant_id); await loadTeams(); }
  };
  const removeMember = async (m: Member) => {
    if (!manage || busy || !confirm(`Remove ${m.full_name ?? "this student"} from ${manage.name}? They lose access to the team company but keep their own company.`)) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("mfg_team_remove_member", { p_tenant: manage.tenant_id, p_user: m.user_id }), { successMessage: "Removed from the team." });
    setBusy(false);
    if (ok(res)) { await loadRoster(manage.tenant_id); await loadTeams(); }
  };
  const openBooks = (t: Team) => { setViewTenantId(t.tenant_id); router.push("/mfg"); };

  if (loading || !profile) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;
  if (!isTeacher) return null;

  const inTeam = new Set(roster.map((m) => m.user_id));
  const free = students.filter((s) => !inTeam.has(s.id));

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 bg-panel border-b border-hairline">
        <div>
          <div className="font-serif text-lg font-bold">Manufacturing team companies</div>
          <div className="text-xs text-[#7F8EA0]">Teacher · {profile.full_name}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.push("/mfg/compare")} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs text-[#A3B1C2]">Class comparison</button>
          <button onClick={() => router.push("/teacher")} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs text-[#A3B1C2]"><ArrowLeft size={15} /> Class overview</button>
          <button onClick={() => signOut()} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs text-[#A3B1C2]"><LogOut size={14} /> Sign out</button>
        </div>
      </div>

      <div className="px-6 py-6 max-w-[1000px] w-full mx-auto flex flex-col gap-5">
        <div className="text-[12.5px] text-[#A3B1C2] max-w-[780px]">
          Each student runs their own <b>solo company</b> first, and sets it up themselves. A <b>team company</b> is made here, by you: you add the students and give each one or more roles.
          Everyone in the team sees the whole set of books, but each role can post only in its own area, and nobody approves a voucher they prepared. You stay the final override.
        </div>

        <Panel title="Team companies">
          <div className="mb-3"><GoldBtn onClick={() => setCreating(true)}><Plus size={14} /> New team company</GoldBtn></div>
          {teams === null ? <div className="py-6 flex justify-center"><Loader2 className="animate-spin" size={18} color={TEAL} /></div>
            : teams.length === 0 ? <Empty>No team company yet. Create one for the second practice set.</Empty> : (
              <table>
                <thead><tr><th>Company</th><th style={{ textAlign: "right" }}>Members</th><th>Created</th><th /></tr></thead>
                <tbody>
                  {teams.map((t) => (
                    <tr key={t.tenant_id}>
                      <td><b>{t.name}</b></td><td style={{ textAlign: "right" }}>{t.members}</td><td>{t.created_at.slice(0, 10)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <TinyBtn type="button" onClick={() => openManage(t)}><Users size={11} /> Members and roles</TinyBtn>{" "}
                        <TinyBtn type="button" onClick={() => openBooks(t)}>Open the books</TinyBtn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </Panel>

        <Panel title="The roles">
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            {ROLES.map((r) => <div key={r.key} className="text-[12.5px]"><b>{r.label}</b><div className="text-[#7F8EA0] text-[11.5px]">{r.does}</div></div>)}
          </div>
        </Panel>
      </div>

      {creating && (
        <Modal title="New team company" onClose={() => setCreating(false)}>
          <form onSubmit={create}>
            <Label>Company name</Label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nueva Ecija Furniture — Team A" required />
            <Label>Fiscal year starts</Label><input className="input" type="date" value={fy} max={today()} onChange={(e) => setFy(e.target.value)} required />
            <Label>Costing method</Label>
            <select className="input" value={costing} onChange={(e) => setCosting(e.target.value as "STANDARD" | "ACTUAL")}>
              <option value="STANDARD">Standard costing</option><option value="ACTUAL">Actual (moving average) costing</option>
            </select>
            <div className="text-[11.5px] text-[#7F8EA0] mt-2">The company starts with the same chart of accounts and master data as a student&rsquo;s own. You are not a member of it; add the students on the next step.</div>
            <div className="flex gap-2 justify-end mt-5"><OutlineBtn type="button" onClick={() => setCreating(false)} disabled={busy}>Cancel</OutlineBtn><GoldBtn type="submit" disabled={busy || !name.trim()}>Create</GoldBtn></div>
          </form>
        </Modal>
      )}

      {manage && (
        <Modal title={`${manage.name} — members and roles`} onClose={() => setManage(null)} wide>
          {roster.length === 0 && <div className="text-[12.5px] text-[#7F8EA0] mb-3">No members yet. Add students below.</div>}
          {roster.map((m) => (
            <div key={m.user_id} className="border border-hairline rounded-md p-3 mb-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-[13px] font-semibold">{m.full_name ?? "Student"} <span className="text-[11.5px] font-normal text-[#7F8EA0]">· {rolesText(m.roles)}</span></div>
                <div className="flex gap-1.5">
                  <TinyBtn type="button" disabled={busy} onClick={() => saveMember(m.user_id)}>Save roles</TinyBtn>
                  <TinyBtn type="button" disabled={busy} onClick={() => removeMember(m)} aria-label={`Remove ${m.full_name ?? "student"}`}><Trash2 size={11} /></TinyBtn>
                </div>
              </div>
              <RoleBoxes value={draft[m.user_id] ?? []} onChange={(v) => setDraft({ ...draft, [m.user_id]: v })} disabled={busy} />
            </div>
          ))}
          <div className="border border-dashed border-hairline rounded-md p-3">
            <Label>Add a student</Label>
            <select className="input mb-3" value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Choose a student…</option>
              {free.map((s) => <option key={s.id} value={s.id}>{s.full_name ?? "Student"}</option>)}
            </select>
            {adding && <RoleBoxes value={addRoles} onChange={setAddRoles} disabled={busy} />}
            <div className="mt-3"><GoldBtn type="button" onClick={addMember} disabled={busy || !adding}>Add to the team</GoldBtn></div>
          </div>
          <div className="flex justify-end mt-4"><OutlineBtn type="button" onClick={() => setManage(null)}>Close</OutlineBtn></div>
        </Modal>
      )}
      <FormStyles />
    </div>
  );
}
