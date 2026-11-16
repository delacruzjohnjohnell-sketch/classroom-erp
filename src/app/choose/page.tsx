"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Building2, Factory, FileText, Loader2, LogOut, Lock, Scale } from "lucide-react";
import { Inter } from "next/font/google";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { EDITION_LABEL, type Edition } from "@/lib/edition";
import { canUse, needsCompany } from "@/lib/access";
import { useAccessGuard } from "@/lib/useAccess";

const CYAN = "#22D3C5";
const inter = Inter({ subsets: ["latin"], display: "swap" });   // this page only: the font is self-hosted at build and not applied anywhere else

type EditionRow = { tenant_id: string; edition: Edition };
type LastUsed = { edition: Edition; tenant_id: string; opened_at: string };

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : null);

export default function ChoosePage() {
  const router = useRouter();
  const { loading, userId, profile, myCompanies, tenants, effectiveTenantId, switchCompany, signOut } = useSession();
  const [ready, setReady] = useState(false);
  const [editions, setEditions] = useState<Record<string, Edition>>({});
  const [enabled, setEnabled] = useState<Record<Edition, boolean>>({ STANDARD: true, MANUFACTURING: false, AIS: false });
  const [lastUsed, setLastUsed] = useState<Partial<Record<Edition, LastUsed>>>({});
  const [busy, setBusy] = useState<Edition | null>(null);
  const isTeacher = profile?.role === "teacher";
  const accessBlocked = useAccessGuard();
  const [pendingCount, setPendingCount] = useState(0);
  // the AIS practice sets the teacher has opened to the class (migration 0088); empty before that update is applied
  const [openSets, setOpenSets] = useState<{ id: string; started: string | null; team: { id: string; name: string } | null }[]>([]);
  useEffect(() => {
    if (isTeacher || !userId) return;
    supabase.rpc("ais_open_sets").then(({ data, error }) => { if (!error) setOpenSets((data as { id: string; started: string | null; team: { id: string; name: string } | null }[]) ?? []); });
  }, [isTeacher, userId]);
  useEffect(() => {
    if (!isTeacher) return;
    supabase.rpc("pending_count").then(({ data, error }) => { if (!error && typeof data === "number") setPendingCount(data); });
  }, [isTeacher]);

  const load = useCallback(async () => {
    const [ed, st, lu] = await Promise.all([
      supabase.from("tenant_editions").select("tenant_id, edition"),
      supabase.from("edition_settings").select("edition, enabled"),
      supabase.from("edition_last_used").select("edition, tenant_id, opened_at"),
    ]);
    setEditions(Object.fromEntries(((ed.data as EditionRow[]) ?? []).map((r) => [r.tenant_id, r.edition])));
    const flags: Record<Edition, boolean> = { STANDARD: true, MANUFACTURING: false, AIS: false };
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

  const toggleAis = async () => {
    const res = await mutate(supabase.rpc("set_edition_enabled", { target_edition: "AIS", is_enabled: !enabled.AIS }),
      { successMessage: !enabled.AIS ? "Accounting Information Systems opened for students." : "Accounting Information Systems closed for students." });
    if (ok(res)) load();
  };

  // ---------- student ----------
  // AIS companies are made by the teacher; a student belongs to the one(s) they were added to
  const aisCompanies = myCompanies.filter((c) => editionOf(c.id) === "AIS");
  const aisCompany = aisCompanies.find((c) => c.id === effectiveTenantId) ?? aisCompanies.find((c) => c.id === lastUsed.AIS?.tenant_id) ?? aisCompanies[0] ?? null;
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
      } else if (edition === "AIS") {
        if (!aisCompany) { toast.error("Your teacher has not added you to an AIS company yet."); return; }
        if (aisCompany.id !== effectiveTenantId && !(await switchCompany(aisCompany.id))) return;
        await supabase.rpc("record_edition_open", { target_edition: "AIS", target_tenant: aisCompany.id });
        router.push("/ais");
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
    if (ready && !isTeacher && userId && myCompanies.length === 0 && !profile?.tenant_id && needsCompany(profile)) router.replace("/login");
  }, [ready, isTeacher, userId, myCompanies.length, profile, router]);

  if (loading || !ready || !profile || accessBlocked) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={20} color={CYAN} /></div>;
  }

  const lastEdition = (["STANDARD", "MANUFACTURING", "AIS"] as Edition[])
    .filter((e) => lastUsed[e])
    .sort((a, b) => (lastUsed[b]!.opened_at > lastUsed[a]!.opened_at ? 1 : -1))[0];
  const counts = (e: Edition) => tenants.filter((t) => editionOf(t.id) === e).length;

  return (
    <div className={`${inter.className} relative min-h-screen flex flex-col bg-[#F4F6FA]`}>
      {/* the school's seal and the college's logo, faint behind everything; the white box of the seal is blended into the page */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[3%] top-1/2 h-[min(44vw,420px)] w-[min(44vw,420px)] -translate-y-1/2 bg-contain bg-center bg-no-repeat opacity-[0.10] mix-blend-multiply" style={{ backgroundImage: "url(/olfu-seal.jpeg)" }} />
        <div className="absolute right-[3%] top-1/2 h-[min(44vw,420px)] w-[min(44vw,420px)] -translate-y-1/2 bg-contain bg-center bg-no-repeat opacity-[0.10] mix-blend-multiply" style={{ backgroundImage: "url(/cba-logo.png)" }} />
      </div>
      <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-hairline bg-panel">
        <div className="flex items-center gap-2.5">
          <div className="font-mono text-[13px] font-bold text-teal border border-[rgba(34,211,197,0.55)] bg-tealsoft rounded-md w-8 h-8 flex items-center justify-center shadow-glow">&gt;_</div>
          <div className="font-mono text-[14px] font-bold">JJ and Co.</div>
        </div>
        <div className="flex items-center gap-2">
          {isTeacher && (
            <button onClick={() => router.push("/teacher/approvals")} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs font-semibold" style={{ color: "#2F6BFF" }}>
              Sign-up approvals
              {pendingCount > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF6B7A] text-white text-[10.5px] font-bold flex items-center justify-center">{pendingCount}</span>}
            </button>
          )}
          <button onClick={() => signOut()} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-1.5 text-xs text-[#A3B1C2]"><LogOut size={14} /> Sign out</button>
        </div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-10">
        <div className="text-center mb-10 max-w-xl">
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#2563EB] mb-2">{isTeacher ? "Teacher" : `Welcome${profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}</div>
          <h1 className="text-[28px] sm:text-[32px] font-semibold tracking-tight text-[#0F2A4A] leading-tight">Choose your ERP</h1>
          <p className="text-[14.5px] text-[#475569] mt-3 leading-relaxed">
            {isTeacher
              ? "Open or close each edition for your class, then look at the companies in it."
              : "Each ERP is a separate company with its own books, documents and numbering. Nothing you post in one appears in the other."}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-6 w-full max-w-[880px]">
          {/* ---------------- Standard ---------------- */}
          <EditionCard
            accent="#D97706" icon={<Building2 size={22} />} title={EDITION_LABEL.STANDARD} subtitle="Service & Trading"
            text="Sales, purchasing, inventory, banking, assets, payroll and reports for a service or trading business."
            lastOpened={!isTeacher && lastEdition === "STANDARD" ? lastUsed.STANDARD : undefined}
            company={isTeacher ? `${counts("STANDARD")} student compan${counts("STANDARD") === 1 ? "y" : "ies"}` : standardCompany?.name}
            extra={!isTeacher && standardCompanies.length > 1 ? `${standardCompanies.length} companies — switch from the sidebar` : undefined}
            locked={!isTeacher && !canUse(profile, "standard")}
            lockedText="Your teacher has not given you this system."
            cta={isTeacher ? "View Standard companies" : standardCompany ? "Open" : "Create a company"}
            busy={busy === "STANDARD"}
            onClick={() => (isTeacher ? router.push("/teacher?edition=STANDARD") : open("STANDARD"))}
          />

          {/* ---------------- Manufacturing ---------------- */}
          <EditionCard
            accent="#0D9488" icon={<Factory size={22} />} title={EDITION_LABEL.MANUFACTURING} subtitle="Production, Costing, Quality"
            text="Bills of materials, routings, production orders, costing, variances and quality, on top of full financials."
            lastOpened={!isTeacher && lastEdition === "MANUFACTURING" ? lastUsed.MANUFACTURING : undefined}
            company={isTeacher ? `${counts("MANUFACTURING")} compan${counts("MANUFACTURING") === 1 ? "y" : "ies"}` : mfgCompany?.name}
            extra={!isTeacher && mfgCompanies.length > 1 ? `${mfgCompanies.length} companies (yours and your team's) — switch from the sidebar` : undefined}
            locked={!isTeacher && (!canUse(profile, "manufacturing") || (!enabled.MANUFACTURING && !mfgCompany))}
            lockedText={canUse(profile, "manufacturing") ? "Opens when your teacher turns it on." : "Your teacher has not given you this system."}
            cta={isTeacher ? "View Manufacturing companies" : mfgCompany ? "Open" : "Set up my company"}
            busy={busy === "MANUFACTURING"}
            onClick={() => (isTeacher ? router.push("/teacher?edition=MANUFACTURING") : open("MANUFACTURING"))}
          />

          {/* ---------------- Accounting Information Systems ---------------- */}
          <EditionCard
            accent="#4F46E5" icon={<Scale size={22} />} title={EDITION_LABEL.AIS} subtitle="Controls, Documents, Audit"
            text="Review document packets, post or hold each one, then audit the books for control failures and fraud."
            lastOpened={!isTeacher && lastEdition === "AIS" ? lastUsed.AIS : undefined}
            company={isTeacher ? `${counts("AIS")} compan${counts("AIS") === 1 ? "y" : "ies"}` : aisCompany?.name}
            extra={!isTeacher && aisCompanies.length > 1 ? `${aisCompanies.length} companies — switch from the sidebar` : undefined}
            locked={!isTeacher && (!canUse(profile, "ais") || !enabled.AIS || !aisCompany)}
            lockedText={!canUse(profile, "ais") ? "Your teacher has not given you this system." : enabled.AIS ? "Your teacher will put you in a team." : "Opens when your teacher turns it on."}
            cta={isTeacher ? "Manage AIS companies" : "Open"}
            busy={busy === "AIS"}
            onClick={() => (isTeacher ? router.push("/ais/teams") : open("AIS"))}
          />

          {/* ---------------- BFAR: standalone, no company or database ---------------- */}
          <EditionCard
            accent="#059669" icon={<BookOpen size={22} />} title="Basic Financial Accounting" subtitle="BFAR, practice sets"
            text="Journal, ledger, worksheet and statements for a sole proprietorship, with graded practice sets. No company to set up."
            company={isTeacher ? "Students' practice sets" : undefined}
            locked={!isTeacher && !canUse(profile, "bfar")}
            lockedText="Your teacher has not given you this system."
            cta={isTeacher ? "Check student work" : "Open"}
            busy={false}
            onClick={() => router.push(isTeacher ? "/bfar/teacher" : "/bfar")}
          />

          {/* ---------------- BIR eForms Lab: standalone, no company ---------------- */}
          <EditionCard
            accent="#E11D48" icon={<FileText size={22} />} title="BIR eForms Lab" subtitle="Tax returns, lessons, cases"
            text="Fill out BIR tax returns on a screen like eBIRForms, with lessons and cases. A simulation: nothing is sent to the BIR."
            locked={!isTeacher && !canUse(profile, "bir")}
            lockedText="Your teacher has not given you this system."
            cta="Open"
            busy={false}
            onClick={() => router.push("/bir-lab")}
          />
        </div>

        {!isTeacher && enabled.AIS && aisCompany && openSets.some((s) => !s.started && s.team) && (
          <div className="mt-8 w-full max-w-3xl border border-hairline rounded-xl bg-panel p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold text-[14px]">A practice set is open for your AIS team</div>
              <div className="text-[12.5px] text-[#A3B1C2] mt-0.5">Any member of your team can start it; the whole team then works on the same set.</div>
            </div>
            <button onClick={() => router.push("/ais/start")} className="h-10 rounded-lg px-5 text-[14px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] active:bg-[#1E40AF] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2">Choose a practice set</button>
          </div>
        )}

        {isTeacher && (
          <div className="mt-8 w-full max-w-3xl border border-hairline rounded-xl bg-panel p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold text-[14px]">Manufacturing ERP for students</div>
              <div className="text-[12.5px] text-[#A3B1C2] mt-0.5">
                {enabled.MANUFACTURING ? "Open — students can set up and use their Manufacturing company." : "Closed — students see it greyed out and can't create a Manufacturing company yet."}
              </div>
            </div>
            <button onClick={toggleManufacturing}
              className={enabled.MANUFACTURING
                ? "h-10 rounded-lg px-5 text-[14px] font-semibold border border-[#DC2626] text-[#DC2626] bg-white hover:bg-[#FEF2F2] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-2"
                : "h-10 rounded-lg px-5 text-[14px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] active:bg-[#1E40AF] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"}>
              {enabled.MANUFACTURING ? "Close it" : "Open it for students"}
            </button>
          </div>
        )}
        {isTeacher && (
          <div className="mt-4 w-full max-w-3xl border border-hairline rounded-xl bg-panel p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold text-[14px]">Accounting Information Systems for students</div>
              <div className="text-[12.5px] text-[#A3B1C2] mt-0.5">
                {enabled.AIS ? "Open — students can enter the AIS companies you add them to." : "Closed — students see it greyed out, and you can't add them to a company yet."}
              </div>
            </div>
            <button onClick={toggleAis}
              className={enabled.AIS
                ? "h-10 rounded-lg px-5 text-[14px] font-semibold border border-[#DC2626] text-[#DC2626] bg-white hover:bg-[#FEF2F2] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-2"
                : "h-10 rounded-lg px-5 text-[14px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] active:bg-[#1E40AF] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"}>
              {enabled.AIS ? "Close it" : "Open it for students"}
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

// A clean white card: a coloured icon tile, the title, a short description and a solid blue button. The whole card is clickable (the button is the keyboard target).
// accent colours only the icon tile and the small tag, so each system has an identity without a rainbow; a locked card is plain grey and says why.
const INK = "#0F2A4A";
function EditionCard({ accent, icon, title, subtitle, text, company, extra, lastOpened, locked, lockedText, cta, busy, onClick }: {
  accent: string; icon: React.ReactNode; title: string; subtitle: string; text: string;
  company?: string; extra?: string; lastOpened?: LastUsed; locked?: boolean; lockedText?: string;
  cta: string; busy: boolean; onClick: () => void;
}) {
  const tone = locked ? "#94A3B8" : accent;
  return (
    <div
      onClick={(e) => { if (!locked && !busy && !(e.target as HTMLElement).closest("button")) onClick(); }}
      className={`relative w-[280px] max-w-full rounded-xl border border-[#E3E8F0] bg-white flex flex-col p-6 transition-all duration-200 ${locked ? "bg-[#F8FAFC]" : "cursor-pointer shadow-[0_1px_2px_rgba(15,42,74,0.06)] hover:-translate-y-0.5 hover:border-[#C7D2E4] hover:shadow-[0_14px_32px_-14px_rgba(15,42,74,0.28)]"}`}>
      {lastOpened && <span className="absolute top-4 right-4 text-[10px] font-semibold uppercase tracking-[0.08em] rounded-full px-2 py-0.5" style={{ color: tone, background: `${tone}14` }}>Last opened</span>}
      <div className="w-12 h-12 rounded-xl flex items-center justify-center [&>svg]:h-6 [&>svg]:w-6 [&>svg]:stroke-[1.7]" style={{ color: tone, background: `${tone}14` }} aria-hidden="true">{icon}</div>
      <div className="text-[17px] font-semibold leading-snug mt-4" style={{ color: INK }}>{title}</div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] mt-1" style={{ color: tone }}>{subtitle}</div>
      <div className="text-[13.5px] leading-relaxed text-[#475569] mt-3 flex-1">{text}</div>

      {company && (
        <div className="mt-4 border-t border-[#E8ECF3] pt-3 text-[12.5px]">
          {!locked && <div className="text-[#64748B]">Your company</div>}
          <div className="font-semibold truncate" style={{ color: INK }}>{company}</div>
          {extra && <div className="text-[#64748B] mt-0.5">{extra}</div>}
          {lastOpened && <div className="text-[#64748B] mt-0.5">Last opened {fmtDate(lastOpened.opened_at)}</div>}
        </div>
      )}

      {locked ? (
        <div className="mt-5">
          <button type="button" disabled className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-lg bg-[#E2E8F0] text-[#64748B] text-[14px] font-semibold cursor-not-allowed"><Lock size={14} /> Locked</button>
          <div className="text-[12.5px] text-[#64748B] mt-2 text-center">{lockedText}</div>
        </div>
      ) : (
        <button type="button" onClick={onClick} disabled={busy}
          className="mt-5 w-full h-10 inline-flex items-center justify-center gap-2 rounded-lg text-white text-[14px] font-semibold bg-[#2563EB] hover:bg-[#1D4ED8] active:bg-[#1E40AF] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed">
          {busy ? <Loader2 size={15} className="animate-spin" /> : null} {cta} {!busy && <ArrowRight size={15} />}
        </button>
      )}
    </div>
  );
}
