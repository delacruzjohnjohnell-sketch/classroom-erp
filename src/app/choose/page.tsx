"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Factory, Loader2, LogOut, Lock } from "lucide-react";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { EDITION_LABEL, type Edition } from "@/lib/edition";

const CYAN = "#22D3C5", AMBER = "#F2B13C";

type EditionRow = { tenant_id: string; edition: Edition };
type LastUsed = { edition: Edition; tenant_id: string; opened_at: string };

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : null);

export default function ChoosePage() {
  const router = useRouter();
  const { loading, userId, profile, myCompanies, tenants, effectiveTenantId, switchCompany, signOut } = useSession();
  const [ready, setReady] = useState(false);
  const [editions, setEditions] = useState<Record<string, Edition>>({});
  const [enabled, setEnabled] = useState<Record<Edition, boolean>>({ STANDARD: true, MANUFACTURING: false });
  const [lastUsed, setLastUsed] = useState<Partial<Record<Edition, LastUsed>>>({});
  const [busy, setBusy] = useState<Edition | null>(null);
  const isTeacher = profile?.role === "teacher";

  const load = useCallback(async () => {
    const [ed, st, lu] = await Promise.all([
      supabase.from("tenant_editions").select("tenant_id, edition"),
      supabase.from("edition_settings").select("edition, enabled"),
      supabase.from("edition_last_used").select("edition, tenant_id, opened_at"),
    ]);
    setEditions(Object.fromEntries(((ed.data as EditionRow[]) ?? []).map((r) => [r.tenant_id, r.edition])));
    const flags: Record<Edition, boolean> = { STANDARD: true, MANUFACTURING: false };
    ((st.data as { edition: Edition; enabled: boolean }[]) ?? []).forEach((r) => { flags[r.edition] = r.enabled; });
    setEnabled(flags);
    const used: Partial<Record<Edition, LastUsed>> = {};
    ((lu.data as LastUsed[]) ?? []).forEach((r) => { used[r.edition] = r; });
    setLastUsed(used);
    setReady(true);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!userId) { router.replace("/login"); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [loading, userId, router, load]);

  const editionOf = (tenantId: string): Edition => editions[tenantId] ?? "STANDARD";

  // ---------- teacher ----------
  const toggleManufacturing = async () => {
    const res = await mutate(supabase.rpc("set_edition_enabled", { target_edition: "MANUFACTURING", is_enabled: !enabled.MANUFACTURING }),
      { successMessage: !enabled.MANUFACTURING ? "Manufacturing ERP opened for students." : "Manufacturing ERP closed for students." });
    if (ok(res)) load();
  };

  // ---------- student ----------
  const standardCompanies = myCompanies.filter((c) => editionOf(c.id) === "STANDARD");
  // a student can hold their own (solo) Manufacturing company and also belong to a team company the teacher made
  const mfgCompanies = myCompanies.filter((c) => editionOf(c.id) === "MANUFACTURING");
  const soloMfg = mfgCompanies.find((c) => c.owner_id === userId) ?? null;
  const mfgCompany = mfgCompanies.find((c) => c.id === effectiveTenantId) ?? mfgCompanies.find((c) => c.id === lastUsed.MANUFACTURING?.tenant_id) ?? soloMfg ?? mfgCompanies[0] ?? null;
  const activeStandard = standardCompanies.find((c) => c.id === effectiveTenantId);
  const lastStandard = standardCompanies.find((c) => c.id === lastUsed.STANDARD?.tenant_id);
  const standardCompany = activeStandard ?? lastStandard ?? standardCompanies[0] ?? null;

  const open = async (edition: Edition) => {
    if (busy) return;
    setBusy(edition);
    try {
      if (edition === "STANDARD") {
        if (!standardCompany) { router.push("/companies"); return; }
        if (standardCompany.id !== effectiveTenantId && !(await switchCompany(standardCompany.id))) return;
        await supabase.rpc("record_edition_open", { target_edition: "STANDARD", target_tenant: standardCompany.id });
        router.push("/dashboard");
      } else {
        if (!mfgCompany) { router.push("/mfg-setup"); return; }
        if (mfgCompany.id !== effectiveTenantId && !(await switchCompany(mfgCompany.id))) return;
        await supabase.rpc("record_edition_open", { target_edition: "MANUFACTURING", target_tenant: mfgCompany.id });
        router.push("/mfg");
      }
    } catch {
      toast.error("Couldn't open that ERP. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  // a student with no company at all still has to create or join one first
  useEffect(() => {
    if (ready && !isTeacher && userId && myCompanies.length === 0 && !profile?.tenant_id) router.replace("/login");
  }, [ready, isTeacher, userId, myCompanies.length, profile, router]);

  if (loading || !ready || !profile) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={20} color={CYAN} /></div>;
  }

  const lastEdition = (["STANDARD", "MANUFACTURING"] as Edition[])
    .filter((e) => lastUsed[e])
    .sort((a, b) => (lastUsed[b]!.opened_at > lastUsed[a]!.opened_at ? 1 : -1))[0];
  const counts = (e: Edition) => tenants.filter((t) => editionOf(t.id) === e).length;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-hairline bg-panel">
        <div className="flex items-center gap-2.5">
          <div className="font-mono text-[13px] font-bold text-teal border border-[rgba(34,211,197,0.55)] bg-tealsoft rounded-md w-8 h-8 flex items-center justify-center shadow-glow">&gt;_</div>
          <div className="font-mono text-[14px] font-bold">JJ and Co.</div>
        </div>
        <button onClick={() => signOut()} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs text-[#A3B1C2]"><LogOut size={14} /> Sign out</button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10">
        <div className="text-center mb-8 max-w-xl">
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7F8EA0] mb-2">{isTeacher ? "Teacher" : `Welcome${profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}</div>
          <h1 className="font-mono text-[22px] font-bold">Choose your ERP</h1>
          <p className="text-[13px] text-[#A3B1C2] mt-2">
            {isTeacher
              ? "Open or close each edition for your class, then look at the companies in it."
              : "Each ERP is a separate company with its own books, documents and numbering. Nothing you post in one appears in the other."}
          </p>
        </div>

        <div className="grid gap-5 w-full max-w-3xl" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))" }}>
          {/* ---------------- Standard ---------------- */}
          <EditionCard
            accent={CYAN} icon={<Building2 size={22} />} title={EDITION_LABEL.STANDARD} subtitle="Service & Trading"
            text="Sales, purchasing, inventory, banking, fixed assets, payroll and financial reports for a service or trading business."
            lastOpened={!isTeacher && lastEdition === "STANDARD" ? lastUsed.STANDARD : undefined}
            company={isTeacher ? `${counts("STANDARD")} student compan${counts("STANDARD") === 1 ? "y" : "ies"}` : standardCompany?.name}
            extra={!isTeacher && standardCompanies.length > 1 ? `${standardCompanies.length} companies — switch from the sidebar` : undefined}
            cta={isTeacher ? "View Standard companies" : standardCompany ? "Open" : "Create a company"}
            busy={busy === "STANDARD"}
            onClick={() => (isTeacher ? router.push("/teacher?edition=STANDARD") : open("STANDARD"))}
          />

          {/* ---------------- Manufacturing ---------------- */}
          <EditionCard
            accent={AMBER} icon={<Factory size={22} />} title={EDITION_LABEL.MANUFACTURING} subtitle="Production, MRP, Costing, Quality"
            text="Bills of materials, work centers, routings, production orders, standard and actual costing, variances and quality — on top of full financials."
            lastOpened={!isTeacher && lastEdition === "MANUFACTURING" ? lastUsed.MANUFACTURING : undefined}
            company={isTeacher ? `${counts("MANUFACTURING")} compan${counts("MANUFACTURING") === 1 ? "y" : "ies"}` : mfgCompany?.name}
            extra={!isTeacher && mfgCompanies.length > 1 ? `${mfgCompanies.length} companies (yours and your team's) — switch from the sidebar` : undefined}
            locked={!isTeacher && !enabled.MANUFACTURING && !mfgCompany}
            lockedText="Opens when your teacher turns it on."
            cta={isTeacher ? "View Manufacturing companies" : mfgCompany ? "Open" : "Set up my company"}
            busy={busy === "MANUFACTURING"}
            onClick={() => (isTeacher ? router.push("/teacher?edition=MANUFACTURING") : open("MANUFACTURING"))}
          />
        </div>

        {isTeacher && (
          <div className="mt-8 w-full max-w-3xl border border-hairline rounded-xl bg-panel p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold text-[14px]">Manufacturing ERP for students</div>
              <div className="text-[12.5px] text-[#A3B1C2] mt-0.5">
                {enabled.MANUFACTURING ? "Open — students can set up and use their Manufacturing company." : "Closed — students see it greyed out and can't create a Manufacturing company yet."}
              </div>
            </div>
            <button onClick={toggleManufacturing}
              className="rounded-lg px-4 py-2 text-[13px] font-semibold border"
              style={{ color: enabled.MANUFACTURING ? "#FF6B7A" : AMBER, borderColor: enabled.MANUFACTURING ? "rgba(255,107,122,0.55)" : "rgba(242,177,60,0.55)", background: enabled.MANUFACTURING ? "rgba(255,107,122,0.1)" : "rgba(242,177,60,0.1)" }}>
              {enabled.MANUFACTURING ? "Close it" : "Open it for students"}
            </button>
          </div>
        )}
        {isTeacher && <button onClick={() => router.push("/teacher")} className="mt-4 text-[12.5px] text-teal font-semibold">Go to the class overview →</button>}
        {isTeacher && <button onClick={() => router.push("/mfg/compare")} className="mt-2 block text-[12.5px] text-teal font-semibold">Compare the Manufacturing companies →</button>}
        {isTeacher && <button onClick={() => router.push("/mfg/teams")} className="mt-2 block text-[12.5px] text-teal font-semibold">Team companies: create one, add students, give roles →</button>}
        {!isTeacher && enabled.MANUFACTURING && mfgCompanies.length > 0 && !soloMfg && <button onClick={() => router.push("/mfg-setup")} className="mt-4 text-[12.5px] text-teal font-semibold">Set up my own Manufacturing company →</button>}
      </div>
    </div>
  );
}

function EditionCard({ accent, icon, title, subtitle, text, company, extra, lastOpened, locked, lockedText, cta, busy, onClick }: {
  accent: string; icon: React.ReactNode; title: string; subtitle: string; text: string;
  company?: string; extra?: string; lastOpened?: LastUsed; locked?: boolean; lockedText?: string;
  cta: string; busy: boolean; onClick: () => void;
}) {
  return (
    <div className="relative rounded-2xl border bg-panel p-6 flex flex-col"
      style={{ borderColor: lastOpened ? accent : "#243140", boxShadow: lastOpened ? `0 0 0 1px ${accent}55, 0 0 36px ${accent}14` : undefined, opacity: locked ? 0.7 : 1 }}>
      <div className="absolute left-0 right-0 top-0 h-px rounded-t-2xl" style={{ background: `linear-gradient(90deg, ${accent}, transparent 60%)` }} />
      <div className="flex items-start justify-between">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center border" style={{ color: accent, borderColor: `${accent}66`, background: `${accent}14` }}>{icon}</div>
        {lastOpened && <span className="font-mono text-[10px] uppercase tracking-[0.12em] rounded px-2 py-1 border" style={{ color: accent, borderColor: `${accent}55`, background: `${accent}12` }}>Last opened</span>}
      </div>
      <div className="font-mono text-[16px] font-bold mt-4">{title}</div>
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] mt-0.5" style={{ color: accent }}>{subtitle}</div>
      <div className="text-[13px] text-[#A3B1C2] leading-relaxed mt-3 flex-1">{text}</div>

      {company && (
        <div className="mt-4 text-[12.5px] border-t border-hairline pt-3">
          <div className="text-[#7F8EA0]">{locked ? "" : "Your company"}</div>
          <div className="font-semibold truncate">{company}</div>
          {extra && <div className="text-[11.5px] text-[#7F8EA0] mt-0.5">{extra}</div>}
          {lastOpened && <div className="text-[11.5px] text-[#7F8EA0] mt-0.5">Last opened {fmtDate(lastOpened.opened_at)}</div>}
        </div>
      )}

      {locked ? (
        <div className="mt-4 flex items-center justify-center gap-2 text-[12.5px] text-[#7F8EA0] border border-hairline rounded-lg py-2.5"><Lock size={14} /> {lockedText}</div>
      ) : (
        <button onClick={onClick} disabled={busy}
          className="mt-4 flex items-center justify-center gap-2 rounded-lg py-2.5 text-[13.5px] font-semibold border transition-colors disabled:opacity-60"
          style={{ color: accent, borderColor: `${accent}8c`, background: lastOpened ? `${accent}24` : `${accent}12` }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : null} {cta} <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}
