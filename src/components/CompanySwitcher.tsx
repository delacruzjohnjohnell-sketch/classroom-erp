"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useSession } from "@/lib/session";

/**
 * Sidebar control for accounts that belong to more than one company: shows the
 * active company and lets the person switch. Every page reloads its data for the
 * company that becomes active; nothing is shared between companies.
 */
export default function CompanySwitcher() {
  const { myCompanies, tenants, effectiveTenantId, switchCompany } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const current = tenants.find((t) => t.id === effectiveTenantId);
  // A company the person has just been added to may not be in the list yet; always show the active one.
  const list = myCompanies.some((c) => c.id === effectiveTenantId) || !current ? myCompanies : [current, ...myCompanies];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 text-left rounded-md px-2 py-1.5 -mx-2 hover:bg-sidebarHover"
        aria-haspopup="listbox" aria-expanded={open}
      >
        <span className="text-[13px] font-bold truncate text-ink">{current?.name ?? "—"}</span>
        <ChevronsUpDown size={14} className="shrink-0 text-sidebarTextMuted" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-panel border border-hairline rounded-lg shadow-[0_18px_50px_rgba(0,0,0,0.55)] p-1.5" role="listbox">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-sidebarTextMuted px-2 py-1">Your companies</div>
          {list.map((c) => {
            const active = c.id === effectiveTenantId;
            return (
              <button
                key={c.id}
                role="option" aria-selected={active}
                disabled={busyId !== null}
                onClick={async () => {
                  if (active) { setOpen(false); return; }
                  setBusyId(c.id);
                  const ok = await switchCompany(c.id);
                  setBusyId(null);
                  if (ok) { setOpen(false); router.refresh(); }
                }}
                className={`w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded-md text-[13px] ${active ? "text-teal bg-tealsoft" : "text-ink hover:bg-sidebarHover"} disabled:opacity-60`}
              >
                <span className="truncate">{c.name}</span>
                {active && <Check size={14} className="shrink-0" />}
              </button>
            );
          })}
          <button
            onClick={() => { setOpen(false); router.push("/companies"); }}
            className="w-full flex items-center gap-2 text-left px-2 py-1.5 mt-1 rounded-md text-[12.5px] text-teal border-t border-hairline hover:bg-sidebarHover"
          >
            <Plus size={13} /> Create or join a company
          </button>
        </div>
      )}
    </div>
  );
}
