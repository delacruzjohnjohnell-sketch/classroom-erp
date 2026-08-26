"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";
import type { Profile, Tenant } from "./types";

type SessionState = {
  loading: boolean;
  userId: string | null;
  profile: Profile | null;
  tenants: Tenant[]; // all tenants (used for the "join a company" picker and the teacher's company list)
  viewTenantId: string | null; // when a teacher drills into a specific company
  setViewTenantId: (id: string | null) => void;
  effectiveTenantId: string | null; // the tenant whose data should currently be shown
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [viewTenantId, setViewTenantId] = useState<string | null>(null);

  const loadProfile = useCallback(async (uid: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
    setProfile((data as Profile) ?? null);
  }, []);

  const loadTenants = useCallback(async () => {
    const { data } = await supabase.from("tenants").select("*").order("created_at", { ascending: true });
    setTenants((data as Tenant[]) ?? []);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id ?? null;
    setUserId(uid);
    if (uid) {
      await loadProfile(uid);
      await loadTenants();
    } else {
      setProfile(null);
      setTenants([]);
    }
  }, [loadProfile, loadTenants]);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const uid = session?.user.id ?? null;
      setUserId(uid);
      if (uid) {
        await loadProfile(uid);
        await loadTenants();
      } else {
        setProfile(null);
        setTenants([]);
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setViewTenantId(null);
  }, []);

  const effectiveTenantId =
    profile?.role === "teacher" ? viewTenantId : profile?.tenant_id ?? null;

  return (
    <SessionContext.Provider
      value={{ loading, userId, profile, tenants, viewTenantId, setViewTenantId, effectiveTenantId, refresh, signOut }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
