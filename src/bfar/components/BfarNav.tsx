"use client";
// Top navigation for the BFAR module. Teachers also get the checking page; students never see anything about keys.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/session";

const LINKS = [
  { href: "/bfar", label: "Home" },
  { href: "/bfar/practice-sets", label: "Practice sets" },
  { href: "/bfar/journal", label: "Journal" },
  { href: "/bfar/ledger", label: "Ledger" },
  { href: "/bfar/worksheet", label: "Worksheet" },
  { href: "/bfar/statements", label: "Statements" },
  { href: "/bfar/reference", label: "Reference" },
];

export function BfarNav() {
  const path = usePathname();
  const { profile } = useSession();
  const links = profile?.role === "teacher" ? [...LINKS, { href: "/bfar/teacher", label: "Check student work" }] : LINKS;
  return (
    <header className="bg-white border-b border-gray-200 print:hidden">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href="/bfar" className="font-bold text-gray-900">BFAR <span className="font-normal text-gray-500 text-sm">Basic Financial Accounting and Reporting</span></Link>
        <nav className="flex flex-wrap gap-1 text-sm" aria-label="BFAR sections">
          {links.map((l) => {
            const active = l.href === "/bfar" ? path === "/bfar" : path.startsWith(l.href);
            return <Link key={l.href} href={l.href} className={`px-2.5 py-1 rounded-md ${active ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}>{l.label}</Link>;
          })}
        </nav>
        <div className="ml-auto flex items-center gap-4 text-sm">
          {profile?.full_name && <span className="text-gray-500">{profile.full_name}</span>}
          <Link href="/choose" className="text-gray-500 hover:underline">Back to Classroom ERP</Link>
        </div>
      </div>
    </header>
  );
}
