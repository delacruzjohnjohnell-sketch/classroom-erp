"use client";
// Sends a student who is waiting for approval (or was not given this system) away from a page. Returns true while the page must render nothing.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "./session";
import { accessState, canUse, type ModuleId } from "./access";

export function useAccessGuard(module?: ModuleId): boolean {
  const router = useRouter();
  const { loading, profile } = useSession();
  const state = accessState(profile);
  const blockedModule = !!profile && !!module && state === "ok" && !canUse(profile, module);
  useEffect(() => {
    if (loading || !profile) return;
    if (state !== "ok") router.replace("/pending");
    else if (blockedModule) router.replace("/choose");
  }, [loading, profile, state, blockedModule, router]);
  return !loading && !!profile && (state !== "ok" || blockedModule);
}
