"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { GoldBtn, Panel } from "../ui";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";

const ACTIVITY = "activity-1-manufacturing";

/**
 * Offers an EMPTY company the Activity 1 answer key, but only once the teacher has released it (for the class or for this student).
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
    const res = await supabase.rpc("mfg_load_activity_key", { p_activity: ACTIVITY });
    if (res.error) { setBusy(false); toast.error(res.error.message); return; }
    toast.success("The answer key is ready. Switch between your company and this one to compare.");
    window.location.reload();
  };

  return (
    <Panel title="Activity 1 answer key">
      <div className="text-[12.5px] text-[#A3B1C2] max-w-[820px]">
        Your teacher has released the answer key for <b>Activity 1 Manufacturing</b>. This company is empty, so you can load the whole of Bamboo Basket Works, November 2026,
        done exactly as the exercise says, with the month closed. Use the company switcher at the top to move between your own company and this one, and compare the items,
        standard costs, stock, vouchers, reports and the trial balance. Your own company is never changed. To keep your own company safe, load the key only in a new company
        (for example <i>Activity 1 answer key</i>) with <b>Standard</b> costing.
      </div>
      <div className="mt-3">
        <GoldBtn type="button" onClick={load} disabled={busy}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} Load the Activity 1 answer key
        </GoldBtn>
      </div>
    </Panel>
  );
}
