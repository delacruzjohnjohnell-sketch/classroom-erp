"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LogOut, ArrowLeft, Loader2, LayoutDashboard, BookOpen, Truck,
  Package, ShoppingCart, Briefcase, FileBarChart, Landmark, Boxes, Building2, Plus, ArrowLeftRight, Settings, Database, Calculator, Factory,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { usePagePresence } from "@/lib/presence";
import { guardTarget } from "@/lib/edition";
import { useEdition } from "@/lib/useEdition";
import GlobalSearch from "./GlobalSearch";
import CompanySwitcher from "./CompanySwitcher";

// Students also get a menu item for their companies, so starting another one is never hidden.
const COMPANIES_NAV = { href: "/companies", label: "My Companies", icon: Building2 };

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/financials", label: "Financials", icon: BookOpen },
  { href: "/procurement", label: "Bills", icon: Truck },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/sales", label: "Invoices", icon: ShoppingCart },
  { href: "/banking", label: "Banking", icon: Landmark },
  { href: "/fixed-assets", label: "Fixed Assets", icon: Boxes },
  { href: "/hr", label: "HR", icon: Briefcase },
  { href: "/reports", label: "Reports", icon: FileBarChart },
];

// The Manufacturing ERP's own navigation. Only screens that exist are listed; production,
// planning, quality and costing screens join this list as their phases arrive.
const NAV_MFG = [
  { href: "/mfg", label: "Overview", icon: LayoutDashboard },
  { href: "/mfg/master", label: "Master Data", icon: Database },
  { href: "/mfg/costing", label: "Costing", icon: Calculator },
  { href: "/mfg/purchasing", label: "Purchasing", icon: Truck },
  { href: "/mfg/inventory", label: "Inventory", icon: Package },
  { href: "/mfg/production", label: "Production", icon: Factory },
  { href: "/mfg/finance", label: "Finance", icon: BookOpen },
  { href: "/mfg/sales", label: "Sales", icon: ShoppingCart },
  { href: "/mfg/banking", label: "Banking", icon: Landmark },
  { href: "/mfg/fixed-assets", label: "Fixed Assets", icon: Boxes },
  { href: "/mfg/payroll", label: "Payroll", icon: Briefcase },
  { href: "/mfg/reports", label: "Reports", icon: FileBarChart },
  { href: "/mfg/settings", label: "Settings", icon: Settings },
];

const CYAN = "#22D3C5", AMBER = "#F2B13C";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { loading, userId, profile, tenants, viewTenantId, setViewTenantId, effectiveTenantId, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // Hooks run unconditionally, before the loading/redirect early-return below —
  // usePagePresence tolerates null args and just reports no other viewers.
  const presenceSelf = userId && profile ? { userId, name: profile.full_name || "Someone", role: profile.role } : null;
  const otherViewers = usePagePresence(effectiveTenantId, pathname, presenceSelf);

  // Which ERP is the active company in? A company is in exactly one; a page for the other ERP sends
  // you to its twin (or the chooser) instead of showing the wrong screens.
  const { edition, ready: editionReady } = useEdition(effectiveTenantId);
  const isMfg = edition === "MANUFACTURING";
  const wrongEdition = editionReady ? guardTarget(edition, pathname) : null;
  useEffect(() => {
    if (wrongEdition) router.replace(wrongEdition);
  }, [wrongEdition, router]);

  useEffect(() => {
    if (loading) return;
    if (!userId) { router.replace("/login"); return; }
    if (profile?.role === "student" && !profile.tenant_id) { router.replace("/login"); return; }
    if (profile?.role === "teacher" && !viewTenantId) { router.replace("/teacher"); return; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userId, profile, viewTenantId]);

  if (loading || !userId || !profile || !effectiveTenantId || !editionReady || wrongEdition) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" size={20} color={isMfg ? AMBER : CYAN} />
      </div>
    );
  }

  const accent = isMfg ? AMBER : CYAN;
  const tenantName = tenants.find((t) => t.id === effectiveTenantId)?.name ?? "—";
  const baseNav = isMfg ? NAV_MFG : NAV;
  const navItems = profile.role === "student" ? [...baseNav, COMPANIES_NAV] : baseNav;
  const pageTitle = navItems.find((item) => item.href === pathname)?.label ?? "";
  const initials = profile.full_name
    ? profile.full_name.split(/\s+/).slice(0, 2).map((p: string) => p[0]?.toUpperCase()).join("")
    : "?";

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <div className="w-[220px] shrink-0 bg-sidebar border-r border-hairline flex flex-col sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-hairline">
          <div className="flex items-center gap-2.5">
            <div className="font-mono text-[13px] font-bold rounded-md w-8 h-8 flex items-center justify-center shrink-0 border"
              style={{ color: accent, borderColor: `${accent}8c`, background: `${accent}1f`, boxShadow: `0 0 0 1px ${accent}59, 0 0 24px ${accent}1a` }}>&gt;_</div>
            <div className="leading-tight">
              <div className="font-mono text-[14px] font-bold text-ink">JJ and Co.</div>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-sidebarTextMuted">{isMfg ? "manufacturing erp" : "classroom erp"}</div>
            </div>
          </div>
        </div>

        <div className="px-5 py-2.5 border-b border-hairline flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] rounded px-2 py-1 border" style={{ color: accent, borderColor: `${accent}59`, background: `${accent}14` }}>
            {isMfg ? "Manufacturing ERP" : "Standard ERP"}
          </span>
          <Link href="/choose" className="flex items-center gap-1 text-[11px] font-semibold text-sidebarText hover:text-ink" title="Choose a different ERP">
            <ArrowLeftRight size={12} /> Switch ERP
          </Link>
        </div>

        <div className="px-5 py-4 border-b border-hairline">
          {profile.role === "teacher" && (
            <button onClick={() => { setViewTenantId(null); router.push("/teacher"); }} className="flex items-center gap-1 text-teal text-xs font-semibold mb-2 hover:text-ink">
              <ArrowLeft size={13} /> All companies
            </button>
          )}
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-sidebarTextMuted mb-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4ADE9C]" style={{ boxShadow: "0 0 8px #4ADE9C" }} /> workspace
          </div>
          {profile.role === "teacher"
            ? <div className="text-[13px] font-bold truncate text-ink">{tenantName}</div>
            : (
              <>
                <CompanySwitcher />
                <Link href="/companies" className="mt-2 flex items-center justify-center gap-1.5 w-full rounded-md border border-[rgba(34,211,197,0.45)] text-teal text-[12px] font-semibold px-2 py-1.5 hover:bg-tealsoft">
                  <Plus size={13} /> New company
                </Link>
              </>
            )}
          <div className="text-[11px] text-sidebarTextMuted mt-0.5 font-mono">
            {profile.role === "teacher" ? `teacher · ${profile.full_name}` : `${profile.full_name} · student`}
          </div>
        </div>

        <nav className="flex-1 py-3 px-3 flex flex-col gap-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={`relative flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-semibold transition-colors ${active ? "" : "text-sidebarText hover:bg-sidebarHover hover:text-ink"}`}
                style={active ? { color: accent, background: `${accent}1a` } : undefined}>
                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />}
                <Icon size={16} /> {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-hairline">
          <button onClick={() => signOut()} className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-[13px] text-sidebarText hover:bg-sidebarHover hover:text-ink">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="sticky top-0 z-20 px-6 py-3.5 border-b border-hairline bg-[rgba(8,12,17,0.82)] backdrop-blur-md flex items-center justify-between gap-4"
          style={isMfg ? { borderTop: `2px solid ${AMBER}` } : undefined}>
          <div className="font-mono text-[15px] font-semibold text-ink truncate">
            <span className="text-sidebarTextMuted">~/</span><span style={{ color: accent }}>{pageTitle.toLowerCase().replace(/\s+/g, "-")}</span><span className="animate-pulse" style={{ color: accent }}>_</span>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {otherViewers.length > 0 && (
              <div
                className="flex items-center gap-1.5"
                title={`Also here: ${otherViewers.map((v) => v.name).join(", ")}`}
              >
                <div className="flex -space-x-2">
                  {otherViewers.slice(0, 3).map((v) => (
                    <div
                      key={v.userId}
                      className="w-6 h-6 rounded-full bg-gold text-onaccent text-[9.5px] font-bold flex items-center justify-center border-2 border-panel"
                    >
                      {v.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?"}
                    </div>
                  ))}
                </div>
                <span className="text-[11px] text-[#7F8EA0] hidden md:inline font-mono">
                  {otherViewers.length === 1 ? "also here" : `+${otherViewers.length} also here`}
                </span>
              </div>
            )}
            <GlobalSearch />
            <div className="flex items-center gap-2.5 pl-3 border-l border-hairline">
              <div className="w-8 h-8 rounded-md bg-tealsoft text-teal border border-[rgba(34,211,197,0.3)] font-mono font-semibold text-[12px] flex items-center justify-center shrink-0">
                {initials}
              </div>
              <div className="hidden sm:block leading-tight">
                <div className="text-[13px] font-semibold text-ink truncate max-w-[140px]">{profile.full_name}</div>
                <div className="text-[10.5px] text-[#7F8EA0] font-mono uppercase tracking-wider">{profile.role}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-[1100px] px-6 py-6 flex flex-col gap-4">
          {children}
        </div>
      </div>
    </div>
  );
}
