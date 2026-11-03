"use client";
// Top bar of the BIR eForms Lab. The lab shell follows the ERP's look; only the forms themselves imitate eBIRForms.
import Link from "next/link";
import { useSession } from "@/lib/session";

export function BirNav() {
  const { profile } = useSession();
  return (
    <header className="bg-white border-b border-gray-200 print:hidden">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href="/bir-lab" className="font-bold text-gray-900">BIR eForms Lab <span className="font-normal text-gray-500 text-sm">— JJ and Co.</span></Link>
        <div className="ml-auto flex items-center gap-4 text-sm">
          {profile?.full_name && <span className="text-gray-500">{profile.full_name}</span>}
          <Link href="/choose" className="text-gray-500 hover:underline">Back to Classroom ERP</Link>
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
