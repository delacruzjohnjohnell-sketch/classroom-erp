"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  // A password-reset email link authenticates the browser via a one-time recovery
  // session before this page even finishes mounting. We don't assume it's there —
  // wait for either the PASSWORD_RECOVERY event or an already-established session,
  // and say so plainly if neither shows up (e.g. someone bookmarked this URL).
  const [ready, setReady] = useState<"checking" | "ready" | "no-session">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady("ready");
    });
    supabase.auth.getSession().then(({ data }) => {
      setReady((r) => (r === "ready" ? r : data.session ? "ready" : "no-session"));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(err.message || "Could not update your password."); return; }
    setDone(true);
    setTimeout(() => router.replace("/"), 1800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-panel border border-hairline rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-7">
          <div className="font-serif text-2xl text-gold border border-gold rounded-lg w-11 h-11 flex items-center justify-center">§</div>
          <div>
            <div className="font-serif text-lg font-bold">JJ and Co.</div>
            <div className="text-xs text-[#6b6357]">Set a new password</div>
          </div>
        </div>

        {ready === "checking" && (
          <div className="text-[13px] text-[#6b6357]">Checking your reset link…</div>
        )}

        {ready === "no-session" && (
          <div className="text-[13px] text-[#6b6357]">
            This page only works from a password-reset email link. Go back to{" "}
            <a href="/login" className="text-teal font-semibold">Sign in</a> and use{" "}
            <strong>Forgot password?</strong> to request a new one.
          </div>
        )}

        {ready === "ready" && !done && (
          <form onSubmit={submit}>
            <label className="text-xs font-semibold text-[#5c5548] mb-1.5 mt-1 block">New password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoFocus />
            <label className="text-xs font-semibold text-[#5c5548] mb-1.5 mt-1 block">Confirm new password</label>
            <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} />
            {error && <div className="text-xs text-red mt-2">{error}</div>}
            <button disabled={busy} className="primary-btn mt-5">
              {busy ? "Saving…" : "Set new password"} <ChevronRight size={16} />
            </button>
          </form>
        )}

        {done && (
          <div className="text-[13px] text-teal font-semibold flex items-center gap-2">
            <CheckCircle2 size={16} /> Password updated — taking you in…
          </div>
        )}
      </div>
      <style jsx global>{`
        .input { font-size: 14px; padding: 9px 11px; border-radius: 8px; border: 1px solid #DDD8CC; background: #F5F3EE; color: #1B2430; outline: none; margin-bottom: 14px; width: 100%; }
        .primary-btn { display: flex; align-items: center; justify-content: center; gap: 6px; background: #12524F; color: #fff; border: none; padding: 11px 14px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; width: 100%; }
        .primary-btn:disabled { opacity: 0.6; }
      `}</style>
    </div>
  );
}
