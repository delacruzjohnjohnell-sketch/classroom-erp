"use client";

import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Panel } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { buildReportHtml, reportDate, reportFileName, type ReportRecord } from "@/lib/practiceReport";

const TEAL = "#12524F", RED = "#A6402F";

// Shows the latest practice-set report the teacher published for this company, with a
// download and a print / save-as-PDF option. Renders nothing until a report exists.
export default function PracticeReportPanel() {
  const { effectiveTenantId, tenants } = useSession();
  const [report, setReport] = useState<ReportRecord | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!effectiveTenantId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("practice_reports").select("*")
        .eq("tenant_id", effectiveTenantId).order("created_at", { ascending: false }).limit(1);
      if (!cancelled) setReport(((data ?? [])[0] as ReportRecord | undefined) ?? null);
    })();
    return () => { cancelled = true; };
  }, [effectiveTenantId]);

  if (!report) return null;

  const companyName = tenants.find((t) => t.id === effectiveTenantId)?.name ?? "Your company";
  const html = () => buildReportHtml(companyName, report);

  const download = () => {
    const url = URL.createObjectURL(new Blob([html()], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = reportFileName(companyName, report.created_at);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const print = () => {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 3000);
    };
    document.body.appendChild(frame);
    frame.srcdoc = html();
  };

  const failed = report.results.filter((r) => !r.pass);
  const allPassed = failed.length === 0;

  return (
    <Panel title="Practice set report">
      <div className="flex items-baseline gap-3 flex-wrap">
        <div className="text-[24px] font-bold" style={{ color: allPassed ? TEAL : RED }}>{report.passed} / {report.total}</div>
        <div className="text-[12.5px] text-[#6b6357]">
          checks passed · {report.set_name} · checked {reportDate(report.created_at)}
        </div>
      </div>
      <div className="text-[12.5px] text-[#6b6357] mt-1">
        {allPassed ? "Everything matches the practice set." : `${failed.length} item${failed.length === 1 ? "" : "s"} need attention. Fix them and ask your teacher to check again.`}
      </div>

      <div className="flex gap-2 flex-wrap mt-3">
        <button onClick={download} className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-white" style={{ background: TEAL }}>
          <Download size={14} /> Download report
        </button>
        <button onClick={print} className="flex items-center gap-1.5 border border-hairline rounded-md px-3 py-2 text-xs font-semibold text-teal bg-panel">
          <Printer size={14} /> Print or save as PDF
        </button>
        {!allPassed && (
          <button onClick={() => setOpen((v) => !v)} className="text-xs font-semibold text-teal px-1">
            {open ? "Hide" : "Show"} what needs attention
          </button>
        )}
      </div>

      {open && !allPassed && (
        <div className="mt-3 flex flex-col">
          {failed.map((r) => (
            <div key={r.group + r.label} className="py-2 border-b border-hairline text-[12.5px]">
              <div className="font-semibold">{r.label} <span className="font-normal text-[#8a8172]">· {r.group}</span></div>
              {report.include_details && (r.expected || r.actual) && (
                <div className="text-[#6b6357] break-words">Expected {r.expected}<br />Found {r.actual}</div>
              )}
              {report.include_details && r.hint && <div className="mt-1" style={{ color: RED }}>{r.hint}</div>}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
