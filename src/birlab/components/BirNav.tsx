"use client";
// Top bar of the BIR eForms Lab. The lab shell follows the ERP's look; only the forms themselves imitate eBIRForms.
import Link from "next/link";
import { useSession } from "@/lib/session";

export function BirNav() {
  const { profile } = useSession();
  return (
    <header className="border-b-4 border-[#f2b705] bg-[#0b2a6f] text-white print:hidden">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href="/bir-lab" className="text-lg font-bold tracking-wide text-white">BIR eForms Lab <span className="text-sm font-normal text-[#c9d6f2]">— JJ and Co.</span></Link>
        <nav aria-label="BIR Lab" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#e8eefb]">
          <Link href="/bir-lab/which-form" className="hover:underline">Which form?</Link>
          <Link href="/bir-lab/calendar" className="hover:underline">Calendar</Link>
          <Link href="/bir-lab/scenarios" className="hover:underline">Scenarios</Link>
          <Link href="/bir-lab/progress" className="hover:underline">My progress</Link>
          {profile?.role === "teacher" && <Link href="/bir-lab/teacher" className="font-semibold hover:underline">Instructor</Link>}
        </nav>
        <div className="ml-auto flex items-center gap-4 text-sm">
          {profile?.full_name && <span className="text-[#c9d6f2]">{profile.full_name}</span>}
          <Link href="/choose" className="text-[#f2b705] hover:underline">Back to Classroom ERP</Link>
        </div>
      </div>
    </header>
  );
}

export function SimulationBanner() {
  return (
    <div role="note" className="bg-amber-100 border-b border-amber-300 text-amber-900 text-xs sm:text-sm px-4 py-1.5 text-center print:hidden">
      Educational simulation only — not connected to the BIR. Do not enter real TINs or personal data.
    </div>
  );
}
