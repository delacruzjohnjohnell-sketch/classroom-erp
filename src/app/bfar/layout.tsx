"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useSession } from "@/lib/session";
import { BfarNav } from "@/bfar/components/BfarNav";
import { useAccountingStore, useHydrated } from "@/bfar/store/useAccountingStore";

// BFAR is a standalone fourth module (no AppShell, no company), but it uses the same login as the other three editions.
export default function BfarLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { loading, userId } = useSession();
  const hydrated = useHydrated();
  const setOwner = useAccountingStore((s) => s.setOwner);

  useEffect(() => {
    if (!loading && !userId) router.replace("/login");
  }, [loading, userId, router]);
  // Books on this browser belong to one user; someone else signing in starts clean.
  useEffect(() => {
    if (hydrated && userId) setOwner(userId);
  }, [hydrated, userId, setOwner]);

  if (loading || !userId) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={20} /></div>;
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <BfarNav />
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
