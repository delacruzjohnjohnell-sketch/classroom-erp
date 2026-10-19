import { redirect } from "next/navigation";

// The Standard Reports screen is no longer used for a Manufacturing company: cash flows and the receivables and payables ageing are in the Reports hub.
export default function OldFinancialReports() {
  redirect("/mfg/reports?r=cashflow");
}
