"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/** How many message threads have something the signed-in user has not read yet. Refreshes every minute and whenever Messages marks something read. */
export function useUnreadMessages(userId: string | null | undefined): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    const load = async () => {
      const r = await supabase.rpc("msg_unread_count");
      if (live && !r.error) setN(Number(r.data) || 0);
    };
    load();
    const timer = setInterval(load, 60_000);
    window.addEventListener("messages-changed", load);
    return () => { live = false; clearInterval(timer); window.removeEventListener("messages-changed", load); };
  }, [userId]);
  return n;
}
