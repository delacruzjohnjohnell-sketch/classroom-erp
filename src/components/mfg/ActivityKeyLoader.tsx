"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { GoldBtn, Panel } from "../ui";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";

const ACTIVITIES = [
  { id: "activity-1-manufacturing", name: "Activity 1", what: "Bamboo Basket Works, November 2026" },
  { id: "activity-2-manufacturing", name: "Activity 2", what: "Rattan Furniture Works, December 2026 and January 2027" },
] as const;

/**
 * Offers each activity's answer key (its own read-only company), but only once the teacher has released it (for the class or for this student).
 * Until then nothing is shown at all. The database does the real checking, so showing it in the wrong company is harmless.
 */
export default function ActivityKeyLoader() {
  const [available, setAvailable] = useState<string[]>([]);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      const found: string[] = [];
      for (const a of ACTIVITIES) {
        const r = await supabase.rpc("mfg_activity_key_available", { p_activity: a.id });
        if (!r.error && r.data === true) found.push(a.id);
      }
      if (live) setAvailable(found);
    })();
    return () => { live = false; };
  }, []);

  const load = async (id: string) => {
    if (busy) return;
    setBusy(id);
    const res = await supabase.rpc("mfg_open_answer_key", { p_activity: id });
    if (res.error) { setBusy(""); toast.error(res.error.message); return; }
    toast.success("The answer key company is open. Use the company switcher to go back to your own company.");
    window.location.assign("/mfg");
  };

  return (
    <>
      {ACTIVITIES.filter((a) => available.includes(a.id)).map((a) => (
        <Panel key={a.id} title={`${a.name} answer key`}>
          <div className="text-[12.5px] text-[#A3B1C2] max-w-[820px]">
            Your teacher has released the answer key for <b>{a.name} Manufacturing</b>. It opens as a separate, read-only company called <i>{a.name} answer key</i>:
            {" "}{a.what}, done exactly as the exercise says, with the months closed. Use the company switcher at the top to move between your own company
            and the key, and compare the items, standard costs, stock, vouchers, reports and the trial balance. Your own company is never changed, and you cannot post in the key.
          </div>
          <div className="mt-3">
            <GoldBtn type="button" onClick={() => load(a.id)} disabled={busy !== ""}>
              {busy === a.id ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} Open the {a.name} answer key
            </GoldBtn>
          </div>
        </Panel>
      ))}
    </>
  );
}
