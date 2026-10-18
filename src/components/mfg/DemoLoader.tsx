"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { GoldBtn, Panel } from "../ui";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";

/**
 * Offers to fill an empty Manufacturing company with the demo shop: a small wooden-furniture business with two months of history.
 * The database refuses if the company already has items or orders, so showing it too often is harmless.
 */
export default function DemoLoader() {
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (busy) return;
    setBusy(true);
    const res = await supabase.rpc("mfg_load_demo");
    if (res.error) { setBusy(false); toast.error(res.error.message); return; }
    toast.success("The demo company is ready. Take a look around.");
    window.location.reload();                 // this is shown on the Manufacturing home page; reload so every screen reads the new data
  };

  return (
    <Panel title="Try it with a demo company">
      <div className="text-[12.5px] text-[#A3B1C2] max-w-[820px]">
        This company is empty. Load a small wooden-furniture shop in Nueva Ecija to see every screen with real figures: eight items, three work centres, last month’s purchases, production, deliveries and invoices, and this month’s orders in progress.
        Last month is ready for you to close under <b>Period End</b>. Payroll is left for you to run. You can only do this in an empty company.
      </div>
      <div className="mt-3">
        <GoldBtn type="button" onClick={load} disabled={busy}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Load the demo company
        </GoldBtn>
      </div>
    </Panel>
  );
}
