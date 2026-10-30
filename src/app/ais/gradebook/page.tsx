"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Loader2, LogOut } from "lucide-react";
import { Empty, FormStyles, GoldBtn, KpiCard, Label, Panel } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { showQueryErrors } from "@/lib/queryErrors";
import {
  classSummary, deskAccuracy, deskReading, detectionRate, gradebookCsv, heatColor, pct, PHASE_LABEL,
  type DeskRow, type DetectionRow, type GradeRow,
} from "@/lib/aisGrade";

type SetRow = { id: string; title: string };
const VIOLET = "#9D7CFF";

/** The teacher's class gradebook for the AIS edition: each company's Accounting and Audit results, which planted exceptions the class finds, and which desk traps fool it. */
export default function AisGradebookPage() {
  const router = useRouter();
  const { loading, userId, profile, signOut } = useSession();
  const isTeacher = profile?.role === "teacher";
  const [rows, setRows] = useState<GradeRow[] | null>(null);
  const [det, setDet] = useState<DetectionRow[]>([]);
  const [desk, setDesk] = useState<DeskRow[]>([]);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [setId, setSetId] = useState("");
  const [closedOnly, setClosedOnly] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!userId) { router.replace("/login"); return; }
    if (profile && !isTeacher) router.replace("/choose");
  }, [loading, userId, profile, isTeacher, router]);

  const load = useCallback(async () => {
    const [g, d, k, s] = await Promise.all([
      supabase.rpc("ais_class_gradebook"),
      supabase.rpc("ais_detection_matrix", { p_set: setId || null, p_closed_only: closedOnly }),
      supabase.rpc("ais_desk_matrix", { p_set: setId || null }),
      supabase.rpc("ais_set_list"),
    ]);
    showQueryErrors(g, d, k, s);
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    setRows(((g.data as GradeRow[]) ?? []).map((r) => ({
      ...r, desk_points: Number(r.desk_points), desk_max: Number(r.desk_max), desk_decided: Number(r.desk_decided), desk_total: Number(r.desk_total),
      audit_points: num(r.audit_points), audit_max: num(r.audit_max), audit_planted: num(r.audit_planted), audit_found: num(r.audit_found), audit_wrong_type: num(r.audit_wrong_type),
      audit_missed: num(r.audit_missed), audit_false_positives: num(r.audit_false_positives), findings: Number(r.findings),
    })));
    setDet(((d.data as DetectionRow[]) ?? []).map((r) => ({ ...r, planted_n: Number(r.planted_n), found_n: Number(r.found_n), wrong_type_n: Number(r.wrong_type_n), missed_n: Number(r.missed_n), companies_n: Number(r.companies_n) })));
    setDesk(((k.data as DeskRow[]) ?? []).map((r) => ({ ...r, seq: Number(r.seq), docs: Number(r.docs), posted: Number(r.posted), held_right: Number(r.held_right), held_other: Number(r.held_other), avg_points: num(r.avg_points) })));
    setSets(((s.data as SetRow[]) ?? []).map((x) => ({ id: x.id, title: x.title })));
  }, [setId, closedOnly]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!loading && isTeacher) load(); }, [loading, isTeacher, load]);

  const shown = useMemo(() => (rows ?? []).filter((r) => !setId || r.set_id === setId), [rows, setId]);
  const sum = useMemo(() => classSummary(shown), [shown]);

  const download = () => {
    const blob = new Blob([gradebookCsv(shown)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ais-gradebook-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading || !profile) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={20} color={VIOLET} /></div>;
  if (!isTeacher) return null;

  const cell = (v: number | null) => ({ background: heatColor(v) ?? undefined, textAlign: "right" as const });

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 bg-panel border-b border-hairline">
        <div>
          <div className="font-serif text-lg font-bold">AIS class gradebook</div>
          <div className="text-xs text-[#7F8EA0]">Teacher · {profile.full_name}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.push("/ais/teams")} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs text-[#A3B1C2]"><ArrowLeft size={15} /> AIS companies</button>
          <button onClick={() => signOut()} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs text-[#A3B1C2]"><LogOut size={14} /> Sign out</button>
        </div>
      </div>

      <div className="px-6 py-6 max-w-[1150px] w-full mx-auto flex flex-col gap-5">
        <div className="grid gap-2 items-end" style={{ gridTemplateColumns: "minmax(240px, 1fr) auto auto" }}>
          <div><Label>Practice set</Label>
            <select className="input" value={setId} onChange={(e) => setSetId(e.target.value)}>
              <option value="">All sets</option>{sets.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select></div>
          <label className="flex items-center gap-2 text-[12.5px] pb-2"><input type="checkbox" checked={closedOnly} onChange={(e) => setClosedOnly(e.target.checked)} /> Count finished audits only in the detection table</label>
          <GoldBtn onClick={download} disabled={shown.length === 0}><Download size={14} /> Download CSV</GoldBtn>
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <KpiCard icon={<span />} label="Companies" value={sum.companies} />
          <KpiCard icon={<span />} label="Started" value={sum.started} accent="#F2B13C" />
          <KpiCard icon={<span />} label="Finished" value={sum.finished} accent="#22D3C5" />
          <KpiCard icon={<span />} label="Average Accounting" value={sum.avgDeskPct === null ? "—" : `${sum.avgDeskPct}%`} accent={VIOLET} />
          <KpiCard icon={<span />} label="Average Audit" value={sum.avgAuditPct === null ? "—" : `${sum.avgAuditPct}%`} accent={VIOLET} />
        </div>

        <Panel title="Results by company">
          {rows === null ? <div className="py-6 flex justify-center"><Loader2 className="animate-spin" size={18} color={VIOLET} /></div> : shown.length === 0 ? <Empty>No company has been assigned a practice set yet.</Empty> : (
            <table>
              <thead><tr><th>Company</th><th>Members</th><th>Phase</th><th style={{ textAlign: "right" }}>Decided</th><th style={{ textAlign: "right" }}>Accounting</th><th style={{ textAlign: "right" }}>Audit</th><th style={{ textAlign: "right" }}>Found / planted</th><th style={{ textAlign: "right" }}>False reports</th></tr></thead>
              <tbody>{shown.map((r) => {
                const dp = pct(r.desk_points, r.desk_max), ap = pct(r.audit_points, r.audit_max);
                return (
                  <tr key={r.tenant_id}>
                    <td><b>{r.company}</b><div className="text-[11px] text-[#7F8EA0]">{r.mode === "IMMEDIATE" ? "practice round" : "graded round"}</div></td>
                    <td style={{ fontSize: 12 }}>{r.members.length === 0 ? "—" : r.members.map((m) => `${m.name} (${m.seats.length ? m.seats.map((s) => s.toLowerCase()).join(" + ") : "no seat"})`).join(", ")}</td>
                    <td>{PHASE_LABEL[r.phase]}</td>
                    <td style={{ textAlign: "right" }}>{r.desk_decided}/{r.desk_total}</td>
                    <td style={cell(dp === null ? null : dp / 100)}>{dp === null ? "" : `${r.desk_points}/${r.desk_max} (${dp}%)`}</td>
                    <td style={cell(ap === null ? null : ap / 100)}>{ap === null ? "" : `${r.audit_points}/${r.audit_max} (${ap}%)`}</td>
                    <td style={{ textAlign: "right" }}>{r.audit_planted === null ? "" : `${r.audit_found}/${r.audit_planted}`}</td>
                    <td style={{ textAlign: "right" }}>{r.audit_false_positives ?? ""}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
          <div className="text-[11.5px] text-[#7F8EA0] mt-2">The Audit score is shown from the moment the Accounting phase closes, as it stands; the student sees theirs when they close the audit. Open a company on the AIS companies page for its full answer key.</div>
        </Panel>

        <Panel title="Which planted exceptions does the class find?">
          {det.length === 0 ? <Empty>Nothing to show yet. Planted exceptions appear here once audits are {closedOnly ? "finished" : "under way"}.</Empty> : (
            <table>
              <thead><tr><th>Type of exception</th><th style={{ textAlign: "right" }}>Planted</th><th style={{ textAlign: "right" }}>Found</th><th style={{ textAlign: "right" }}>Wrong type</th><th style={{ textAlign: "right" }}>Missed</th><th style={{ textAlign: "right" }}>Detection rate</th></tr></thead>
              <tbody>{det.map((d) => {
                const r = detectionRate(d);
                return <tr key={d.exception_type}><td><b>{d.label}</b><div className="text-[11px] text-[#7F8EA0]">in {d.companies_n} compan{d.companies_n === 1 ? "y" : "ies"}</div></td>
                  <td style={{ textAlign: "right" }}>{d.planted_n}</td><td style={{ textAlign: "right" }}>{d.found_n}</td><td style={{ textAlign: "right" }}>{d.wrong_type_n}</td><td style={{ textAlign: "right" }}>{d.missed_n}</td>
                  <td style={cell(r)}>{r === null ? "" : `${Math.round(r * 100)}%`}</td></tr>;
              })}</tbody>
            </table>
          )}
          <div className="text-[11.5px] text-[#7F8EA0] mt-2">A low rate means the class does not yet know how to spot this kind of exception: a good topic for the next lesson.</div>
        </Panel>

        <Panel title="Which documents fooled the class at the desk?">
          {desk.length === 0 ? <Empty>No document has been decided yet.</Empty> : (
            <table>
              <thead><tr><th style={{ width: 40 }}>#</th><th>Right answer</th><th style={{ textAlign: "right" }}>Students</th><th style={{ textAlign: "right" }}>Posted</th><th style={{ textAlign: "right" }}>Held, right control</th><th style={{ textAlign: "right" }}>Held, other</th><th style={{ textAlign: "right" }}>Got it right</th><th>What happened</th></tr></thead>
              <tbody>{desk.map((d) => {
                const a = deskAccuracy(d);
                return <tr key={d.seq}><td>{d.seq}</td><td>{d.key_decision === "POST" ? "Post" : `Hold: ${d.failed_control?.replace(/_/g, " ").toLowerCase()}`}</td>
                  <td style={{ textAlign: "right" }}>{d.docs}</td><td style={{ textAlign: "right" }}>{d.posted}</td><td style={{ textAlign: "right" }}>{d.held_right}</td><td style={{ textAlign: "right" }}>{d.held_other}</td>
                  <td style={cell(a)}>{a === null ? "" : `${Math.round(a * 100)}%`}</td><td style={{ fontSize: 12 }}>{deskReading(d)}</td></tr>;
              })}</tbody>
            </table>
          )}
        </Panel>
      </div>
      <FormStyles />
    </div>
  );
}
