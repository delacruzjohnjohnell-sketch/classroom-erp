"use client";
// What a new student sees until the teacher approves the sign-up (or after a rejection). It checks again every 15 seconds, so approval opens the system without signing in again.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Clock, Loader2, LogOut, XCircle } from "lucide-react";
import { useSession } from "@/lib/session";
import { accessState } from "@/lib/access";

export default function PendingPage() {
  const router = useRouter();
  const { loading, userId, profile, refresh, signOut } = useSession();
  const state = accessState(profile);

  useEffect(() => {
    if (loading) return;
    if (!userId) { router.replace("/login"); return; }
    if (state === "ok") router.replace("/choose");
  }, [loading, userId, state, router]);

  useEffect(() => {
    if (state !== "pending") return;
    const t = setInterval(() => { refresh(); }, 15000);
    return () => clearInterval(t);
  }, [state, refresh]);

  if (loading || !profile || state === "ok") return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={20} color="#2F6BFF" /></div>;

  const rejected = state === "rejected";
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${rejected ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}>
          {rejected ? <XCircle size={28} /> : <Clock size={28} />}
        </div>
        <h1 className="text-xl font-bold text-gray-900">{rejected ? "Your sign-up was not approved" : "Waiting for your teacher's approval"}</h1>
        <p className="mt-2 text-sm text-gray-600">
          {rejected
            ? (profile.approval_note ? `Your teacher wrote: "${profile.approval_note}"` : "Please ask your teacher about your account.")
            : `Thank you${profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}. Your account has been created. Your teacher will choose which systems you can use. This page opens them as soon as you are approved, so you can leave it open or come back later.`}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {!rejected && <button type="button" onClick={() => refresh()} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">Check now</button>}
          <button type="button" onClick={() => signOut()} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600"><LogOut size={14} /> Sign out</button>
        </div>
      </div>
    </div>
  );
}
