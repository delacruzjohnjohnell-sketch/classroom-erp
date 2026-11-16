"use client";
// The teacher's switch for each practice set: open it to the class and every student who may use AIS sees it and starts it with one click (migration 0088).
// A set that ships with the app and is not in the database yet is installed on the first "open", so nothing has to be pasted.
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { GoldBtn, OutlineBtn } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { BUILTIN_SETS, type SetDef } from "@/lib/aisBuiltinSets";

type Mode = "IMMEDIATE" | "AFTER_CLOSE";
export type SetRow = { id: string; title: string; topic: string | null; summary: string | null; txns: number; assigned: number };
type OpenRow = { id: string; open: boolean; mode: Mode; lock: string | null; started: number };
type Draft = { mode: Mode; lock: string };
const VIOLET = "#9D7CFF";

export default function PracticeSetsPanel({ sets, onChanged }: { sets: SetRow[]; onChanged: () => void }) {
  const [state, setState] = useState<OpenRow[] | null | undefined>(undefined);   // undefined: loading, null: the database update is not applied yet
  const [defs, setDefs] = useState<Record<string, SetDef>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    const r = await supabase.rpc("ais_open_state");
    if (r.error) { setState(null); return; }
    const rows = ((r.data as OpenRow[]) ?? []).map((x) => ({ ...x, started: Number(x.started) }));
    setState(rows);
    setDrafts((d) => {
      const next = { ...d };
      rows.forEach((x) => { if (!next[x.id]) next[x.id] = { mode: x.mode, lock: x.lock ?? "" }; });
      return next;
    });
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadState(); }, [loadState, sets.length]);

  const have = new Set(sets.map((s) => s.id));
  const missing = BUILTIN_SETS.filter((b) => !have.has(b.id));
  useEffect(() => {
    missing.forEach((b) => { if (!defs[b.id]) b.load().then((d) => setDefs((x) => ({ ...x, [b.id]: d })), () => undefined); });
  }, [missing.map((b) => b.id).join(","), defs]);   // eslint-disable-line react-hooks/exhaustive-deps

  const rows = [
    ...sets.map((s) => ({ ...s, installed: true })),
    ...missing.filter((b) => defs[b.id]).map((b) => ({ id: b.id, title: defs[b.id].title, topic: defs[b.id].topic ?? null, summary: defs[b.id].summary ?? null, txns: defs[b.id].txns.length, assigned: 0, installed: false })),
  ];
  const stateOf = (id: string) => state?.find((x) => x.id === id);
  const draftOf = (id: string): Draft => drafts[id] ?? { mode: "IMMEDIATE", lock: "" };
  const setDraft = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...draftOf(id), ...patch } }));

  const apply = async (id: string, installed: boolean, open: boolean) => {
    if (busy) return;
    setBusy(id);
    try {
      if (open && !installed) {
        const def = defs[id] ?? (await BUILTIN_SETS.find((b) => b.id === id)!.load());
        if (!ok(await mutate(supabase.rpc("ais_set_import", { p_def: def })))) return;
      }
      const d = draftOf(id);
      const res = await mutate(supabase.rpc("ais_set_open", { p_set: id, p_open: open, p_mode: d.mode, p_lock: d.lock || null }),
        { successMessage: open ? "Open. Every team that has no set yet can now start it." : "Closed. No team can start it now; teams that already started keep working." });
      if (ok(res)) { await loadState(); onChanged(); }
    } finally { setBusy(null); }
  };

  if (state === undefined) return <div className="py-6 flex justify-center"><Loader2 className="animate-spin" size={18} color={VIOLET} /></div>;
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[12.5px] text-[#A3B1C2] max-w-[780px]">
        Put the students in teams first (the AIS companies above: add an Accounting student and an Audit student). Then open a set: any member of a team can start it, and the whole
        team works on it in the company you made, with numbers of its own. <b>Practice</b> explains each answer straight away; <b>Graded</b> shows results only after the Audit closes.
        Close it to stop new starts. A team that already has a set needs your &ldquo;Start a new round&rdquo; for another.
      </div>
      {state === null && <div className="rounded-lg bg-amber-50 p-3 text-[12.5px] text-amber-900">The sets can&rsquo;t be opened to the class until the database update 0088 is applied.</div>}
      {rows.length === 0 ? <div className="text-[12.5px] text-[#7F8EA0]">No practice set yet.</div> : (
        <table>
          <thead><tr><th>Set</th><th style={{ textAlign: "right" }}>Documents</th><th>Mode</th><th>Books lock on</th><th>For the class</th><th /></tr></thead>
          <tbody>
            {rows.map((x) => {
              const st = stateOf(x.id); const d = draftOf(x.id); const isOpen = !!st?.open;
              const changed = isOpen && st && (st.mode !== d.mode || (st.lock ?? "") !== d.lock);
              return (
                <tr key={x.id}>
                  <td><b>{x.title}</b><div className="text-[11px] text-[#7F8EA0]">{x.topic} · {x.id}{!x.installed ? " · ships with the app, not installed yet" : ""}</div></td>
                  <td style={{ textAlign: "right" }}>{x.txns}</td>
                  <td>
                    <select className="input" value={d.mode} onChange={(e) => setDraft(x.id, { mode: e.target.value as Mode })} disabled={state === null} aria-label={`Mode for ${x.title}`}>
                      <option value="IMMEDIATE">Practice</option><option value="AFTER_CLOSE">Graded</option>
                    </select>
                  </td>
                  <td><input className="input" type="date" value={d.lock} onChange={(e) => setDraft(x.id, { lock: e.target.value })} disabled={state === null} aria-label={`Lock date for ${x.title}`} /></td>
                  <td>
                    {isOpen ? <b style={{ color: "#2E9E5B" }}>Open</b> : <span className="text-[#7F8EA0]">{x.installed ? "Closed" : "Not installed"}</span>}
                    {st && st.started > 0 && <div className="text-[11px] text-[#7F8EA0]">{st.started} team{st.started === 1 ? "" : "s"} started</div>}
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {isOpen ? (
                      <>
                        {changed && <GoldBtn onClick={() => apply(x.id, x.installed, true)} disabled={busy !== null}>Update</GoldBtn>}{" "}
                        <OutlineBtn onClick={() => apply(x.id, x.installed, false)} disabled={busy !== null}>Close</OutlineBtn>
                      </>
                    ) : (
                      <GoldBtn onClick={() => apply(x.id, x.installed, true)} disabled={busy !== null || state === null}>{busy === x.id ? <Loader2 size={13} className="animate-spin" /> : null} {x.installed ? "Open to the class" : "Add and open to the class"}</GoldBtn>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
