"use client";
// The teacher's announcements (migration 0092): post one to a system, let the page draft a congratulation for the top scorer of each practice set (you edit it and press Post;
// nothing goes to students on its own), and delete old ones. Students see them at the top of that system's home page.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Trophy } from "lucide-react";
import { GoldBtn, Label, OutlineBtn, Panel } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { SYSTEMS, makeDrafts, systemLabel, type Draft, type SystemId } from "@/lib/announce";
import { loadLines } from "@/lib/announceLoad";

type Posted = { id: string; system: SystemId; title: string; body: string; kind: "NOTICE" | "TOP_SCORER"; activity: string | null; created_at: string };
type Edit = { title: string; body: string; board: boolean };
const VIOLET = "#9D7CFF";
const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
const keyOf = (d: Draft) => `${d.system}|${d.activity}`;

export default function AnnouncementsPage() {
  const router = useRouter();
  const { loading, userId, profile } = useSession();
  const isTeacher = profile?.role === "teacher";
  const [posted, setPosted] = useState<Posted[] | null | undefined>(undefined);   // undefined: loading, null: the database update is not applied yet
  const [system, setSystem] = useState<SystemId>("AIS");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState<SystemId>("MANUFACTURING");
  const [finding, setFinding] = useState<{ done: number; total: number } | null>(null);
  const [findNote, setFindNote] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});

  useEffect(() => {
    if (loading) return;
    if (!userId) { router.replace("/login"); return; }
    if (profile && !isTeacher) router.replace("/choose");
  }, [loading, userId, profile, isTeacher, router]);

  const loadPosted = useCallback(async () => {
    const r = await supabase.rpc("announcement_list_all");
    setPosted(r.error ? null : ((r.data as Posted[]) ?? []));
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!loading && isTeacher) loadPosted(); }, [loading, isTeacher, loadPosted]);

  const post = async () => {
    if (busy) return;
    if (!title.trim() || !body.trim()) { toast.error("Write a title and the message."); return; }
    setBusy(true);
    const res = await mutate(supabase.rpc("announcement_post", { p_system: system, p_title: title, p_body: body, p_kind: "NOTICE", p_activity: null }),
      { successMessage: `Posted to ${systemLabel(system)}.` });
    setBusy(false);
    if (ok(res)) { setTitle(""); setBody(""); await loadPosted(); }
  };

  const find = async () => {
    if (finding) return;
    setFinding({ done: 0, total: 0 }); setFindNote(""); setDrafts([]);
    try {
      const lines = await loadLines(scan, (done, total) => setFinding({ done, total }));
      const ds = makeDrafts(lines);
      setDrafts(ds);
      setEdits(Object.fromEntries(ds.map((d) => [keyOf(d), { title: d.title, body: d.body, board: false }])));
      if (ds.length === 0) setFindNote(`Nobody has scored in ${systemLabel(scan)} yet, so there is nothing to congratulate.`);
    } catch (e) {
      setFindNote(e instanceof Error ? e.message : "The scores could not be read.");
    } finally { setFinding(null); }
  };

  const postDraft = async (d: Draft) => {
    const e = edits[keyOf(d)];
    if (!e || busy) return;
    setBusy(true);
    const text = e.board && d.board ? `${e.body.trim()}\n\n${d.board}` : e.body.trim();
    const res = await mutate(supabase.rpc("announcement_post", { p_system: d.system, p_title: e.title, p_body: text, p_kind: "TOP_SCORER", p_activity: d.activity }),
      { successMessage: `Posted to ${systemLabel(d.system)}.` });
    setBusy(false);
    if (ok(res)) { setDrafts((x) => x.filter((y) => keyOf(y) !== keyOf(d))); await loadPosted(); }
  };

  const remove = async (a: Posted) => {
    if (busy || !confirm(`Delete "${a.title}"? Students will no longer see it.`)) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("announcement_delete", { p_id: a.id }), { successMessage: "Deleted." });
    setBusy(false);
    if (ok(res)) await loadPosted();
  };

  if (loading || !profile || !isTeacher) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={20} color={VIOLET} /></div>;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 bg-panel border-b border-hairline">
        <div>
          <div className="font-serif text-lg font-bold">Announcements</div>
          <div className="text-xs text-[#7F8EA0]">Teacher · {profile.full_name}</div>
        </div>
        <button onClick={() => router.push("/choose")} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs text-[#A3B1C2]"><ArrowLeft size={15} /> Choose ERP</button>
      </div>

      <div className="px-1 py-2 sm:px-6 sm:py-6 max-w-[920px] w-full mx-auto flex flex-col gap-5">
        <div className="text-[12.5px] text-[#A3B1C2] max-w-[780px]">
          An announcement appears at the top of one system&rsquo;s home page, for the students who may use that system. Nothing is posted until you press Post.
        </div>
        {posted === null && <div className="rounded-lg bg-amber-50 p-3 text-[12.5px] text-amber-900">Announcements need the database update 0092, which is not applied yet.</div>}

        <Panel title="Post an announcement">
          <div className="flex flex-col gap-3">
            <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(200px, 280px) 1fr" }}>
              <div><Label>System</Label>
                <select className="input" value={system} onChange={(e) => setSystem(e.target.value as SystemId)}>{SYSTEMS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
              <div><Label>Title</Label><input className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Activity 2 reminder" /></div>
            </div>
            <div><Label>Message</Label><textarea className="input" rows={5} value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} placeholder="Write what the students should know." /></div>
            <div><GoldBtn onClick={post} disabled={busy || posted === null}>{busy ? <Loader2 size={13} className="animate-spin" /> : null} Post to students</GoldBtn></div>
          </div>
        </Panel>

        <Panel title="Congratulate the top scorers">
          <div className="flex flex-col gap-3">
            <div className="text-[12.5px] text-[#A3B1C2] max-w-[780px]">
              Pick a system and I will find the top score in each of its practice sets and write a congratulation. Students are named by first name and the initial of their last name; a team shows its members.
              You can edit the text, tick the top-5 line, and post only the ones you want. Standard and Manufacturing check every company, so they take a little while.
            </div>
            <div className="flex gap-2 items-end flex-wrap">
              <div><Label>System</Label>
                <select className="input" value={scan} onChange={(e) => setScan(e.target.value as SystemId)} disabled={!!finding}>{SYSTEMS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
              <OutlineBtn onClick={find} disabled={!!finding || posted === null}>{finding ? <Loader2 size={13} className="animate-spin" /> : <Trophy size={13} />} Find the top scorers</OutlineBtn>
              {finding && finding.total > 0 && <span className="text-[12.5px] text-[#A3B1C2]">Checking companies: {finding.done} of {finding.total}</span>}
            </div>
            {findNote && <div className="text-[12.5px] text-[#A3B1C2]">{findNote}</div>}
            {drafts.map((d) => {
              const e = edits[keyOf(d)];
              if (!e) return null;
              return (
                <div key={keyOf(d)} className="border border-hairline rounded-lg p-3 flex flex-col gap-2">
                  <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#7F8EA0]">{systemLabel(d.system)} · {d.activity}</div>
                  <input className="input" value={e.title} maxLength={120} onChange={(x) => setEdits((all) => ({ ...all, [keyOf(d)]: { ...e, title: x.target.value } }))} aria-label="Title" />
                  <textarea className="input" rows={3} value={e.body} maxLength={1900} onChange={(x) => setEdits((all) => ({ ...all, [keyOf(d)]: { ...e, body: x.target.value } }))} aria-label="Message" />
                  {d.board && (
                    <label className="flex items-start gap-2 text-[12.5px]"><input type="checkbox" className="mt-0.5" checked={e.board} onChange={(x) => setEdits((all) => ({ ...all, [keyOf(d)]: { ...e, board: x.target.checked } }))} />
                      <span>Add the top-5 line: <span className="text-[#7F8EA0]">{d.board}</span></span></label>
                  )}
                  <div className="flex gap-2">
                    <GoldBtn onClick={() => postDraft(d)} disabled={busy}>Post this congratulation</GoldBtn>
                    <OutlineBtn onClick={() => setDrafts((x) => x.filter((y) => keyOf(y) !== keyOf(d)))} disabled={busy}>Skip</OutlineBtn>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Posted">
          {posted === undefined ? <div className="py-4 flex justify-center"><Loader2 className="animate-spin" size={18} color={VIOLET} /></div>
            : !posted || posted.length === 0 ? <div className="text-[12.5px] text-[#7F8EA0]">Nothing posted yet.</div> : (
              <table>
                <thead><tr><th>System</th><th>Announcement</th><th>Posted</th><th /></tr></thead>
                <tbody>
                  {posted.map((a) => (
                    <tr key={a.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{systemLabel(a.system)}</td>
                      <td><b>{a.kind === "TOP_SCORER" ? "★ " : ""}{a.title}</b><div className="text-[12px] text-[#7F8EA0] whitespace-pre-line">{a.body}</div></td>
                      <td style={{ whiteSpace: "nowrap" }}>{when(a.created_at)}</td>
                      <td style={{ textAlign: "right" }}><OutlineBtn onClick={() => remove(a)} disabled={busy}>Delete</OutlineBtn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </Panel>
      </div>
    </div>
  );
}
