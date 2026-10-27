#!/usr/bin/env python3
"""Activity 3 Manufacturing (team set, Capiz Lantern Works): ONE script defines every transaction.
 - emit(role, date, where, what, sql)  adds a step: the SQL that the answer key runs (exactly what the screen calls) and the line the handout shows for that role.
 - `python3 gen.py do A B`    prints a DO block that runs steps A..B (data rows + dispatcher.sql) against the scratch team company.
 - `python3 gen.py rows A B`  prints the JSON rows of steps A..B.
 - `python3 gen.py func`      prints the whole plpgsql function mfg__load_activity_3(p_tenant uuid) (the answer-key loader).
 - `python3 gen.py handout`   writes handout rows to rows.json (the handout/teacher-key builder reads them).
Lookups use natural keys only (sku, vendor name, document numbers that follow creation order), so any slice of steps can run on its own."""
import json, sys

STEPS = []          # {n, role, date, where, what, row}   row = one JSON object read by dispatcher.sql
def emit(role, date, where, what, row):
    STEPS.append(dict(n=len(STEPS) + 1, role=role, date=date, where=where, what=what, row=row))

q = lambda s: "'" + str(s).replace("'", "''") + "'"
def money(x): return f"{x:,.2f}"

# ------------------------------------------------------------------ master data
def uom(role, d, code, name):
    emit(role, d, "Master Data → Units of measure → Add unit", f"Code <b>{code}</b>, name <i>{name}</i>.", dict(k="uom", code=code, name=name))
def conv(role, d, item, frm, to, factor):
    emit(role, d, "Master Data → Conversions → Add conversion", f"For <b>{item}</b>: 1 <b>{frm}</b> = <b>{factor}</b> <b>{to}</b>.", dict(k="conv", sku=item, to=to, f=factor, **{"from": frm}))
UOM = {}
def item(role, d, sku, name, u, typ, mb, lead, price=None, batch=False, loc=None, puom=None):
    UOM[sku] = u
    row = dict(k="item", sku=sku, name=name, typ=typ, mb=mb, u=u, lead=lead)
    if price is not None: row["price"] = price
    if batch: row["batch"] = "1"
    if loc: row["loc"] = loc
    tname = {"RAW": "Raw material", "PACKAGING": "Packaging", "SEMI": "Semi-finished", "FINISHED": "Finished good"}[typ]
    extra = []
    if price is not None: extra.append(f"planned price {price}")
    if batch: extra.append("tick <b>Track batches / lots</b>")
    if loc: extra.append(f"usual store {loc}")
    emit(role, d, "Master Data → Items → Add item", f"<b>{sku}</b> {name}, unit {u}, {tname}, {'Buy' if mb == 'BUY' else 'Make'}, lead time {lead} days" + ("; " + ", ".join(extra) if extra else "") + ".", row)
def purchase_unit(role, d, sku, uom_):
    emit(role, d, "Master Data → Items → pencil on " + sku, f"Choose <b>Buy it in {uom_}</b> and save.", dict(k="puom", sku=sku, uom=uom_))
def work_center(role, d, name):
    emit(role, d, "Master Data → Work centers → Add work center", f"Name <b>{name}</b> (leave the other boxes).", dict(k="wc", name=name))
def location(role, d, code, name, kind):
    emit(role, d, "Master Data → Locations → Add location", f"Code <b>{code}</b>, name <i>{name}</i>, kind {kind}.", dict(k="loc", code=code, name=name, kind=kind))
def rate(role, d, wc, kind, r, frm):
    emit(role, d, "Master Data → Activity rates → Add rate", f"<b>{wc}</b>, {'Direct labor' if kind == 'LABOR' else 'Machine time'}, from <b>{frm}</b>, <b>{r}</b> per hour.", dict(k="rate", wc=wc, kind=kind, r=r, frm=frm))
def overhead(role, d, r):
    emit(role, d, "Master Data → Costing sheet → pencil on Fixed overhead", f"<b>Plus ₱ per hour</b> = <b>{r}</b>.", dict(k="oh", r=r))
def bom(role, d, sku, frm, lines):
    comp = " · ".join(f"{c} {qty}" for c, qty in lines)
    emit(role, d, "Master Data → Bills of materials → New BOM", f"<b>{sku}</b>, valid from <b>{frm}</b>: {comp}. Save draft, then Activate.", dict(k="bom", sku=sku, frm=frm, lines=[[c, qty, UOM[c]] for c, qty in lines]))
def routing(role, d, sku, ops):
    txt = "; ".join(f"op {no} {ds} at {wc} ({su}/{ru}/{la}/{ma} min)" for no, ds, wc, su, ru, la, ma in ops)
    emit(role, d, "Master Data → Routings → New routing", f"<b>{sku}</b>: {txt}. Save draft, then Activate.", dict(k="rtg", sku=sku, ops=[list(o) for o in ops]))
def estimate(role, d, sku, lot, date):
    emit(role, d, "Costing → New estimate", f"<b>{sku}</b>, lot size {lot}, costing date <b>{date}</b>: Work out the cost, Mark this cost, Release as standard cost.", dict(k="est", sku=sku, lot=lot, d=date))
def voucher(role, d, ref, part, lines, override=None):
    txt = "; ".join(f"<b>{a}</b> " + (f"debit {money(dr)}" if dr else f"credit {money(cr)}") for a, dr, cr in lines)
    row = dict(k="vch", d=d, ref=ref, part=part, lines=[[a, dr, cr] for a, dr, cr in lines])
    if override: row["ov"] = override
    emit(role, d, "Finance → New journal voucher", f"Date <b>{d}</b>, reference <b>{ref}</b>, particulars <i>{part}</i>: {txt}." + (f" Tick <b>System override / audit adjustment</b>, reason <i>{override}</i>: it then waits for the Finance manager." if override else ""), row)
def reverse_voucher(role, d, ref, reason):
    emit(role, d, "Finance → open the voucher → Reverse", f"Reverse the posted voucher with reference <b>{ref}</b>, date <b>{d}</b>, reason <i>{reason}</i>.", dict(k="rvch", ref=ref, d=d, reason=reason))
def approve_voucher(d, ref):
    emit("FINANCE_MANAGER", d, "Finance → open the voucher → Approve", f"Approve the voucher with reference <b>{ref}</b> (you must not be the one who prepared it).", dict(k="nop"))
def customer(role, d, name):
    emit(role, d, "Sales → Customers → New customer", f"<b>{name}</b>.", dict(k="cust", name=name))
def asset(role, d, name, cost, salv, life):
    emit(role, d, "Fixed Assets → New fixed asset", f"<b>{name}</b>, purchase date {d}, cost {money(cost)}, salvage {money(salv)}, life {life} months.", dict(k="asset", name=name, d=d, cost=cost, salv=salv, life=life))
def depreciation(role, d, name, amt):
    emit(role, d, "Fixed Assets → Record 1 month dep.", f"<b>{name}</b>, date <b>{d}</b> (it proposes the month-end): {money(amt)}.", dict(k="dep", name=name, amt=amt, d=d))

# ------------------------------------------------------------------ sales
def sales_order(role, n, d, cust, lines):
    sub = sum(qty * pr for s, qty, pr in lines)
    txt = " · ".join(f"{s} {qty} @ {pr:,}" for s, qty, pr in lines)
    emit(role, d, "Sales → Sales Orders → New sales order", f"<b>SO-{n:04d}</b> {cust}, date {d}: {txt}; tax rate 12; total <b>₱{money(sub * 1.12)}</b>. Save, then Confirm.", dict(k="so", n=n, cust=cust, d=d, lines=[list(l) for l in lines]))
def deliver(role, so, d, cust, lines, due, invoice_n):
    txt = " · ".join(f"{s} {qty}" for s, qty in lines)
    emit("WAREHOUSE", d, "Shipping → click the order → Post delivery", f"<b>SO-{so:04d}</b> {cust}: deliver {txt}, delivery date <b>{d}</b>.", dict(k="dlv", so=so, d=d, lines=[list(l) for l in lines]))
    emit(role, d, "Shipping → click the order → Create invoice for what was delivered", f"<b>SO-{so:04d}</b>: invoice date <b>{d}</b>, due <b>{due}</b> → creates <b>INV-{invoice_n:04d}</b>.", dict(k="invso", so=so, due=due, d=d))
    emit(role, d, "Sales → Invoices → Send invoice", f"Send <b>INV-{invoice_n:04d}</b> ({cust}).", dict(k="send", inv=invoice_n))
def receive_payment(role, inv, d, amount, who):
    row = dict(k="payinv", inv=inv, d=d)
    if amount is not None: row["amt"] = amount
    emit(role, d, "Sales → Invoices → Details → Record payment", f"<b>INV-{inv:04d}</b> ({who}): {'the whole balance' if amount is None else money(amount)}, date <b>{d}</b>, Bank transfer.", row)

# ------------------------------------------------------------------ planning / purchasing / warehouse
def mrp(role, d, frm):
    emit(role, d, "Planning → Run planning", f"Plan from <b>{frm}</b>, then <b>Run planning</b>.", dict(k="mrp", frm=frm))
def make_planned(role, d):
    emit(role, d, "Planning → Planned orders → Make selected", "Tick the box at the top of the table, then <b>Make selected</b>: every open planned order becomes a production order.", dict(k="mkplan"))
def reqs_to_po(role, d, vendor, items_prices, n_po):
    names = ", ".join(i for i, p in items_prices)
    prices = " · ".join(f"{i} {p}" for i, p in items_prices)
    emit(role, d, "Planning → Purchase requisitions → Create purchase order…", f"Vendor <b>{vendor}</b> (type it in the new-vendor box the first time). Tick: {names}. Prices: {prices} → creates <b>PO-{n_po:04d}</b>.", dict(k="reqpo", vendor=vendor, prices=[list(p) for p in items_prices]))
def manual_po(role, d, vendor, lines, expected, n_po):
    """lines = [(sku, qty, price, uom_or_None)]"""
    txt = " · ".join(f"{s} {qty}{(' ' + u) if u else ''} @ {pr}" for s, qty, pr, u in lines)
    emit(role, d, "Purchasing → New purchase order", f"Vendor <b>{vendor}</b>, order date {d}, expected {expected}: {txt} → <b>PO-{n_po:04d}</b>.", dict(k="po", vendor=vendor, d=d, exp=expected, lines=[list(l) for l in lines]))
def delete_req(role, d, sku):
    emit(role, d, "Planning → Purchase requisitions → Delete", f"Delete the open requisition for <b>{sku}</b> (you ordered it by hand in bundles).", dict(k="delreq", sku=sku))
def receipt(n_po, d, vendor, qty_by_sku, lot=None, quarantine=()):
    txt = " · ".join(f"{sk} {qty}" for sk, qty in qty_by_sku.items())
    ex = []
    if quarantine: ex.append("goes to QUARANTINE by itself: " + ", ".join(quarantine))
    if lot: ex.append("lot/expiry: " + "; ".join(f"{sk} {a} exp {b}" for sk, (a, b) in lot.items()))
    lines = [[sk, qty, 1 if sk in quarantine else 0, lot[sk][0] if lot and sk in lot else None, lot[sk][1] if lot and sk in lot else None] for sk, qty in qty_by_sku.items()]
    emit("WAREHOUSE", d, "Purchasing → Receive", f"<b>PO-{n_po:04d}</b> ({vendor}): receipt date <b>{d}</b>: {txt}" + (" (" + "; ".join(ex) + ")" if ex else "") + ".", dict(k="rcpt", po=n_po, d=d, lines=lines))
def vendor_invoice(n_vi, n_po, d, ref, due, price_over=None, role="ACCOUNTANT"):
    row = dict(k="vinv", po=n_po, ref=ref, d=d, due=due)
    if price_over: row["over"] = list(price_over)
    emit(role, d, "Purchasing → Enter vendor invoice", f"<b>PO-{n_po:04d}</b>, invoice number <b>{ref}</b>, invoice date <b>{d}</b>, due <b>{due}</b>, VAT 12 → <b>VI-{n_vi:04d}</b>." + (f" Type price {price_over[1]} for {price_over[0]}: it goes ON HOLD." if price_over else ""), row)
def pay_bill(n_vi, d, amount, role="PURCHASING"):
    row = dict(k="paybill", vi=n_vi, d=d)
    if amount is not None: row["amt"] = amount
    emit(role, d, "Purchasing → Vendor invoices → Pay", f"<b>VI-{n_vi:04d}</b>: {'the whole balance' if amount is None else money(amount)}, date <b>{d}</b>, Bank transfer.", row)

# ------------------------------------------------------------------ production
def release(d, sku, k):
    emit("PRODUCTION", d, "Production → click the order → Release", f"Release the production order for <b>{sku}</b> (number {k} of that item).", dict(k="rel", sku=sku, ok=k))
def issue(d, sku, k):
    emit("WAREHOUSE", d, "Production → the order → Materials → Issue material to the order", f"<b>{sku}</b> order {k}: set the Date to <b>{d}</b> FIRST, leave every quantity as proposed, then click the button.", dict(k="iss", sku=sku, ok=k, d=d))
def confirm(d, sku, k, op, good, scrap, reason, setup, labor, machine, final):
    emit("PRODUCTION", d, "Production → the order → Confirm production", f"<b>{sku}</b> order {k}: operation <b>{op}</b>, good {good}, scrapped {scrap}" + (f" (<i>{reason}</i>)" if scrap else "") + f", labor {labor} h, machine {machine} h, setup {setup} h, date <b>{d}</b>" + (", <b>tick the final confirmation</b>" if final else "") + ".",
         dict(k="cnf", sku=sku, ok=k, op=op, good=good, scrap=scrap, why=reason if scrap else None, setup=setup, labor=labor, machine=machine, final=bool(final), d=d))
QCFG = set()   # finished goods that are inspected when they are made (they must be received into QUARANTINE)
def fg_receipt(d, sku, k, qty):
    qc = sku in QCFG
    emit("PRODUCTION", d, "Production → the order → Finished goods into stock", f"<b>{sku}</b> order {k}: quantity <b>{qty}</b>, date <b>{d}</b>" + (", store <b>QUARANTINE</b> (the lamp is inspected before it can be sold)" if qc else "") + ".", dict(k="fgr", sku=sku, ok=k, qty=qty, d=d, q="1" if qc else "0"))
def new_order(d, sku, qty, start, end):
    emit("PRODUCTION", d, "Production → New order", f"Item <b>{sku}</b>, quantity <b>{qty}</b>, starts <b>{start}</b>, finishes <b>{end}</b> (a rush order made by hand).", dict(k="new", sku=sku, qty=qty, start=start, end=end))
def settle_order(d, sku, k, role="ACCOUNTANT"):
    emit(role, d, "Production → the order → Settle order", f"<b>{sku}</b> order {k}: settlement date <b>{d}</b>.", dict(k="stl", sku=sku, ok=k, d=d))

# ------------------------------------------------------------------ quality
def inspection_plan(d, sku, chars, receipt=True, prod=False):
    txt = "; ".join(f"{c} ({u}) {lo if lo is not None else '—'} to {hi if hi is not None else '—'}" for c, u, lo, hi in chars)
    emit("QUALITY", d, "Quality → Plans and settings", f"Item <b>{sku}</b>: tick <b>{'Inspect when it is bought' if receipt else 'Inspect when it is made'}</b>, Save these settings; characteristics: {txt}; Save the plan.",
         dict(k="plan", sku=sku, chars=[list(c) for c in chars], rcpt="1" if receipt else "0", prod="1" if prod else "0"))
    if prod: QCFG.add(sku)
def inspect(d, sku, k, results, accept, scrap, ret, cause, note, rework=0):
    txt = ", ".join(f"{c} {v}" for c, v in results)
    emit("QUALITY", d, "Quality → Inspection lots → the waiting lot", f"<b>{sku}</b> lot {k}: measured {txt} → Save measurements. Decision: accept <b>{accept}</b>" + (f", scrap {scrap}" if scrap else "") + (f", return {ret}" if ret else "") + (f", rework {rework}" if rework else "") + (f", root cause {cause}" if cause else "") + f", date <b>{d}</b>" + (f", note <i>{note}</i>" if note else "") + ".",
         dict(k="insp", sku=sku, res=[list(r) for r in results], acc=accept, scr=scrap, ret=ret, rwk=rework, cause=cause, note=note, d=d))
def close_ncr(d, sku, action):
    emit("QUALITY", d, "Quality → Non-conformances → the open report → Close the report", f"<b>{sku}</b>: corrective action <i>{action}</i>.", dict(k="ncr", sku=sku, action=action))

# ------------------------------------------------------------------ period end
def settle_month(role, d, month):
    emit(role, d, "Period End → Settle…", f"<b>{month}</b>: read the checks, Post the month-end entries.", dict(k="settle", month=month))
def close_month(role, d, month):
    emit(role, d, "Period End → Close month", f"Close <b>{month}</b> (oldest first).", dict(k="close", month=month))

# ------------------------------------------------------------------ more macros (landed cost, stock moves, downtime, held invoices) and the dated event list
def landed_cost(d, vendor, ref, due, amount, what, sku, rdate):
    emit("ACCOUNTANT", d, "Purchasing → Add landed cost", f"Vendor <b>{vendor}</b>, invoice no. <b>{ref}</b>, <i>{what}</i>, date {d}, due {due}, amount before VAT <b>{money(amount)}</b>, VAT 12, spread by value; tick only the <b>{sku}</b> line of the receipt dated <b>{rdate}</b>.",
         dict(k="lcost", vendor=vendor, ref=ref, d=d, due=due, amt=amount, what=what, sku=sku, rd=rdate))
def stock_adjust(d, sku, loc, qty, reason, batch=None, expiry=None, cost=None):
    row = dict(k="adj", sku=sku, loc=loc, qty=qty, reason=reason, d=d)
    if batch: row["batch"] = batch
    if expiry: row["expiry"] = expiry
    if cost is not None: row["cost"] = cost
    emit("WAREHOUSE", d, "Inventory → Stock → Adjust stock", f"<b>{sku}</b> in {loc}: change <b>{qty}</b>, reason <i>{'Stock count' if reason == 'COUNT' else 'Opening balance'}</i>, date <b>{d}</b>" + (f", lot {batch}" if batch else "") + ".", row)
def transfer(d, sku, frm, to, qty):
    emit("WAREHOUSE", d, "Inventory → Stock → Move stock", f"Move <b>{qty}</b> of <b>{sku}</b> from {frm} to {to}, date <b>{d}</b>.", dict(k="xfer", sku=sku, **{"from": frm}, to=to, qty=qty, d=d))
def downtime(d, wc, hours, cat, note):
    emit("PRODUCTION", d, "Shop Floor → Downtime → Log it", f"<b>{wc}</b>, day <b>{d}</b>, {hours} hours, reason {cat.title().replace('_', ' ')}, note <i>{note}</i>.", dict(k="down", wc=wc, d=d, h=hours, cat=cat, note=note))
def approve_held(d, n_vi):
    emit("FINANCE_MANAGER", d, "Purchasing → Vendor invoices → the invoice ON HOLD → Approve", f"Approve <b>VI-{n_vi:04d}</b>: the price difference is accepted (you must not be the person who entered it).", dict(k="apprh", vi=n_vi))
def reject_held(d, n_vi, reason, rdate):
    emit("FINANCE_MANAGER", d, "Purchasing → Vendor invoices → the invoice ON HOLD → Reject", f"Reject <b>VI-{n_vi:04d}</b>, reason <i>{reason}</i>, date {rdate}.", dict(k="rejh", vi=n_vi, reason=reason))
def reverse_conf(d, sku, k, reason):
    emit("PRODUCTION", d, "Production → the order → Reverse (on the wrong confirmation)", f"<b>{sku}</b> order {k}: reverse the last confirmation, reason <i>{reason}</i>, date <b>{d}</b>.", dict(k="revc", sku=sku, ok=k, reason=reason, d=d))

EV = []
def at(d, fn, *a, **k):
    EV.append((d, len(EV), fn, a, k))
def flush():
    for d, _, fn, a, k in sorted(EV, key=lambda e: (e[0], e[1])): fn(*a, **k)
    EV.clear()

# ===================================================================== THE SCENARIO
exec(open(__file__.replace("gen.py", "scenario.py")).read())

# ===================================================================== OUTPUT
DECL = "p_scratch boolean := {scratch}; p_rows jsonb; v_t uuid; tmp uuid; a jsonb; iid uuid; ord uuid; pid uuid; sid uuid; vid uuid; nid uuid; vend uuid; me uuid;"
DISPATCH = open(__file__.replace("gen.py", "dispatcher.sql")).read()
def dispatch_for(kinds):
    """the dispatcher with only the branches the given step kinds need (keeps test calls short; the loader function uses all of them)"""
    import re
    lines = DISPATCH.split("\n"); out = []; keep = True
    for ln in lines:
        m = re.match(r"^    when '(\w+)' then", ln)
        if m: keep = m.group(1) in kinds
        elif re.match(r"^    else$", ln): keep = True
        elif re.match(r"^    -- -{10}", ln): continue
        if keep: out.append(ln)
    return "\n".join(out)
def rows_json(a, b):
    return "[" + ",\n".join(json.dumps(dict(s["row"]), separators=(",", ":"), ensure_ascii=False) for s in STEPS[a - 1:b]) + "]"
if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "count"
    if mode == "rows":
        print(rows_json(int(sys.argv[2]), int(sys.argv[3])))
    elif mode == "do":
        a, b = int(sys.argv[2]), int(sys.argv[3])
        tenant = sys.argv[4] if len(sys.argv) > 4 else "93c9f7b9-883e-464c-a1e1-5c7575f84520"
        print("do $t$\ndeclare " + DECL.replace("{scratch}", "true") + "\nbegin\n  me := 'e42040af-4f1a-48e4-bcef-a0615e57f2b1'; v_t := '" + tenant + "'; p_rows := $j$" + rows_json(a, b) + "$j$::jsonb;")
        print("  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, false);\n  update profiles set tenant_id = v_t where id = me;\n  execute 'set local role authenticated';")
        print(dispatch_for({s["row"]["k"] for s in STEPS[a - 1:b]}) + "end $t$;")
    elif mode == "func":
        print("create or replace function mfg__load_activity_3(p_tenant uuid)\nreturns jsonb as $$\ndeclare " + DECL.replace("{scratch}", "false") + "\nbegin\n  v_t := p_tenant; p_rows := $j$" + rows_json(1, len(STEPS)) + "$j$::jsonb;")
        print(DISPATCH)
        print("  insert into mfg_audit_log (tenant_id, event, detail, created_by) values (v_t, 'activity_key_loaded', jsonb_build_object('activity', 'activity-3-manufacturing'), auth.uid());\n  return jsonb_build_object('activity', 'activity-3-manufacturing');\nend;\n$$ language plpgsql security definer set search_path = public;")
    elif mode == "handout":
        json.dump([{k: s[k] for k in ("n", "role", "date", "where", "what")} for s in STEPS], open(__file__.replace("gen.py", "rows.json"), "w"), ensure_ascii=False, indent=1)
        print(len(STEPS), "steps")
    elif mode == "count":
        from collections import Counter
        print(len(STEPS), dict(Counter(s["role"] for s in STEPS)))
