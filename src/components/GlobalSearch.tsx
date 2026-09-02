"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";

type ResultGroup = { label: string; items: { id: string; primary: string; secondary?: string; href: string }[] };

export default function GlobalSearch() {
  const { effectiveTenantId } = useSession();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<ResultGroup[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!effectiveTenantId || query.trim().length < 2) { setGroups([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      const q = query.trim();
      const [customers, vendors, items, employees, invoices, bills, salesOrders, purchaseOrders, quotes] = await Promise.all([
        supabase.from("customers").select("id, name").eq("tenant_id", effectiveTenantId).ilike("name", `%${q}%`).limit(5),
        supabase.from("vendors").select("id, name").eq("tenant_id", effectiveTenantId).ilike("name", `%${q}%`).limit(5),
        supabase.from("items").select("id, name, sku").eq("tenant_id", effectiveTenantId).or(`name.ilike.%${q}%,sku.ilike.%${q}%`).limit(5),
        supabase.from("employees").select("id, name, employee_number").eq("tenant_id", effectiveTenantId).or(`name.ilike.%${q}%,employee_number.ilike.%${q}%`).limit(5),
        supabase.from("invoices").select("id, document_number, customers(name)").eq("tenant_id", effectiveTenantId).ilike("document_number", `%${q}%`).limit(5),
        supabase.from("bills").select("id, document_number, vendors(name)").eq("tenant_id", effectiveTenantId).ilike("document_number", `%${q}%`).limit(5),
        supabase.from("sales_orders").select("id, document_number, customers(name)").eq("tenant_id", effectiveTenantId).ilike("document_number", `%${q}%`).limit(5),
        supabase.from("purchase_orders").select("id, document_number, vendors(name)").eq("tenant_id", effectiveTenantId).ilike("document_number", `%${q}%`).limit(5),
        supabase.from("quotes").select("id, document_number, customers(name)").eq("tenant_id", effectiveTenantId).ilike("document_number", `%${q}%`).limit(5),
      ]);

      const g: ResultGroup[] = [];
      if (customers.data?.length) g.push({ label: "Customers", items: customers.data.map((c: any) => ({ id: c.id, primary: c.name, href: "/sales?tab=customers" })) });
      if (vendors.data?.length) g.push({ label: "Vendors", items: vendors.data.map((v: any) => ({ id: v.id, primary: v.name, href: "/procurement?tab=vendors" })) });
      if (items.data?.length) g.push({ label: "Inventory", items: items.data.map((i: any) => ({ id: i.id, primary: i.name, secondary: i.sku, href: "/inventory" })) });
      if (employees.data?.length) g.push({ label: "Employees", items: employees.data.map((e: any) => ({ id: e.id, primary: e.name, secondary: e.employee_number, href: "/hr?tab=employees" })) });
      if (invoices.data?.length) g.push({ label: "Invoices", items: invoices.data.map((i: any) => ({ id: i.id, primary: i.document_number, secondary: i.customers?.name, href: "/sales?tab=invoices" })) });
      if (bills.data?.length) g.push({ label: "Bills", items: bills.data.map((b: any) => ({ id: b.id, primary: b.document_number, secondary: b.vendors?.name, href: "/procurement?tab=bills" })) });
      if (salesOrders.data?.length) g.push({ label: "Sales Orders", items: salesOrders.data.map((s: any) => ({ id: s.id, primary: s.document_number, secondary: s.customers?.name, href: "/sales?tab=orders" })) });
      if (purchaseOrders.data?.length) g.push({ label: "Purchase Orders", items: purchaseOrders.data.map((p: any) => ({ id: p.id, primary: p.document_number, secondary: p.vendors?.name, href: "/procurement?tab=orders" })) });
      if (quotes.data?.length) g.push({ label: "Quotes", items: quotes.data.map((q2: any) => ({ id: q2.id, primary: q2.document_number, secondary: q2.customers?.name, href: "/sales?tab=quotes" })) });

      setGroups(g);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, effectiveTenantId]);

  const totalResults = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <div ref={boxRef} className="relative w-full max-w-[360px]">
      <div className="flex items-center gap-2 bg-paper border border-hairline rounded-md px-3 py-2">
        <Search size={14} color="#8a8172" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search customers, vendors, items, invoices…"
          className="flex-1 bg-transparent outline-none text-[13px]"
        />
        {loading && <Loader2 size={13} className="animate-spin" color="#8a8172" />}
        {query && !loading && (
          <button onClick={() => { setQuery(""); setGroups([]); }}><X size={13} color="#8a8172" /></button>
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-panel border border-hairline rounded-md shadow-lg z-50 max-h-[420px] overflow-y-auto">
          {totalResults === 0 && !loading ? (
            <div className="px-4 py-6 text-center text-[12.5px] text-[#8a8172]">No matches for "{query}"</div>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="py-2">
                <div className="px-3 pb-1 text-[10.5px] font-bold uppercase tracking-wide text-[#8a8172]">{g.label}</div>
                {g.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { router.push(item.href); setOpen(false); setQuery(""); }}
                    className="w-full text-left px-3 py-2 hover:bg-paper flex items-center justify-between text-[13px]"
                  >
                    <span>{item.primary}</span>
                    {item.secondary && <span className="text-[#8a8172] text-[12px]">{item.secondary}</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
