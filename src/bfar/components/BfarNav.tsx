"use client";
// Top navigation for the BFAR module, with the instructor-mode switch that reveals solution keys.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccountingStore, useHydrated } from "../store/useAccountingStore";

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
  const hydrated = useHydrated();
  const instructor = useAccountingStore((s) => s.instructorMode);
  const setInstructor = useAccountingStore((s) => s.setInstructorMode);
  return (
    <header className="bg-white border-b border-slate-200 print:hidden">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href="/bfar" className="font-bold text-slate-900">BFAR <span className="font-normal text-slate-500 text-sm">Basic Financial Accounting and Reporting</span></Link>
        <nav className="flex flex-wrap gap-1 text-sm" aria-label="BFAR sections">
          {LINKS.map((l) => {
            const active = l.href === "/bfar" ? path === "/bfar" : path.startsWith(l.href);
            return <Link key={l.href} href={l.href} className={`px-2.5 py-1 rounded-md ${active ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}>{l.label}</Link>;
          })}
        </nav>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={hydrated && instructor} onChange={(e) => setInstructor(e.target.checked)} /> Instructor mode</label>
          <Link href="/choose" className="text-slate-500 hover:underline">Back to Classroom ERP</Link>
        </div>
      </div>
    </header>
  );
}
