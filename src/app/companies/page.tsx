"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Plus } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Panel, Empty, Label, GoldBtn, OutlineBtn, FormStyles } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { mutate, ok } from "@/lib/mutate";

export default function CompaniesPage() {
  return <AppShell><CompaniesBody /></AppShell>;
}

// One account can belong to several companies. Each keeps its own books, people and
// documents; this page is where you start a new one, join one that exists, or hop between them.
function CompaniesBody() {
  const router = useRouter();
  const { myCompanies, tenants, effectiveTenantId, switchCompany, refresh } = useSession();
  const [newName, setNewName] = useState("");
  const [joinId, setJoinId] = useState("");
  const [busy, setBusy] = useState(false);

  const mine = new Set(myCompanies.map((c) => c.id));
  const joinable = tenants.filter((t) => !mine.has(t.id) && t.id !== effectiveTenantId);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("create_tenant", { tenant_name: newName.trim() }), { successMessage: "Company created — you're now working in it." });
    setBusy(false);
    if (ok(res)) { setNewName(""); await refresh(); router.push("/dashboard"); }
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinId || busy) return;
    setBusy(true);
    const res = await mutate(supabase.rpc("join_tenant", { target_tenant: joinId }), { successMessage: "Joined — you're now working in that company." });
    setBusy(false);
    if (ok(res)) { setJoinId(""); await refresh(); router.push("/dashboard"); }
  };

  return (
    <>
      <Panel title="Your companies">
        {myCompanies.length === 0 ? <Empty>You aren&rsquo;t in any company yet.</Empty> : (
          <div className="flex flex-col gap-1.5">
            {myCompanies.map((c) => {
              const active = c.id === effectiveTenantId;
              return (
                <div key={c.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-md border border-hairline bg-paper">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Building2 size={15} className="text-teal shrink-0" />
                    <div className="text-[13.5px] font-bold truncate">{c.name}</div>
                  </div>
                  {active ? (
                    <span className="flex items-center gap-1 text-[12px] font-semibold text-teal"><Check size={13} /> Active</span>
                  ) : (
                    <OutlineBtn onClick={async () => { if (await switchCompany(c.id)) router.push("/dashboard"); }}>Switch to this</OutlineBtn>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="text-[12px] text-[#7F8EA0] mt-3">
          Each company has its own chart of accounts, ledger, employees, payroll, invoices and orders. Nothing is shared between them.
        </div>
      </Panel>

      <Panel title="Create a new company">
        <form onSubmit={create}>
          <Label>Company name</Label>
          <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Team 3 — Northwind Traders" required />
          <div className="mt-3"><GoldBtn type="submit" disabled={busy || !newName.trim()}><Plus size={14} /> Create company</GoldBtn></div>
          <FormStyles />
        </form>
      </Panel>

      <Panel title="Join an existing company">
        {joinable.length === 0 ? <Empty>There are no other companies to join.</Empty> : (
          <form onSubmit={join}>
            <Label>Company</Label>
            <select className="input" value={joinId} onChange={(e) => setJoinId(e.target.value)} required>
              <option value="">Choose a company…</option>
              {joinable.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <div className="mt-3"><GoldBtn type="submit" disabled={busy || !joinId}>Join company</GoldBtn></div>
            <FormStyles />
          </form>
        )}
      </Panel>
    </>
  );
}
