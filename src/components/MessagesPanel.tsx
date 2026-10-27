"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquarePlus, Send } from "lucide-react";
import { FormStyles, GoldBtn, Label, Modal, OutlineBtn } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";

type Row = { thread_id: string; subject: string; audience: string; audience_label: string; last_post_at: string; last_body: string; last_sender: string; posts: number; unread: boolean };
type Post = { id: string; sender: string; role: string; body: string; at: string; mine: boolean };
type Thread = { id: string; subject: string; audience: string; audience_label: string; posts: Post[] };
type Targets = { students: { id: string; name: string }[]; teams: { id: string; name: string }[] };

const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const AUDIENCE_TAG: Record<string, string> = { CLASS: "Class", TEAM: "Team", STUDENT: "Private" };
const notify = () => window.dispatchEvent(new Event("messages-changed"));

/** The inbox and conversation screen. The teacher can write to the whole class, one team or one student; a student writes to the teacher. */
export default function MessagesPanel() {
  const { profile } = useSession();
  const isTeacher = profile?.role === "teacher";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const loadInbox = useCallback(async () => {
    const r = await supabase.rpc("msg_inbox");
    if (r.error) { toast.error(r.error.message); setRows([]); return; }
    setRows((r.data as Row[]) ?? []);
  }, []);

  const openThread = useCallback(async (id: string) => {
    setOpenId(id);
    const r = await supabase.rpc("msg_thread", { p_thread: id });
    if (r.error) { toast.error(r.error.message); return; }
    setThread(r.data as Thread);
    loadInbox();
    notify();
  }, [loadInbox]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadInbox(); const t = setInterval(loadInbox, 30_000); return () => clearInterval(t); }, [loadInbox]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [thread?.posts.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openId || !reply.trim() || busy) return;
    setBusy(true);
    const r = await supabase.rpc("msg_reply", { p_thread: openId, p_body: reply });
    setBusy(false);
    if (r.error) { toast.error(r.error.message); return; }
    setReply("");
    await openThread(openId);
  };

  return (
    <div>
      <FormStyles />
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[11px] tracking-[0.12em] text-[#7F8EA0] uppercase">Messages</div>
          <h1 className="text-[22px] font-bold">{isTeacher ? "Messages to your class" : "Messages with your teacher"}</h1>
        </div>
        <GoldBtn type="button" onClick={() => setComposing(true)}><MessageSquarePlus size={14} /> {isTeacher ? "New message" : "Message my teacher"}</GoldBtn>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(260px, 340px) 1fr" }}>
        <div className="rounded-xl border border-hairline bg-panel overflow-hidden" style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {rows === null && <div className="py-10 flex justify-center"><Loader2 className="animate-spin" size={18} color="#2F6BFF" /></div>}
          {rows && rows.length === 0 && <div className="p-5 text-[13px] text-[#7F8EA0]">No messages yet.</div>}
          {rows?.map((r) => (
            <button key={r.thread_id} type="button" onClick={() => openThread(r.thread_id)}
              className={`w-full text-left px-4 py-3 border-b border-hairline ${openId === r.thread_id ? "bg-[rgba(47,107,255,0.08)]" : ""}`}>
              <div className="flex items-center gap-2">
                {r.unread && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#2F6BFF" }} aria-label="unread" />}
                <span className={`text-[13.5px] truncate ${r.unread ? "font-bold" : "font-semibold"}`}>{r.subject}</span>
                <span className="ml-auto text-[10.5px] text-[#7F8EA0] shrink-0">{when(r.last_post_at)}</span>
              </div>
              <div className="text-[11px] text-[#7F8EA0] mt-0.5">{AUDIENCE_TAG[r.audience] ?? ""} · {r.audience_label} · {r.posts} message{r.posts === 1 ? "" : "s"}</div>
              <div className="text-[12px] text-[#A3B1C2] truncate mt-0.5">{r.last_sender}: {r.last_body}</div>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-hairline bg-panel flex flex-col" style={{ minHeight: 360, maxHeight: "70vh" }}>
          {!thread && <div className="m-auto text-[13px] text-[#7F8EA0] p-6">Choose a message on the left{isTeacher ? ", or start a new one" : ", or message your teacher"}.</div>}
          {thread && (
            <>
              <div className="px-5 py-3 border-b border-hairline">
                <div className="text-[15px] font-bold">{thread.subject}</div>
                <div className="text-[11.5px] text-[#7F8EA0]">{AUDIENCE_TAG[thread.audience]} · {thread.audience_label}</div>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {thread.posts.map((p) => (
                  <div key={p.id} className={`flex ${p.mine ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[78%] rounded-xl px-3.5 py-2.5 text-[13px]" style={{ background: p.mine ? "rgba(47,107,255,0.12)" : "rgba(127,142,160,0.14)" }}>
                      <div className="text-[11px] font-semibold text-[#7F8EA0] mb-0.5">{p.mine ? "You" : p.sender}{p.role === "teacher" ? " (teacher)" : ""} · {when(p.at)}</div>
                      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{p.body}</div>
                    </div>
                  </div>
                ))}
                <div ref={bottom} />
              </div>
              <form onSubmit={send} className="px-4 py-3 border-t border-hairline flex gap-2 items-end">
                <textarea className="input flex-1" rows={2} maxLength={4000} placeholder="Write a reply…" value={reply} onChange={(e) => setReply(e.target.value)} />
                <GoldBtn type="submit" disabled={busy || !reply.trim()}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send</GoldBtn>
              </form>
            </>
          )}
        </div>
      </div>

      {composing && <Compose isTeacher={isTeacher} onClose={() => setComposing(false)} onSent={async (id) => { setComposing(false); await loadInbox(); await openThread(id); }} />}
    </div>
  );
}

function Compose({ isTeacher, onClose, onSent }: { isTeacher: boolean; onClose: () => void; onSent: (id: string) => void }) {
  const [targets, setTargets] = useState<Targets | null>(null);
  const [audience, setAudience] = useState<"CLASS" | "TEAM" | "STUDENT">("CLASS");
  const [target, setTarget] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isTeacher) return;
    supabase.rpc("msg_targets").then((r) => { if (r.error) toast.error(r.error.message); else setTargets(r.data as Targets); });
  }, [isTeacher]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (isTeacher && audience !== "CLASS" && !target) { toast.error(audience === "TEAM" ? "Choose a team." : "Choose a student."); return; }
    setBusy(true);
    const r = isTeacher
      ? await supabase.rpc("msg_send", { p_audience: audience, p_target: audience === "CLASS" ? null : target, p_subject: subject, p_body: body })
      : await supabase.rpc("msg_student_start", { p_subject: subject, p_body: body });
    setBusy(false);
    if (r.error) { toast.error(r.error.message); return; }
    toast.success("Message sent.");
    notify();
    onSent(r.data as string);
  };

  return (
    <Modal title={isTeacher ? "New message" : "Message my teacher"} onClose={onClose}>
      <form onSubmit={submit}>
        {isTeacher && (
          <>
            <Label>To</Label>
            <select className="input" value={audience} onChange={(e) => { setAudience(e.target.value as "CLASS" | "TEAM" | "STUDENT"); setTarget(""); }}>
              <option value="CLASS">The whole class</option>
              <option value="TEAM">A team company</option>
              <option value="STUDENT">One student</option>
            </select>
            {audience === "TEAM" && (
              <select className="input mt-2" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Choose a team…</option>
                {targets?.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            {audience === "STUDENT" && (
              <select className="input mt-2" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Choose a student…</option>
                {targets?.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </>
        )}
        <div className="mt-3"><Label>Subject</Label>
          <input className="input" maxLength={120} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Activity 1 is open" autoFocus /></div>
        <div className="mt-3"><Label>Message</Label>
          <textarea className="input" rows={5} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <div className="flex gap-2 justify-end mt-4">
          <OutlineBtn type="button" onClick={onClose}>Cancel</OutlineBtn>
          <GoldBtn type="submit" disabled={busy || !subject.trim() || !body.trim()}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send</GoldBtn>
        </div>
      </form>
    </Modal>
  );
}
