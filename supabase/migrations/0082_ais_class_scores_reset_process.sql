-- ============================================================
-- Classroom ERP — migration 0082 (AIS edition: class-wide score items for the teacher, desk reset, auditor process score)
--
-- Needs 0066-0081. Adds functions only; nothing existing is altered and no table is added.
--
--   1. ais_class_score_items()     TEACHER ONLY. One row per scored item for every AIS company: the 13 document packets, every card of the five desks, the audit
--                                  seat and the audit process score. Feeds the teacher's Scores page and the Excel download. Unlike the students' own score functions
--                                  it ignores the "hide until the phase closes" rule, because it is the teacher's view.
--   2. ais__audit_process(tenant)  How the auditor worked (max 10): tests run, sampling, workpapers, quality of findings. ais_my_audit_process() shows it to the
--                                  student once the audit is closed.
--   3. ais_reset_desks(tenant)     TEACHER ONLY. Clears the five desks of one company (cards, orders, bills, payroll, assets, close entries and what they planted)
--                                  so the class can do them again. Only while the Accounting phase is open. The 13 packets and the sales population are not touched.
-- ROLLBACK: drop function ais_reset_desks(uuid), ais_my_audit_process(), ais_class_score_items(), ais__audit_process(uuid), ais__desk_items(uuid);
-- ============================================================

-- ---------- 1. score items per company ----------
create or replace function ais__desk_items(p_tenant uuid)
returns table (area text, seq int, label text, points numeric, max numeric, message text) as $$
declare
  x record; o ais_wb_orders%rowtype; b ais_pw_bills%rowtype; p numeric; msg text; rel boolean; inst uuid;
begin
  select id into inst from ais_instances where tenant_id = p_tenant;
  if inst is null then return; end if;

  -- the 13 document packets
  for x in select t.seq as sq, t.title, r.points as pt, r.max_points as mx, r.detail, t.status as st from ais_instance_txns t left join ais_results r on r.txn_id = t.id where t.instance_id = inst order by t.seq loop
    area := 'INBOX'; seq := x.sq; label := x.title; points := coalesce(x.pt, 0); max := coalesce(x.mx, 6);
    message := coalesce(x.detail, case when x.st = 'PENDING' then 'Not decided.' else '' end); return next;
  end loop;

  -- sales desk
  for x in select t.*, k.trap, k.why from ais_wb_tasks t join ais_wb_task_keys k on k.task_id = t.id where t.tenant_id = p_tenant order by t.seq loop
    p := 0; o := null; select * into o from ais_wb_orders where task_id = x.id;
    if x.kind = 'RECEIPT' then p := case when x.status = 'DONE' then 6 else 0 end; msg := case when p = 6 then 'Recorded correctly.' else 'Not recorded.' end;
    elsif x.trap is null then p := case when o.status = 'BILLED' then 6 else 0 end; msg := case when p = 6 then 'Processed through to the bill.' when o.status = 'REJECTED' then 'Rejected, but this was a valid order.' else 'Not completed.' end;
    else
      if o.id is null then p := 0; msg := 'Not worked.';
      elsif o.status = 'REJECTED' then p := 6; msg := 'Stopped.';
      elsif o.status in ('BILLED', 'SHIPPED') and not o.self_approved and o.approved_by is not null then p := 3; msg := 'Released with a second person''s approval.';
      elsif o.status in ('BILLED', 'SHIPPED') then p := 0; msg := 'Released without a proper second approval.';
      else p := 3; msg := 'Left unfinished; not released.'; end if;
    end if;
    area := 'SALES'; seq := x.seq; label := x.ref_no; points := p; max := 6; message := msg; return next;
  end loop;

  -- purchases desk
  for x in select t.*, k.trap, k.why from ais_pw_tasks t join ais_pw_task_keys k on k.task_id = t.id where t.tenant_id = p_tenant order by t.seq loop
    p := 0; b := null; select * into b from ais_pw_bills where task_id = x.id;
    if x.kind = 'PAYMENT' then p := case when x.status = 'DONE' then 6 else 0 end; msg := case when p = 6 then 'Paid correctly.' else 'Not paid.' end;
    elsif x.trap is null then p := case when b.status = 'POSTED' then 6 else 0 end; msg := case when p = 6 then 'Received, matched and posted.' when b.status = 'REJECTED' then 'Rejected, but this was a valid purchase.' else 'Not completed.' end;
    else
      if b.id is null then p := 0; msg := 'Not worked.';
      elsif b.status = 'REJECTED' then p := 6; msg := 'Stopped.';
      elsif b.status in ('POSTED', 'APPROVED') and not b.self_approved and b.approved_by is not null then p := 3; msg := 'Released with a second person''s approval.';
      elsif b.status in ('POSTED', 'APPROVED') then p := 0; msg := 'Released without a proper second approval.';
      else p := 3; msg := 'Left unfinished; not released.'; end if;
    end if;
    area := 'PURCHASES'; seq := x.seq; label := coalesce(x.inv_no, x.ref_no); points := p; max := 6; message := msg; return next;
  end loop;

  -- payroll desk
  for x in select t.*, k.trap, k.why from ais_pr_tasks t join ais_pr_task_keys k on k.task_id = t.id where t.tenant_id = p_tenant order by t.seq loop
    p := 0; rel := x.state in ('CLEAN', 'ACCEPTED', 'POSTED', 'PAID');
    if x.kind = 'RUN' then p := case when x.state = 'DONE' then 6 else 0 end; msg := case when p = 6 then 'Posted and paid.' else 'The payroll was not completed.' end;
    elsif x.trap is null then p := case when x.state in ('CLEAN', 'POSTED', 'PAID') then 6 else 0 end; msg := case when p = 6 then 'Checked and paid.' when x.state = 'REJECTED' then 'Rejected, but this was a valid card.' else 'Not completed.' end;
    else
      if x.state = 'NEW' then p := 0; msg := 'Not worked.';
      elsif x.state = 'REJECTED' then p := 6; msg := 'Stopped.';
      elsif rel and not x.self_approved and x.approved_by is not null then p := 3; msg := 'Released with a second person''s approval.';
      elsif rel then p := 0; msg := 'Released without a proper second approval.';
      else p := 3; msg := 'Left unfinished; not released.'; end if;
    end if;
    area := 'PAYROLL'; seq := x.seq; label := x.emp_name; points := p; max := 6; message := msg; return next;
  end loop;

  -- fixed assets desk
  for x in select t.*, k.correct from ais_fa_tasks t join ais_fa_task_keys k on k.task_id = t.id where t.tenant_id = p_tenant order by t.seq loop
    if x.kind = 'INVOICE' then
      if x.state = 'NEW' then p := 0; msg := 'Not decided.'; elsif x.decision = x.correct then p := 6; msg := 'Correct: ' || lower(x.decision) || '.'; else p := 0; msg := 'Should have been ' || lower(x.correct) || '.'; end if;
    else p := case when x.state = 'DONE' then 6 else 0 end; msg := case when p = 6 then 'Recorded.' else 'Not done.' end; end if;
    area := 'ASSETS'; seq := x.seq; label := x.title; points := p; max := 6; message := msg; return next;
  end loop;

  -- period-end close
  for x in select t.* from ais_cl_tasks t where t.tenant_id = p_tenant order by t.seq loop
    if x.kind = 'ACCRUAL' then
      if x.state = 'NEW' then p := 0; msg := 'Not decided.'; elsif x.decision = 'ACCRUE' then p := 6; msg := 'Accrued.'; else p := 0; msg := 'Skipped: should have been accrued.'; end if;
    else p := case when x.state = 'DONE' then 6 else 0 end; msg := case when p = 6 then 'Recorded.' else 'Not done.' end; end if;
    area := 'CLOSE'; seq := x.seq; label := x.title; points := p; max := 6; message := msg; return next;
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- 2. how the auditor worked ----------
create or replace function ais__audit_process(p_tenant uuid)
returns jsonb as $$
declare
  kinds int; samples int; marked_all int; signed int; good int; linked int; f int; fgood int; t_pts numeric; s_pts numeric; w_pts numeric; f_pts numeric; rows_ jsonb;
begin
  select count(distinct kind) into kinds from ais_test_runs where tenant_id = p_tenant;
  t_pts := case when kinds >= 5 then 3 when kinds >= 3 then 2 when kinds >= 1 then 1 else 0 end;

  select count(*) into samples from ais_samples where tenant_id = p_tenant;
  select count(*) into marked_all from ais_samples s where s.tenant_id = p_tenant
     and exists (select 1 from ais_sample_items i where i.sample_id = s.id)
     and not exists (select 1 from ais_sample_items i where i.sample_id = s.id and i.result is null);
  s_pts := (case when samples >= 1 then 1 else 0 end) + (case when marked_all >= 1 then 1 else 0 end);

  select count(*), count(*) filter (where length(coalesce(objective, '')) >= 20 and length(coalesce(procedure_text, '')) >= 20 and length(coalesce(conclusion, '')) >= 20),
         count(*) filter (where length(coalesce(objective, '')) >= 20 and length(coalesce(procedure_text, '')) >= 20 and length(coalesce(conclusion, '')) >= 20 and sample_id is not null)
    into signed, good, linked from ais_workpapers where tenant_id = p_tenant and signed_at is not null;
  w_pts := (case when signed >= 1 then 1 else 0 end) + (case when good >= 1 then 1 else 0 end) + (case when linked >= 1 then 1 else 0 end);

  select count(*), count(*) filter (where length(coalesce(condition_text, '')) >= 15 and length(coalesce(criteria_text, '')) >= 15 and length(coalesce(cause_text, '')) >= 15
                                      and length(coalesce(effect_text, '')) >= 15 and length(coalesce(recommendation, '')) >= 15)
    into f, fgood from ais_findings where tenant_id = p_tenant;
  f_pts := case when f = 0 then 0 when fgood = f then 2 when fgood >= 1 then 1 else 0 end;

  rows_ := jsonb_build_array(
    jsonb_build_object('label', 'Tests', 'points', t_pts, 'max', 3, 'message', 'Ran ' || kinds || ' different test(s). Three or more different tests earn 2 points, five or more earn 3.'),
    jsonb_build_object('label', 'Sampling', 'points', s_pts, 'max', 2, 'message', samples || ' sample(s) drawn; ' || marked_all || ' with every item vouched and marked.'),
    jsonb_build_object('label', 'Workpapers', 'points', w_pts, 'max', 3, 'message', signed || ' signed; ' || good || ' with objective, procedure and conclusion filled in (20+ characters each); ' || linked || ' of those linked to a sample.'),
    jsonb_build_object('label', 'Findings', 'points', f_pts, 'max', 2, 'message', f || ' finding(s); ' || fgood || ' with condition, criteria, cause, effect and recommendation all written out (15+ characters each).'));
  return jsonb_build_object('points', t_pts + s_pts + w_pts + f_pts, 'max', 10, 'rows', rows_);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_my_audit_process()
returns jsonb as $$
declare
  t uuid := ais__my_tenant('AUDIT'); ph text;
begin
  select phase into ph from ais_instances where tenant_id = t;
  if ph is distinct from 'CLOSED' then return jsonb_build_object('visible', false); end if;
  return ais__audit_process(t) || jsonb_build_object('visible', true);
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- 3. the teacher's class-wide list ----------
create or replace function ais_class_score_items()
returns table (tenant_id uuid, company text, area text, seq int, label text, points numeric, max numeric, message text) as $$
declare
  i record; sc jsonb; pr jsonb;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see the class scores.'; end if;
  for i in select ii.tenant_id as tid, t.name as nm, ii.phase from ais_instances ii join tenants t on t.id = ii.tenant_id order by t.name loop
    return query select i.tid, i.nm, d.area, d.seq, d.label, d.points, d.max, d.message from ais__desk_items(i.tid) d;
    if i.phase <> 'ACCOUNTING' then
      sc := ais__audit_score(i.tid); pr := ais__audit_process(i.tid);
      return query select i.tid, i.nm, 'AUDIT'::text, 1, 'Audit seat: planted problems found'::text, (sc ->> 'points')::numeric, (sc ->> 'max')::numeric,
        ('Found ' || (sc ->> 'found') || ' of ' || (sc ->> 'planted') || '; wrong type ' || (sc ->> 'wrong_type') || '; missed ' || (sc ->> 'missed') || '; false positives ' || (sc ->> 'false_positives') || '.')::text;
      return query select i.tid, i.nm, 'AUDIT'::text, 2, 'Audit process'::text, (pr ->> 'points')::numeric, (pr ->> 'max')::numeric,
        (select string_agg((r ->> 'label') || ' ' || (r ->> 'points') || '/' || (r ->> 'max'), '; ') from jsonb_array_elements(pr -> 'rows') r)::text;
    end if;
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- 4. reset the desks of one company ----------
create or replace function ais_reset_desks(p_tenant uuid)
returns jsonb as $$
declare
  ph text; n_entries int; n_planted int;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can reset the desks.'; end if;
  perform assert_ais_tenant(p_tenant);
  select phase into ph from ais_instances where tenant_id = p_tenant;
  if ph is null then raise exception 'This company has no practice set yet, so there is nothing to reset.'; end if;
  if ph <> 'ACCOUNTING' then raise exception 'The Accounting phase is closed. Desks can only be reset while it is open: restart the company instead.'; end if;

  perform set_config('app.deleting_company', p_tenant::text, true);   -- the same guarded door delete_company uses for removing posted entries
  delete from ais_planted where tenant_id = p_tenant and detail ->> 'source' in ('workbench', 'purchases', 'payroll', 'assets', 'close');
  get diagnostics n_planted = row_count;
  delete from journal_entries where tenant_id = p_tenant and source_table in ('ais_wb_orders', 'ais_wb_receipts', 'ais_pw_receipts', 'ais_pw_bills', 'ais_pr_tasks', 'ais_fa_tasks', 'ais_fa_assets', 'ais_cl_tasks');
  get diagnostics n_entries = row_count;

  delete from ais_wb_receipts where tenant_id = p_tenant;
  delete from ais_wb_orders where tenant_id = p_tenant;
  delete from ais_pw_bills where tenant_id = p_tenant;
  delete from ais_pw_receipts where tenant_id = p_tenant;
  delete from ais_pw_tasks where tenant_id = p_tenant;
  delete from ais_pw_vendors where tenant_id = p_tenant;
  delete from ais_wb_tasks where tenant_id = p_tenant;
  delete from ais_wb_items where tenant_id = p_tenant;
  delete from ais_wb_customers where tenant_id = p_tenant;
  delete from ais_pr_tasks where tenant_id = p_tenant;
  delete from ais_pr_employees where tenant_id = p_tenant;
  delete from ais_fa_tasks where tenant_id = p_tenant;
  delete from ais_fa_assets where tenant_id = p_tenant;
  delete from ais_cl_tasks where tenant_id = p_tenant;
  return jsonb_build_object('entries_removed', n_entries, 'planted_removed', n_planted);
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function ais__desk_items(uuid), ais__audit_process(uuid) from public, anon, authenticated;
revoke execute on function ais_my_audit_process(), ais_class_score_items(), ais_reset_desks(uuid) from public, anon;
grant execute on function ais_my_audit_process(), ais_class_score_items(), ais_reset_desks(uuid) to authenticated;
