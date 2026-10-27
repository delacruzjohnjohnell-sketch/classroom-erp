"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { GoldBtn, Panel } from "../ui";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";

const ACTIVITY = "activity-1-manufacturing";

/**
 * Offers the Activity 1 answer key (its own read-only company), but only once the teacher has released it (for the class or for this student).
 * Until then nothing is shown at all. The database does the real checking, so showing it in the wrong company is harmless.
 */
export default function ActivityKeyLoader() {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const r = await supabase.rpc("mfg_activity_key_available", { p_activity: ACTIVITY });
      if (live && !r.error) setAvailable(r.data === true);
    })();
    return () => { live = false; };
  }, []);

  if (!available) return null;

  const load = async () => {
    if (busy) return;
    setBusy(true);
    const res = await supabase.rpc("mfg_open_answer_key", { p_activity: ACTIVITY });
    if (res.error) { setBusy(false); toast.error(res.error.message); return; }
    toast.success("The answer key company is open. Use the company switcher to go back to your own company.");
    window.location.assign("/mfg");
  };

  return (
    <Panel title="Activity 1 answer key">
      <div className="text-[12.5px] text-[#A3B1C2] max-w-[820px]">
        Your teacher has released the answer key for <b>Activity 1 Manufacturing</b>. It opens as a separate, read-only company called <i>Activity 1 answer key</i>:
        Bamboo Basket Works, November 2026, done exactly as the exercise says, with the month closed. Use the company switcher at the top to move between your own company
        and the key, and compare the items, standard costs, stock, vouchers, reports and the trial balance. Your own company is never changed, and you cannot post in the key.
      </div>
      <div className="mt-3">
        <GoldBtn type="button" onClick={load} disabled={busy}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} Open the Activity 1 answer key
        </GoldBtn>
      </div>
    </Panel>
  );
}
