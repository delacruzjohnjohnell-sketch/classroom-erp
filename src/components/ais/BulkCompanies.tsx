"use client";

import { useMemo, useState } from "react";
import { GoldBtn, Label, Modal, OutlineBtn } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/mutate";
import { parseCompanyList, planOk, type Student } from "@/lib/aisBulk";

type SetOption = { id: string; title: string };

/** The teacher pastes a class list and every company is created with its seats (and, if chosen, its practice set) in one go. */
export default function BulkCompanies({ students, sets, onClose, onDone }: { students: Student[]; sets: SetOption[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [setId, setSetId] = useState("");
  const [mode, setMode] = useState<"IMMEDIATE" | "AFTER_CLOSE">("IMMEDIATE");
  const [lock, setLock] = useState("2027-01-31");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const plans = useMemo(() => parseCompanyList(text, students), [text, students]);
  const good = plans.filter(planOk);

  const create = async () => {
    setBusy(true); setLog([]);
    const out: string[] = [];
    for (const p of good) {
      try {
        const c = await supabase.rpc("ais_create_company", { p_name: p.company.trim(), p_fiscal_year_start: "2027-01-01" });
        if (c.error) throw new Error(c.error.message);
        const tenant = c.data as unknown as string;
        if (p.solo) {
          const s = await supabase.rpc("ais_set_solo", { p_tenant: tenant, p_allow: true });
          if (s.error) throw new Error(s.error.message);
          const m = await supabase.rpc("ais_set_seats", { p_tenant: tenant, p_user: p.accounting!.id, p_seats: ["ACCOUNTING", "AUDIT"] });
          if (m.error) throw new Error(m.error.message);
        } else {
          const a = await supabase.rpc("ais_set_seats", { p_tenant: tenant, p_user: p.accounting!.id, p_seats: ["ACCOUNTING"] });
          if (a.error) throw new Error(a.error.message);
          const b = await supabase.rpc("ais_set_seats", { p_tenant: tenant, p_user: p.audit!.id, p_seats: ["AUDIT"] });
          if (b.error) throw new Error(b.error.message);
        }
        if (setId) {
          const r = await supabase.rpc("ais_assign_set", { p_tenant: tenant, p_set: setId, p_seed: null, p_mode: mode, p_lock: lock || null });
          if (r.error) throw new Error(r.error.message);
        }
        out.push(`Created "${p.company}"${p.solo ? " (solo)" : ""}.`);
      } catch (e) {
        out.push(`"${p.company}" was not finished: ${friendlyError((e as Error).message)}`);
      }
      setLog([...out]);
    }
    setBusy(false);
    await onDone();
  };

  return (
    <Modal title="Create companies from a list" onClose={onClose} wide>
      <div className="text-[12.5px] text-[#A3B1C2]">One company per line: <b>Company name, Accounting student, Audit student</b>. Names must match the student&apos;s name exactly. Leave the audit student out (or repeat the same name) for a solo company. You can paste straight from a spreadsheet.</div>
      <Label>The list</Label>
      <textarea className="input" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Alpha Trading, Ana Cruz, Ben Reyes\nBeta Supply, Carla Dizon"} />
      <div className="grid gap-3 mt-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div><Label>Practice set (optional)</Label><select className="input" value={setId} onChange={(e) => setSetId(e.target.value)}><option value="">Do not assign one yet</option>{sets.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></div>
        <div><Label>Round</Label><select className="input" value={mode} onChange={(e) => setMode(e.target.value as "IMMEDIATE" | "AFTER_CLOSE")} disabled={!setId}><option value="IMMEDIATE">Practice (feedback at once)</option><option value="AFTER_CLOSE">Graded (points after close)</option></select></div>
        <div><Label>Books locked through</Label><input className="input" type="date" value={lock} onChange={(e) => setLock(e.target.value)} disabled={!setId} /></div>
      </div>
      {plans.length > 0 && (
        <table className="mt-3">
          <thead><tr><th>Line</th><th>Company</th><th>Accounting</th><th>Audit</th><th>Check</th></tr></thead>
          <tbody>{plans.map((p) => (
            <tr key={p.line}><td>{p.line}</td><td>{p.company}</td><td>{p.accounting?.full_name ?? ""}</td><td>{p.solo ? "(same: solo)" : p.audit?.full_name ?? ""}</td>
              <td style={{ fontSize: 12, color: p.errors.length ? "#FF6B7A" : "#22D3C5" }}>{p.errors.length ? p.errors.join(" ") : "Ready"}</td></tr>
          ))}</tbody>
        </table>
      )}
      {log.length > 0 && <div className="mt-3 text-[12px] text-[#A3B1C2]">{log.map((l, i) => <div key={i}>{l}</div>)}</div>}
      <div className="flex gap-2 justify-end mt-4">
        <OutlineBtn type="button" onClick={onClose} disabled={busy}>Close</OutlineBtn>
        <GoldBtn type="button" onClick={create} disabled={busy || good.length === 0}>{busy ? "Creating…" : `Create ${good.length} ${good.length === 1 ? "company" : "companies"}`}</GoldBtn>
      </div>
    </Modal>
  );
}
