"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Panel, GoldBtn } from "@/components/ui";
import ListReport, { Chip, type ListColumn } from "@/components/ListReport";
import VoucherForm from "@/components/mfg/VoucherForm";
import VoucherView from "@/components/mfg/VoucherView";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { showQueryErrors } from "@/lib/queryErrors";
import { money } from "@/lib/costing";
import { KIND_LABEL, STATUS_LABEL, STATUS_TONE, type VoucherStatus } from "@/lib/mfgVouchers";

type Row = {
  id: string; voucher_no: string; kind: "MANUAL" | "SYSTEM"; voucher_type: string; jv_type: string | null; voucher_date: string; period: string;
  reference: string | null; particulars: string | null; status: VoucherStatus; total: number; prepared_by_name: string | null; override: boolean; reject_note: string | null;
};

/** Every journal voucher of the company, whether a person prepared it or a document wrote it. Drafts open in the form; the rest open as the printable voucher. */
export default function VoucherRegister({ initialPeriod }: { initialPeriod?: string }) {
  const { effectiveTenantId, profile } = useSession();
  const isTeacher = profile?.role === "teacher";
  const [rows, setRows] = useState<Row[]>([]);
  const [from, setFrom] = useState(initialPeriod ? `${initialPeriod}-01` : "");
  const [to, setTo] = useState(() => {
    if (!initialPeriod) return "";
    const [y, m] = initialPeriod.split("-").map(Number);
    return `${initialPeriod}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;   // the last day of that month
  });
  const [form, setForm] = useState<string | null | undefined>(undefined);   // undefined = closed, null = a new voucher, id = a draft
  const [view, setView] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!effectiveTenantId) return;
    const r = await supabase.rpc("mfg_voucher_register", { p_tenant: effectiveTenantId, p_from: from || null, p_to: to || null });
    if (showQueryErrors(r)) return;
    setRows(((r.data as Row[]) ?? []).map((x) => ({ ...x, total: Number(x.total) })));
  }, [effectiveTenantId, from, to]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const waiting = useMemo(() => rows.filter((r) => r.status === "PENDING_APPROVAL").length, [rows]);

  const columns: ListColumn<Row>[] = [
    { key: "no", label: "Voucher no.", value: (r) => r.voucher_no, width: 130 },
    { key: "date", label: "Date", value: (r) => r.voucher_date, width: 100 },
    { key: "type", label: "Type", value: (r) => r.voucher_type, filter: true, width: 150 },
    { key: "status", label: "Status", value: (r) => STATUS_LABEL[r.status], filter: true, width: 150, render: (r) => <Chip label={STATUS_LABEL[r.status]} tone={STATUS_TONE[r.status]} /> },
    { key: "kind", label: "Source", value: (r) => KIND_LABEL[r.kind], filter: true, width: 150, defaultHidden: true },
    { key: "ref", label: "Reference", value: (r) => r.reference ?? "", width: 130 },
    { key: "part", label: "Particulars", value: (r) => r.particulars ?? "", width: 300 },
    { key: "by", label: "Prepared by", value: (r) => r.prepared_by_name ?? "", width: 140, defaultHidden: true },
    { key: "total", label: "Amount", value: (r) => r.total, align: "right", width: 130, render: (r) => money(r.total) },
  ];

  const open = (r: Row) => (r.kind === "MANUAL" && r.status === "DRAFT" && !isTeacher ? setForm(r.id) : setView(r.id));

  return (
    <Panel title="Journal vouchers">
      {waiting > 0 && <div className="text-[12.5px] mb-3" style={{ color: "#F2B13C" }}>{waiting} voucher{waiting === 1 ? " is" : "s are"} waiting for approval{isTeacher ? "" : " by the teacher or the finance manager"} — filter Status to “Waiting for approval”.</div>}
      <div className="flex flex-wrap gap-3 items-end mb-3">
        <div><label className="block text-[11px] text-[#7F8EA0] mb-1">From</label><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="block text-[11px] text-[#7F8EA0] mb-1">To</label><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        {!isTeacher && <GoldBtn onClick={() => setForm(null)}><Plus size={14} /> New journal voucher</GoldBtn>}
      </div>
      <ListReport listKey="mfg-vouchers" rows={rows} columns={columns} rowKey={(r) => r.id} onRowClick={open} exportName="journal-vouchers" emptyText="No vouchers in this range." />
      <div className="text-[11.5px] text-[#7F8EA0] mt-2">Every posting in the books has a voucher. Open one to print it, see its supporting document, or reverse it.</div>
      {form !== undefined && <VoucherForm voucherId={form} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); load(); }} />}
      {view && <VoucherView voucherId={view} onClose={() => setView(null)} onChanged={load} />}
    </Panel>
  );
}
