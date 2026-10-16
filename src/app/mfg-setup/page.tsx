"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Check, Factory, Loader2 } from "lucide-react";
import { Label, FormStyles } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/mutate";
import { toast } from "@/lib/toast";
import { todayStr } from "@/lib/types";

const AMBER = "#F2B13C";

// What the wizard collects. The database checks the same rules again; this gives a clear message first.
const SetupSchema = z.object({
  name: z.string().trim().min(2, "Give your company a name (at least 2 letters).").max(80, "Keep the name under 80 characters."),
  fiscalYearStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date your fiscal year starts."),
  costing: z.enum(["STANDARD", "ACTUAL"], { message: "Choose how you will cost your products." }),
});

const COSTING = [
  { key: "STANDARD", title: "Standard costing", text: "Every product has a planned (standard) cost. Material and labor are charged to production at that cost, and the differences show up as named variances — purchase price, material usage, labor efficiency, overhead." },
  { key: "ACTUAL", title: "Actual costing", text: "Production is charged what it really cost: materials at the moving-average price, labor at actual hours and rates, overhead at a predetermined rate. A finished product's cost is its actual cost divided by the good units." },
] as const;

export default function MfgSetupPage() {
  const router = useRouter();
  const { loading, userId, profile, refresh } = useSession();
  const [checking, setChecking] = useState(true);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [fiscalYearStart, setFiscalYearStart] = useState(`${todayStr().slice(0, 4)}-01-01`);
  const [costing, setCosting] = useState<"STANDARD" | "ACTUAL">("STANDARD");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!userId) { router.replace("/login"); return; }
    if (profile?.role === "teacher") { router.replace("/choose"); return; }
    (async () => {
      const [{ data: setting }, { data: mine }] = await Promise.all([
        supabase.from("edition_settings").select("enabled").eq("edition", "MANUFACTURING").maybeSingle(),
        supabase.from("tenant_editions").select("tenant_id").eq("edition", "MANUFACTURING").eq("owner_id", userId).maybeSingle(),
      ]);
      if (mine) { router.replace("/choose"); return; }          // already has one
      setOpen(!!(setting as { enabled?: boolean } | null)?.enabled);
      setChecking(false);
    })();
  }, [loading, userId, profile, router]);

  const validate = () => {
    const r = SetupSchema.safeParse({ name, fiscalYearStart, costing });
    if (!r.success) { setError(r.error.issues[0]?.message ?? "Check the details."); return null; }
    setError("");
    return r.data;
  };

  const next = () => {
    if (step === 0) {
      const r = SetupSchema.pick({ name: true, fiscalYearStart: true }).safeParse({ name, fiscalYearStart });
      if (!r.success) { setError(r.error.issues[0]?.message ?? "Check the details."); return; }
    }
    setError(""); setStep(step + 1);
  };

  const create = async () => {
    const v = validate();
    if (!v || busy) return;
    setBusy(true);
    const { error: err } = await supabase.rpc("create_mfg_company", { company_name: v.name, fiscal_year_start: v.fiscalYearStart, costing_method: v.costing });
    if (err) { setBusy(false); setError(friendlyError(err.message)); return; }
    toast.success("Your Manufacturing company is ready.");
    await refresh();
    router.replace("/mfg");
  };

  if (loading || checking) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={20} color={AMBER} /></div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-panel border border-hairline rounded-2xl p-8 shadow-[0_24px_70px_rgba(0,0,0,0.55),0_0_0_1px_rgba(242,177,60,0.12)]">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-lg flex items-center justify-center border" style={{ color: AMBER, borderColor: "rgba(242,177,60,0.55)", background: "rgba(242,177,60,0.1)" }}><Factory size={20} /></div>
          <div>
            <div className="font-mono text-[15px] font-bold">Set up your Manufacturing company</div>
            <div className="text-[12px] text-[#7F8EA0]">JJ and Co. Manufacturing ERP · step {step + 1} of 3</div>
          </div>
        </div>

        {!open ? (
          <div>
            <div className="text-[13px] text-[#A3B1C2] leading-relaxed">Your teacher hasn&rsquo;t opened the Manufacturing ERP yet. It will appear here as soon as they do.</div>
            <button onClick={() => router.replace("/choose")} className="primary-btn mt-5"><ArrowLeft size={14} /> Back to the ERP chooser</button>
          </div>
        ) : (
          <>
            {step === 0 && (
              <div>
                <Label>Company name</Label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nueva Ecija Wooden Furniture Co." autoFocus />
                <Label>Fiscal year starts</Label>
                <input className="input" type="date" value={fiscalYearStart} onChange={(e) => setFiscalYearStart(e.target.value)} />
                <div className="text-[12px] text-[#7F8EA0] mt-1.5">Your accounting periods are calendar months counted from this date. This is separate from your Standard ERP company — nothing you post in one appears in the other.</div>
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-2.5">
                <div className="text-[12.5px] text-[#A3B1C2]">How should your products be costed? Your teacher can change this later, only between periods.</div>
                {COSTING.map((c) => (
                  <button key={c.key} type="button" onClick={() => setCosting(c.key)}
                    className="text-left rounded-lg p-3.5 border transition-colors"
                    style={{ borderColor: costing === c.key ? AMBER : "#243140", background: costing === c.key ? "rgba(242,177,60,0.08)" : "#0D1319" }}>
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-[13.5px]">{c.title}</div>
                      {costing === c.key && <Check size={15} color={AMBER} />}
                    </div>
                    <div className="text-[12px] text-[#A3B1C2] mt-1 leading-relaxed">{c.text}</div>
                  </button>
                ))}
              </div>
            )}

            {step === 2 && (
              <div>
                <div className="text-[12.5px] text-[#A3B1C2] mb-3">Review, then create. A manufacturing chart of accounts (41 accounts, including Raw Materials, Work in Process, Finished Goods, GR/IR and the variance accounts) is set up for you.</div>
                <div className="grid gap-x-5 gap-y-1.5 text-[13px]" style={{ gridTemplateColumns: "130px 1fr" }}>
                  <span className="text-[#7F8EA0]">Company</span><span className="font-semibold">{name.trim() || "—"}</span>
                  <span className="text-[#7F8EA0]">Fiscal year starts</span><span className="font-semibold">{fiscalYearStart}</span>
                  <span className="text-[#7F8EA0]">Costing</span><span className="font-semibold">{costing === "STANDARD" ? "Standard costing" : "Actual costing"}</span>
                </div>
              </div>
            )}

            {error && <div className="text-[12.5px] mt-3" style={{ color: "#FF6B7A" }}>{error}</div>}

            <div className="flex gap-2 mt-6">
              {step > 0 && <button type="button" onClick={() => { setError(""); setStep(step - 1); }} disabled={busy} className="flex items-center gap-1.5 border border-hairline rounded-lg px-3.5 text-[13px] text-[#A3B1C2]"><ArrowLeft size={14} /> Back</button>}
              {step < 2
                ? <button type="button" onClick={next} className="primary-btn">Next <ArrowRight size={14} /></button>
                : <button type="button" onClick={create} disabled={busy} className="primary-btn">{busy ? "Creating…" : "Create my Manufacturing company"}</button>}
            </div>
            <button type="button" onClick={() => router.replace("/choose")} className="block mx-auto mt-4 text-[12px] text-[#7F8EA0] hover:text-ink">Cancel and go back</button>
          </>
        )}
        <FormStyles />
      </div>
    </div>
  );
}
