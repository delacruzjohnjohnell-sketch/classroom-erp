# The Capiz Lantern Works scenario. Executed by gen.py (all macros are defined there).
# Roles: PURCHASING WAREHOUSE PRODUCTION QUALITY SALES ACCOUNTANT FINANCE_MANAGER
P, W, PR, QA, S, AC, FM = "PURCHASING", "WAREHOUSE", "PRODUCTION", "QUALITY", "SALES", "ACCOUNTANT", "FINANCE_MANAGER"

# ============================================================ A. SET UP (Feb 1, 2027)
D0 = "2027-02-01"
# --- Production: units, locations, items
uom(PR, D0, "BDL", "Bundle")
RAW = [
    ("CAP-SH", "Capiz shell sheets", "KG", "RAW", "BUY", 5, 420, False, None, "BDL"),
    ("WIR-FR", "Steel wire frame", "PC", "RAW", "BUY", 4, 35, False, None, None),
    ("BRS-RD", "Brass rod", "M", "RAW", "BUY", 4, 85, False, None, None),
    ("BRS-FT", "Brass fitting set", "PC", "RAW", "BUY", 4, 60, False, None, None),
    ("LED-KT", "LED kit", "PC", "RAW", "BUY", 6, 150, False, None, None),
    ("CRD-SW", "Cord and switch set", "PC", "RAW", "BUY", 6, 55, False, None, None),
    ("GLU-AD", "Adhesive", "L", "RAW", "BUY", 3, 190, False, None, None),
    ("CLR-CT", "Clear coat", "L", "RAW", "BUY", 3, 260, True, None, None),
    ("CTN-LP", "Lamp carton", "PC", "PACKAGING", "BUY", 3, 38, False, None, None),
    ("FOM-PD", "Foam padding", "PC", "PACKAGING", "BUY", 3, 12, False, None, None),
]
# the conversion must exist before an item can be bought in bundles
conv_done = False
for sku, name, u, typ, mb, lead, price, batch, loc, puom in RAW:
    if puom and not conv_done:
        item(PR, D0, sku, name, u, typ, mb, lead, price=price, batch=batch, loc=loc, puom=None)
        conv(PR, D0, "CAP-SH", "BDL", "KG", 5)
        purchase_unit(PR, D0, "CAP-SH", "BDL")
        conv_done = True
    else:
        item(PR, D0, sku, name, u, typ, mb, lead, price=price, batch=batch, loc=loc, puom=None)
SEMI = [("SHD-S", "Small capiz shade", 2), ("SHD-L", "Large capiz shade", 2), ("BAS-BR", "Brass base", 2)]
for sku, name, lead in SEMI:
    item(PR, D0, sku, name, "PC", "SEMI", "MAKE", lead, loc="RM-STORE")
FIN = [("PEN-S", "Small pendant lamp", 3), ("PEN-L", "Large pendant lamp", 3), ("TBL-LP", "Table lamp", 3), ("FLR-LP", "Floor lamp", 4), ("CHD-4", "Four-arm chandelier", 5)]
for sku, name, lead in FIN:
    item(PR, D0, sku, name, "PC", "FINISHED", "MAKE", lead)
for wc in ("Cutting", "Assembly", "Finishing", "Packing"):
    work_center(PR, D0, wc)
location(PR, D0, "STORE-B", "Second raw material store", "RM")

# --- Accountant: rates, overhead
for wc, mach in (("Cutting", 45), ("Assembly", 20), ("Finishing", 35), ("Packing", 10)):
    rate(AC, D0, wc, "LABOR", 75, D0)
    rate(AC, D0, wc, "MACHINE", mach, D0)
overhead(AC, D0, 25)

# --- Production: bills and routings (semi-finished first)
bom(PR, D0, "SHD-S", D0, [("CAP-SH", 0.4), ("WIR-FR", 1), ("GLU-AD", 0.05), ("CLR-CT", 0.04)])
bom(PR, D0, "SHD-L", D0, [("CAP-SH", 0.9), ("WIR-FR", 2), ("GLU-AD", 0.1), ("CLR-CT", 0.08)])
bom(PR, D0, "BAS-BR", D0, [("BRS-RD", 0.6), ("BRS-FT", 1)])
bom(PR, D0, "PEN-S", D0, [("SHD-S", 1), ("LED-KT", 1), ("CRD-SW", 1), ("CTN-LP", 1), ("FOM-PD", 1)])
bom(PR, D0, "PEN-L", D0, [("SHD-L", 1), ("LED-KT", 1), ("CRD-SW", 1), ("CTN-LP", 1), ("FOM-PD", 2)])
bom(PR, D0, "TBL-LP", D0, [("SHD-S", 1), ("BAS-BR", 1), ("LED-KT", 1), ("CRD-SW", 1), ("CTN-LP", 1), ("FOM-PD", 1)])
bom(PR, D0, "FLR-LP", D0, [("SHD-L", 1), ("BAS-BR", 1), ("BRS-RD", 1.2), ("LED-KT", 1), ("CRD-SW", 1), ("CTN-LP", 1), ("FOM-PD", 2)])
bom(PR, D0, "CHD-4", D0, [("SHD-S", 4), ("BRS-RD", 2), ("BRS-FT", 2), ("LED-KT", 4), ("CRD-SW", 1), ("CTN-LP", 2), ("FOM-PD", 3)])
routing(PR, D0, "SHD-S", [(10, "Cut the capiz", "Cutting", 30, 18, 18, 12), (20, "Assemble the shade", "Assembly", 15, 24, 24, 6)])
routing(PR, D0, "SHD-L", [(10, "Cut the capiz", "Cutting", 30, 30, 30, 21), (20, "Assemble the shade", "Assembly", 15, 42, 42, 9)])
routing(PR, D0, "BAS-BR", [(10, "Cut the brass", "Cutting", 30, 12, 12, 9), (20, "Polish and lacquer", "Finishing", 15, 18, 18, 12)])
routing(PR, D0, "PEN-S", [(10, "Wire and fit", "Assembly", 15, 12, 12, 3), (20, "Pack", "Packing", 12, 6, 6, 0)])
routing(PR, D0, "PEN-L", [(10, "Wire and fit", "Assembly", 15, 18, 18, 3), (20, "Pack", "Packing", 12, 9, 9, 0)])
routing(PR, D0, "TBL-LP", [(10, "Wire and fit", "Assembly", 15, 21, 21, 3), (20, "Finish the base", "Finishing", 15, 9, 9, 6), (30, "Pack", "Packing", 12, 6, 6, 0)])
routing(PR, D0, "FLR-LP", [(10, "Wire and fit", "Assembly", 15, 30, 30, 6), (20, "Finish the stand", "Finishing", 15, 15, 15, 9), (30, "Pack", "Packing", 12, 9, 9, 0)])
routing(PR, D0, "CHD-4", [(10, "Wire and fit", "Assembly", 30, 60, 60, 12), (20, "Finish the arms", "Finishing", 15, 30, 30, 18), (30, "Pack", "Packing", 12, 15, 15, 0)])

# --- Accountant: standard costs (semi-finished first)
for sku, lot in (("SHD-S", 20), ("SHD-L", 20), ("BAS-BR", 20), ("PEN-S", 20), ("PEN-L", 20), ("TBL-LP", 20), ("FLR-LP", 10), ("CHD-4", 10)):
    estimate(AC, D0, sku, lot, D0)

# --- Sales: customers
for c in ("Manila Lamp House", "Cebu Interiors", "Davao Design Hub", "Baguio Gifts", "Iloilo Decor", "Cagayan Lighting"):
    customer(S, D0, c)

# --- Accountant: capital and the machine
voucher(AC, D0, "Capital", "Owner puts in the starting cash", [("1000", 1500000, None), ("3000", None, 1500000)])
voucher(AC, D0, "Cutter", "Bought a capiz cutting machine for cash", [("1500", 360000, None), ("1000", None, 360000)])
asset(AC, D0, "Capiz cutting machine", 360000, 36000, 48)

# ============================================================ B. FEBRUARY ORDERS AND FIRST PLANNING RUN
sales_order(S, 1, "2027-02-02", "Manila Lamp House", [("PEN-S", 40, 1450), ("PEN-L", 20, 2350), ("TBL-LP", 30, 1850)])
sales_order(S, 2, "2027-02-03", "Cebu Interiors", [("PEN-L", 30, 2400), ("FLR-LP", 12, 3950)])
sales_order(S, 3, "2027-02-05", "Davao Design Hub", [("CHD-4", 6, 9800), ("PEN-S", 25, 1450)])
sales_order(S, 4, "2027-02-08", "Baguio Gifts", [("TBL-LP", 20, 1900), ("PEN-S", 30, 1480)])
sales_order(S, 5, "2027-02-10", "Iloilo Decor", [("FLR-LP", 8, 4100), ("CHD-4", 4, 10200), ("PEN-L", 10, 2400)])
mrp(PR, "2027-02-10", "2027-02-01")

# ============================================================ C. FEBRUARY BUYING (Feb 11 - 24)
# vendors: V1 capiz, V2 metal, V3 electronics, V4 chemicals, V5 packaging
V1, V2, V3, V4, V5 = "Bohol Capiz Traders", "Cebu Metalworks", "Manila Electronics", "Laguna Chemicals", "Pasig Packaging"
D = "2027-02-11"
delete_req(P, D, "CAP-SH")
manual_po(P, D, V1, [("CAP-SH", 31, 2100, "BDL")], "2027-02-18", 1)                     # PO-0001 (31 bundles = 155 kg, a little over the 146 kg planned)
reqs_to_po(P, D, V2, [("WIR-FR", 35), ("BRS-RD", 85), ("BRS-FT", 60)], 2)                   # PO-0002
reqs_to_po(P, D, V3, [("LED-KT", 150), ("CRD-SW", 55)], 3)                                  # PO-0003
reqs_to_po(P, D, V4, [("GLU-AD", 190), ("CLR-CT", 260)], 4)                                 # PO-0004
reqs_to_po(P, D, V5, [("CTN-LP", 38), ("FOM-PD", 12)], 5)                                   # PO-0005
# quality plans before the first receipt
inspection_plan("2027-02-11", "CAP-SH", [("Moisture", "%", None, 12)])
inspection_plan("2027-02-11", "LED-KT", [("Voltage", "V", 11.5, 12.5), ("Lumens", "lm", 800, None)])
# receipts
receipt(1, "2027-02-12", V1, {"CAP-SH": 90}, quarantine=("CAP-SH",))
receipt(2, "2027-02-12", V2, {"WIR-FR": 345, "BRS-RD": 86, "BRS-FT": 90})
receipt(4, "2027-02-12", V4, {"GLU-AD": 17.25, "CLR-CT": 13.8}, lot={"CLR-CT": ("CC-0227-A", "2028-02-28")})
receipt(5, "2027-02-13", V5, {"CTN-LP": 245, "FOM-PD": 335})
receipt(3, "2027-02-14", V3, {"LED-KT": 150, "CRD-SW": 235}, quarantine=("LED-KT",))
inspect("2027-02-13", "CAP-SH", 1, [("Moisture", 10.5)], 90, 0, 0, None, None)
inspect("2027-02-14", "LED-KT", 1, [("Voltage", 12.1), ("Lumens", 850)], 150, 0, 0, None, None)
receipt(1, "2027-02-18", V1, {"CAP-SH": 65}, quarantine=("CAP-SH",))
inspect("2027-02-18", "CAP-SH", 2, [("Moisture", 13.4)], 60, 0, 5, "MATERIAL", "Sheets damp at one end; 5 kg returned")
close_ncr("2027-02-18", "CAP-SH", "Vendor to dry the sheets before loading; moisture to be measured on arrival")
receipt(3, "2027-02-19", V3, {"LED-KT": 115}, quarantine=("LED-KT",))
inspect("2027-02-19", "LED-KT", 2, [("Voltage", 12.9), ("Lumens", 790)], 105, 0, 10, "SUPPLIER", "Voltage over the limit on 10 kits; returned")
close_ncr("2027-02-19", "LED-KT", "Vendor to test every kit before packing; sample test on arrival")

# ============================================================ D. FEBRUARY PRODUCTION (chronological)
# per-op standard minutes (setup, labor/unit, machine/unit) used to type realistic hours
ROUT = {
    "SHD-S": [(10, 30, 18, 12), (20, 15, 24, 6)], "SHD-L": [(10, 30, 30, 21), (20, 15, 42, 9)], "BAS-BR": [(10, 30, 12, 9), (20, 15, 18, 12)],
    "PEN-S": [(10, 15, 12, 3), (20, 12, 6, 0)], "PEN-L": [(10, 15, 18, 3), (20, 12, 9, 0)],
    "TBL-LP": [(10, 15, 21, 3), (20, 15, 9, 6), (30, 12, 6, 0)], "FLR-LP": [(10, 15, 30, 6), (20, 15, 15, 9), (30, 12, 9, 0)], "CHD-4": [(10, 30, 60, 12), (20, 15, 30, 18), (30, 12, 15, 0)],
}
def op(d, sku, k, idx, good, scrap=0, reason=None, labor_x=1.0, machine_x=1.0):
    no, su, la, ma = ROUT[sku][idx]
    last = idx == len(ROUT[sku]) - 1
    units = good + scrap
    confirm(d, sku, k, no, good, scrap, reason, round(su / 60, 2), round(la * units / 60 * labor_x, 2), round(ma * units / 60 * machine_x, 2), last)
def start(d_rel, d_iss, sku, k):
    release(d_rel, sku, k)
    issue(d_iss, sku, k)

make_planned(PR, "2027-02-12")
start("2027-02-13", "2027-02-13", "SHD-S", 1)
op("2027-02-13", "SHD-S", 1, 0, 185)
op("2027-02-14", "SHD-S", 1, 1, 180, 5, "Cracked capiz sheets")
fg_receipt("2027-02-14", "SHD-S", 1, 180)
start("2027-02-14", "2027-02-14", "BAS-BR", 1)
op("2027-02-14", "BAS-BR", 1, 0, 70)
op("2027-02-15", "BAS-BR", 1, 1, 70)
fg_receipt("2027-02-15", "BAS-BR", 1, 70)
start("2027-02-15", "2027-02-15", "PEN-S", 1)
op("2027-02-16", "PEN-S", 1, 0, 65)
# a new customer order arrives mid-month, so planning is run again
sales_order(S, 6, "2027-02-16", "Cagayan Lighting", [("TBL-LP", 15, 1880), ("PEN-S", 20, 1450)])
mrp(PR, "2027-02-16", "2027-02-16")

# ============================================================ E. FEBRUARY, SECOND HALF (events are listed by date; flush() puts them in date order)
A = lambda d, fn, *a, **k: at(d, lambda: fn(*a, **k))
F = "2027-02-"
# --- Feb 13-15: vendor invoices for the first deliveries, and the freight bill
A(F+"13", vendor_invoice, 1, 2, F+"13", "CM-1021", "2027-03-15")
A(F+"14", vendor_invoice, 2, 4, F+"14", "LC-5510", "2027-03-16")
A(F+"15", vendor_invoice, 3, 5, F+"15", "PP-0870", "2027-03-17")
A(F+"15", landed_cost, F+"15", V1, "BCT-F-880", "2027-03-15", 3600, "Sea freight, Bohol to Cebu", "CAP-SH", F+"12")
# --- Feb 16: second planning run -> second round of buying
A(F+"16", make_planned, PR, F+"16")
A(F+"16", delete_req, P, F+"16", "CAP-SH")
A(F+"16", manual_po, P, F+"16", V1, [("CAP-SH", 3, 2100, "BDL")], F+"20", 6)
A(F+"16", reqs_to_po, P, F+"16", V2, [("BRS-FT", 60), ("BRS-RD", 85), ("WIR-FR", 35)], 7)
A(F+"16", reqs_to_po, P, F+"16", V3, [("LED-KT", 150), ("CRD-SW", 55)], 8)
A(F+"16", reqs_to_po, P, F+"16", V4, [("CLR-CT", 260), ("GLU-AD", 190)], 9)
A(F+"16", reqs_to_po, P, F+"16", V5, [("CTN-LP", 38), ("FOM-PD", 12)], 10)
# --- Feb 17-19: finish pendants, tables, first chandeliers, large shades
A(F+"17", op, F+"17", "PEN-S", 1, 1, 65)
A(F+"17", fg_receipt, F+"17", "PEN-S", 1, 65)
A(F+"17", start, F+"17", F+"17", "TBL-LP", 1)
A(F+"17", op, F+"17", "TBL-LP", 1, 0, 30)
A(F+"18", op, F+"18", "TBL-LP", 1, 1, 30)
A(F+"18", op, F+"18", "TBL-LP", 1, 2, 30)
A(F+"18", fg_receipt, F+"18", "TBL-LP", 1, 30)
A(F+"17", start, F+"17", F+"17", "CHD-4", 1)
A(F+"18", op, F+"18", "CHD-4", 1, 0, 6)
A(F+"19", op, F+"19", "CHD-4", 1, 1, 6)
A(F+"19", op, F+"19", "CHD-4", 1, 2, 6)
A(F+"19", fg_receipt, F+"19", "CHD-4", 1, 6)
A(F+"18", downtime, F+"18", "Cutting", 4, "BREAKDOWN", "Saw blade snapped")
A(F+"18", start, F+"18", F+"18", "SHD-L", 1)
A(F+"18", op, F+"18", "SHD-L", 1, 0, 80)
A(F+"19", op, F+"19", "SHD-L", 1, 1, 80)
A(F+"19", fg_receipt, F+"19", "SHD-L", 1, 80)
# --- Feb 19-20: second-round receipts and inspections
A(F+"19", receipt, 7, F+"19", V2, {"BRS-FT": 15, "BRS-RD": 9, "WIR-FR": 40})
A(F+"19", receipt, 9, F+"19", V4, {"GLU-AD": 2, "CLR-CT": 1.6}, lot={"CLR-CT": ("CC-0227-B", "2028-02-28")})
A(F+"19", receipt, 10, F+"19", V5, {"CTN-LP": 35, "FOM-PD": 35})
A(F+"20", receipt, 6, F+"20", V1, {"CAP-SH": 15}, quarantine=("CAP-SH",))
A(F+"20", inspect, F+"20", "CAP-SH", 3, [("Moisture", 10.8)], 15, 0, 0, None, None)
A(F+"20", receipt, 8, F+"20", V3, {"LED-KT": 35, "CRD-SW": 35}, quarantine=("LED-KT",))
A(F+"20", inspect, F+"20", "LED-KT", 3, [("Voltage", 12.2), ("Lumens", 840)], 35, 0, 0, None, None)
# --- the capiz bundle price went up: the invoice is held, the finance manager decides
A(F+"19", vendor_invoice, 4, 1, F+"19", "BCT-2210", "2027-03-21", price_over=("CAP-SH", 450))
A(F+"20", approve_held, F+"20", 4)
# --- Feb 20-26: more production
A(F+"20", start, F+"20", F+"20", "BAS-BR", 2)
A(F+"20", op, F+"20", "BAS-BR", 2, 0, 15)
A(F+"21", op, F+"21", "BAS-BR", 2, 1, 15)
A(F+"21", fg_receipt, F+"21", "BAS-BR", 2, 15)
A(F+"19", start, F+"19", F+"19", "PEN-L", 1)
A(F+"20", op, F+"20", "PEN-L", 1, 0, 50)
A(F+"20", op, F+"20", "PEN-L", 1, 1, 50)
A(F+"20", fg_receipt, F+"20", "PEN-L", 1, 50)
A(F+"20", start, F+"20", F+"20", "FLR-LP", 1)
A(F+"21", op, F+"21", "FLR-LP", 1, 0, 12)
A(F+"21", op, F+"21", "FLR-LP", 1, 1, 12)
A(F+"22", op, F+"22", "FLR-LP", 1, 2, 12)
A(F+"22", fg_receipt, F+"22", "FLR-LP", 1, 12)
A(F+"21", start, F+"21", F+"21", "CHD-4", 2)
A(F+"22", op, F+"22", "CHD-4", 2, 0, 4)
A(F+"22", op, F+"22", "CHD-4", 2, 1, 4)
A(F+"23", op, F+"23", "CHD-4", 2, 2, 4)
A(F+"23", fg_receipt, F+"23", "CHD-4", 2, 4)
A(F+"21", start, F+"21", F+"21", "SHD-S", 2)
A(F+"21", op, F+"21", "SHD-S", 2, 0, 40)
A(F+"22", op, F+"22", "SHD-S", 2, 1, 40)
A(F+"22", fg_receipt, F+"22", "SHD-S", 2, 40)
A(F+"22", start, F+"22", F+"22", "PEN-S", 2)
A(F+"23", op, F+"23", "PEN-S", 2, 0, 30)
A(F+"23", op, F+"23", "PEN-S", 2, 1, 30)
A(F+"23", fg_receipt, F+"23", "PEN-S", 2, 30)
A(F+"22", start, F+"22", F+"22", "PEN-L", 2)
A(F+"23", op, F+"23", "PEN-L", 2, 0, 10)
A(F+"23", op, F+"23", "PEN-L", 2, 1, 10)
A(F+"23", fg_receipt, F+"23", "PEN-L", 2, 10)
A(F+"23", start, F+"23", F+"23", "TBL-LP", 2)
A(F+"24", op, F+"24", "TBL-LP", 2, 0, 20)
A(F+"24", op, F+"24", "TBL-LP", 2, 1, 20)
A(F+"24", op, F+"24", "TBL-LP", 2, 2, 20)
A(F+"24", fg_receipt, F+"24", "TBL-LP", 2, 20)
A(F+"23", start, F+"23", F+"23", "FLR-LP", 2)
A(F+"24", op, F+"24", "FLR-LP", 2, 0, 8)
A(F+"24", op, F+"24", "FLR-LP", 2, 1, 8)
A(F+"25", op, F+"25", "FLR-LP", 2, 2, 8)
A(F+"25", fg_receipt, F+"25", "FLR-LP", 2, 8)
A(F+"24", start, F+"24", F+"24", "PEN-S", 3)
A(F+"25", op, F+"25", "PEN-S", 3, 0, 20)
A(F+"25", op, F+"25", "PEN-S", 3, 1, 20)
A(F+"25", fg_receipt, F+"25", "PEN-S", 3, 20)
A(F+"25", start, F+"25", F+"25", "TBL-LP", 3)
A(F+"26", op, F+"26", "TBL-LP", 3, 0, 15)
A(F+"26", op, F+"26", "TBL-LP", 3, 1, 15)
A(F+"26", op, F+"26", "TBL-LP", 3, 2, 15)
A(F+"26", fg_receipt, F+"26", "TBL-LP", 3, 15)
A(F+"24", downtime, F+"24", "Assembly", 2, "NO_MATERIAL", "Waiting for LED kits")
A(F+"24", receipt, 3, F+"24", V3, {"LED-KT": 10}, quarantine=("LED-KT",))
A(F+"24", inspect, F+"24", "LED-KT", 4, [("Voltage", 12.0), ("Lumens", 860)], 10, 0, 0, None, None)

# ============================================================ F. FEBRUARY, LAST DAYS (deliveries, invoices, bills, month end)
# --- vendor bills for the second round and the electronics order
A(F+"24", vendor_invoice, 5, 3, F+"24", "ME-7741", "2027-03-24")
A(F+"25", vendor_invoice, 6, 6, F+"25", "BCT-2217", "2027-03-25")
A(F+"25", vendor_invoice, 7, 7, F+"25", "CM-1033", "2027-03-25")
A(F+"25", vendor_invoice, 8, 8, F+"25", "ME-7752", "2027-03-26")
A(F+"26", vendor_invoice, 9, 9, F+"26", "LC-5524", "2027-03-26")
A(F+"26", vendor_invoice, 10, 10, F+"26", "PP-0881", "2027-03-27")
# --- deliveries (Warehouse), invoices created and sent (Sales)
A(F+"26", deliver, S, 1, F+"26", "Manila Lamp House", [("PEN-S", 40), ("PEN-L", 20), ("TBL-LP", 30)], "2027-03-28", 1)
A(F+"26", deliver, S, 2, F+"26", "Cebu Interiors", [("PEN-L", 30), ("FLR-LP", 12)], "2027-03-28", 2)
A(F+"26", deliver, S, 3, F+"26", "Davao Design Hub", [("CHD-4", 6), ("PEN-S", 25)], "2027-03-28", 3)
A(F+"27", deliver, S, 4, F+"27", "Baguio Gifts", [("TBL-LP", 20), ("PEN-S", 30)], "2027-03-29", 4)
A(F+"27", deliver, S, 5, F+"27", "Iloilo Decor", [("FLR-LP", 8), ("CHD-4", 4), ("PEN-L", 10)], "2027-03-29", 5)
A(F+"27", deliver, S, 6, F+"27", "Cagayan Lighting", [("TBL-LP", 15), ("PEN-S", 20)], "2027-03-29", 6)
# --- first payments in: an early payer (Accountant records it)
A(F+"27", receive_payment, AC, 1, F+"27", None, "Manila Lamp House")
# --- paying vendors
A(F+"27", pay_bill, 1, F+"27", None)
A(F+"27", pay_bill, 2, F+"27", None)
A(F+"27", pay_bill, 3, F+"27", None)
# --- stores: the leftover capiz moves to the second store, then a count shows 1 kg of cracked sheets
A(F+"27", transfer, F+"27", "CAP-SH", "RM-STORE", "STORE-B", 3)
A(F+"28", stock_adjust, F+"28", "CAP-SH", "STORE-B", -1, "COUNT")
# --- the month's vouchers
A(F+"27", voucher, AC, F+"27", "Rent Feb", "Workshop rent for February", [("5100", 18000, None), ("1000", None, 18000)])
A(F+"27", voucher, AC, F+"27", "Payroll Feb", "Salaries and wages for February", [("5300", 85000, None), ("1000", None, 85000)])
A(F+"28", voucher, AC, F+"28", "Power Feb", "Electricity for February paid by bank", [("5100", 9500, None), ("1000", None, 9500)], override="Electricity bill higher than the usual limit")
A(F+"28", approve_voucher, F+"28", "Power Feb")
A(F+"28", voucher, AC, F+"28", "Ads Feb", "Facebook ads for the lamp launch", [("5200", 12000, None), ("1000", None, 12000)], override="Launch campaign above the usual limit")
A(F+"28", approve_voucher, F+"28", "Ads Feb")
A(F+"28", depreciation, AC, F+"28", "Capiz cutting machine", 6750)
A(F+"28", voucher, AC, F+"28", "Rounding Feb", "One centavo rounding difference found by the books check", [("1220", 0.01, None), ("5590", None, 0.01)], override="Books check shows 0.01 on Finished goods: standard costs with 3 decimals")
A(F+"28", approve_voucher, F+"28", "Rounding Feb")
# --- settle every production order, then the month
for _sku, _n in (("BAS-BR",2),("SHD-S",2),("SHD-L",1),("PEN-S",3),("PEN-L",2),("TBL-LP",3),("FLR-LP",2),("CHD-4",2)):
    for _k in range(1, _n + 1): A(F+"28", settle_order, F+"28", _sku, _k, role=(AC if _sku in ("BAS-BR", "SHD-S", "SHD-L") else FM))
A(F+"28", settle_month, FM, F+"28", "2027-02")
A(F+"28", close_month, FM, F+"28", "2027-02")
flush()

# ============================================================ G. MARCH (second month). Feb is closed; every order number continues after February's.
M = "2027-03-"
KOFF = {"BAS-BR": 2, "SHD-S": 2, "SHD-L": 1, "PEN-S": 3, "PEN-L": 2, "TBL-LP": 3, "FLR-LP": 2, "CHD-4": 2}   # production orders made in February
# --- Mar 1: the small pendant gets more padding (transit breakage claims), so its bill changes and the standard cost is worked out again
A(M+"01", bom, PR, M+"01", "PEN-S", M+"01", [("SHD-S", 1), ("LED-KT", 1), ("CRD-SW", 1), ("CTN-LP", 1), ("FOM-PD", 2)])
A(M+"01", estimate, AC, M+"01", "PEN-S", 20, M+"01")
A(M+"03", customer, S, M+"03", "Bacolod Home Gallery")
# --- orders from customers
A(M+"01", sales_order, S, 7, M+"01", "Manila Lamp House", [("PEN-S", 50, 1480), ("TBL-LP", 25, 1900)])
A(M+"02", sales_order, S, 8, M+"02", "Cebu Interiors", [("PEN-L", 30, 2400), ("FLR-LP", 10, 4000)])
A(M+"03", sales_order, S, 9, M+"03", "Davao Design Hub", [("CHD-4", 5, 9900), ("TBL-LP", 20, 1900)])
A(M+"04", sales_order, S, 10, M+"04", "Cagayan Lighting", [("PEN-S", 40, 1480), ("PEN-L", 20, 2400)])
A(M+"04", mrp, PR, M+"04", M+"01")
A(M+"04", make_planned, PR, M+"04")
flush()

# --- Mar 4-5: buying for the March orders (PO numbers continue after February's ten)
A(M+"04", delete_req, P, M+"04", "CAP-SH")
A(M+"04", manual_po, P, M+"04", V1, [("CAP-SH", 22, 2100, "BDL")], M+"12", 11)
A(M+"04", reqs_to_po, P, M+"04", V2, [("WIR-FR", 35), ("BRS-RD", 85), ("BRS-FT", 60)], 12)
A(M+"04", reqs_to_po, P, M+"04", V3, [("LED-KT", 156), ("CRD-SW", 55)], 13)               # the vendor raised the LED price from 150 to 156
A(M+"04", reqs_to_po, P, M+"04", V4, [("GLU-AD", 190), ("CLR-CT", 260)], 14)
A(M+"04", reqs_to_po, P, M+"04", V5, [("CTN-LP", 38), ("FOM-PD", 12)], 15)
# --- Mar 5: quality plans: two more bought items and a final test on every finished lamp
A(M+"05", inspection_plan, M+"05", "CLR-CT", [("Viscosity", "s", 20, 35)])
A(M+"05", inspection_plan, M+"05", "BRS-FT", [("Hardness", "HB", 60, 90)])
for _s in ("PEN-S", "PEN-L", "TBL-LP", "FLR-LP", "CHD-4"):
    A(M+"05", inspection_plan, M+"05", _s, [("Switch test", "pass", 1, None), ("Finish defects", "count", None, 2)], receipt=False, prod=True)
# --- Mar 8-12: deliveries from the vendors (some in two parts) and the quality decisions
A(M+"08", receipt, 12, M+"08", V2, {"WIR-FR": 275, "BRS-RD": 55, "BRS-FT": 65}, quarantine=("BRS-FT",))
A(M+"08", receipt, 14, M+"08", V4, {"GLU-AD": 13.75, "CLR-CT": 11}, lot={"CLR-CT": ("CC-0308-A", "2028-03-31")}, quarantine=("CLR-CT",))
A(M+"08", receipt, 15, M+"08", V5, {"CTN-LP": 150, "FOM-PD": 360})
A(M+"08", inspect, M+"08", "BRS-FT", 1, [("Hardness", 72)], 65, 0, 0, None, None)
A(M+"08", inspect, M+"08", "CLR-CT", 1, [("Viscosity", 28)], 11, 0, 0, None, None)
A(M+"09", receipt, 13, M+"09", V3, {"LED-KT": 100, "CRD-SW": 200}, quarantine=("LED-KT",))
A(M+"09", inspect, M+"09", "LED-KT", 1, [("Voltage", 12.0), ("Lumens", 850)], 100, 0, 0, None, None)
A(M+"10", receipt, 11, M+"10", V1, {"CAP-SH": 60}, quarantine=("CAP-SH",))
A(M+"10", inspect, M+"10", "CAP-SH", 1, [("Moisture", 11.2)], 60, 0, 0, None, None)
A(M+"12", receipt, 13, M+"12", V3, {"LED-KT": 115}, quarantine=("LED-KT",))
A(M+"12", inspect, M+"12", "LED-KT", 2, [("Voltage", 12.1), ("Lumens", 770)], 105, 0, 10, "SUPPLIER", "Lumens below the limit on 10 kits; returned")
A(M+"12", close_ncr, M+"12", "LED-KT", "Vendor to test lumens on every kit before packing")
A(M+"12", receipt, 15, M+"12", V5, {"CTN-LP": 55})
A(M+"12", receipt, 11, M+"12", V1, {"CAP-SH": 50}, quarantine=("CAP-SH",))
A(M+"12", inspect, M+"12", "CAP-SH", 2, [("Moisture", 12.9)], 45, 0, 5, "MATERIAL", "Damp sheets, 5 kg returned")
A(M+"12", close_ncr, M+"12", "CAP-SH", "Vendor to dry the sheets before loading")
flush()

# --- Mar 8-13: three more customer orders, then planning is run again (it sees the stock, the open orders and the returns)
A(M+"08", sales_order, S, 11, M+"08", "Baguio Gifts", [("TBL-LP", 30, 1900), ("FLR-LP", 8, 4100), ("PEN-S", 30, 1480)])
A(M+"09", sales_order, S, 12, M+"09", "Iloilo Decor", [("CHD-4", 4, 10200), ("PEN-L", 25, 2400)])
A(M+"10", sales_order, S, 13, M+"10", "Bacolod Home Gallery", [("FLR-LP", 12, 4100), ("PEN-S", 20, 1480)])
A(M+"13", mrp, PR, M+"13", M+"01")
A(M+"13", make_planned, PR, M+"13")
flush()

# --- Mar 13: second round of buying (only what planning still asks for)
A(M+"13", delete_req, P, M+"13", "CAP-SH")
A(M+"13", manual_po, P, M+"13", V1, [("CAP-SH", 18, 2100, "BDL")], M+"18", 16)                # 18 bundles = 90 kg for the 82.9 kg asked (one bundle extra for cracked sheets)
A(M+"13", reqs_to_po, P, M+"13", V2, [("WIR-FR", 35), ("BRS-RD", 85), ("BRS-FT", 60)], 17)
A(M+"13", reqs_to_po, P, M+"13", V3, [("LED-KT", 156), ("CRD-SW", 55)], 18)
A(M+"13", reqs_to_po, P, M+"13", V4, [("GLU-AD", 190), ("CLR-CT", 260)], 19)
A(M+"13", reqs_to_po, P, M+"13", V5, [("CTN-LP", 38), ("FOM-PD", 12)], 20)
# --- Mar 16-18: second deliveries and the quality decisions
A(M+"16", receipt, 17, M+"16", V2, {"WIR-FR": 186, "BRS-RD": 62, "BRS-FT": 58}, quarantine=("BRS-FT",))
A(M+"16", inspect, M+"16", "BRS-FT", 2, [("Hardness", 68)], 58, 0, 0, None, None)
A(M+"16", receipt, 19, M+"16", V4, {"GLU-AD": 9.3, "CLR-CT": 7.44}, lot={"CLR-CT": ("CC-0316-A", "2028-03-31")}, quarantine=("CLR-CT",))
A(M+"16", inspect, M+"16", "CLR-CT", 2, [("Viscosity", 31)], 7.44, 0, 0, None, None)
A(M+"16", receipt, 16, M+"16", V1, {"CAP-SH": 60}, quarantine=("CAP-SH",))
A(M+"16", inspect, M+"16", "CAP-SH", 3, [("Moisture", 10.9)], 60, 0, 0, None, None)
A(M+"17", receipt, 20, M+"17", V5, {"CTN-LP": 133, "FOM-PD": 232})
A(M+"18", receipt, 18, M+"18", V3, {"LED-KT": 141, "CRD-SW": 129}, quarantine=("LED-KT",))
A(M+"18", inspect, M+"18", "LED-KT", 3, [("Voltage", 12.2), ("Lumens", 835)], 141, 0, 0, None, None)
A(M+"18", receipt, 16, M+"18", V1, {"CAP-SH": 30}, quarantine=("CAP-SH",))
A(M+"18", inspect, M+"18", "CAP-SH", 4, [("Moisture", 11.5)], 30, 0, 0, None, None)

# --- March production, in date order (order k = February's count + position)
def mk(sku, i): return KOFF[sku] + i
B1, B2 = mk("BAS-BR", 1), mk("BAS-BR", 2)
S1, S2 = mk("SHD-S", 1), mk("SHD-S", 2)
L1, L2 = mk("SHD-L", 1), mk("SHD-L", 2)
PS1, PS2 = mk("PEN-S", 1), mk("PEN-S", 2)
PL1, PL2 = mk("PEN-L", 1), mk("PEN-L", 2)
T1, T2 = mk("TBL-LP", 1), mk("TBL-LP", 2)
F1, F2 = mk("FLR-LP", 1), mk("FLR-LP", 2)
C1, C2 = mk("CHD-4", 1), mk("CHD-4", 2)
def run(d_rel, sku, k, ops, qty_in, scrap_first=0):
    """release and issue on d_rel, then one confirmation per operation on the dates in `ops`, last one final, finished goods into stock on the last date"""
    A(d_rel, release, d_rel, sku, k); A(d_rel, issue, d_rel, sku, k)
    good = qty_in
    for idx, (d, g, s, why) in enumerate(ops):
        A(d, op, d, sku, k, idx, g, s, why)
    A(ops[-1][0], fg_receipt, ops[-1][0], sku, k, ops[-1][1])
# BAS-BR order 1
run(M+"09", "BAS-BR", B1, [(M+"09", 55, 0, None), (M+"10", 55, 0, None)], 55)
# SHD-S order 1
run(M+"11", "SHD-S", S1, [(M+"11", 155, 0, None), (M+"12", 150, 5, "Cracked capiz sheets")], 155)
# PEN-S order 1 and TBL-LP order 1
run(M+"12", "PEN-S", PS1, [(M+"13", 90, 0, None), (M+"14", 90, 0, None)], 90)
run(M+"12", "TBL-LP", T1, [(M+"13", 45, 0, None), (M+"14", 45, 0, None), (M+"15", 45, 0, None)], 45)
A(M+"11", downtime, M+"11", "Cutting", 3, "BREAKDOWN", "Blade replaced on the capiz cutter")
# SHD-L order 1 and SHD-S order 2 after the second deliveries
run(M+"16", "SHD-L", L1, [(M+"16", 60, 0, None), (M+"17", 60, 0, None)], 60)
run(M+"17", "SHD-S", S2, [(M+"17", 96, 0, None), (M+"18", 95, 1, "Cracked capiz sheets")], 96)
run(M+"17", "PEN-L", PL1, [(M+"18", 50, 0, None), (M+"19", 50, 0, None)], 50)
# --- the cutting scrap leaves 6 small shades short: a small rush purchase and a rush production order made by hand
A(M+"19", manual_po, P, M+"19", V2, [("WIR-FR", 10, 35, None)], M+"20", 21)
A(M+"19", manual_po, P, M+"19", V1, [("CAP-SH", 1, 2100, "BDL")], M+"20", 22)
A(M+"19", manual_po, P, M+"19", V4, [("GLU-AD", 2, 190, None), ("CLR-CT", 1, 260, None)], M+"20", 23)
A(M+"19", manual_po, P, M+"19", V3, [("LED-KT", 10, 156, None)], M+"21", 24)                      # replaces the 10 kits returned on Mar 12
A(M+"20", receipt, 21, M+"20", V2, {"WIR-FR": 10})
A(M+"20", receipt, 22, M+"20", V1, {"CAP-SH": 5}, quarantine=("CAP-SH",))
A(M+"20", inspect, M+"20", "CAP-SH", 5, [("Moisture", 11.0)], 5, 0, 0, None, None)
A(M+"20", receipt, 23, M+"20", V4, {"GLU-AD": 2, "CLR-CT": 1}, lot={"CLR-CT": ("CC-0320-A", "2028-03-31")}, quarantine=("CLR-CT",))
A(M+"20", inspect, M+"20", "CLR-CT", 3, [("Viscosity", 29)], 1, 0, 0, None, None)
A(M+"21", receipt, 24, M+"21", V3, {"LED-KT": 10}, quarantine=("LED-KT",))
A(M+"21", inspect, M+"21", "LED-KT", 4, [("Voltage", 12.1), ("Lumens", 830)], 10, 0, 0, None, None)
A(M+"21", new_order, M+"21", "SHD-S", 6, M+"21", M+"22")
S3 = mk("SHD-S", 3)
run(M+"21", "SHD-S", S3, [(M+"21", 6, 0, None), (M+"21", 6, 0, None)], 6)
run(M+"18", "CHD-4", C1, [(M+"19", 5, 0, None), (M+"20", 5, 0, None), (M+"21", 5, 0, None)], 5)
run(M+"18", "BAS-BR", B2, [(M+"19", 50, 0, None), (M+"20", 50, 0, None)], 50)
run(M+"19", "PEN-S", PS2, [(M+"20", 50, 0, None), (M+"21", 50, 0, None)], 50)
run(M+"19", "SHD-L", L2, [(M+"19", 45, 0, None), (M+"20", 45, 0, None)], 45)
run(M+"21", "TBL-LP", T2, [(M+"22", 30, 0, None), (M+"23", 30, 0, None), (M+"24", 30, 0, None)], 30)
run(M+"21", "PEN-L", PL2, [(M+"22", 25, 0, None), (M+"23", 25, 0, None)], 25)
run(M+"21", "FLR-LP", F1, [(M+"22", 10, 0, None), (M+"23", 10, 0, None), (M+"24", 10, 0, None)], 10)
run(M+"22", "FLR-LP", F2, [(M+"23", 20, 0, None), (M+"24", 20, 0, None), (M+"25", 20, 0, None)], 20)
run(M+"22", "CHD-4", C2, [(M+"24", 4, 0, None), (M+"25", 4, 0, None), (M+"26", 4, 0, None)], 4)
# --- Quality: every finished lamp lot is inspected in the QUARANTINE store before it can be sold
SW, FD = "Switch test", "Finish defects"
A(M+"15", inspect, M+"15", "PEN-S", 1, [(SW, 1), (FD, 1)], 90, 0, 0, None, None)
A(M+"16", inspect, M+"16", "TBL-LP", 1, [(SW, 1), (FD, 0)], 45, 0, 0, None, None)
A(M+"20", inspect, M+"20", "PEN-L", 1, [(SW, 1), (FD, 1)], 50, 0, 0, None, None)
A(M+"22", inspect, M+"22", "CHD-4", 1, [(SW, 1), (FD, 0)], 5, 0, 0, None, None)
A(M+"22", inspect, M+"22", "PEN-S", 2, [(SW, 1), (FD, 3)], 46, 0, 0, "PEOPLE", "Finish defects over the limit on 4 lamps (glue marks); the other 46 are fine", rework=4)
A(M+"23", inspect, M+"23", "PEN-S", 3, [(SW, 1), (FD, 0)], 2, 2, 0, "PEOPLE", "Two shades cracked while the glue marks were being cleaned off")
A(M+"23", close_ncr, M+"23", "PEN-S", "Glue marks: assemblers shown the glue gauge")
A(M+"23", close_ncr, M+"23", "PEN-S", "Cleaning is done with the cloth only, never a blade")
A(M+"24", inspect, M+"24", "PEN-L", 2, [(SW, 1), (FD, 0)], 25, 0, 0, None, None)
A(M+"25", inspect, M+"25", "TBL-LP", 2, [(SW, 1), (FD, 1)], 30, 0, 0, None, None)
A(M+"25", inspect, M+"25", "FLR-LP", 1, [(SW, 1), (FD, 0)], 10, 0, 0, None, None)
A(M+"26", inspect, M+"26", "FLR-LP", 2, [(SW, 1), (FD, 1)], 20, 0, 0, None, None)
A(M+"27", inspect, M+"27", "CHD-4", 2, [(SW, 1), (FD, 0)], 4, 0, 0, None, None)
flush()

# ============================================================ H. MARCH: bills, deliveries, money, month end
# --- vendor bills for March buying (Purchasing keeps the accounts-payable desk; the Finance manager decides on price differences)
A(M+"12", vendor_invoice, 11, 11, M+"12", "BCT-2301", "2027-04-11", role=P)
A(M+"12", vendor_invoice, 12, 12, M+"12", "CM-1101", "2027-04-11", role=P)
A(M+"13", vendor_invoice, 13, 13, M+"13", "ME-7790", "2027-04-12", price_over=("LED-KT", 160), role=P)      # price 160, PO says 156: ON HOLD
A(M+"15", approve_held, M+"15", 13)
A(M+"13", vendor_invoice, 14, 14, M+"13", "LC-5601", "2027-04-12", role=P)
A(M+"13", vendor_invoice, 15, 15, M+"13", "PP-0902", "2027-04-12", role=P)
A(M+"19", vendor_invoice, 16, 16, M+"19", "BCT-2315", "2027-04-18", role=P)
A(M+"19", vendor_invoice, 17, 17, M+"19", "CM-1120", "2027-04-18", role=P)
A(M+"19", vendor_invoice, 18, 18, M+"19", "ME-7801", "2027-04-18", price_over=("LED-KT", 165), role=P)      # price 165: ON HOLD, then rejected
A(M+"19", reject_held, M+"19", 18, "Price 165 is not the agreed 156; send a corrected invoice", M+"19")
A(M+"20", vendor_invoice, 21, 18, M+"20", "ME-7802", "2027-04-19", role=P)
A(M+"19", vendor_invoice, 19, 19, M+"19", "LC-5633", "2027-04-18", role=P)
A(M+"19", vendor_invoice, 20, 20, M+"19", "PP-0915", "2027-04-18", role=P)
A(M+"21", vendor_invoice, 22, 21, M+"21", "CM-1130", "2027-04-20", role=P)
A(M+"21", vendor_invoice, 23, 22, M+"21", "BCT-2322", "2027-04-20", role=P)
A(M+"21", vendor_invoice, 24, 23, M+"21", "LC-5640", "2027-04-20", role=P)
A(M+"22", vendor_invoice, 25, 24, M+"22", "ME-7811", "2027-04-21", role=P)
A(M+"17", landed_cost, M+"17", "Visayan Trucking", "VT-3392", "2027-04-16", 1800.00, "Freight for the capiz delivery of Mar 16", "CAP-SH", M+"16")
# --- paying the February bills when they fall due (Finance manager pays the big ones)
A(M+"19", pay_bill, 4, M+"19", None, role=FM)
A(M+"22", pay_bill, 5, M+"22", None, role=FM)
A(M+"23", pay_bill, 6, M+"23", None)
A(M+"23", pay_bill, 7, M+"23", None)
A(M+"24", pay_bill, 8, M+"24", None)
A(M+"24", pay_bill, 9, M+"24", None)
A(M+"25", pay_bill, 10, M+"25", None)
# --- deliveries and invoices (Warehouse ships, Sales invoices)
A(M+"16", deliver, S, 7, M+"16", "Manila Lamp House", [("PEN-S", 50), ("TBL-LP", 25)], "2027-04-15", 7)
A(M+"16", deliver, S, 10, M+"16", "Cagayan Lighting", [("PEN-S", 40)], "2027-04-15", 8)
A(M+"16", deliver, S, 9, M+"16", "Davao Design Hub", [("TBL-LP", 20)], "2027-04-15", 9)
A(M+"21", deliver, S, 10, M+"21", "Cagayan Lighting", [("PEN-L", 20)], "2027-04-20", 10)
A(M+"23", deliver, S, 9, M+"23", "Davao Design Hub", [("CHD-4", 5)], "2027-04-22", 11)
A(M+"25", deliver, S, 8, M+"25", "Cebu Interiors", [("PEN-L", 30), ("FLR-LP", 10)], "2027-04-24", 12)
A(M+"26", deliver, S, 11, M+"26", "Baguio Gifts", [("TBL-LP", 30), ("FLR-LP", 8), ("PEN-S", 30)], "2027-04-25", 13)
A(M+"29", deliver, S, 12, M+"29", "Iloilo Decor", [("CHD-4", 4), ("PEN-L", 25)], "2027-04-28", 14)
A(M+"29", deliver, S, 13, M+"29", "Bacolod Home Gallery", [("FLR-LP", 12), ("PEN-S", 18)], "2027-04-28", 15)
# --- money in (the Finance manager records collections)
A(M+"22", receive_payment, FM, 2, M+"22", None, "Cebu Interiors")
A(M+"24", receive_payment, FM, 3, M+"24", None, "Davao Design Hub")
A(M+"26", receive_payment, FM, 4, M+"26", 60000, "Baguio Gifts (part payment)")
A(M+"28", receive_payment, FM, 5, M+"28", None, "Iloilo Decor")
A(M+"29", receive_payment, FM, 6, M+"29", None, "Cagayan Lighting")
A(M+"29", receive_payment, FM, 7, M+"29", None, "Manila Lamp House")
A(M+"30", receive_payment, FM, 8, M+"30", 60000, "Cagayan Lighting (part payment)")
A(M+"31", receive_payment, FM, 4, M+"31", None, "Baguio Gifts (balance)")
# --- paying March bills early where there is a discount of goodwill, and the others when due in April
A(M+"29", pay_bill, 11, M+"29", None, role=FM)
A(M+"29", pay_bill, 12, M+"29", None)
A(M+"30", pay_bill, 14, M+"30", None)
A(M+"30", pay_bill, 15, M+"30", None)
flush()

# --- more bill payments: the Finance manager pays every bill of 40,000 or more, Purchasing the rest
A(M+"30", pay_bill, 13, M+"30", None, role=FM)
A(M+"31", pay_bill, 16, M+"31", None, role=FM)
for _vi in (17, 19, 20, 22, 23, 24, 25):
    A(M+"31", pay_bill, _vi, M+"31", None)
# --- a wrong voucher is reversed and entered again
A(M+"28", voucher, AC, M+"28", "Ads Mar", "Facebook ads for March", [("5200", 90000, None), ("1000", None, 90000)], override="Campaign above the usual limit")
A(M+"28", approve_voucher, M+"28", "Ads Mar")
A(M+"29", reverse_voucher, FM, M+"29", "Ads Mar", "Typed 90,000 instead of 9,000")
A(M+"29", voucher, AC, M+"29", "Ads Mar", "Facebook ads for March (corrected)", [("5200", 9000, None), ("1000", None, 9000)], override="Campaign above the usual limit")
A(M+"29", approve_voucher, M+"29", "Ads Mar")
# --- month end
A(M+"30", transfer, M+"30", "CAP-SH", "STORE-B", "RM-STORE", 2)
A(M+"31", voucher, AC, M+"31", "Rent Mar", "Workshop rent for March", [("5100", 18000, None), ("1000", None, 18000)])
A(M+"31", voucher, AC, M+"31", "Payroll Mar", "Salaries and wages for March", [("5300", 85000, None), ("1000", None, 85000)])
A(M+"31", voucher, AC, M+"31", "Power Mar", "Electricity for March paid by bank", [("5100", 10200, None), ("1000", None, 10200)], override="Electricity bill higher than the usual limit")
A(M+"31", approve_voucher, M+"31", "Power Mar")
A(M+"31", voucher, AC, M+"31", "Insurance", "Fire insurance for the workshop, first quarter", [("5100", 4500, None), ("1000", None, 4500)])
A(M+"31", voucher, AC, M+"31", "Scrap sale", "Capiz offcuts sold as scrap", [("1000", 3200, None), ("4100", None, 3200)])
A(M+"31", depreciation, AC, M+"31", "Capiz cutting machine", 6750)
A(M+"31", stock_adjust, M+"31", "WIR-FR", "RM-STORE", -1, "COUNT")
A(M+"31", stock_adjust, M+"31", "CAP-SH", "RM-STORE", -0.7, "COUNT")
A(M+"31", stock_adjust, M+"31", "GLU-AD", "RM-STORE", -0.2, "COUNT")
for _sku, _ks in (("BAS-BR", (3, 4)), ("SHD-S", (3, 4, 5)), ("SHD-L", (2, 3)), ("PEN-S", (4, 5)), ("PEN-L", (3, 4)), ("TBL-LP", (4, 5)), ("FLR-LP", (3, 4)), ("CHD-4", (3, 4))):
    for _k in _ks: A(M+"31", settle_order, M+"31", _sku, _k, role=(AC if _sku in ("BAS-BR", "SHD-S", "SHD-L") else FM))
A(M+"31", settle_month, FM, M+"31", "2027-03")
A(M+"31", close_month, FM, M+"31", "2027-03")
flush()
