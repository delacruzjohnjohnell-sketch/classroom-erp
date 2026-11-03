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
    // Everyone starts at the system chooser; a teacher then sees the students' companies of the system they pick.
    router.replace("/choose");
  }, [loading, userId, profile, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="animate-spin" size={22} color="#22D3C5" />
    </div>
  );
}
