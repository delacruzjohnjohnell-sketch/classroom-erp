"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import MessagesPanel from "@/components/MessagesPanel";
import { useSession } from "@/lib/session";

// The teacher's messages: to the whole class, one team company or one student. The teacher page has no company chosen, so this has its own plain frame.
export default function TeacherMessagesPage() {
  const { loading, userId, profile } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!userId) router.replace("/login");
    else if (profile && profile.role !== "teacher") router.replace("/messages");
  }, [loading, userId, profile, router]);

  if (loading || !profile || profile.role !== "teacher") {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={20} color="#2F6BFF" /></div>;
  }

  return (
    <div className="mfg-light min-h-screen">
      <div className="max-w-[1200px] mx-auto px-6 py-6">
        <button type="button" onClick={() => router.push("/teacher")} className="flex items-center gap-1.5 text-[13px] font-semibold mb-4" style={{ color: "#2F6BFF" }}>
          <ArrowLeft size={14} /> Back to the class overview
        </button>
        <MessagesPanel />
      </div>
    </div>
  );
}
