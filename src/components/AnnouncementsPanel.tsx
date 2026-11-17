"use client";
// The teacher's announcements for one system, shown at the top of that system's home page (migration 0092). Nothing is drawn when there are none, or before the update is applied.
import { useEffect, useState } from "react";
import { Megaphone, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { SystemId } from "@/lib/announce";

type Item = { id: string; title: string; body: string; kind: "NOTICE" | "TOP_SCORER"; activity: string | null; created_at: string };
const when = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });

export default function AnnouncementsPanel({ system, className = "" }: { system: SystemId; className?: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    supabase.rpc("announcement_list", { p_system: system }).then(({ data, error }) => { if (live && !error) setItems((data as Item[]) ?? []); });
    return () => { live = false; };
  }, [system]);

  if (items.length === 0) return null;
  const shown = all ? items : items.slice(0, 3);
  return (
    <section aria-label="Announcements" className={`rounded-xl border border-[#E3E8F0] bg-white p-4 flex flex-col gap-3 ${className}`}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2563EB]"><Megaphone size={14} aria-hidden="true" /> Announcements</div>
      {shown.map((a) => (
        <div key={a.id} className="flex gap-3 border-t border-[#EEF1F6] pt-3 first-of-type:border-t-0 first-of-type:pt-0">
          <div className="mt-0.5 shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: a.kind === "TOP_SCORER" ? "#FEF3C7" : "#EAF1FF", color: a.kind === "TOP_SCORER" ? "#B45309" : "#2563EB" }} aria-hidden="true">
            {a.kind === "TOP_SCORER" ? <Trophy size={16} /> : <Megaphone size={16} />}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[14px] text-[#0F2A4A]">{a.title}</div>
            <div className="text-[13.5px] text-[#475569] leading-relaxed whitespace-pre-line mt-0.5">{a.body}</div>
            <div className="text-[11.5px] text-[#7B8794] mt-1">{when(a.created_at)}</div>
          </div>
        </div>
      ))}
      {items.length > 3 && <button type="button" onClick={() => setAll((v) => !v)} className="self-start text-[12.5px] font-semibold text-[#2563EB] hover:underline">{all ? "Show fewer" : `Show earlier (${items.length - 3})`}</button>}
    </section>
  );
}
