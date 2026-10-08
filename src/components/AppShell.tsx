"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LogOut, ArrowLeft, Loader2, LayoutDashboard, BookOpen, Truck,
  Package, ShoppingCart, Briefcase, FileBarChart, Landmark, Boxes,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { usePagePresence } from "@/lib/presence";
import GlobalSearch from "./GlobalSearch";
import CompanySwitcher from "./CompanySwitcher";

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

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { loading, userId, profile, tenants, viewTenantId, setViewTenantId, effectiveTenantId, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // Hooks run unconditionally, before the loading/redirect early-return below —
  // usePagePresence tolerates null args and just reports no other viewers.
  const presenceSelf = userId && profile ? { userId, name: profile.full_name || "Someone", role: profile.role } : null;
  const otherViewers = usePagePresence(effectiveTenantId, pathname, presenceSelf);

  useEffect(() => {
    if (loading) return;
    if (!userId) { router.replace("/login"); return; }
    if (profile?.role === "student" && !profile.tenant_id) { router.replace("/login"); return; }
    if (profile?.role === "teacher" && !viewTenantId) { router.replace("/teacher"); return; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userId, profile, viewTenantId]);

  if (loading || !userId || !profile || !effectiveTenantId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" size={20} color="#22D3C5" />
      </div>
    );
  }

  const tenantName = tenants.find((t) => t.id === effectiveTenantId)?.name ?? "—";
  const pageTitle = NAV.find((item) => item.href === pathname)?.label ?? "";
  const initials = profile.full_name
    ? profile.full_name.split(/\s+/).slice(0, 2).map((p: string) => p[0]?.toUpperCase()).join("")
    : "?";

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <div className="w-[220px] shrink-0 bg-sidebar border-r border-hairline flex flex-col sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-hairline">
          <div className="flex items-center gap-2.5">
            <div className="font-mono text-[13px] font-bold text-teal border border-[rgba(34,211,197,0.55)] bg-tealsoft rounded-md w-8 h-8 flex items-center justify-center shrink-0 shadow-glow">&gt;_</div>
            <div className="leading-tight">
              <div className="font-mono text-[14px] font-bold text-ink">JJ and Co.</div>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-sidebarTextMuted">classroom erp</div>
            </div>
          </div>
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
            : <CompanySwitcher />}
          <div className="text-[11px] text-sidebarTextMuted mt-0.5 font-mono">
            {profile.role === "teacher" ? `teacher · ${profile.full_name}` : `${profile.full_name} · student`}
          </div>
        </div>

        <nav className="flex-1 py-3 px-3 flex flex-col gap-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={`relative flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-semibold transition-colors ${active ? "bg-sidebarActive text-teal" : "text-sidebarText hover:bg-sidebarHover hover:text-ink"}`}>
                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded bg-teal" style={{ boxShadow: "0 0 8px #22D3C5" }} />}
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
        <div className="sticky top-0 z-20 px-6 py-3.5 border-b border-hairline bg-[rgba(8,12,17,0.82)] backdrop-blur-md flex items-center justify-between gap-4">
          <div className="font-mono text-[15px] font-semibold text-ink truncate">
            <span className="text-sidebarTextMuted">~/</span><span className="text-teal">{pageTitle.toLowerCase().replace(/\s+/g, "-")}</span><span className="text-teal animate-pulse">_</span>
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
