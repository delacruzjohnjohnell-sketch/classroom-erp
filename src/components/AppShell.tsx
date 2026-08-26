"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LogOut, ArrowLeft, Loader2, LayoutDashboard, BookOpen, Truck,
  Package, ShoppingCart, Briefcase, FileBarChart, Landmark,
} from "lucide-react";
import { useSession } from "@/lib/session";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/financials", label: "Financials", icon: BookOpen },
  { href: "/procurement", label: "Bills", icon: Truck },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/sales", label: "Invoices", icon: ShoppingCart },
  { href: "/banking", label: "Banking", icon: Landmark },
  { href: "/hr", label: "HR", icon: Briefcase },
  { href: "/reports", label: "Reports", icon: FileBarChart },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { loading, userId, profile, tenants, viewTenantId, setViewTenantId, effectiveTenantId, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();

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
        <Loader2 className="animate-spin" size={20} color="#12524F" />
      </div>
    );
  }

  const tenantName = tenants.find((t) => t.id === effectiveTenantId)?.name ?? "—";

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <div className="w-[220px] shrink-0 bg-panel border-r border-hairline flex flex-col">
        <div className="px-5 py-5 border-b border-hairline">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="font-serif text-lg text-gold border border-gold rounded-md w-8 h-8 flex items-center justify-center shrink-0">§</div>
            <div className="font-serif text-[15px] font-bold leading-tight">Ledger &amp; Co.</div>
          </div>
        </div>

        <div className="px-5 py-4 border-b border-hairline">
          {profile.role === "teacher" && (
            <button onClick={() => { setViewTenantId(null); router.push("/teacher"); }} className="flex items-center gap-1 text-teal text-xs font-semibold mb-2">
              <ArrowLeft size={13} /> All companies
            </button>
          )}
          <div className="text-[13px] font-bold truncate">{tenantName}</div>
          <div className="text-[11px] text-[#8a8172] mt-0.5">
            {profile.role === "teacher" ? `Teacher · ${profile.full_name}` : `${profile.full_name} · Student`}
          </div>
        </div>

        <nav className="flex-1 py-3 px-3 flex flex-col gap-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-semibold ${active ? "bg-tealsoft text-teal" : "text-[#5c5548]"}`}>
                <Icon size={16} /> {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-hairline">
          <button onClick={() => signOut()} className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-[13px] text-[#6b6357] hover:bg-paper">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="max-w-[1100px] px-6 py-6 flex flex-col gap-4">
          {children}
        </div>
      </div>
    </div>
  );
}
