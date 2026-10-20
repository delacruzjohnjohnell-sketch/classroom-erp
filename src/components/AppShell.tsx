"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Loader2, LayoutDashboard, BookOpen, Truck,
  Package, ShoppingCart, Briefcase, FileBarChart, Landmark, Boxes, Building2,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { usePagePresence } from "@/lib/presence";
import { guardTarget } from "@/lib/edition";
import { useEdition } from "@/lib/useEdition";
import GlobalSearch from "./GlobalSearch";
import CompanySwitcher from "./CompanySwitcher";
import MfgShell, { MfgFrame } from "./mfg/MfgShell";

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
        <Loader2 className="animate-spin" size={20} color="#2F6BFF" />
      </div>
    );
  }

  // A Manufacturing company adds its own role note and menu; the Standard ERP uses the same frame with its menu (below).
  if (isMfg) return <MfgShell otherViewers={otherViewers}>{children}</MfgShell>;

  const tenantName = tenants.find((t) => t.id === effectiveTenantId)?.name ?? "—";
  const navItems = profile.role === "student" ? [...NAV, COMPANIES_NAV] : NAV;

  // The Standard ERP draws the same frame as the Manufacturing ERP (navy sidebar, light top bar); only the menu and the product name differ.
  return (
    <MfgFrame pathname={pathname} fullName={profile.full_name ?? ""} role={profile.role} isTeacher={profile.role === "teacher"}
      tenantName={tenantName} otherViewers={otherViewers} items={navItems} product="Standard ERP" logo={<Building2 size={22} color="#fff" />}
      searchSlot={<GlobalSearch />} companySlot={<CompanySwitcher />} onSignOut={() => signOut()}
      onAllCompanies={() => { setViewTenantId(null); router.push("/teacher"); }}>
      {children}
    </MfgFrame>
  );
}
