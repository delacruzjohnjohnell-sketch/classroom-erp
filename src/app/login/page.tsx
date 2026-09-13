"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Users, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const { userId, profile, tenants, refresh, loading } = useSession();

  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Onboarding state (shown once a user is authenticated but has no company yet)
  const [companyMode, setCompanyMode] = useState<"join" | "create">("join");
  const [selectedTenant, setSelectedTenant] = useState("");
  const [newCompany, setNewCompany] = useState("");

  const submitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      if (authMode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName, role } },
        });
        if (err) throw err;
        if (!data.session) {
          setNotice("Check your email to confirm your account, then sign in.");
          setAuthMode("signin");
        } else {
          await refresh();
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        await refresh();
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const submitCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      if (companyMode === "create") {
        if (!newCompany.trim()) return;
        const { error: err } = await supabase.rpc("create_tenant", { tenant_name: newCompany.trim() });
        if (err) throw err;
      } else {
        if (!selectedTenant) return;
        const { error: err } = await supabase.rpc("join_tenant", { target_tenant: selectedTenant });
        if (err) throw err;
      }
      await refresh();
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  // Authenticated already — route or show onboarding
  if (!loading && userId && profile) {
    if (profile.role === "teacher") { router.replace("/teacher"); return null; }
    if (profile.tenant_id) { router.replace("/dashboard"); return null; }

    return (
      <Shell>
        <div className="flex bg-tealsoft rounded-lg p-1 mb-5">
          <TabBtn active={companyMode === "join"} onClick={() => setCompanyMode("join")}>Join a company</TabBtn>
          <TabBtn active={companyMode === "create"} onClick={() => setCompanyMode("create")}>Start a new one</TabBtn>
        </div>
        <form onSubmit={submitCompany} className="flex flex-col">
          {companyMode === "join" ? (
            <>
              <Label>Company</Label>
              <select className="input" value={selectedTenant} onChange={(e) => setSelectedTenant(e.target.value)} required>
                <option value="">Select your company…</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {tenants.length === 0 && <div className="text-xs text-[#8a8172] mt-1.5">No companies yet — start one instead.</div>}
            </>
          ) : (
            <>
              <Label>Company name</Label>
              <input className="input" value={newCompany} onChange={(e) => setNewCompany(e.target.value)} placeholder="e.g. Team 3 — Northwind Traders" required />
            </>
          )}
          {error && <div className="text-xs text-red mt-2">{error}</div>}
          <button disabled={busy} className="primary-btn mt-5">{busy ? "One moment…" : "Enter the ledger"} <ChevronRight size={16} /></button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex bg-tealsoft rounded-lg p-1 mb-5">
        <TabBtn active={role === "student"} onClick={() => setRole("student")}><GraduationCap size={16} className="inline mr-1.5 -mt-0.5" />Student</TabBtn>
        <TabBtn active={role === "teacher"} onClick={() => setRole("teacher")}><Users size={16} className="inline mr-1.5 -mt-0.5" />Teacher</TabBtn>
      </div>
      {role === "teacher" && (
        <div className="text-[11.5px] text-[#8a8172] mb-3 -mt-3">
          Teacher access is restricted to the class instructor&rsquo;s email. If that&rsquo;s not you, use Student instead.
        </div>
      )}

      <div className="flex gap-2 text-xs mb-4">
        <button onClick={() => setAuthMode("signin")} className={`px-2.5 py-1 rounded-md ${authMode === "signin" ? "bg-teal text-white" : "text-[#6b6357]"}`}>Sign in</button>
        <button onClick={() => setAuthMode("signup")} className={`px-2.5 py-1 rounded-md ${authMode === "signup" ? "bg-teal text-white" : "text-[#6b6357]"}`}>Create account</button>
      </div>

      <form onSubmit={submitAuth} className="flex flex-col">
        {authMode === "signup" && (
          <>
            <Label>Your name</Label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Jordan Lee" required />
          </>
        )}
        <Label>Email</Label>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Label>Password</Label>
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />

        {error && <div className="text-xs text-red mt-2">{error}</div>}
        {notice && <div className="text-xs text-teal mt-2">{notice}</div>}

        <button disabled={busy} className="primary-btn mt-5">
          {busy ? "One moment…" : authMode === "signup" ? "Create account" : "Sign in"} <ChevronRight size={16} />
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-panel border border-hairline rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-7">
          <div className="font-serif text-2xl text-gold border border-gold rounded-lg w-11 h-11 flex items-center justify-center">§</div>
          <div>
            <div className="font-serif text-lg font-bold">JJ and Co.</div>
            <div className="text-xs text-[#6b6357]">A classroom ERP</div>
          </div>
        </div>
        {children}
      </div>
      <style jsx global>{`
        .input { font-size: 14px; padding: 9px 11px; border-radius: 8px; border: 1px solid #DDD8CC; background: #F5F3EE; color: #1B2430; outline: none; margin-bottom: 14px; }
        .primary-btn { display: flex; align-items: center; justify-content: center; gap: 6px; background: #12524F; color: #fff; border: none; padding: 11px 14px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .primary-btn:disabled { opacity: 0.6; }
      `}</style>
    </div>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-semibold text-[#5c5548] mb-1.5 mt-1">{children}</label>;
}
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-semibold ${active ? "bg-panel text-teal shadow-sm" : "text-[#3f5b57]"}`}>
      {children}
    </button>
  );
}
