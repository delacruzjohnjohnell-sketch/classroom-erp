"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LogOut, ArrowLeft, LayoutDashboard, BookOpen, Truck, Package, ShoppingCart, Briefcase, FileBarChart, Landmark, Boxes, Building2,
  ArrowLeftRight, Settings, Database, Calculator, Factory, Send, Plus, CalendarRange, ShieldCheck, Gauge,
} from "lucide-react";
import { useSession } from "@/lib/session";
import GlobalSearch from "../GlobalSearch";
import CompanySwitcher from "../CompanySwitcher";

// The Manufacturing ERP's own navigation. Only screens that exist are listed; planning, quality and
// maintenance screens join this list as their phases arrive.
const NAV = [
  { href: "/mfg", label: "Dashboard", icon: LayoutDashboard },
  { href: "/mfg/master", label: "Master Data", icon: Database },
  { href: "/mfg/costing", label: "Costing", icon: Calculator },
  { href: "/mfg/planning", label: "Planning", icon: CalendarRange },
  { href: "/mfg/purchasing", label: "Purchasing", icon: Truck },
  { href: "/mfg/inventory", label: "Inventory", icon: Package },
  { href: "/mfg/production", label: "Production", icon: Factory },
  { href: "/mfg/shopfloor", label: "Shop Floor", icon: Gauge },
  { href: "/mfg/quality", label: "Quality", icon: ShieldCheck },
  { href: "/mfg/shipping", label: "Shipping", icon: Send },
  { href: "/mfg/sales", label: "Sales", icon: ShoppingCart },
  { href: "/mfg/finance", label: "Finance", icon: BookOpen },
  { href: "/mfg/banking", label: "Banking", icon: Landmark },
  { href: "/mfg/fixed-assets", label: "Fixed Assets", icon: Boxes },
  { href: "/mfg/payroll", label: "Payroll", icon: Briefcase },
  { href: "/mfg/reports", label: "Reports", icon: FileBarChart },
  { href: "/mfg/settings", label: "Settings", icon: Settings },
];
const COMPANIES_NAV = { href: "/companies", label: "My Companies", icon: Building2 };

export type FrameProps = {
  children: React.ReactNode;
  pathname: string;
  fullName: string;
  role: string;
  tenantName: string;
  isTeacher: boolean;
  otherViewers: { userId: string; name: string }[];
  searchSlot: React.ReactNode;
  companySlot: React.ReactNode;
  onSignOut: () => void;
  onAllCompanies: () => void;
};

/**
 * The Manufacturing workspace frame: a navy sidebar, a light top bar (search, company, you) and a light page.
 * The `mfg-light` class switches every shared component to the light theme (see globals.css); the Standard ERP
 * never gets it. This part only draws; MfgShell below feeds it from the session.
 */
export function MfgFrame({ children, pathname, fullName, role, tenantName, isTeacher, otherViewers, searchSlot, companySlot, onSignOut, onAllCompanies }: FrameProps) {
  const items = isTeacher ? NAV : [...NAV, COMPANIES_NAV];
  const initials = fullName ? fullName.split(/\s+/).slice(0, 2).map((p: string) => p[0]?.toUpperCase()).join("") : "?";

  return (
    <div className="mfg-light min-h-screen flex">
      <aside className="w-[236px] shrink-0 bg-[#0B1431] flex flex-col sticky top-0 h-screen">
        <div className="px-5 pt-6 pb-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#2F6BFF] flex items-center justify-center shrink-0 shadow-[0_6px_16px_rgba(47,107,255,0.45)]"><Factory size={22} color="#fff" /></div>
          <div className="leading-tight min-w-0">
            <div className="text-[18px] font-bold text-white truncate">JJ and Co.</div>
            <div className="text-[11.5px] text-[#93A3C6]">Manufacturing ERP</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-1 flex flex-col gap-1 overflow-y-auto" aria-label="Manufacturing menu">
          {items.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/mfg" ? pathname === "/mfg" : pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-[14px] font-semibold transition-colors ${active ? "bg-[#2F6BFF] text-white shadow-[0_4px_12px_rgba(47,107,255,0.4)]" : "text-[#B4C0DC] hover:bg-[rgba(255,255,255,0.07)] hover:text-white"}`}>
                <Icon size={18} /> {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 pt-3 pb-4 border-t border-[rgba(255,255,255,0.08)]">
          <div className="text-[12px] text-[#93A3C6] leading-snug mb-3">Smarter operations.<br />Higher productivity.</div>
          <Link href="/choose" className="flex items-center gap-2 text-[12.5px] font-semibold text-[#B4C0DC] hover:text-white mb-2" title="Choose a different ERP"><ArrowLeftRight size={14} /> Switch ERP</Link>
          <button onClick={onSignOut} className="flex items-center gap-2 text-[12.5px] font-semibold text-[#B4C0DC] hover:text-white"><LogOut size={14} /> Sign out</button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 px-7 py-3 bg-white border-b border-hairline flex items-center gap-4">
          <div className="flex-1 min-w-[190px]">{searchSlot}</div>
          <div className="flex items-center gap-4 shrink-0">
            {otherViewers.length > 0 && (
              <div className="hidden xl:flex items-center gap-1.5" title={`Also here: ${otherViewers.map((v) => v.name).join(", ")}`}>
                <div className="flex -space-x-2">
                  {otherViewers.slice(0, 3).map((v) => (
                    <div key={v.userId} className="w-7 h-7 rounded-full bg-[#2F6BFF] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                      {v.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?"}
                    </div>
                  ))}
                </div>
                <span className="text-[11.5px] text-[#6B7A92]">{otherViewers.length === 1 ? "also here" : `+${otherViewers.length} also here`}</span>
              </div>
            )}
            <div className="hidden lg:flex items-center gap-2.5 border border-hairline rounded-lg px-3 py-1.5 min-w-[230px] max-w-[300px] bg-white">
              <Building2 size={17} className="text-[#6B7A92] shrink-0" />
              <div className="flex-1 min-w-0">
                {isTeacher ? (
                  <div className="flex items-center gap-2">
                    <button onClick={onAllCompanies} className="text-[12px] font-semibold text-[#2F6BFF] flex items-center gap-1 shrink-0" title="Back to all companies"><ArrowLeft size={12} /> All</button>
                    <span className="text-[13px] font-semibold truncate text-ink">{tenantName}</span>
                  </div>
                ) : companySlot}
              </div>
            </div>
            {!isTeacher && <Link href="/companies" className="hidden lg:flex items-center gap-1 text-[12.5px] font-semibold text-[#2F6BFF] hover:underline"><Plus size={13} /> New company</Link>}
            <div className="flex items-center gap-2.5 pl-4 border-l border-hairline">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#2F6BFF] to-[#7C5CFC] text-white text-[12.5px] font-bold flex items-center justify-center shrink-0">{initials}</div>
              <div className="hidden sm:block leading-tight">
                <div className="text-[13.5px] font-semibold text-ink truncate max-w-[150px]">{fullName}</div>
                <div className="text-[12px] text-[#6B7A92] capitalize">{role}</div>
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-[1280px] px-7 py-6 flex flex-col gap-5">{children}</main>
      </div>
    </div>
  );
}

export default function MfgShell({ children, otherViewers }: { children: React.ReactNode; otherViewers: { userId: string; name: string }[] }) {
  const { profile, tenants, effectiveTenantId, setViewTenantId, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  if (!profile) return null;
  return (
    <MfgFrame pathname={pathname} fullName={profile.full_name ?? ""} role={profile.role} isTeacher={profile.role === "teacher"}
      tenantName={tenants.find((t) => t.id === effectiveTenantId)?.name ?? "—"} otherViewers={otherViewers}
      searchSlot={<GlobalSearch />} companySlot={<CompanySwitcher />} onSignOut={() => signOut()}
      onAllCompanies={() => { setViewTenantId(null); router.push("/teacher"); }}>
      {children}
    </MfgFrame>
  );
}
