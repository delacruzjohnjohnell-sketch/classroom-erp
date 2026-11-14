"use client";
// Shown to a student when the teacher has marked the company checked (migration 0086): the company is locked, they can look but not change.
// It asks again every 30 seconds so an unlock or a new check shows without a reload. A teacher never sees it; before the migration is applied it stays hidden.
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

export function CheckedBanner() {
  const { profile, effectiveTenantId } = useSession();
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const student = !!profile && profile.role !== "teacher";

  useEffect(() => {
    if (!student || !effectiveTenantId) return;
    let live = true;
    const read = async () => {
      const r = await supabase.rpc("mfg_company_checked", { p_tenant: effectiveTenantId });
      if (live) setCheckedAt(r.error ? null : ((r.data as string | null) ?? null));
    };
    read();
    const t = setInterval(read, 30000);
    return () => { live = false; clearInterval(t); };
  }, [student, effectiveTenantId]);

  if (!student || !checkedAt) return null;
  return (
    <div role="status" className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-900">
      <Lock size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>Your teacher has checked this company, so it is locked. You can look at everything but you cannot change it. Ask your teacher if something needs correcting.</span>
    </div>
  );
}
