-- ============================================================
-- Classroom ERP — migration 0059 (Manufacturing ERP: practice-set snapshot for Activity 2)
--
-- Needs 0050. ADDITIVE: one new read-only function. mfg_practice_snapshot (0050) is not touched, so Activity 1's Check keeps working.
--
--   mfg_practice_snapshot_a2(p_tenant)   Everything mfg_practice_snapshot returns, plus the areas Activity 2 adds: inspection plans and flags,
--                                        inspection lots, non-conformance reports, batches, fixed assets, payments received and made,
--                                        vendor bills (this is where a landed-cost bill shows), reversed confirmations and vouchers, and downtime. Teacher only; writes nothing.
--
-- ROLLBACK:  drop function if exists mfg_practice_snapshot_a2(uuid);
-- ============================================================

create or replace function mfg_practice_snapshot_a2(p_tenant uuid)
returns jsonb as $$
declare
  r jsonb;
begin
  if not is_teacher() then raise exception 'Only the teacher can check a practice set.'; end if;
  r := mfg_practice_snapshot(p_tenant);

  return r || jsonb_build_object(
    'quality_plans', coalesce((select jsonb_agg(jsonb_build_object('item', i.sku, 'characteristic', q.characteristic, 'min', q.spec_min, 'max', q.spec_max) order by i.sku, q.line_no)
                         from mfg_inspection_plans q join items i on i.id = q.item_id where q.tenant_id = p_tenant), '[]'),
    'quality_flags', coalesce((select jsonb_agg(jsonb_build_object('item', i.sku, 'receipt', f.inspect_receipt, 'production', f.inspect_production) order by i.sku)
                         from mfg_item_quality f join items i on i.id = f.item_id where f.tenant_id = p_tenant and (f.inspect_receipt or f.inspect_production)), '[]'),
    'inspection_lots', coalesce((select jsonb_agg(jsonb_build_object('item', i.sku, 'source', l.source, 'qty', l.qty, 'status', l.status, 'accept', l.qty_accept, 'scrap', l.qty_scrap,
                                                                      'return', l.qty_return, 'rework', l.qty_rework) order by l.document_number)
                         from mfg_inspection_lots l join items i on i.id = l.item_id where l.tenant_id = p_tenant), '[]'),
    'ncrs', coalesce((select jsonb_agg(jsonb_build_object('item', i.sku, 'root_cause', n.root_cause, 'qty', n.qty, 'status', n.status,
                                                          'action_written', coalesce(trim(n.corrective_action), '') <> '') order by n.document_number)
                         from mfg_ncr n join items i on i.id = n.item_id where n.tenant_id = p_tenant), '[]'),
    'batches', coalesce((select jsonb_agg(jsonb_build_object('item', i.sku, 'batch_no', b.batch_no, 'expiry', b.expiry_date) order by i.sku, b.received_on)
                         from mfg_batches b join items i on i.id = b.item_id where b.tenant_id = p_tenant and b.expiry_date is not null), '[]'),
    'assets', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'cost', cost, 'salvage', salvage_value, 'life', useful_life_months, 'accumulated', accumulated_depreciation) order by name)
                         from fixed_assets where tenant_id = p_tenant), '[]'),
    'payments', jsonb_build_object(
      'received', coalesce((select sum(amount) from invoice_payments where tenant_id = p_tenant), 0),
      'received_count', (select count(*) from invoice_payments where tenant_id = p_tenant),
      'made', coalesce((select sum(amount) from bill_payments where tenant_id = p_tenant), 0),
      'made_count', (select count(*) from bill_payments where tenant_id = p_tenant)),
    'reversals', jsonb_build_object(
      'confirmations', (select count(*) from mfg_confirmations where tenant_id = p_tenant and reversal_of is not null),
      'vouchers', (select count(*) from mfg_vouchers where tenant_id = p_tenant and kind = 'MANUAL' and status = 'REVERSED')),
    'bills', coalesce((select jsonb_agg(jsonb_build_object('total', total, 'status', status) order by document_number) from bills where tenant_id = p_tenant), '[]'),
    'downtime', coalesce((select jsonb_agg(jsonb_build_object('work_center', w.name, 'hours', d.hours, 'category', d.category) order by d.event_date)
                         from mfg_downtime d join mfg_work_centers w on w.id = d.work_center_id where d.tenant_id = p_tenant and d.voided_at is null), '[]')
  );
end;
$$ language plpgsql stable security definer set search_path = public;

revoke execute on function mfg_practice_snapshot_a2(uuid) from public, anon;
grant execute on function mfg_practice_snapshot_a2(uuid) to authenticated;
