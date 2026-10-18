"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import ChangeHistoryPanel from "@/components/mfg/ChangeHistoryPanel";
import AppShell from "@/components/AppShell";
import { Empty } from "@/components/ui";
import { useSession } from "@/lib/session";
import { useLookups } from "@/components/mfg/useLookups";
import ItemsTab from "@/components/mfg/ItemsTab";
import { BomsTab, RoutingsTab } from "@/components/mfg/BomRoutingLists";
import {
  CalendarTab, CapacityPanel, ConversionsTab, CostCentersTab, CostingSheetTab, LocationsTab, RatesTab, UnitsTab, WorkCentersTab,
} from "@/components/mfg/MasterTables";

const TABS = [
  { id: "items", label: "Items" },
  { id: "boms", label: "Bills of materials" },
  { id: "routings", label: "Routings" },
  { id: "workcenters", label: "Work centers" },
  { id: "rates", label: "Activity rates" },
  { id: "calendar", label: "Calendar" },
  { id: "units", label: "Units" },
  { id: "conversions", label: "Conversions" },
  { id: "locations", label: "Locations" },
  { id: "costcenters", label: "Cost centers" },
  { id: "costing", label: "Costing sheet" },
  { id: "history", label: "Change history" },
] as const;

export default function MasterDataPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>}>
        <MasterBody />
      </Suspense>
    </AppShell>
  );
}

function MasterBody() {
  const router = useRouter();
  const params = useSearchParams();
  const { profile } = useSession();
  const readOnly = profile?.role === "teacher";
  const { data, loading, reload } = useLookups();
  const tab = TABS.find((t) => t.id === params.get("tab"))?.id ?? "items";
  const props = { lookups: data, reload, readOnly };

  return (
    <>
      <div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-[#7F8EA0]" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>Manufacturing</div>
        <h1 className="text-[20px] font-semibold">Master data</h1>
        {readOnly && <div className="text-[12px] text-[#7F8EA0] mt-1">You are looking at a student&rsquo;s master data. Only the student can change it.</div>}
      </div>

      <div className="flex gap-1 flex-wrap border-b border-hairline" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => router.replace(`/mfg/master?tab=${t.id}`)}
            className={`px-3 py-2 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors ${tab === t.id ? "text-gold border-[#F2B13C]" : "text-[#A3B1C2] border-transparent hover:text-ink"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color="#F2B13C" /></div>
      ) : (
        <>
          {tab === "items" && <ItemsTab {...props} />}
          {tab === "boms" && <BomsTab lookups={data} readOnly={readOnly} />}
          {tab === "routings" && <RoutingsTab lookups={data} readOnly={readOnly} />}
          {tab === "workcenters" && <><WorkCentersTab {...props} /><CapacityPanel lookups={data} /></>}
          {tab === "rates" && <RatesTab {...props} />}
          {tab === "calendar" && <CalendarTab {...props} />}
          {tab === "units" && <UnitsTab {...props} />}
          {tab === "conversions" && <ConversionsTab {...props} />}
          {tab === "locations" && <LocationsTab {...props} />}
          {tab === "costcenters" && <CostCentersTab {...props} />}
          {tab === "costing" && <CostingSheetTab {...props} />}
          {tab === "history" && <ChangeHistoryPanel />}
          {!TABS.some((t) => t.id === tab) && <Empty>Choose a tab above.</Empty>}
        </>
      )}
    </>
  );
}
