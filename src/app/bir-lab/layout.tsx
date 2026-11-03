"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useSession } from "@/lib/session";
import { useAccessGuard } from "@/lib/useAccess";
import { BirNav, SimulationBanner } from "@/birlab/components/BirNav";
import { useBirHydrated, useBirStore } from "@/birlab/store/useBirStore";

// The BIR eForms Lab is a standalone module (no AppShell, no company), but it uses the same login as the rest of the ERP.
export default function BirLabLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { loading, userId } = useSession();
  const hydrated = useBirHydrated();
  const blocked = useAccessGuard("bir");
  const setOwner = useBirStore((s) => s.setOwner);

  useEffect(() => { if (!loading && !userId) router.replace("/login"); }, [loading, userId, router]);
  // Saved work on this browser belongs to one user; someone else signing in starts clean.
  useEffect(() => { if (hydrated && userId) setOwner(userId); }, [hydrated, userId, setOwner]);

  if (loading || !userId || blocked) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#0b2a6f]" size={20} /></div>;
  return (
    <div className="min-h-screen bg-[#eef2f8] text-gray-900">
      <BirNav />
      <SimulationBanner />
      <main className="max-w-6xl mx-auto px-4 py-6">{hydrated ? children : null}</main>
    </div>
  );
}
