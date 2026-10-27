  for a in select value from jsonb_array_elements(p_rows) loop
    -- look-ups every row may need
    iid := case when a ? 'sku' then (select id from items where tenant_id = v_t and sku = a->>'sku') end;
    ord := case when a ? 'ok' then (select o.id from mfg_production_orders o where o.tenant_id = v_t and o.item_id = iid order by o.document_number offset (a->>'ok')::int - 1 limit 1) end;
    pid := case when a ? 'po' then (select id from purchase_orders where tenant_id = v_t and document_number = 'PO-' || lpad(a->>'po', 4, '0')) end;
    sid := case when a ? 'so' then (select id from sales_orders where tenant_id = v_t and document_number = 'SO-' || lpad(a->>'so', 4, '0')) end;
    vid := case when a ? 'vi' then (select id from mfg_vendor_invoices where tenant_id = v_t and document_number = 'VI-' || lpad(a->>'vi', 4, '0')) end;
    nid := case when a ? 'inv' then (select id from invoices where tenant_id = v_t and document_number = 'INV-' || lpad(a->>'inv', 4, '0')) end;
    if a ? 'vendor' then
      insert into vendors (tenant_id, name) select v_t, a->>'vendor' where not exists (select 1 from vendors where tenant_id = v_t and name = a->>'vendor');
      vend := (select id from vendors where tenant_id = v_t and name = a->>'vendor');
    end if;
    case a->>'k'
    when 'nop' then null;
    -- ---------------------------------------------------------------- master data
    when 'uom' then
      insert into mfg_uom (tenant_id, code, name) values (v_t, a->>'code', a->>'name');
    when 'conv' then
      insert into mfg_uom_conversions (tenant_id, item_id, from_uom, to_uom, factor) values (v_t, iid, a->>'from', a->>'to', (a->>'f')::numeric);
    when 'item' then
      tmp := mfg_save_item(null, jsonb_strip_nulls(jsonb_build_object('sku', a->>'sku', 'name', a->>'name', 'item_type', a->>'typ', 'make_or_buy', a->>'mb', 'base_uom', a->>'u',
        case when a->>'mb' = 'BUY' then 'procurement_lead_days' else 'production_lead_days' end, (a->>'lead')::int,
        'planned_price', (a->>'price')::numeric, 'batch_tracked', case when a->>'batch' = '1' then true end,
        'default_location_id', (select id from mfg_storage_locations where tenant_id = v_t and code = a->>'loc'))));
    when 'puom' then
      perform mfg_set_purchase_uom(iid, a->>'uom');
    when 'wc' then
      insert into mfg_work_centers (tenant_id, name, shifts, hours_per_shift, utilization_pct, efficiency_pct, working_days) values (v_t, a->>'name', 1, 8, 85, 100, '{1,2,3,4,5}');
    when 'loc' then
      insert into mfg_storage_locations (tenant_id, code, name, kind) values (v_t, a->>'code', a->>'name', a->>'kind');
    when 'rate' then
      insert into mfg_activity_rates (tenant_id, work_center_id, activity_type_id, period_start, rate)
      select v_t, (select id from mfg_work_centers where tenant_id = v_t and name = a->>'wc'), t.id, (a->>'frm')::date, (a->>'r')::numeric from mfg_activity_types t where t.tenant_id = v_t and t.kind = a->>'kind';
    when 'oh' then
      update mfg_costing_sheet set oh_rate_per_hour = (a->>'r')::numeric where tenant_id = v_t and kind = 'FIXED';
    when 'bom' then
      tmp := mfg_save_bom(null, jsonb_build_object('item_id', iid, 'valid_from', a->>'frm', 'lines',
        (select jsonb_agg(jsonb_build_object('component_item_id', (select id from items where tenant_id = v_t and sku = l->>0), 'qty', (l->>1)::numeric, 'uom', l->>2)) from jsonb_array_elements(a->'lines') l)));
      perform mfg_activate_bom(tmp);
    when 'rtg' then
      tmp := mfg_save_routing(null, jsonb_build_object('item_id', iid, 'ops',
        (select jsonb_agg(jsonb_build_object('op_no', (o->>0)::int, 'description', o->>1, 'work_center_id', (select id from mfg_work_centers where tenant_id = v_t and name = o->>2),
           'setup_min', (o->>3)::numeric, 'run_min_per_unit', (o->>4)::numeric, 'labor_min_per_unit', (o->>5)::numeric, 'machine_min_per_unit', (o->>6)::numeric)) from jsonb_array_elements(a->'ops') o)));
      perform mfg_activate_routing(tmp);
    when 'est' then
      tmp := mfg_create_cost_estimate(iid, (a->>'lot')::numeric, (a->>'d')::date);
      perform mfg_mark_cost_estimate(tmp);
      perform mfg_release_cost_estimate(tmp, (a->>'d')::date);
    -- ---------------------------------------------------------------- finance
    when 'vch' then
      tmp := mfg_save_voucher(null, jsonb_strip_nulls(jsonb_build_object('voucher_date', a->>'d', 'jv_type', 'GENERAL', 'reference', a->>'ref', 'particulars', a->>'part',
        'override', case when a ? 'ov' then true end, 'override_reason', a->>'ov',
        'lines', (select jsonb_agg(jsonb_build_object('account_id', (select id from accounts where tenant_id = v_t and code = l->>0), 'debit', (l->>1)::numeric, 'credit', (l->>2)::numeric)) from jsonb_array_elements(a->'lines') l))));
      perform mfg_submit_voucher(tmp);
      if a ? 'ov' then
        -- the key is posted by ONE user, so the preparer is cleared before the approval (a student team has two different people)
        if p_scratch then execute 'reset role'; end if;
        update mfg_vouchers set prepared_by = null where id = tmp;
        if p_scratch then execute 'set local role authenticated'; end if;
        perform mfg_approve_voucher(tmp);
      end if;
    when 'rvch' then
      perform mfg_reverse_voucher((select id from mfg_vouchers where tenant_id = v_t and reference = a->>'ref' and status = 'POSTED' order by created_at desc limit 1), (a->>'d')::date, a->>'reason');
    when 'asset' then
      insert into fixed_assets (tenant_id, name, purchase_date, cost, salvage_value, useful_life_months) values (v_t, a->>'name', (a->>'d')::date, (a->>'cost')::numeric, (a->>'salv')::numeric, (a->>'life')::int);
    when 'dep' then
      perform record_depreciation((select id from fixed_assets where tenant_id = v_t and name = a->>'name'), (a->>'amt')::numeric, (a->>'d')::date);
    when 'cust' then
      insert into customers (tenant_id, name) values (v_t, a->>'name');
    when 'payinv' then
      perform record_invoice_payment(nid, case when a ? 'amt' then (a->>'amt')::numeric else (select i.total - coalesce((select sum(p.amount) from invoice_payments p where p.invoice_id = i.id), 0) from invoices i where i.id = nid) end, (a->>'d')::date, 'Bank transfer');
    when 'paybill' then
      perform record_bill_payment((select bill_id from mfg_vendor_invoices where id = vid),
        case when a ? 'amt' then (a->>'amt')::numeric else (select v.total - coalesce((select sum(p.amount) from bill_payments p where p.bill_id = v.bill_id), 0) from mfg_vendor_invoices v where v.id = vid) end, (a->>'d')::date, 'Bank transfer');
    when 'settle' then
      perform mfg_settle_period((a->>'month' || '-01')::date);
    when 'close' then
      perform mfg_close_period((a->>'month' || '-01')::date);
    when 'adj' then
      perform mfg_post_stock_adjustment(iid, (select id from mfg_storage_locations where tenant_id = v_t and code = a->>'loc'), (a->>'qty')::numeric,
        coalesce((a->>'cost')::numeric, (select standard_cost from mfg_item_master where item_id = iid)), a->>'reason', (a->>'d')::date, a->>'batch', (a->>'expiry')::date, null);
    when 'xfer' then
      perform mfg_transfer_stock(iid, (select id from mfg_storage_locations where tenant_id = v_t and code = a->>'from'), (select id from mfg_storage_locations where tenant_id = v_t and code = a->>'to'), (a->>'qty')::numeric, (a->>'d')::date, null);
    -- ---------------------------------------------------------------- sales
    when 'so' then
      insert into sales_orders (tenant_id, customer_id, order_date, status, total, tax_rate, tax_amount)
      select v_t, (select id from customers where tenant_id = v_t and name = a->>'cust'), (a->>'d')::date, 'draft', round(s.sub * 1.12, 2), 12, round(s.sub * 0.12, 2)
        from (select sum((l->>1)::numeric * (l->>2)::numeric) sub from jsonb_array_elements(a->'lines') l) s returning id into tmp;
      insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price)
      select tmp, i.id, i.name, (l->>1)::numeric, (l->>2)::numeric from jsonb_array_elements(a->'lines') l join items i on i.tenant_id = v_t and i.sku = l->>0;
      update sales_orders set status = 'confirmed' where id = tmp;
    when 'dlv' then
      perform mfg_post_delivery(sid, (a->>'d')::date, (select jsonb_agg(jsonb_build_object('so_line_id', (select sl.id from sales_order_lines sl where sl.sales_order_id = sid and sl.item_id = (select id from items where tenant_id = v_t and sku = l->>0)), 'qty', (l->>1)::numeric)) from jsonb_array_elements(a->'lines') l));
    when 'invso' then
      perform mfg_create_invoice_from_so(sid, (a->>'due')::date, (a->>'d')::date);
    when 'send' then
      perform post_invoice(nid);
    -- ---------------------------------------------------------------- planning and purchasing
    when 'mrp' then
      perform mfg_run_mrp(84, 7, true, (a->>'frm')::date);
    when 'mkplan' then
      perform mfg_convert_planned_orders((select array_agg(id order by document_number) from mfg_planned_orders where tenant_id = v_t and status = 'OPEN'), false);
    when 'delreq' then
      perform mfg_delete_requisition((select id from mfg_purchase_reqs where tenant_id = v_t and status = 'OPEN' and item_id = iid limit 1));
    when 'po' then
      perform mfg_create_po(vend, (a->>'d')::date, (a->>'exp')::date,
        (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('item_id', (select id from items where tenant_id = v_t and sku = l->>0), 'qty', (l->>1)::numeric, 'unit_price', (l->>2)::numeric, 'uom', l->>3))) from jsonb_array_elements(a->'lines') l));
    when 'reqpo' then
      perform mfg_convert_requisitions(vend, (select jsonb_agg(jsonb_build_object('req_id', r.id, 'unit_price', (select (p->>1)::numeric from jsonb_array_elements(a->'prices') p where p->>0 = i.sku)))
        from mfg_purchase_reqs r join items i on i.id = r.item_id where r.tenant_id = v_t and r.status = 'OPEN' and i.sku in (select p->>0 from jsonb_array_elements(a->'prices') p)));
    when 'rcpt' then
      perform mfg_post_goods_receipt(pid, (a->>'d')::date, (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('po_line_id', l.id, 'qty', (v->>1)::numeric,
          'location_id', case when v->>2 = '1' then (select id from mfg_storage_locations where tenant_id = v_t and code = 'QUARANTINE') end, 'batch_no', v->>3, 'expiry', v->>4)))
        from jsonb_array_elements(a->'lines') v join mfg_po_line_items li on li.item_id = (select id from items where tenant_id = v_t and sku = v->>0)
        join purchase_order_lines l on l.id = li.po_line_id and l.purchase_order_id = pid));
    when 'vinv' then
      perform mfg_post_vendor_invoice(pid, a->>'ref', (a->>'d')::date, (a->>'due')::date, 12,
        (select jsonb_agg(jsonb_build_object('po_line_id', l.id, 'qty', l.qty_recv, 'unit_price', case when li.item_id = (select id from items where tenant_id = v_t and sku = a#>>'{over,0}') then (a#>>'{over,1}')::numeric else l.unit_cost end))
         from (select pl.*, (select coalesce(sum(m.qty_change), 0) from mfg_material_doc_lines m where m.po_line_id = pl.id) as qty_recv from purchase_order_lines pl where pl.purchase_order_id = pid) l
         join mfg_po_line_items li on li.po_line_id = l.id where l.qty_recv > 0));
    when 'lcost' then
      perform mfg_post_landed_cost(vend, a->>'ref', (a->>'d')::date, (a->>'due')::date, 'VALUE', (a->>'amt')::numeric, 12, a->>'what',
        (select jsonb_agg(jsonb_build_object('doc_line_id', m.id)) from mfg_material_doc_lines m join mfg_material_documents x on x.id = m.doc_id
          where m.tenant_id = v_t and m.item_id = iid and m.qty_change > 0 and x.doc_type = 'GR' and x.posting_date = (a->>'rd')::date), null);
    when 'apprh' then
      -- the loader runs as ONE user, so the entering user is cleared first (a student team has two different people)
      if p_scratch then execute 'reset role'; end if;
      update mfg_vendor_invoices set created_by = null where id = vid;
      if p_scratch then
        -- scratch runs only: until the team approval is applied, the teacher releases it
        tmp := (select id from profiles where role = 'teacher' order by created_at limit 1);
        perform set_config('request.jwt.claims', json_build_object('sub', tmp, 'role', 'authenticated')::text, false);
        execute 'set local role authenticated';
      end if;
      perform mfg_approve_held_invoice(vid);
      if p_scratch then perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, false); end if;
    when 'rejh' then
      perform mfg_reject_held_invoice(vid, a->>'reason');
    -- ---------------------------------------------------------------- production
    when 'rel' then
      perform mfg_release_order(ord);
    when 'iss' then
      perform mfg_post_material_issue(ord, (select jsonb_agg(jsonb_build_object('component_id', c.id, 'qty', c.qty_required)) from mfg_prod_components c where c.order_id = ord), (a->>'d')::date);
    when 'cnf' then
      perform mfg_post_confirmation(ord, (a->>'op')::int, (a->>'good')::numeric, (a->>'scrap')::numeric, a->>'why', (a->>'setup')::numeric, (a->>'labor')::numeric, (a->>'machine')::numeric, (a->>'final')::boolean, (a->>'d')::date, null);
    when 'fgr' then
      perform mfg_post_fg_receipt(ord, (a->>'qty')::numeric, case when a->>'q' = '1' then (select id from mfg_storage_locations where tenant_id = v_t and code = 'QUARANTINE') end, null, null, (a->>'d')::date);
    when 'stl' then
      perform mfg_settle_order(ord, (a->>'d')::date);
    when 'new' then
      perform mfg_create_order(iid, (a->>'qty')::numeric, (a->>'start')::date, (a->>'end')::date, 1, 1, false);
    when 'revc' then
      perform mfg_reverse_confirmation((select c.id from mfg_confirmations c where c.order_id = ord and c.reversal_of is null and not exists (select 1 from mfg_confirmations r where r.reversal_of = c.id) order by c.document_number desc limit 1), (a->>'d')::date, a->>'reason');
    when 'down' then
      perform mfg_log_downtime((select id from mfg_work_centers where tenant_id = v_t and name = a->>'wc'), (a->>'d')::date, (a->>'h')::numeric, a->>'cat', a->>'note');
    -- ---------------------------------------------------------------- quality
    when 'plan' then
      perform mfg_save_inspection_plan(iid, (select jsonb_agg(jsonb_build_object('characteristic', c->>0, 'unit', c->>1, 'spec_min', (c->>2)::numeric, 'spec_max', (c->>3)::numeric)) from jsonb_array_elements(a->'chars') c));
      perform mfg_save_item_quality(iid, a->>'rcpt' = '1', a->>'prod' = '1');
    when 'insp' then
      tmp := (select id from mfg_inspection_lots where tenant_id = v_t and item_id = iid and status <> 'DECIDED' order by document_number limit 1);
      perform mfg_record_inspection(tmp, (select jsonb_agg(jsonb_build_object('characteristic', c->>0, 'value', (c->>1)::numeric)) from jsonb_array_elements(a->'res') c));
      perform mfg_decide_inspection_lot(tmp, (a->>'acc')::numeric, (a->>'scr')::numeric, (a->>'ret')::numeric, (a->>'rwk')::numeric, a->>'cause', a->>'note', (a->>'d')::date);
    when 'ncr' then
      perform mfg_close_ncr((select id from mfg_ncr where tenant_id = v_t and item_id = iid and status = 'OPEN' order by document_number limit 1), a->>'action');
    else
      raise exception 'Unknown step kind %', a->>'k';
    end case;
  end loop;
