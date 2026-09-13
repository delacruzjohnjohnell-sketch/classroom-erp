"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type Viewer = { userId: string; name: string; role: string };

/**
 * "Someone else is looking at this" indicator (AUDIT.md: no signal when two
 * students on the same team both have the app open). Uses Supabase Realtime
 * Presence — an ephemeral broadcast, not a database table, so there's nothing
 * to migrate and nothing left behind if everyone closes their tab.
 *
 * Scoped to tenant + page (pathname), not to an individual record — this says
 * "N others are on this page right now," not "X is editing this exact row."
 * That's the whole feature: a heads-up, not a lock.
 */
export function usePagePresence(tenantId: string | null, pathname: string, self: { userId: string; name: string; role: string } | null) {
  const [others, setOthers] = useState<Viewer[]>([]);

  useEffect(() => {
    // Clearing stale viewers synchronously when we lose tenant/page/self context
    // (e.g. signing out) is intentional, not the async-fetch pattern the rule
    // usually flags.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!tenantId || !pathname || !self) { setOthers([]); return; }

    const channel = supabase.channel(`presence:${tenantId}:${pathname}`, {
      config: { presence: { key: self.userId } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<{ name: string; role: string }>();
      const list: Viewer[] = Object.entries(state)
        .filter(([key]) => key !== self.userId)
        .map(([key, metas]) => ({ userId: key, name: metas[0]?.name ?? "Someone", role: metas[0]?.role ?? "" }));
      setOthers(list);
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.track({ name: self.name, role: self.role });
      }
    });

    return () => { supabase.removeChannel(channel); };
    // Depend on self's primitive fields, not the `self` object itself — the caller
    // (AppShell) constructs a fresh object every render, so depending on the object
    // would re-subscribe the channel on every render instead of only when identity
    // actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, pathname, self?.userId, self?.name, self?.role]);

  return others;
}
