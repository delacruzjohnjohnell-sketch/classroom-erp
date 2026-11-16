"use client";
// The teacher builds a team in one step: name it, tick the students and tick each student's role (Accounting, Audit, or both). Nothing is created until Create is pressed,
// and then the company and every seat are made together or not at all (migration 0090).
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { GoldBtn, Label, Modal, OutlineBtn } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { teamSummary, toMembers, type Picks, type TeamSeat } from "@/lib/aisTeam";

type Student = { id: string; full_name: string | null; teams: string[] };
const VIOLET = "#9D7CFF";

export default function NewTeamModal({ defaultName, fiscalStart, onClose, onCreated }: { defaultName: string; fiscalStart: string; onClose: () => void; onCreated: () => void }) {
  const [students, setStudents] = useState<Student[] | null | undefined>(undefined);   // undefined: loading, null: the database update is not applied yet
  const [name, setName] = useState(defaultName);
  const [fy, setFy] = useState(fiscalStart);
  const [picks, setPicks] = useState<Picks>({});
  const [q, setQ] = useState("");
  const [onlyFree, setOnlyFree] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    supabase.rpc("ais_students_with_teams").then((r) => { if (live) setStudents(r.error ? null : (r.data as Student[]) ?? []); });
    return () => { live = false; };
  }, []);

  const tick = (id: string, seat: TeamSeat, on: boolean) =>
    setPicks((p) => ({ ...p, [id]: { ...(p[id] ?? { ACCOUNTING: false, AUDIT: false }), [seat]: on } }));
  const summary = teamSummary(picks);
  const shown = useMemo(() => (students ?? []).filter((s) => {
    const ticked = !!(picks[s.id]?.ACCOUNTING || picks[s.id]?.AUDIT);
    if (onlyFree && s.teams.length > 0 && !ticked) return false;
    return !q.trim() || (s.full_name ?? "").toLowerCase().includes(q.trim().toLowerCase());
  }), [students, picks, onlyFree, q]);
  const inTeam = (students ?? []).filter((s) => s.teams.length > 0).length;

  const create = async () => {
    if (busy) return;
    if (!name.trim()) { toast.error("Give the team a name."); return; }
    if (summary.members === 0) { toast.error("Tick at least one student and a role."); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("ais_create_team", { p_name: name.trim(), p_fiscal_year_start: fy, p_members: toMembers(picks) }),
      { successMessage: `${name.trim()} created with ${summary.members} student${summary.members === 1 ? "" : "s"}.` });
    setBusy(false);
    if (ok(res)) { onCreated(); onClose(); }
  };

  return (
    <Modal title="New team" onClose={onClose} wide>
      {students === undefined && <div className="py-8 flex justify-center"><Loader2 className="animate-spin" size={18} color={VIOLET} /></div>}
      {students === null && <div className="rounded-lg bg-amber-50 p-3 text-[12.5px] text-amber-900">The team form needs the database update 0090, which is not applied yet.</div>}
      {students && (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <div><Label>Team name</Label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>Fiscal year starts</Label><input className="input" type="date" value={fy} onChange={(e) => setFy(e.target.value)} /></div>
          </div>
          <div className="text-[12.5px] text-[#A3B1C2]">
            Tick each student who belongs to the team and the role they hold. <b>Accounting</b> reviews and posts the documents; <b>Audit</b> tests the posted books.
            Tick both for one student to make a solo team. Only students you ticked for the AIS system in Sign-up approvals are listed. A student who is missing: open
            Sign-up approvals, tick AIS for them and press Save access.
          </div>
          {students.length === 0 && <div className="rounded-lg bg-amber-50 p-3 text-[12.5px] text-amber-900">No student has been ticked for the AIS system yet. Do that in Sign-up approvals first.</div>}
          <div className="flex gap-3 items-center flex-wrap">
            <input className="input" style={{ maxWidth: 260 }} placeholder="Search a student" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search a student" />
            <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> Hide students already in a team ({inTeam})</label>
          </div>
          <div className="border border-hairline rounded-lg overflow-auto" style={{ maxHeight: 340 }}>
            <table style={{ margin: 0 }}>
              <thead><tr><th>Student</th><th style={{ textAlign: "center", width: 96 }}>Accounting</th><th style={{ textAlign: "center", width: 96 }}>Audit</th></tr></thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={3} className="text-[12.5px] text-[#7F8EA0]">No student matches.</td></tr>}
                {shown.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <b>{s.full_name?.trim() || "(no name)"}</b>
                      {s.teams.length > 0 && <div className="text-[11px] text-[#7F8EA0]">Already in: {s.teams.join(", ")}</div>}
                    </td>
                    <td style={{ textAlign: "center" }}><input type="checkbox" checked={!!picks[s.id]?.ACCOUNTING} onChange={(e) => tick(s.id, "ACCOUNTING", e.target.checked)} aria-label={`${s.full_name} Accounting seat`} /></td>
                    <td style={{ textAlign: "center" }}><input type="checkbox" checked={!!picks[s.id]?.AUDIT} onChange={(e) => tick(s.id, "AUDIT", e.target.checked)} aria-label={`${s.full_name} Audit seat`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[12.5px]">
            <b>{summary.members}</b> student{summary.members === 1 ? "" : "s"} ticked · {summary.accounting} Accounting · {summary.audit} Audit
            {summary.notes.map((n) => <div key={n} className="text-amber-800 mt-1">{n}</div>)}
          </div>
          <div className="flex justify-end gap-2">
            <OutlineBtn onClick={onClose} disabled={busy}>Cancel</OutlineBtn>
            <GoldBtn onClick={create} disabled={busy || summary.members === 0}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Create the team</GoldBtn>
          </div>
        </div>
      )}
    </Modal>
  );
}
