"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { loading, userId, profile } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!userId) { router.replace("/login"); return; }
    if (profile?.role === "teacher") { router.replace("/teacher"); return; }
    router.replace("/dashboard");
  }, [loading, userId, profile, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="animate-spin" size={22} color="#12524F" />
    </div>
  );
}
