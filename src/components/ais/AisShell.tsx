"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Building2, FileSearch, Inbox, LayoutDashboard, MessageSquare, ShoppingBag, ShoppingCart, Users, Scale } from "lucide-react";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import GlobalSearch from "../GlobalSearch";
import CompanySwitcher from "../CompanySwitcher";
import { MfgFrame } from "../mfg/MfgShell";

// The Accounting Information Systems workspace: the same frame as the other editions, with its own menu.
// Only pages that exist are listed; each phase of the build adds its entries.
const HOME = { href: "/ais", label: "Workspace", icon: LayoutDashboard };
const ACCOUNTING_NAV = [
  { href: "/ais/inbox", label: "Document inbox", icon: Inbox },
  { href: "/ais/sales", label: "Sales desk", icon: ShoppingCart },
  { href: "/ais/purchases", label: "Purchases desk", icon: ShoppingBag },
  { href: "/ais/ledger", label: "General ledger", icon: BookOpen },
];
const AUDIT_NAV = [
  { href: "/ais/audit", label: "Audit room", icon: FileSearch },
];
const SCORES_NAV = { href: "/ais/scores", label: "Scores", icon: Scale };
const MESSAGES_NAV = { href: "/messages", label: "Messages", icon: MessageSquare };
const COMPANIES_NAV = { href: "/companies", label: "My Companies", icon: Building2 };
const TEACHER_NAV = { href: "/ais/teams", label: "AIS companies", icon: Users };

const SEAT_LABEL: Record<string, string> = { ACCOUNTING: "Accounting", AUDIT: "Audit" };

/** Which of the optional menu groups exist yet. Flipped on as each phase adds its pages. */
export const AIS_PAGES_LIVE = { accounting: true, audit: true, scores: false };

export default function AisShell({ children, otherViewers }: { children: React.ReactNode; otherViewers: { userId: string; name: string }[] }) {
  const { profile, tenants, effectiveTenantId, setViewTenantId, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [seats, setSeats] = useState<string[]>([]);
  const isStudent = profile?.role === "student";

  useEffect(() => {
    if (!isStudent || !effectiveTenantId) return;
    let live = true;
    supabase.rpc("ais_my_seats").then((r) => { if (live) setSeats((r.data as string[] | null) ?? []); });
    return () => { live = false; };
  }, [isStudent, effectiveTenantId]);

  if (!profile) return null;
  const isTeacher = profile.role === "teacher";
  const items = [
    HOME,
    ...(AIS_PAGES_LIVE.accounting && (isTeacher || seats.includes("ACCOUNTING")) ? ACCOUNTING_NAV : []),
    ...(AIS_PAGES_LIVE.audit && (isTeacher || seats.includes("AUDIT")) ? AUDIT_NAV : []),
    ...(AIS_PAGES_LIVE.scores ? [SCORES_NAV] : []),
    MESSAGES_NAV,
    isTeacher ? TEACHER_NAV : COMPANIES_NAV,
  ];
  const roleNote = isStudent && seats.length ? `Seat: ${seats.map((s) => SEAT_LABEL[s] ?? s).join(" + ")}` : null;

  return (
    <MfgFrame pathname={pathname} fullName={profile.full_name ?? ""} role={profile.role} isTeacher={isTeacher}
      tenantName={tenants.find((t) => t.id === effectiveTenantId)?.name ?? "—"} otherViewers={otherViewers} roleNote={roleNote}
      items={items} product="Accounting Information Systems" logo={<Scale size={22} color="#fff" />}
      searchSlot={<GlobalSearch />} companySlot={<CompanySwitcher edition="AIS" />} onSignOut={() => signOut()}
      onAllCompanies={() => { setViewTenantId(null); router.push("/teacher"); }}>
      {children}
    </MfgFrame>
  );
}
