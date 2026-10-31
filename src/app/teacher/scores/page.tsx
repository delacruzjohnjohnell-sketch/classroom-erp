"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { KpiCard, Panel, Empty } from "@/components/ui";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { classWorkbookBytes, pctOf, studentMatrix, type Edition, type ScoreRow } from "@/lib/classScores";
import { loadAisRows, loadClassCompanies, loadMfgSet, loadMfgSets, mapLimit, PRACTICE_SETS, scoreMfg, scoreStandard } from "@/lib/classScoresLoad";

const BLUE = "#2F6BFF";

export default function TeacherScoresPage() {
  const { loading, userId, profile } = useSession();
  const router = useRouter();
  const [mfgSets, setMfgSets] = useState<{ id: string; name: string }[]>([]);
  const [stdSet, setStdSet] = useState(PRACTICE_SETS[0].id);
  const [mfgSet, setMfgSet] = useState("");
  const [use, setUse] = useState<Record<Edition, boolean>>({ Standard: true, Manufacturing: true, AIS: true });
  const [answers, setAnswers] = useState(true);
  const [rows, setRows] = useState<ScoreRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [filter, setFilter] = useState<Edition | "All">("All");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!userId) router.replace("/login");
    else if (profile && profile.role !== "teacher") router.replace("/dashboard");
  }, [loading, userId, profile, router]);

  useEffect(() => {
    if (!profile || profile.role !== "teacher") return;
    loadMfgSets().then((s) => { setMfgSets(s); setMfgSet((cur) => cur || s[0]?.id || ""); }).catch(() => setMfgSets([]));
  }, [profile]);

  const load = async () => {
    setBusy(true); setErrors([]); setRows(null); setProgress(null);
    const errs: string[] = [];
    const all: ScoreRow[] = [];
    try {
      const companies = use.Standard || use.Manufacturing ? await loadClassCompanies() : [];
      if (use.Standard) {
        const set = PRACTICE_SETS.find((p) => p.id === stdSet) ?? PRACTICE_SETS[0];
        const list = companies.filter((c) => c.edition === "Standard");
        const res = await mapLimit(list, 3, (c) => scoreStandard(c, set).catch((e) => { errs.push(`${c.name}: ${e?.message ?? e}`); return null; }), (done, total) => setProgress({ done, total }));
        all.push(...res.filter((r): r is ScoreRow => r !== null));
      }
      if (use.Manufacturing && mfgSet) {
        const set = await loadMfgSet(mfgSet);
        const list = companies.filter((c) => c.edition === "Manufacturing");
        const res = await mapLimit(list, 3, (c) => scoreMfg(c, set).catch((e) => { errs.push(`${c.name}: ${e?.message ?? e}`); return null; }), (done, total) => setProgress({ done, total }));
        all.push(...res.filter((r): r is ScoreRow => r !== null));
      }
      if (use.AIS) all.push(...(await loadAisRows()));
    } catch (e) {
      errs.push((e as Error)?.message ?? String(e));
    }
    setRows(all); setErrors(errs); setBusy(false); setProgress(null);
  };

  const download = async () => {
    if (!rows) return;
    const bytes = await classWorkbookBytes(rows, { includeAnswers: answers });
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url; a.download = `Classroom-ERP-Class-Scores-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast.success("The Excel file was downloaded.");
  };

  const shown = useMemo(() => (rows ?? []).filter((r) => (filter === "All" || r.edition === filter) && (!q.trim() || `${r.company} ${r.students.join(" ")} ${r.activity}`.toLowerCase().includes(q.trim().toLowerCase()))), [rows, filter, q]);
  const matrix = useMemo(() => studentMatrix(rows ?? []), [rows]);
  const avg = matrix.students.length ? Math.round(matrix.students.reduce((s, x) => s + (x.average ?? 0), 0) / matrix.students.length) : null;

  if (loading || !profile || profile.role !== "teacher") return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={20} color={BLUE} /></div>;

  return (
    <div className="mfg-light min-h-screen">
      <div className="max-w-[1200px] mx-auto px-6 py-6 flex flex-col gap-5">
        <button type="button" onClick={() => router.push("/teacher")} className="flex items-center gap-1.5 text-[13px] font-semibold self-start" style={{ color: BLUE }}><ArrowLeft size={14} /> Back to the class overview</button>
        <div>
          <h1 className="text-[22px] font-bold">Class scores</h1>
          <div className="text-[13px] text-[#6b778a] mt-1 max-w-[820px]">Every student&apos;s result for every activity, across the Standard, Manufacturing and AIS editions, in one place and in one Excel file. Standard and Manufacturing are checked against the practice set you choose, right now. AIS comes from the scores the system keeps.</div>
        </div>

        <Panel title="What to include">
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <label className="text-[12.5px]"><input type="checkbox" checked={use.Standard} onChange={(e) => setUse({ ...use, Standard: e.target.checked })} /> <b>Standard</b> practice set
              <select className="input mt-1" value={stdSet} onChange={(e) => setStdSet(e.target.value)} disabled={!use.Standard}>{PRACTICE_SETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="text-[12.5px]"><input type="checkbox" checked={use.Manufacturing} onChange={(e) => setUse({ ...use, Manufacturing: e.target.checked })} /> <b>Manufacturing</b> activity
              <select className="input mt-1" value={mfgSet} onChange={(e) => setMfgSet(e.target.value)} disabled={!use.Manufacturing}>{mfgSets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="text-[12.5px]"><input type="checkbox" checked={use.AIS} onChange={(e) => setUse({ ...use, AIS: e.target.checked })} /> <b>AIS</b>: inbox, the five desks and the audit
              <div className="text-[11.5px] text-[#6b778a] mt-1">All AIS companies, whatever practice set they were given.</div></label>
          </div>
          <div className="flex items-center gap-4 mt-4 flex-wrap">
            <button type="button" onClick={load} disabled={busy || (!use.Standard && !use.Manufacturing && !use.AIS)} className="rounded-md px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: BLUE }}>{busy ? "Loading…" : rows ? "Load the scores again" : "Load the scores"}</button>
            {busy && progress && <span className="text-[12.5px] text-[#6b778a]">Checked {progress.done} of {progress.total} companies…</span>}
            <label className="text-[12.5px] text-[#6b778a]"><input type="checkbox" checked={answers} onChange={(e) => setAnswers(e.target.checked)} /> Include what each company actually has, next to what was expected, in the Detail sheet</label>
          </div>
        </Panel>

        {errors.length > 0 && <div className="rounded-lg border px-4 py-3 text-[12.5px]" style={{ borderColor: "#f0b4b4", background: "#fdeeee", color: "#a03030" }}>Some companies could not be scored: {errors.slice(0, 4).join(" · ")}{errors.length > 4 ? ` and ${errors.length - 4} more` : ""}</div>}

        {rows && (
          <>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
              <KpiCard icon={<Download size={14} />} label="Students" value={matrix.students.length} accent={BLUE} />
              <KpiCard icon={<Download size={14} />} label="Scored items" value={rows.length} accent="#9D7CFF" />
              <KpiCard icon={<Download size={14} />} label="Class average" value={avg === null ? "n/a" : `${avg}%`} accent="#22A6A0" />
            </div>

            <Panel title="Scores">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                {(["All", "Standard", "Manufacturing", "AIS"] as const).map((e) => (
                  <button key={e} type="button" onClick={() => setFilter(e)} className="rounded-full px-3 py-1 text-[12px] font-semibold border" style={filter === e ? { background: BLUE, color: "#fff", borderColor: BLUE } : { color: "#4a566a", borderColor: "#d7dde6" }}>{e}</button>
                ))}
                <input className="input" style={{ maxWidth: 260, padding: "6px 10px" }} placeholder="Search a student or company" value={q} onChange={(e) => setQ(e.target.value)} />
                <button type="button" onClick={download} className="ml-auto flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-semibold text-white" style={{ background: "#1f8f5f" }}><Download size={14} /> Download Excel</button>
              </div>
              {shown.length === 0 ? <Empty>Nothing to show for this filter.</Empty> : (
                <table>
                  <thead><tr><th>Edition</th><th>Activity</th><th>Company</th><th>Students</th><th style={{ textAlign: "right" }}>Score</th><th style={{ textAlign: "right" }}>%</th><th>Status</th></tr></thead>
                  <tbody>{shown.map((r, i) => {
                    const p = pctOf(r.points, r.max);
                    return (<tr key={i}><td>{r.edition}</td><td>{r.activity}</td><td>{r.company}</td><td style={{ fontSize: 12 }}>{r.students.join(", ")}</td>
                      <td style={{ textAlign: "right" }}>{r.points ?? ""} / {r.max ?? ""}</td><td style={{ textAlign: "right", fontWeight: 600, color: p === null ? undefined : p >= 75 ? "#1f8f5f" : p >= 50 ? "#b97a10" : "#c0392b" }}>{p === null ? "" : `${p}%`}</td><td style={{ fontSize: 12 }}>{r.status}</td></tr>);
                  })}</tbody>
                </table>
              )}
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
