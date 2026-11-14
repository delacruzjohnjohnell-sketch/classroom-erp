#!/usr/bin/env python3
"""Prints one DO block that runs steps A..B of the key in the scratch company: production rows through a compact loop, every other step as its own SQL.
Usage: python3 player.py A B"""
import sys
a, b = int(sys.argv[1]), int(sys.argv[2])
sys.argv = ["gen.py", "none"]
__file__ = "gen.py"
src = open("gen.py").read().split("if __name__")[0]
exec(src)
q2 = lambda x: "null" if x is None else q(str(x).lower() if isinstance(x, bool) else x)
LOOP = """  for pr in select * from (values
{rows}
  ) x(n,k,sku,off,a1,a2,a3,a4,a5,a6,a7,a8,a9) order by n loop
    tmp := (select o.id from mfg_production_orders o where o.tenant_id = v_t and o.item_id = (mi->>pr.sku)::uuid order by o.document_number offset pr.off limit 1);
    if pr.k = 'rel' then perform mfg_release_order(tmp);
    elsif pr.k = 'iss' then perform mfg_post_material_issue(tmp, (select jsonb_agg(jsonb_build_object('component_id', c.id, 'qty', c.qty_required)) from mfg_prod_components c where c.order_id = tmp), pr.a1::date);
    elsif pr.k = 'cnf' then perform mfg_post_confirmation(tmp, pr.a1::int, pr.a2::numeric, pr.a3::numeric, pr.a4, pr.a5::numeric, pr.a6::numeric, pr.a7::numeric, pr.a8::boolean, pr.a9::date, null);
    elsif pr.k = 'fgr' then perform mfg_post_fg_receipt(tmp, pr.a1::numeric, case when pr.a3 = 'Q' then (ml->>'QUARANTINE')::uuid end, null, null, pr.a2::date);
    elsif pr.k = 'stl' then perform mfg_settle_order(tmp, pr.a1::date);
    end if;
  end loop;"""
out = [PRELUDE.replace("{tenant}", "93c9f7b9-883e-464c-a1e1-5c7575f84520").replace("rec record;", "rec record; pr record;").rstrip("\n")]
buf = []
def flushbuf():
    if buf:
        out.append(LOOP.replace("{rows}", ",\n".join(buf))); buf.clear()
for s in STEPS[a - 1:b]:
    m = s.get("meta")
    if m:
        k, sku, off = m[0], m[1], m[2]; rest = list(m[3:]) + [None] * 9
        buf.append(f"({s['n']}, {q(k)}, {q(sku)}, {off}, {q2(rest[0])}, {q2(rest[1])}, {q2(rest[2])}, {q2(rest[3])}, {q2(rest[4])}, {q2(rest[5])}, {q2(rest[6])}, {q2(rest[7])}, {q2(rest[8])})")
    else:
        flushbuf(); out.append("  " + s["sql"].replace("\n", "\n  "))
flushbuf()
out.append("end $t$;")
print("\n".join(out))
