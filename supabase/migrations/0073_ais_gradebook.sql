-- ============================================================
-- Classroom ERP — migration 0073 (AIS edition, step 5: the class gradebook and the detection matrix)
--
-- Needs 0071–0072. ADDITIVE and READ-ONLY: three teacher-only functions. No table, policy or existing function is changed.
--
--   ais_class_gradebook()                One row per AIS company that has a practice set: who is in it, the Accounting score (desk), the Audit score,
--                                        how many planted exceptions were found, missed, mis-typed and falsely reported. The Audit columns are null until the
--                                        Accounting phase has closed.
--   ais_detection_matrix(set, closed)    For each type of planted exception, across the class: how many were planted, found with the right type, found under the
--                                        wrong type, and missed. closed = true counts only companies whose audit is closed (finished work).
--   ais_desk_matrix(set)                 For each document of a set, across the class: how many students posted it, held it for the right control, or held it
--                                        for another reason, and the average points. Shows which traps fooled the class.
--
-- ROLLBACK: drop function if exists ais_desk_matrix(text), ais_detection_matrix(text, boolean), ais_class_gradebook();
-- ============================================================

create or replace function ais_class_gradebook()
returns table (
  tenant_id uuid, company text, set_id text, set_title text, mode text, phase text, members jsonb, created_at timestamptz,
  desk_points numeric, desk_max numeric, desk_decided int, desk_total int,
  audit_points numeric, audit_max numeric, audit_planted int, audit_found int, audit_wrong_type int, audit_missed int, audit_false_positives int, findings int
) as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see the gradebook.'; end if;
  return query
  select i.tenant_id, t.name, s.id, s.title, i.mode, i.phase,
         coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(p.full_name, 'Student'),
                    'seats', coalesce((select jsonb_agg(r.seat order by r.seat) from ais_company_roles r where r.tenant_id = i.tenant_id and r.user_id = m.user_id), '[]'::jsonb)) order by p.full_name)
                     from memberships m left join profiles p on p.id = m.user_id where m.tenant_id = i.tenant_id), '[]'::jsonb),
         i.created_at,
         (select coalesce(sum(r.points), 0) from ais_results r join ais_instance_txns x on x.id = r.txn_id where x.instance_id = i.id),
         (select count(*) * 6 from ais_instance_txns x where x.instance_id = i.id)::numeric,
         (select count(*)::int from ais_instance_txns x where x.instance_id = i.id and x.status <> 'PENDING'),
         (select count(*)::int from ais_instance_txns x where x.instance_id = i.id),
         case when i.phase = 'ACCOUNTING' then null else (sc ->> 'points')::numeric end,
         case when i.phase = 'ACCOUNTING' then null else (sc ->> 'max')::numeric end,
         case when i.phase = 'ACCOUNTING' then null else (sc ->> 'planted')::int end,
         case when i.phase = 'ACCOUNTING' then null else (sc ->> 'found')::int end,
         case when i.phase = 'ACCOUNTING' then null else (sc ->> 'wrong_type')::int end,
         case when i.phase = 'ACCOUNTING' then null else (sc ->> 'missed')::int end,
         case when i.phase = 'ACCOUNTING' then null else (sc ->> 'false_positives')::int end,
         (select count(*)::int from ais_findings f where f.tenant_id = i.tenant_id)
    from ais_instances i
    join tenants t on t.id = i.tenant_id
    join ais_sets s on s.id = i.set_id
    cross join lateral ais__audit_score(i.tenant_id) as sc
   order by t.name;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais_detection_matrix(p_set text, p_closed_only boolean)
returns table (exception_type text, label text, planted_n bigint, found_n bigint, wrong_type_n bigint, missed_n bigint, companies_n bigint) as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see the detection matrix.'; end if;
  return query
  with pl as (
    select p.tenant_id as tid, p.type as ptype, p.entry_id as pentry
      from ais_planted p join ais_instances i on i.id = p.instance_id
     where (p_set is null or i.set_id = p_set) and (not coalesce(p_closed_only, true) or i.phase = 'CLOSED')
  ), st as (
    select pl.tid, pl.ptype,
           case when exists (select 1 from ais_findings f where f.tenant_id = pl.tid and f.exception_type = pl.ptype and f.entry_id is not distinct from pl.pentry) then 'found'
                when pl.pentry is not null and exists (select 1 from ais_findings f where f.tenant_id = pl.tid and f.entry_id = pl.pentry) then 'wrong'
                else 'missed' end as s
      from pl
  )
  select st.ptype, coalesce(ft.label, st.ptype), count(*), count(*) filter (where st.s = 'found'), count(*) filter (where st.s = 'wrong'), count(*) filter (where st.s = 'missed'), count(distinct st.tid)
    from st left join ais_finding_types ft on ft.tag = st.ptype
   group by st.ptype, ft.label order by count(*) desc, st.ptype;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais_desk_matrix(p_set text)
returns table (seq int, key_decision text, failed_control text, docs bigint, posted bigint, held_right bigint, held_other bigint, avg_points numeric) as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see the desk matrix.'; end if;
  return query
  select x.seq, k.key ->> 'decision', k.key ->> 'failed_control', count(*),
         count(*) filter (where d.decision = 'POST'),
         count(*) filter (where d.decision = 'HOLD' and d.failed_control is not distinct from (k.key ->> 'failed_control')),
         count(*) filter (where d.decision = 'HOLD' and d.failed_control is distinct from (k.key ->> 'failed_control')),
         round(avg(r.points), 2)
    from ais_instance_txns x
    join ais_instances i on i.id = x.instance_id
    join ais_instance_keys k on k.txn_id = x.id
    left join ais_decisions d on d.txn_id = x.id
    left join ais_results r on r.txn_id = x.id
   where x.status <> 'PENDING' and (p_set is null or i.set_id = p_set)
   group by x.seq, k.key ->> 'decision', k.key ->> 'failed_control'
   order by x.seq;
end;
$$ language plpgsql stable security definer set search_path = public;

revoke execute on function ais_class_gradebook(), ais_detection_matrix(text, boolean), ais_desk_matrix(text) from public, anon;
grant execute on function ais_class_gradebook(), ais_detection_matrix(text, boolean), ais_desk_matrix(text) to authenticated;
