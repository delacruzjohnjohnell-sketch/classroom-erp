"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Briefcase, Wallet, Receipt } from "lucide-react";
import AppShell from "@/components/AppShell";
import { KpiCard, Panel, Empty, Modal, Label, GoldBtn, OutlineBtn, FormStyles } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { money } from "@/lib/types";

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

  const monthlyPayroll = employees.reduce((s, e) => s + (e.salary || 0) / 12, 0);
  const runPayroll = async () => { await supabase.rpc("run_payroll", { target_tenant: effectiveTenantId }); load(); };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        <GoldBtn onClick={() => setModal(true)}><Plus size={14} /> New employee</GoldBtn>
        <OutlineBtn onClick={runPayroll} disabled={employees.length === 0}>Run monthly payroll</OutlineBtn>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <KpiCard icon={<Briefcase size={16} />} label="Employees" value={employees.length} />
        <KpiCard icon={<Wallet size={16} />} label="Monthly payroll cost" value={money(monthlyPayroll)} />
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
            <thead><tr><th>Date</th><th>Headcount</th><th className="text-right">Total</th></tr></thead>
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
      <Label>Annual salary</Label><input className="input" type="number" value={salary} onChange={(e) => setSalary(e.target.value)} required />
      <button type="submit" className="primary-btn mt-4">Save</button>
      <FormStyles />
    </form>
  );
}
