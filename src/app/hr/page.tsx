"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Plus, Loader2, Briefcase, Wallet, Receipt, PhilippinePeso, ChevronDown, ChevronRight,
  FileText, Clock, CalendarDays, HandCoins, Check, X, Gift,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { KpiCard, Panel, Empty, Modal, ConfirmDialog, Label, GoldBtn, OutlineBtn, TinyBtn, SearchBox, FormStyles } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";
import { money, todayStr } from "@/lib/types";
import { computePayrollForPeriod, computeHourlyPayrollForPeriod, getPeriodDateRange, type PayrollBreakdown, type PayPeriod } from "@/lib/philippinePayroll";

const TEAL = "#12524F", RED = "#A6402F";
const TABS = [
  { key: "employees", label: "Employees" },
  { key: "time", label: "Time & Attendance" },
  { key: "leave", label: "Leave" },
  { key: "loans", label: "Loans" },
  { key: "payroll", label: "Payroll" },
] as const;
type Tab = typeof TABS[number]["key"];

export default function HrPage() {
  return <AppShell><Suspense><HrBody /></Suspense></AppShell>;
}

function HrBody() {
  const { effectiveTenantId, profile } = useSession();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "payroll";
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.key === initialTab) ? initialTab : "payroll");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);

  const [modal, setModal] = useState<null | "employee" | "time" | "leave" | "loan">(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming13th, setConfirming13th] = useState(false);
  const [posting13th, setPosting13th] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runLines, setRunLines] = useState<Record<string, any[]>>({});

  const load = async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    const [e, te, lr, ln, r] = await Promise.all([
      supabase.from("employees").select("*").eq("tenant_id", effectiveTenantId).order("name"),
      supabase.from("time_entries").select("*, employees(name)").eq("tenant_id", effectiveTenantId).order("work_date", { ascending: false }),
      supabase.from("leave_requests").select("*, employees(name)").eq("tenant_id", effectiveTenantId).order("start_date", { ascending: false }),
      supabase.from("employee_loans").select("*, employees(name)").eq("tenant_id", effectiveTenantId).order("start_date", { ascending: false }),
      supabase.from("payroll_runs").select("*").eq("tenant_id", effectiveTenantId).order("run_date", { ascending: false }),
    ]);
    setEmployees(e.data ?? []);
    setTimeEntries(te.data ?? []);
    setLeaveRequests(lr.data ?? []);
    setLoans(ln.data ?? []);
    setRuns(r.data ?? []);
    setLoading(false);
  };
  // load() sets state synchronously before its first await (fetch-on-mount) — intentional.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [effectiveTenantId]);

  const toggleRun = async (runId: string) => {
    if (expandedRun === runId) { setExpandedRun(null); return; }
    setExpandedRun(runId);
    if (!runLines[runId]) {
      const { data } = await supabase.from("payroll_run_lines").select("*, employees(name, employee_number)").eq("payroll_run_id", runId);
      setRunLines((prev) => ({ ...prev, [runId]: data ?? [] }));
    }
  };

  const setLeaveStatus = async (id: string, status: "approved" | "denied") => {
    await mutate(supabase.from("leave_requests").update({ status }).eq("id", id));
    load();
  };

  const post13thMonth = async () => {
    setPosting13th(true);
    const res = await mutate(supabase.rpc("post_13th_month_pay", { target_tenant: effectiveTenantId, pay_year: new Date().getFullYear() }), { successMessage: "13th month pay posted." });
    setPosting13th(false);
    if (ok(res)) setConfirming13th(false);
    load();
  };

  const employeesF = employees.filter((e) => !q || [e.name, e.title, e.department, e.employee_number].some((v) => (v ?? "").toLowerCase().includes(q.trim().toLowerCase())));

  const monthlyGross = employees.reduce((s, e) => s + (e.salary || 0) / 12, 0);
  const activeLoans = loans.filter((l) => l.status === "active");
  const pendingLeave = leaveRequests.filter((l) => l.status === "pending").length;

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin" size={20} color={TEAL} /></div>;

  return (
    <>
      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`text-[13px] font-semibold px-3 py-1.5 rounded-md ${tab === t.key ? "bg-panel border border-hairline" : "text-[#8a8172]"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <KpiCard icon={<Briefcase size={16} />} label="Employees" value={employees.length} />
        <KpiCard icon={<Wallet size={16} />} label="Monthly gross payroll" value={money(monthlyGross)} />
        <KpiCard icon={<HandCoins size={16} />} label="Active loans" value={activeLoans.length} />
        <KpiCard icon={<CalendarDays size={16} />} label="Pending leave requests" value={pendingLeave} accent={pendingLeave > 0 ? RED : TEAL} />
      </div>

      {tab === "employees" && (
        <>
          <div className="flex gap-2 items-center justify-between flex-wrap">
            <GoldBtn onClick={() => setModal("employee")}><Plus size={14} /> New employee</GoldBtn>
            <SearchBox value={q} onChange={setQ} placeholder="Search employees…" />
          </div>
          <Panel title="Employees">
            {employeesF.length === 0 ? <Empty>{employees.length === 0 ? "No employees yet." : "No employees match your search."}</Empty> : (
              <table>
                <thead><tr><th>Emp #</th><th>Name</th><th>Title</th><th>Department</th><th>Pay type</th><th className="text-right">Rate</th></tr></thead>
                <tbody>{employeesF.map((e) => (
                  <tr key={e.id}>
                    <td style={{ color: "#C08A2E", fontWeight: 600 }}>{e.employee_number}</td>
                    <td>{e.name}</td><td>{e.title}</td><td>{e.department}</td>
                    <td className="capitalize">{e.pay_type || "monthly"}</td>
                    <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {e.pay_type === "hourly" ? `${money(e.hourly_rate || 0)}/hr` : money(e.salary)}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </Panel>
        </>
      )}

      {tab === "time" && (
        <>
          <div className="flex gap-2"><GoldBtn onClick={() => setModal("time")} disabled={employees.length === 0}><Plus size={14} /> Log hours</GoldBtn></div>
          <Panel title="Time entries">
            <div className="text-[12px] text-[#8a8172] mb-3">
              Wired into pay for <strong>hourly</strong> employees — their gross pay each run comes directly from hours logged here.
              Monthly-salaried employees&rsquo; pay stays fixed regardless of logged hours (their entries are attendance records only).
            </div>
            {timeEntries.length === 0 ? <Empty>No time entries logged yet.</Empty> : (
              <table>
                <thead><tr><th>Date</th><th>Employee</th><th className="text-right">Hours</th><th>Notes</th></tr></thead>
                <tbody>{timeEntries.map((t) => (
                  <tr key={t.id}><td>{t.work_date}</td><td>{t.employees?.name}</td>
                    <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{t.hours_worked}</td><td>{t.notes}</td></tr>
                ))}</tbody>
              </table>
            )}
          </Panel>
        </>
      )}

      {tab === "leave" && (
        <>
          <div className="flex gap-2"><GoldBtn onClick={() => setModal("leave")} disabled={employees.length === 0}><Plus size={14} /> Request leave</GoldBtn></div>
          <Panel title="Leave requests">
            {leaveRequests.length === 0 ? <Empty>No leave requests yet.</Empty> : (
              <table>
                <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th className="text-right">Days</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {leaveRequests.map((l) => (
                    <tr key={l.id}>
                      <td>{l.employees?.name}</td><td className="capitalize">{l.leave_type}</td>
                      <td>{l.start_date} → {l.end_date}</td>
                      <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{l.days}</td>
                      <td className="capitalize" style={{ color: l.status === "approved" ? TEAL : l.status === "denied" ? RED : "#C08A2E", fontWeight: 600, fontSize: 12 }}>{l.status}</td>
                      <td>
                        {l.status === "pending" && profile?.role === "teacher" && (
                          <div className="flex gap-1.5">
                            <TinyBtn onClick={() => setLeaveStatus(l.id, "approved")}><Check size={12} /> Approve</TinyBtn>
                            <button onClick={() => setLeaveStatus(l.id, "denied")} className="text-[11px] text-[#8a8172] flex items-center gap-1"><X size={11} /> Deny</button>
                          </div>
                        )}
                        {l.status === "pending" && profile?.role !== "teacher" && <span className="text-[11px] text-[#8a8172]">Awaiting teacher review</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}

      {tab === "loans" && (
        <>
          <div className="flex gap-2"><GoldBtn onClick={() => setModal("loan")} disabled={employees.length === 0}><Plus size={14} /> Issue loan</GoldBtn></div>
          <Panel title="Employee loans">
            {loans.length === 0 ? <Empty>No employee loans yet.</Empty> : (
              <table>
                <thead><tr><th>Employee</th><th className="text-right">Principal</th><th className="text-right">Monthly ded.</th><th className="text-right">Balance</th><th>Status</th></tr></thead>
                <tbody>
                  {loans.map((l) => (
                    <tr key={l.id}>
                      <td>{l.employees?.name}</td>
                      <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(l.principal)}</td>
                      <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(l.monthly_deduction)}</td>
                      <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(l.balance_remaining)}</td>
                      <td style={{ color: l.status === "active" ? "#C08A2E" : TEAL, fontWeight: 600, fontSize: 12 }} className="capitalize">{l.status.replace("_", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}

      {tab === "payroll" && (
        <>
          <div className="flex gap-2 flex-wrap">
            <OutlineBtn onClick={() => setPreviewing(true)} disabled={employees.length === 0}><PhilippinePeso size={14} /> Run payroll</OutlineBtn>
            <OutlineBtn onClick={() => setConfirming13th(true)} disabled={posting13th || employees.length === 0}>
              <Gift size={14} /> {posting13th ? "Posting…" : `Post 13th month pay (${new Date().getFullYear()})`}
            </OutlineBtn>
          </div>
          <Panel title="Payroll history">
            {runs.length === 0 ? <Empty>No payroll runs yet.</Empty> : (
              <div className="flex flex-col">
                {runs.map((r) => (
                  <div key={r.id} className="border-b border-hairline">
                    <button onClick={() => toggleRun(r.id)} className="w-full flex items-center justify-between py-2.5 text-left">
                      <span className="flex items-center gap-2 text-[13px]">
                        {expandedRun === r.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {r.run_date} · {r.run_type === "13th_month" ? "13th month pay" : (r.pay_period || "monthly").replace("_", " ")} · {r.headcount} employees
                      </span>
                      <span className="text-[13px] font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>{money(r.total)}</span>
                    </button>
                    {expandedRun === r.id && (
                      <div className="pb-3 pl-6">
                        {!runLines[r.id] ? (
                          <Loader2 className="animate-spin" size={14} color={TEAL} />
                        ) : (
                          <table>
                            <thead><tr><th>Employee</th><th className="text-right">Net pay</th><th></th></tr></thead>
                            <tbody>
                              {runLines[r.id].map((line: any) => (
                                <tr key={line.id}>
                                  <td>{line.employees?.name} <span className="text-[#8a8172]">({line.employees?.employee_number})</span></td>
                                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(line.net_pay)}</td>
                                  <td>
                                    <Link href={`/hr/payslip/${line.id}`} target="_blank" className="flex items-center gap-1 text-[11.5px] font-semibold text-teal">
                                      <FileText size={12} /> Payslip
                                    </Link>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}

      {modal === "employee" && (
        <Modal title="New employee" onClose={() => setModal(null)}>
          <EmployeeForm onClose={() => setModal(null)} onSaved={load} />
        </Modal>
      )}
      {modal === "time" && (
        <Modal title="Log hours" onClose={() => setModal(null)}>
          <TimeEntryForm employees={employees} onClose={() => setModal(null)} onSaved={load} />
        </Modal>
      )}
      {modal === "leave" && (
        <Modal title="Request leave" onClose={() => setModal(null)}>
          <LeaveForm employees={employees} onClose={() => setModal(null)} onSaved={load} />
        </Modal>
      )}
      {modal === "loan" && (
        <Modal title="Issue employee loan" onClose={() => setModal(null)}>
          <LoanForm employees={employees} onClose={() => setModal(null)} onSaved={load} />
        </Modal>
      )}
      {previewing && (
        <PayrollPreviewModal employees={employees} activeLoans={activeLoans} tenantId={effectiveTenantId!}
          onClose={() => setPreviewing(false)} onPosted={() => { setPreviewing(false); load(); }} />
      )}
      {confirming13th && (
        <ConfirmDialog
          title="Post 13th month pay?"
          message={`This posts one payroll expense entry per employee for ${new Date().getFullYear()}'s 13th month pay. It can't be undone from here.`}
          confirmLabel="Post 13th month pay"
          busy={posting13th}
          onCancel={() => setConfirming13th(false)}
          onConfirm={post13thMonth}
        />
      )}
    </>
  );
}

function EmployeeForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { effectiveTenantId } = useSession();
  const [name, setName] = useState(""); const [title, setTitle] = useState("");
  const [department, setDepartment] = useState(""); const [salary, setSalary] = useState("");
  const [payType, setPayType] = useState<"monthly" | "hourly">("monthly");
  const [hourlyRate, setHourlyRate] = useState("");
  const [tin, setTin] = useState(""); const [sss, setSss] = useState("");
  const [philhealth, setPhilhealth] = useState(""); const [pagibig, setPagibig] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      const res = await mutate(supabase.from("employees").insert({
        tenant_id: effectiveTenantId, name, title, department,
        salary: payType === "monthly" ? (parseFloat(salary) || 0) : 0,
        pay_type: payType, hourly_rate: payType === "hourly" ? (parseFloat(hourlyRate) || 0) : null,
        tin: tin || null, sss_number: sss || null, philhealth_number: philhealth || null, pagibig_number: pagibig || null,
      }), { successMessage: "Employee added." });
      setSubmitting(false);
      if (ok(res)) { onClose(); onSaved(); }
    }}>
      <Label>Full name</Label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      <Label>Job title</Label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <Label>Department</Label><input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} />

      <Label>Pay type</Label>
      <select className="input" value={payType} onChange={(e) => setPayType(e.target.value as "monthly" | "hourly")}>
        <option value="monthly">Monthly (fixed salary)</option>
        <option value="hourly">Hourly (paid from logged time)</option>
      </select>

      {payType === "monthly" ? (
        <><Label>Annual salary (₱)</Label><input className="input" type="number" value={salary} onChange={(e) => setSalary(e.target.value)} required /></>
      ) : (
        <><Label>Hourly rate (₱)</Label><input className="input" type="number" step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} required />
        <div className="text-[12px] text-[#8a8172] mt-1">Gross pay each run comes directly from hours logged in Time &amp; Attendance for that period.</div></>
      )}

      <div className="text-[11px] font-bold uppercase tracking-wide text-[#8a8172] mt-4 mb-1">Statutory IDs (optional — shown on payslip)</div>
      <div className="grid grid-cols-2 gap-2.5">
        <div><Label>TIN</Label><input className="input" value={tin} onChange={(e) => setTin(e.target.value)} placeholder="000-000-000-000" /></div>
        <div><Label>SSS No.</Label><input className="input" value={sss} onChange={(e) => setSss(e.target.value)} placeholder="00-0000000-0" /></div>
        <div><Label>PhilHealth No.</Label><input className="input" value={philhealth} onChange={(e) => setPhilhealth(e.target.value)} placeholder="00-000000000-0" /></div>
        <div><Label>Pag-IBIG No.</Label><input className="input" value={pagibig} onChange={(e) => setPagibig(e.target.value)} placeholder="0000-0000-0000" /></div>
      </div>

      <button type="submit" disabled={submitting} className="primary-btn mt-4">{submitting ? "Saving…" : "Save"}</button>
      <FormStyles />
    </form>
  );
}

function TimeEntryForm({ employees, onClose, onSaved }: { employees: any[]; onClose: () => void; onSaved: () => void }) {
  const { effectiveTenantId } = useSession();
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [date, setDate] = useState(todayStr());
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      const res = await mutate(supabase.from("time_entries").insert({ tenant_id: effectiveTenantId, employee_id: employeeId, work_date: date, hours_worked: parseFloat(hours) || 0, notes }), { successMessage: "Time logged." });
      setSubmitting(false);
      if (ok(res)) { onClose(); onSaved(); }
    }}>
      <Label>Employee</Label>
      <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
        {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2.5">
        <div><Label>Date</Label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
        <div><Label>Hours worked</Label><input className="input" type="number" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} required /></div>
      </div>
      <Label>Notes (optional)</Label>
      <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button type="submit" disabled={submitting} className="primary-btn mt-4">{submitting ? "Saving…" : "Save"}</button>
      <FormStyles />
    </form>
  );
}

function LeaveForm({ employees, onClose, onSaved }: { employees: any[]; onClose: () => void; onSaved: () => void }) {
  const { effectiveTenantId } = useSession();
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [leaveType, setLeaveType] = useState("vacation");
  const [start, setStart] = useState(todayStr());
  const [end, setEnd] = useState(todayStr());
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const days = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1);

  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      const res = await mutate(supabase.from("leave_requests").insert({
        tenant_id: effectiveTenantId, employee_id: employeeId, leave_type: leaveType,
        start_date: start, end_date: end, days, reason, status: "pending",
      }), { successMessage: "Leave request submitted." });
      setSubmitting(false);
      if (ok(res)) { onClose(); onSaved(); }
    }}>
      <Label>Employee</Label>
      <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
        {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
      </select>
      <Label>Leave type</Label>
      <select className="input" value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
        <option value="vacation">Vacation</option><option value="sick">Sick</option>
        <option value="emergency">Emergency</option><option value="unpaid">Unpaid</option>
      </select>
      <div className="grid grid-cols-2 gap-2.5">
        <div><Label>Start date</Label><input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></div>
        <div><Label>End date</Label><input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} required /></div>
      </div>
      <div className="text-[12px] text-[#8a8172] mt-1">{days} day{days !== 1 ? "s" : ""}</div>
      <Label>Reason (optional)</Label>
      <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button type="submit" disabled={submitting} className="primary-btn mt-4">{submitting ? "Submitting…" : "Submit request"}</button>
      <FormStyles />
    </form>
  );
}

function LoanForm({ employees, onClose, onSaved }: { employees: any[]; onClose: () => void; onSaved: () => void }) {
  const { effectiveTenantId } = useSession();
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [principal, setPrincipal] = useState("");
  const [monthlyDeduction, setMonthlyDeduction] = useState("");
  const [date, setDate] = useState(todayStr());
  const [submitting, setSubmitting] = useState(false);

  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      const res = await mutate(supabase.rpc("issue_employee_loan", {
        target_tenant: effectiveTenantId, target_employee_id: employeeId,
        loan_principal: parseFloat(principal) || 0, loan_monthly_deduction: parseFloat(monthlyDeduction) || 0, loan_date: date,
      }), { successMessage: "Loan issued." });
      setSubmitting(false);
      if (ok(res)) { onClose(); onSaved(); }
    }}>
      <Label>Employee</Label>
      <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
        {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2.5">
        <div><Label>Loan amount (₱)</Label><input className="input" type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} required /></div>
        <div><Label>Monthly deduction (₱)</Label><input className="input" type="number" value={monthlyDeduction} onChange={(e) => setMonthlyDeduction(e.target.value)} required /></div>
      </div>
      <Label>Date issued</Label>
      <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      <div className="text-[12px] text-[#8a8172] mt-1">Posts Dr Employee Loans Receivable / Cr Cash immediately.</div>
      <button type="submit" disabled={submitting} className="primary-btn mt-4">{submitting ? "Issuing…" : "Issue loan"}</button>
      <FormStyles />
    </form>
  );
}

function PayrollPreviewModal({ employees, activeLoans, tenantId, onClose, onPosted }: { employees: any[]; activeLoans: any[]; tenantId: string; onClose: () => void; onPosted: () => void }) {
  const [posting, setPosting] = useState(false);
  const [payPeriod, setPayPeriod] = useState<PayPeriod>("monthly");
  const [hoursByEmployee, setHoursByEmployee] = useState<Record<string, number>>({});
  const [loadingHours, setLoadingHours] = useState(true);

  const hourlyEmployees = employees.filter((e) => e.pay_type === "hourly");
  const range = getPeriodDateRange(payPeriod);

  useEffect(() => {
    (async () => {
      if (hourlyEmployees.length === 0) { setLoadingHours(false); return; }
      setLoadingHours(true);
      const { data } = await supabase.from("time_entries").select("employee_id, hours_worked")
        .in("employee_id", hourlyEmployees.map((e) => e.id))
        .gte("work_date", range.start).lte("work_date", range.end);
      const totals: Record<string, number> = {};
      (data ?? []).forEach((t: any) => { totals[t.employee_id] = (totals[t.employee_id] || 0) + t.hours_worked; });
      setHoursByEmployee(totals);
      setLoadingHours(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payPeriod]);

  const loanFor = (employeeId: string) => activeLoans.find((l) => l.employee_id === employeeId);
  const breakdown: PayrollBreakdown[] = employees.map((e) => {
    const loan = loanFor(e.id);
    const loanDed = loan ? Math.min(loan.monthly_deduction, loan.balance_remaining) : 0;
    if (e.pay_type === "hourly") {
      const hours = hoursByEmployee[e.id] || 0;
      return computeHourlyPayrollForPeriod(e.id, e.name, e.hourly_rate || 0, hours, payPeriod, loanDed);
    }
    return computePayrollForPeriod(e.id, e.name, e.salary || 0, payPeriod, loanDed);
  });

  const totals = breakdown.reduce((acc, b) => ({
    netPay: acc.netPay + b.netPay,
  }), { netPay: 0 });

  const post = async () => {
    setPosting(true);
    const res = await mutate(supabase.rpc("run_payroll_ph", { target_tenant: tenantId, run_date: todayStr(), lines: breakdown, pay_period: payPeriod }), { successMessage: "Payroll posted." });
    setPosting(false);
    if (ok(res)) onPosted();
  };

  return (
    <Modal title="Payroll preview — Philippine statutory deductions" onClose={onClose} wide>
      <div className="text-[12px] text-[#8a8172] mb-3">
        Rates approximate 2023–2024 SSS/PhilHealth/Pag-IBIG/BIR tables. Verify against current issuances before real use.
      </div>
      <Label>Pay period</Label>
      <select className="input mb-3" value={payPeriod} onChange={(e) => setPayPeriod(e.target.value as PayPeriod)}>
        <option value="monthly">Monthly (full month)</option>
        <option value="semi_first">Semi-monthly — 1st half (no statutory/loan deductions)</option>
        <option value="semi_second">Semi-monthly — 2nd half (statutory + loan deductions applied)</option>
      </select>

      {hourlyEmployees.length > 0 && (
        <div className="text-[12px] text-[#6b6357] mb-3">
          Hourly employees&rsquo; gross is pulled from Time &amp; Attendance entries between <strong>{range.start}</strong> and <strong>{range.end}</strong>.
          {loadingHours && " Loading logged hours…"}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr><th>Employee</th><th className="text-right">Gross</th><th className="text-right">SSS (EE)</th>
              <th className="text-right">PhilHealth (EE)</th><th className="text-right">Pag-IBIG (EE)</th>
              <th className="text-right">W/Tax</th><th className="text-right">Loan</th><th className="text-right">Net pay</th></tr>
          </thead>
          <tbody>
            {breakdown.map((b) => {
              const emp = employees.find((e) => e.id === b.employeeId);
              return (
                <tr key={b.employeeId}>
                  <td>{b.employeeName}{emp?.pay_type === "hourly" && <span className="text-[#8a8172]"> · {hoursByEmployee[emp.id] || 0} hrs</span>}</td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(b.gross)}</td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(b.sssEE)}</td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(b.philhealthEE)}</td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(b.pagibigEE)}</td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(b.withholdingTax)}</td>
                  <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{money(b.loanDeduction)}</td>
                  <td className="text-right font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>{money(b.netPay)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between text-[13.5px] font-bold mt-4 pt-3" style={{ borderTop: "2px solid #1B2430" }}>
        <span>Total net pay to employees</span><span>{money(totals.netPay)}</span>
      </div>
      <div className="text-[12px] text-[#6b6357] mt-1">
        Plus employer-side SSS/PhilHealth/Pag-IBIG contributions posted as Payroll Tax Expense. Individual payslips are available afterward from Payroll history.
      </div>
      <button onClick={post} disabled={posting || loadingHours} className="primary-btn mt-4">{posting ? "Posting…" : "Confirm & post payroll"}</button>
      <FormStyles />
    </Modal>
  );
}
