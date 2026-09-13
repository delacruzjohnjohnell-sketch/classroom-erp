"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Printer } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { money } from "@/lib/types";

export default function PayslipPage() {
  const params = useParams();
  const lineId = params.lineId as string;
  const [loading, setLoading] = useState(true);
  const [line, setLine] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("payroll_run_lines")
        .select("*, employees(*), payroll_runs(run_date, pay_period), tenants(name)")
        .eq("id", lineId)
        .single();
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      setLine(data);
      setLoading(false);
    })();
  }, [lineId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={20} color="#12524F" /></div>;
  if (notFound || !line) return <div className="min-h-screen flex items-center justify-center text-[#8a8172]">Payslip not found, or you don&rsquo;t have access to it.</div>;

  const emp = line.employees;
  const totalDeductions = line.sss_ee + line.philhealth_ee + line.pagibig_ee + line.withholding_tax + (line.loan_deduction || 0);
  const totalEmployerContrib = line.sss_er + line.philhealth_er + line.pagibig_er;

  return (
    <div className="min-h-screen bg-paper flex justify-center py-10 px-4">
      <div className="w-full max-w-[640px] bg-panel border border-hairline rounded-xl p-8">
        <div className="flex items-center justify-between no-print mb-6">
          <div className="text-xs text-[#8a8172]">Payslip</div>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 bg-teal text-white text-xs font-semibold px-3 py-2 rounded-md">
            <Printer size={13} /> Print / Save as PDF
          </button>
        </div>

        <div className="text-center mb-6 pb-5" style={{ borderBottom: "2px solid #1B2430" }}>
          <div className="font-serif text-xl font-bold">{line.tenants?.name}</div>
          <div className="text-[13px] text-[#6b6357] mt-1">
            Payslip — Pay Period Ending {line.payroll_runs?.run_date}
            {line.payroll_runs?.pay_period && ` (${String(line.payroll_runs.pay_period).replace("_", " ")})`}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12.5px] mb-6">
          <Row label="Employee name" value={emp?.name} />
          <Row label="Employee no." value={emp?.employee_number} />
          <Row label="Position" value={emp?.title} />
          <Row label="Department" value={emp?.department} />
          <Row label="TIN" value={emp?.tin || "—"} />
          <Row label="SSS No." value={emp?.sss_number || "—"} />
          <Row label="PhilHealth No." value={emp?.philhealth_number || "—"} />
          <Row label="Pag-IBIG No." value={emp?.pagibig_number || "—"} />
        </div>

        <SectionTitle>Earnings</SectionTitle>
        <LineItem label="Gross monthly pay" value={line.gross} bold />

        <SectionTitle>Deductions</SectionTitle>
        <LineItem label="SSS contribution" value={line.sss_ee} />
        <LineItem label="PhilHealth contribution" value={line.philhealth_ee} />
        <LineItem label="Pag-IBIG contribution" value={line.pagibig_ee} />
        <LineItem label="Withholding tax" value={line.withholding_tax} />
        {line.loan_deduction > 0 && <LineItem label="Loan deduction" value={line.loan_deduction} />}
        <LineItem label="Total deductions" value={totalDeductions} bold border />

        <div className="flex justify-between items-center mt-5 pt-4" style={{ borderTop: "2px solid #1B2430" }}>
          <span className="text-[15px] font-bold">NET PAY</span>
          <span className="text-[19px] font-bold" style={{ color: "#12524F", fontVariantNumeric: "tabular-nums" }}>{money(line.net_pay)}</span>
        </div>

        <div className="mt-8 pt-4 border-t border-hairline">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#8a8172] mb-2">Employer contributions (for reference — not deducted from employee)</div>
          <LineItem label="SSS (employer share)" value={line.sss_er} small />
          <LineItem label="PhilHealth (employer share)" value={line.philhealth_er} small />
          <LineItem label="Pag-IBIG (employer share)" value={line.pagibig_er} small />
          <LineItem label="Total employer contribution" value={totalEmployerContrib} small bold />
        </div>

        <div className="text-[10.5px] text-[#8a8172] mt-6">
          This payslip is generated for classroom instructional use. Statutory deduction rates approximate 2023–2024
          SSS/PhilHealth/Pag-IBIG/BIR tables and should not be relied on for actual payroll compliance.
        </div>
      </div>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between border-b border-hairline py-1">
      <span className="text-[#8a8172]">{label}</span><span className="font-medium">{value || "—"}</span>
    </div>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold uppercase tracking-wide text-[#C08A2E] mt-5 mb-1.5">{children}</div>;
}
function LineItem({ label, value, bold, border, small }: { label: string; value: number; bold?: boolean; border?: boolean; small?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${border ? "border-t border-hairline mt-1 pt-2" : ""}`} style={{ fontSize: small ? 12 : 13, fontWeight: bold ? 700 : 400 }}>
      <span>{label}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{money(value)}</span>
    </div>
  );
}
