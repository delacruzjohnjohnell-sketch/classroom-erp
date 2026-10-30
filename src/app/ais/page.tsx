"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSearch, Inbox, Loader2, ShieldCheck, Users } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Panel, Empty, GoldBtn } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { SEATS, seatAccess, seatsText } from "@/lib/aisSeats";

type Settings = { fiscal_year_start: string; sod_mode: "ENFORCE" | "ALLOW_LOGGED" };
type Member = { user_id: string; full_name: string | null; seats: string[] };
type Instance = { title: string; topic: string | null; summary: string | null; mode: string; phase: string; total: number; pending: number; posted: number; held: number };

export default function AisHomePage() {
  return <AppShell><AisHome /></AppShell>;
}

function AisHome() {
  const { effectiveTenantId, profile, tenants } = useSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [roster, setRoster] = useState<Member[]>([]);
  const [mySeats, setMySeats] = useState<string[]>([]);
  const [inst, setInst] = useState<Instance | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const isTeacher = profile?.role === "teacher";
  const company = tenants.find((t) => t.id === effectiveTenantId)?.name ?? "—";

  useEffect(() => {
    if (!effectiveTenantId) return;
    let live = true;
    (async () => {
      const [s, r, m, i] = await Promise.all([
        supabase.from("ais_company_settings").select("fiscal_year_start, sod_mode").eq("tenant_id", effectiveTenantId).maybeSingle(),
        supabase.rpc("ais_roster", { p_tenant: effectiveTenantId }),
        isTeacher ? Promise.resolve({ data: [] as string[] }) : supabase.rpc("ais_my_seats"),
        supabase.rpc("ais_my_instance"),
      ]);
      if (!live) return;
      setSettings((s.data as Settings | null) ?? null);
      setRoster((r.data as Member[] | null) ?? []);
      setMySeats((m.data as string[] | null) ?? []);
      setInst((i.data as Instance | null) ?? null);
      setReady(true);
    })();
    return () => { live = false; };
  }, [effectiveTenantId, isTeacher]);

  if (!ready) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin" size={20} color="#9D7CFF" /></div>;
  const access = seatAccess(mySeats);

  return (
    <div className="px-7 py-6 max-w-[1100px] flex flex-col gap-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7F8EA0]">Accounting Information Systems</div>
        <h1 className="text-[22px] font-bold mt-1">{company}</h1>
        <div className="text-[13px] text-[#7F8EA0] mt-1">
          {isTeacher ? "Reviewing as teacher." : access.lookOnly ? "You have no seat in this company yet, so you can only look. Ask your teacher." : `Your seat: ${seatsText(mySeats)}.`}
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        {SEATS.map((s) => {
          const mine = mySeats.includes(s.key);
          const Icon = s.key === "ACCOUNTING" ? Inbox : FileSearch;
          return (
            <div key={s.key} className="rounded-xl border bg-panel p-5" style={{ borderColor: mine ? "#9D7CFF" : "#243140" }}>
              <div className="flex items-center gap-2.5">
                <Icon size={18} color="#9D7CFF" />
                <div className="font-semibold text-[15px]">{s.label} seat</div>
                {mine && <span className="ml-auto text-[10.5px] font-mono uppercase tracking-[0.12em] text-[#9D7CFF]">yours</span>}
              </div>
              <div className="text-[12.5px] text-[#A3B1C2] mt-2 leading-relaxed">{s.does}</div>
            </div>
          );
        })}
      </div>

      <Panel title="Practice set">
        {!inst ? (
          <Empty>No practice set has been assigned to this company yet. When your teacher assigns one, its documents will appear in the Accounting seat&rsquo;s inbox.</Empty>
        ) : (
          <div className="text-[12.5px]">
            <div className="font-semibold text-[14px]">{inst.title}</div>
            <div className="text-[#7F8EA0] mt-0.5">{inst.topic} · {inst.mode === "IMMEDIATE" ? "practice round" : "graded round"} · {inst.phase === "ACCOUNTING" ? "Accounting phase open" : "Accounting phase closed"}</div>
            <div className="text-[#A3B1C2] mt-2">{inst.posted} posted · {inst.held} held · {inst.pending} waiting of {inst.total} documents.</div>
            {(access.canAccount || isTeacher) && <div className="mt-3"><GoldBtn onClick={() => router.push("/ais/inbox")}>Open the document inbox</GoldBtn></div>}
          </div>
        )}
      </Panel>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <Panel title="Who is in this company">
          {roster.length === 0 ? <Empty>No members yet.</Empty> : (
            <table>
              <thead><tr><th>Name</th><th>Seat</th></tr></thead>
              <tbody>{roster.map((m) => <tr key={m.user_id}><td>{m.full_name ?? "Student"}</td><td>{seatsText(m.seats)}</td></tr>)}</tbody>
            </table>
          )}
        </Panel>
        <Panel title="Controls in force">
          <div className="flex items-start gap-2.5 text-[12.5px]">
            <ShieldCheck size={16} color="#9D7CFF" className="mt-0.5 shrink-0" />
            <div>
              <b>Segregation of duties: {settings?.sod_mode === "ALLOW_LOGGED" ? "allowed but logged" : "enforced"}.</b>
              <div className="text-[#7F8EA0] mt-0.5">
                {settings?.sod_mode === "ALLOW_LOGGED"
                  ? "A person may approve what they entered, but it is recorded. The Audit seat should look for it."
                  : "Nobody may approve a document they entered themselves."}
              </div>
              {settings && <div className="text-[#7F8EA0] mt-1"><Users size={12} className="inline mr-1" />Fiscal year starts {settings.fiscal_year_start}.</div>}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
