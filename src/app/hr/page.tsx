"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Briefcase, Wallet, Receipt, PhilippinePeso } from "lucide-react";
import AppShell from "@/components/AppShell";
import { KpiCard, Panel, Empty, Modal, Label, GoldBtn, OutlineBtn, FormStyles } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { money, todayStr } from "@/lib/types";
import { computeMonthlyPayroll, type PayrollBreakdown } from "@/lib/philippinePayroll";

const TEAL = "#12524F";

export default function HrPage() {
  return <AppShell><HrBody /></AppShell>;
}

function HrBody() {
  const { effectiveTenantId } = useSession();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const load = async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    const [e, r] = await Promise.all([
      supabase.from("employees").select("*").eq("tenant_id", effectiveTenantId).order("name"),
      supabase.from("payroll_runs").select("*").eq("tenant_id", effectiveTenantId).order("run_date", { ascending: false }),
    ]);
    setEmployees(e.data ?? []);
    setRuns(r.data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [effectiveTenantId]);

  const monthlyGross = employees.reduce((s, e) => s + (e.salary || 0) / 12, 0);

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        <GoldBtn onClick={() => setModal(true)}><Plus size={14} /> New employee</GoldBtn>
        <OutlineBtn onClick={() => setPreviewing(true)} disabled={employees.length === 0}><PhilippinePeso size={14} /> Run payroll (PH statutory)</OutlineBtn>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <KpiCard icon={<Briefcase size={16} />} label="Employees" value={employees.length} />
        <KpiCard icon={<Wallet size={16} />} label="Monthly gross payroll" value={money(monthlyGross)} />
        <KpiCard icon={<Receipt size={16} />} label="Payroll runs" value={runs.length} />
      </div>

      <Panel title="Employees">
        {employees.length === 0 ? <Empty>No employees yet.</Empty> : (
          <table>
            <thead><tr><th>Name</th><th>Title</th><th>Department</th><th className="text-right">Annual salary</th></tr></thead>
            <tbody>{employees.map((e) => (
              <tr key={e.id}><td>{e.name}</td><td>{e.title}</td><td>{e.department}</td>
                <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(e.salary)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Panel>

      <Panel title="Payroll history">
        {runs.length === 0 ? <Empty>No payroll runs yet.</Empty> : (
          <table>
            <thead><tr><th>Date</th><th>Headcount</th><th className="text-right">Gross total</th></tr></thead>
            <tbody>{runs.map((r) => (
              <tr key={r.id}><td>{r.run_date}</td><td>{r.headcount}</td>
                <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(r.total)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Panel>

      {modal && (
        <Modal title="New employee" onClose={() => setModal(false)}>
          <EmployeeForm onClose={() => setModal(false)} onSaved={load} />
        </Modal>
      )}
      {previewing && (
        <PayrollPreviewModal employees={employees} tenantId={effectiveTenantId!} onClose={() => setPreviewing(false)} onPosted={() => { setPreviewing(false); load(); }} />
      )}
    </>
  );
}

function EmployeeForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { effectiveTenantId } = useSession();
  const [name, setName] = useState(""); const [title, setTitle] = useState("");
  const [department, setDepartment] = useState(""); const [salary, setSalary] = useState("");
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      await supabase.from("employees").insert({ tenant_id: effectiveTenantId, name, title, department, salary: parseFloat(salary) || 0 });
      onClose(); onSaved();
    }}>
      <Label>Full name</Label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      <Label>Job title</Label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <Label>Department</Label><input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} />
      <Label>Annual salary (₱)</Label><input className="input" type="number" value={salary} onChange={(e) => setSalary(e.target.value)} required />
      <button type="submit" className="primary-btn mt-4">Save</button>
      <FormStyles />
    </form>
  );
}

function PayrollPreviewModal({ employees, tenantId, onClose, onPosted }: { employees: any[]; tenantId: string; onClose: () => void; onPosted: () => void }) {
  const [posting, setPosting] = useState(false);
  const breakdown: PayrollBreakdown[] = employees.map((e) => computeMonthlyPayroll(e.id, e.name, e.salary || 0));

  const totals = breakdown.reduce((acc, b) => ({
    gross: acc.gross + b.gross,
    sssEE: acc.sssEE + b.sssEE, sssER: acc.sssEE + b.sssER,
    philhealthEE: acc.philhealthEE + b.philhealthEE, philhealthER: acc.philhealthER + b.philhealthER,
    pagibigEE: acc.pagibigEE + b.pagibigEE, pagibigER: acc.pagibigER + b.pagibigER,
    withholdingTax: acc.withholdingTax + b.withholdingTax,
    netPay: acc.netPay + b.netPay,
  }), { gross: 0, sssEE: 0, sssER: 0, philhealthEE: 0, philhealthER: 0, pagibigEE: 0, pagibigER: 0, withholdingTax: 0, netPay: 0 });

  const post = async () => {
    setPosting(true);
    await supabase.rpc("run_payroll_ph", {
      target_tenant: tenantId,
      run_date: todayStr(),
      lines: breakdown,
    });
    setPosting(false);
    onPosted();
  };

  return (
    <Modal title="Payroll preview — Philippine statutory deductions" onClose={onClose} wide>
      <div className="text-[12px] text-[#8a8172] mb-3">
        Rates approximate 2023–2024 SSS/PhilHealth/Pag-IBIG/BIR tables. Verify against current issuances before real use.
      </div>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr><th>Employee</th><th className="text-right">Gross</th><th className="text-right">SSS (EE)</th>
              <th className="text-right">PhilHealth (EE)</th><th className="text-right">Pag-IBIG (EE)</th>
              <th className="text-right">W/Tax</th><th className="text-right">Net pay</th></tr>
          </thead>
          <tbody>
            {breakdown.map((b) => (
              <tr key={b.employeeId}>
                <td>{b.employeeName}</td>
                <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(b.gross)}</td>
                <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(b.sssEE)}</td>
                <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(b.philhealthEE)}</td>
                <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(b.pagibigEE)}</td>
                <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(b.withholdingTax)}</td>
                <td className="text-right font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>{money(b.netPay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between text-[13.5px] font-bold mt-4 pt-3" style={{ borderTop: "2px solid #1B2430" }}>
        <span>Total net pay to employees</span><span>{money(totals.netPay)}</span>
      </div>
      <div className="text-[12px] text-[#6b6357] mt-1">
        Plus employer-side contributions (SSS/PhilHealth/Pag-IBIG employer share) posted as Payroll Tax Expense — this run also remits statutory payables, not just wages.
      </div>
      <button onClick={post} disabled={posting} className="primary-btn mt-4">{posting ? "Posting…" : "Confirm & post payroll"}</button>
      <FormStyles />
    </Modal>
  );
}
