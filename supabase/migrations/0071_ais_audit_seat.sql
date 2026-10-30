-- ============================================================
-- Classroom ERP — migration 0071 (AIS edition, step 4: the Audit seat)
--
-- Needs 0066–0070. ADDITIVE: new ais_ tables, functions and two triggers on ais_instances (our own table). Nothing existing is changed.
--
-- When the Accounting phase closes the books are locked and the Audit seat takes over (phase AUDIT). The Audit seat works on what is in the ledger:
--   Population   every journal entry of the company, with who/when it was posted (created_at is the real posting time, entry_date is the document date)
--   Tests        CAAT-style tests run over the population: duplicates, round amounts, weekend and after-hours postings, amounts just below the approval limit,
--                gaps in the invoice sequence, and a Benford first-digit analysis. Each run is logged.
--   Sampling     random or monetary-unit sampling, reproducible from a seed; each sampled entry is marked pass / exception
--   Workpapers   objective, procedure, conclusion; a signed workpaper is frozen
--   Findings     condition, criteria, cause, effect, recommendation, severity, tied to an entry and an exception type
--   Reversal     the Audit seat reverses a wrongly posted entry (dated after the closed period); one reversal per finding
--
-- The PLANTED exceptions (what the instructor hid in the books) live in ais_planted, which has no policy: students never read it.
--   * At assign time, a set whose meta carries a "population" spec gets a seeded sales population with planted anomalies (trigger on ais_instances insert).
--   * When the Accounting phase closes, every exception the Accounting seat POSTED (a HOLD document that was posted) is planted too (trigger on update).
-- Scoring (per planted exception): found with the right type 6, right entry but wrong type 3, missed 0, plus 2 if a true exception was reversed;
--   each finding that matches nothing planted costs 2; the total is never below 0. Scores show to the student when the audit is closed.
--
-- ROLLBACK:
--   drop trigger if exists trg_ais_seed_population on ais_instances; drop trigger if exists trg_ais_plant_from_desk on ais_instances;
--   (to undo the simulated time, re-run the ais__post_entry definition from migration 0069)
--   drop function if exists ais__sim_ts(date, uuid), ais_teacher_audit_score(uuid), ais_audit_score(), ais_close_audit(), ais_reverse_finding(uuid, date, text), ais_save_finding(uuid, text, text, text, text, text, text, text, uuid),
--     ais_sign_workpaper(uuid), ais_save_workpaper(uuid, text, text, text, text, text, uuid), ais_sample_mark(uuid, text, text), ais_sample_items(uuid), ais_sample_draw(text, int, bigint, numeric),
--     ais_test_run(text, jsonb), ais_audit_entries(date, date, numeric, numeric, text, int), ais_audit_overview(), ais__audit_score(uuid), ais__audit_tenant(boolean),
--     ais__post_entry_src(uuid, date, text, text, uuid, jsonb), ais__plant_from_desk(), ais__seed_population_trg(), ais__seed_population(uuid, jsonb);
--   drop table if exists ais_test_runs, ais_findings, ais_workpapers, ais_sample_items, ais_samples, ais_planted, ais_finding_types;
--   update ais_sets set meta = meta - 'population';
-- ============================================================

-- ---------- what an auditor can name a finding (every desk control, plus the analytics ones) ----------
create table if not exists ais_finding_types (
  tag      text primary key,
  label    text not null,
  category text not null
);
insert into ais_finding_types (tag, label, category)
  select c.tag, c.label, c.hall_category from ais_controls c
on conflict (tag) do nothing;
insert into ais_finding_types (tag, label, category) values
  ('ROUND_AMOUNT',     'Unusually round amounts',                   'Unusual amounts'),
  ('WEEKEND_POSTING',  'Entry posted on a weekend or at night',     'Unusual timing'),
  ('JUST_BELOW_LIMIT', 'Amounts just below the approval limit',     'Transaction authorization'),
  ('SEQUENCE_GAP',     'Missing document numbers in a sequence',    'Completeness')
on conflict (tag) do nothing;
alter table ais_finding_types enable row level security;
drop policy if exists "ais finding types read" on ais_finding_types;
create policy "ais finding types read" on ais_finding_types for select using (auth.uid() is not null);

-- ---------- the instructor's hidden answers (no policy) ----------
create table if not exists ais_planted (
  id          uuid primary key default gen_random_uuid(),
  instance_id uuid not null references ais_instances(id) on delete cascade,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  entry_id    uuid,
  type        text not null,
  detail      jsonb not null default '{}'::jsonb
);
create index if not exists ais_planted_tenant on ais_planted (tenant_id);
alter table ais_planted enable row level security;

-- ---------- the Audit seat's own records (tenant-readable; written only by the functions below) ----------
create table if not exists ais_test_runs (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kind      text not null,
  params    jsonb not null default '{}'::jsonb,
  flagged   int not null default 0,
  run_by    uuid,
  run_at    timestamptz not null default now()
);
create table if not exists ais_samples (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  method     text not null check (method in ('RANDOM', 'MUS')),
  params     jsonb not null default '{}'::jsonb,
  seed       bigint not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create table if not exists ais_sample_items (
  id               uuid primary key default gen_random_uuid(),
  sample_id        uuid not null references ais_samples(id) on delete cascade,
  tenant_id        uuid not null references tenants(id) on delete cascade,
  entry_id         uuid not null,
  selection_reason text,
  result           text check (result in ('PASS', 'EXCEPTION')),
  note             text,
  unique (sample_id, entry_id)
);
create table if not exists ais_workpapers (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  ref_no         text not null,
  title          text not null,
  objective      text,
  procedure_text text,
  conclusion     text,
  sample_id      uuid references ais_samples(id) on delete set null,
  status         text not null default 'DRAFT' check (status in ('DRAFT', 'SIGNED')),
  created_by     uuid,
  created_at     timestamptz not null default now(),
  signed_at      timestamptz,
  unique (tenant_id, ref_no)
);
create table if not exists ais_findings (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  entry_id          uuid,
  exception_type    text not null references ais_finding_types(tag),
  condition_text    text not null,
  criteria_text     text,
  cause_text        text,
  effect_text       text,
  recommendation    text,
  severity          text not null default 'MODERATE' check (severity in ('LOW', 'MODERATE', 'HIGH', 'CRITICAL')),
  workpaper_id      uuid references ais_workpapers(id) on delete set null,
  status            text not null default 'OPEN' check (status in ('OPEN', 'REVERSED')),
  reversal_entry_id uuid,
  created_by        uuid,
  created_at        timestamptz not null default now()
);
create unique index if not exists ais_findings_one_per_entry_type on ais_findings (tenant_id, coalesce(entry_id, '00000000-0000-0000-0000-000000000000'::uuid), exception_type);

alter table ais_test_runs enable row level security;
alter table ais_samples enable row level security;
alter table ais_sample_items enable row level security;
alter table ais_workpapers enable row level security;
alter table ais_findings enable row level security;
drop policy if exists "ais read" on ais_test_runs;
create policy "ais read" on ais_test_runs for select using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'AIS');
drop policy if exists "ais read" on ais_samples;
create policy "ais read" on ais_samples for select using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'AIS');
drop policy if exists "ais read" on ais_sample_items;
create policy "ais read" on ais_sample_items for select using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'AIS');
drop policy if exists "ais read" on ais_workpapers;
create policy "ais read" on ais_workpapers for select using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'AIS');
drop policy if exists "ais read" on ais_findings;
create policy "ais read" on ais_findings for select using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'AIS');

-- ---------- simulated posting time ----------
-- The practice books are January 2027, so an entry posted at the desk or reversed by the Audit seat is stamped with a business-hours time on its own
-- document date (09:00-17:00 Manila, fixed by the entry's source id). Otherwise a student working on a Saturday night would trip the weekend test.
create or replace function ais__sim_ts(p_date date, p_key uuid)
returns timestamptz as $$
  select ((p_date::timestamp + make_interval(secs => 32400 + (abs(hashtext(p_key::text)) % 28800))) at time zone 'Asia/Manila');
$$ language sql immutable set search_path = public;

-- the Accounting desk's posting function, now with the simulated time (same signature and behaviour otherwise)
create or replace function ais__post_entry(p_tenant uuid, p_date date, p_memo text, p_source uuid, p_lines jsonb)
returns uuid as $$
declare
  e uuid; ln jsonb; acc uuid;
begin
  perform set_config('ais.posting', 'on', true);
  insert into journal_entries (tenant_id, entry_date, memo, created_by, created_at, source_table, source_id)
  values (p_tenant, p_date, p_memo, auth.uid(), ais__sim_ts(p_date, p_source), 'ais_instance_txns', p_source) returning id into e;
  for ln in select value from jsonb_array_elements(p_lines) loop
    select a.id into acc from accounts a where a.tenant_id = p_tenant and a.code = ln ->> 'acct';
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values (e, acc, (ln ->> 'debit')::numeric, (ln ->> 'credit')::numeric);
  end loop;
  perform set_config('ais.posting', 'off', true);
  return e;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- posting with a named source (the original ais__post_entry always names the Accounting desk) ----------
create or replace function ais__post_entry_src(p_tenant uuid, p_date date, p_memo text, p_src_table text, p_src uuid, p_lines jsonb)
returns uuid as $$
declare
  e uuid; ln jsonb; acc uuid;
begin
  perform set_config('ais.posting', 'on', true);
  insert into journal_entries (tenant_id, entry_date, memo, created_by, created_at, source_table, source_id)
  values (p_tenant, p_date, p_memo, auth.uid(), ais__sim_ts(p_date, p_src), p_src_table, p_src) returning id into e;
  for ln in select value from jsonb_array_elements(p_lines) loop
    select a.id into acc from accounts a where a.tenant_id = p_tenant and a.code = ln ->> 'acct';
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values (e, acc, (ln ->> 'debit')::numeric, (ln ->> 'credit')::numeric);
  end loop;
  perform set_config('ais.posting', 'off', true);
  return e;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- the seeded sales population with planted anomalies ----------
-- spec: {"count":300,"from":"2027-01-04","to":"2027-01-29","approval_limit":150000}. Deterministic from the instance seed.
--   normal entries: gross amounts are log-uniform over whole decades (so they follow Benford's law), posted on weekdays 09:00-17:00 Manila time,
--                   invoice numbers run in date order
--   planted: 3 DUP_INVOICE (same invoice number, customer and amount re-posted two working days later), 6 ROUND_AMOUNT (gross a multiple of 10,000),
--            4 WEEKEND_POSTING (created on a Saturday or Sunday around 02:00), 5 JUST_BELOW_LIMIT (gross 95.5%-99.5% of the limit),
--            4 missing invoice numbers (SEQUENCE_GAP, one planted row)
create or replace function ais__seed_population(p_instance uuid, p_spec jsonb)
returns int as $$
declare
  inst ais_instances%rowtype; sd bigint; n int; lim numeric; d0 date; d1 date; wd date[] := array[]::date[]; d date; r record; rnn int;
  a_ar uuid; a_sales uuid; a_vat uuid;
  customers text[] := array['Mang Tomas Grocery', 'Bagong Silang Store', 'Lucena Rice Mart', 'Dalisay Wholesale', 'Mercado Foods Inc.', 'Santos Trading', 'Villanueva Eatery', 'Pangasinan Grains', 'Tarlac Feed Supply', 'Kabisig Sari-sari'];
  dups int[] := array[40, 120, 200]; rounds int[] := array[25, 60, 95, 140, 175, 230]; belows int[] := array[50, 85, 130, 165, 215]; weekends int[] := array[30, 100, 180, 260]; gaps int[] := array[70, 150, 210, 270];
  inv int := 9001; cust text; gross numeric; net numeric; vat numeric; e uuid; ts timestamptz; k int; made int := 0; missing int[] := array[]::int[];
  dup_date date; dup_ts timestamptz; ty text; secs int; dups_made jsonb := '[]'::jsonb;
begin
  select * into inst from ais_instances where id = p_instance;
  sd := inst.seed; n := coalesce((p_spec ->> 'count')::int, 300);
  lim := coalesce((p_spec ->> 'approval_limit')::numeric, 150000);
  d0 := coalesce((p_spec ->> 'from')::date, date '2027-01-04'); d1 := coalesce((p_spec ->> 'to')::date, date '2027-01-29');
  for d in select g::date from generate_series(d0, d1, interval '1 day') g loop
    if extract(isodow from d) < 6 then wd := wd || d; end if;
  end loop;
  if array_length(wd, 1) is null then raise exception 'The population needs at least one weekday between from and to.'; end if;
  select a.id into a_ar from accounts a where a.tenant_id = inst.tenant_id and a.code = '1100';
  select a.id into a_sales from accounts a where a.tenant_id = inst.tenant_id and a.code = '4000';
  select a.id into a_vat from accounts a where a.tenant_id = inst.tenant_id and a.code = '2200';
  if a_ar is null or a_sales is null or a_vat is null then raise exception 'The company chart needs accounts 1100, 4000 and 2200.'; end if;

  perform set_config('ais.posting', 'on', true);
  for r in
    select row_number() over (order by q.dt, q.g) as rn, q.dt
      from (select wd[1 + floor(ais__rnd(sd, 'pd' || g) * array_length(wd, 1))::int] as dt, g from generate_series(1, n) g) q
  loop
    rnn := r.rn::int;
    if rnn = any (gaps) then missing := missing || inv; inv := inv + 1; end if;
    cust := customers[1 + floor(ais__rnd(sd, 'pc' || rnn) * array_length(customers, 1))::int];
    secs := 32400 + floor(ais__rnd(sd, 'pt' || rnn) * 28800)::int;                                    -- 09:00 to 17:00
    ts := ((r.dt::timestamp + make_interval(secs => secs)) at time zone 'Asia/Manila');
    ty := null;
    if rnn = any (rounds) then
      gross := (array[3, 5, 6, 8, 9, 11])[array_position(rounds, rnn)] * 10000; ty := 'ROUND_AMOUNT';
    elsif rnn = any (belows) then
      gross := round(lim * (0.955 + ais__rnd(sd, 'pb' || rnn) * 0.04), 2); ty := 'JUST_BELOW_LIMIT';
    else
      gross := round(power(10::numeric, 3 + ais__rnd(sd, 'pa' || rnn) * 2), 2);                      -- 1,000 to 99,999.99: two whole decades
      if gross % 10000 = 0 or gross >= lim * 0.94 then gross := gross + 0.37; end if;               -- keep ordinary entries clear of the planted patterns
    end if;
    net := round(gross / 1.12, 2); vat := round(gross - net, 2);
    if rnn = any (weekends) then
      k := array_position(weekends, rnn);
      ts := (((r.dt + (case when k % 2 = 0 then 7 - extract(isodow from r.dt)::int else 6 - extract(isodow from r.dt)::int end))::timestamp + interval '2 hours 10 minutes') at time zone 'Asia/Manila');
      ty := coalesce(ty, 'WEEKEND_POSTING');
    end if;
    insert into journal_entries (tenant_id, entry_date, memo, created_by, created_at, source_table, source_id)
    values (inst.tenant_id, r.dt, 'Sales invoice INV-' || inv || ' — ' || cust, auth.uid(), ts, 'ais_population', inst.id) returning id into e;
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values (e, a_ar, gross, 0), (e, a_sales, 0, net), (e, a_vat, 0, vat);
    if ty is not null then insert into ais_planted (instance_id, tenant_id, entry_id, type, detail) values (inst.id, inst.tenant_id, e, ty, jsonb_build_object('invoice', inv, 'amount', gross)); end if;
    if rnn = any (dups) then dups_made := dups_made || jsonb_build_object('date', r.dt, 'inv', inv, 'cust', cust, 'gross', gross, 'net', net, 'vat', vat); end if;
    made := made + 1; inv := inv + 1;
  end loop;

  -- the duplicates: same invoice number, customer and amount, posted again two (working) days later
  for r in select x.value as v from jsonb_array_elements(dups_made) as x(value) loop
    dup_date := (r.v ->> 'date')::date + (case when extract(isodow from (r.v ->> 'date')::date + 2) > 5 then 4 else 2 end);
    dup_ts := ((dup_date::timestamp + interval '10 hours 15 minutes') at time zone 'Asia/Manila');
    insert into journal_entries (tenant_id, entry_date, memo, created_by, created_at, source_table, source_id)
    values (inst.tenant_id, dup_date, 'Sales invoice INV-' || (r.v ->> 'inv') || ' — ' || (r.v ->> 'cust'), auth.uid(), dup_ts, 'ais_population', inst.id) returning id into e;
    insert into journal_lines (journal_entry_id, account_id, debit, credit)
    values (e, a_ar, (r.v ->> 'gross')::numeric, 0), (e, a_sales, 0, (r.v ->> 'net')::numeric), (e, a_vat, 0, (r.v ->> 'vat')::numeric);
    insert into ais_planted (instance_id, tenant_id, entry_id, type, detail) values (inst.id, inst.tenant_id, e, 'DUP_INVOICE', jsonb_build_object('invoice', (r.v ->> 'inv')::int, 'amount', (r.v ->> 'gross')::numeric));
    made := made + 1;
  end loop;
  if array_length(missing, 1) is not null then
    insert into ais_planted (instance_id, tenant_id, entry_id, type, detail) values (inst.id, inst.tenant_id, null, 'SEQUENCE_GAP', jsonb_build_object('missing', to_jsonb(missing)));
  end if;
  perform set_config('ais.posting', 'off', true);
  return made;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais__seed_population_trg()
returns trigger as $$
declare
  spec jsonb;
begin
  select s.meta -> 'population' into spec from ais_sets s where s.id = new.set_id;
  if spec is not null then perform ais__seed_population(new.id, spec); end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
drop trigger if exists trg_ais_seed_population on ais_instances;
create trigger trg_ais_seed_population after insert on ais_instances for each row execute function ais__seed_population_trg();

-- an exception the Accounting seat posted is now something for the Audit seat to find
create or replace function ais__plant_from_desk()
returns trigger as $$
begin
  if old.phase = 'ACCOUNTING' and new.phase = 'AUDIT' then
    insert into ais_planted (instance_id, tenant_id, entry_id, type, detail)
    select new.id, new.tenant_id, x.journal_entry_id, k.key ->> 'failed_control', jsonb_build_object('source', 'desk', 'seq', x.seq, 'title', x.title)
      from ais_instance_txns x join ais_instance_keys k on k.txn_id = x.id
     where x.instance_id = new.id and x.status = 'POSTED' and k.key ->> 'decision' = 'HOLD' and x.journal_entry_id is not null;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
drop trigger if exists trg_ais_plant_from_desk on ais_instances;
create trigger trg_ais_plant_from_desk after update of phase on ais_instances for each row execute function ais__plant_from_desk();

-- ---------- the Audit seat's door ----------
create or replace function ais__audit_tenant(p_require_open boolean)
returns uuid as $$
declare
  t uuid := ais__my_tenant('AUDIT'); inst ais_instances%rowtype;
begin
  select * into inst from ais_instances where tenant_id = t;
  if not found then raise exception 'No practice set has been assigned to this company yet.'; end if;
  if inst.phase = 'ACCOUNTING' then raise exception 'The Audit phase opens when the Accounting phase is closed.'; end if;
  if p_require_open and inst.phase <> 'AUDIT' then raise exception 'The audit is closed.'; end if;
  return t;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais_audit_overview()
returns jsonb as $$
declare
  t uuid := ais__audit_tenant(false); inst ais_instances%rowtype;
begin
  select * into inst from ais_instances where tenant_id = t;
  return jsonb_build_object('phase', inst.phase, 'lock_date', inst.lock_date,
    'entries', (select count(*) from journal_entries e where e.tenant_id = t),
    'total_debits', coalesce((select sum(l.debit) from journal_lines l join journal_entries e on e.id = l.journal_entry_id where e.tenant_id = t), 0),
    'first_date', (select min(e.entry_date) from journal_entries e where e.tenant_id = t), 'last_date', (select max(e.entry_date) from journal_entries e where e.tenant_id = t),
    'tests_run', (select count(*) from ais_test_runs r where r.tenant_id = t), 'samples', (select count(*) from ais_samples s where s.tenant_id = t),
    'workpapers', (select count(*) from ais_workpapers w where w.tenant_id = t), 'signed', (select count(*) from ais_workpapers w where w.tenant_id = t and w.status = 'SIGNED'),
    'findings', (select count(*) from ais_findings f where f.tenant_id = t), 'reversed', (select count(*) from ais_findings f where f.tenant_id = t and f.status = 'REVERSED'));
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais_audit_entries(p_from date, p_to date, p_min numeric, p_max numeric, p_search text, p_limit int)
returns table (entry_id uuid, entry_date date, created_at timestamptz, posted_day text, memo text, amount numeric, reversed boolean) as $$
declare
  t uuid := ais__audit_tenant(false);
begin
  return query
  select e.id, e.entry_date, e.created_at, to_char(e.created_at at time zone 'Asia/Manila', 'Dy HH24:MI'), e.memo,
         (select coalesce(sum(l.debit), 0) from journal_lines l where l.journal_entry_id = e.id),
         exists (select 1 from ais_findings f where f.tenant_id = t and f.entry_id = e.id and f.reversal_entry_id is not null)
    from journal_entries e
   where e.tenant_id = t
     and (p_from is null or e.entry_date >= p_from) and (p_to is null or e.entry_date <= p_to)
     and (p_search is null or p_search = '' or e.memo ilike '%' || p_search || '%')
     and (p_min is null or (select coalesce(sum(l.debit), 0) from journal_lines l where l.journal_entry_id = e.id) >= p_min)
     and (p_max is null or (select coalesce(sum(l.debit), 0) from journal_lines l where l.journal_entry_id = e.id) <= p_max)
   order by e.entry_date, e.created_at limit least(coalesce(p_limit, 300), 1000);
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- the tests ----------
-- kinds: DUPLICATE, ROUND (mod), WEEKEND, AFTER_HOURS (from_hour, to_hour), JUST_BELOW (limit, band_pct), GAP, BENFORD
create or replace function ais_test_run(p_kind text, p_params jsonb)
returns jsonb as $$
declare
  t uuid := ais__audit_tenant(false); rows_ jsonb := '[]'::jsonb; n int := 0; md numeric; lim numeric; band numeric; lo int; hi int; digits jsonb := '[]'::jsonb;
  total int; mad numeric := 0; i int; act int; exp_p numeric; stats jsonb := '{}'::jsonb; shown jsonb;
begin
  if p_kind not in ('DUPLICATE', 'ROUND', 'WEEKEND', 'AFTER_HOURS', 'JUST_BELOW', 'GAP', 'BENFORD') then raise exception 'Unknown test.'; end if;
  p_params := coalesce(p_params, '{}'::jsonb);
  create temporary table if not exists ais_tmp_pop (id uuid, d date, ts timestamptz, memo text, amt numeric, ref int, cust text) on commit drop;
  delete from ais_tmp_pop;
  insert into ais_tmp_pop
    select e.id, e.entry_date, e.created_at, e.memo, (select coalesce(sum(l.debit), 0) from journal_lines l where l.journal_entry_id = e.id),
           nullif(substring(e.memo from 'INV-([0-9]+)'), '')::int, trim(substring(e.memo from '— (.*)$'))
      from journal_entries e where e.tenant_id = t and e.source_table is distinct from 'ais_findings';

  if p_kind = 'DUPLICATE' then
    select coalesce(jsonb_agg(jsonb_build_object('entry_id', z.id, 'entry_date', z.d, 'memo', z.memo, 'amount', z.amt,
             'reason', 'Same amount for the same customer within 7 days of an earlier entry (' || z.prev_memo || ').') order by z.d), '[]'::jsonb), count(*)
      into rows_, n
      from (select a.id, a.d, a.memo, a.amt, b.memo as prev_memo, row_number() over (partition by a.id order by b.ts) as rn
              from ais_tmp_pop a join ais_tmp_pop b on b.id <> a.id and b.cust = a.cust and b.amt = a.amt and abs(b.d - a.d) <= 7 and (b.ts < a.ts or (b.ts = a.ts and b.id < a.id))) z
     where z.rn = 1;
  elsif p_kind = 'ROUND' then
    md := coalesce((p_params ->> 'mod')::numeric, 10000);
    select coalesce(jsonb_agg(jsonb_build_object('entry_id', id, 'entry_date', d, 'memo', memo, 'amount', amt, 'reason', 'Amount is an exact multiple of ' || md) order by d), '[]'::jsonb), count(*)
      into rows_, n from ais_tmp_pop where amt >= md and amt % md = 0;
  elsif p_kind = 'WEEKEND' then
    select coalesce(jsonb_agg(jsonb_build_object('entry_id', id, 'entry_date', d, 'memo', memo, 'amount', amt,
             'reason', 'Posted on ' || to_char(ts at time zone 'Asia/Manila', 'FMDay HH24:MI')) order by d), '[]'::jsonb), count(*)
      into rows_, n from ais_tmp_pop where extract(isodow from ts at time zone 'Asia/Manila') in (6, 7);
  elsif p_kind = 'AFTER_HOURS' then
    lo := coalesce((p_params ->> 'from_hour')::int, 6); hi := coalesce((p_params ->> 'to_hour')::int, 21);
    select coalesce(jsonb_agg(jsonb_build_object('entry_id', id, 'entry_date', d, 'memo', memo, 'amount', amt,
             'reason', 'Posted at ' || to_char(ts at time zone 'Asia/Manila', 'HH24:MI')) order by d), '[]'::jsonb), count(*)
      into rows_, n from ais_tmp_pop where extract(hour from ts at time zone 'Asia/Manila') < lo or extract(hour from ts at time zone 'Asia/Manila') >= hi;
  elsif p_kind = 'JUST_BELOW' then
    lim := coalesce((p_params ->> 'limit')::numeric, 150000); band := coalesce((p_params ->> 'band_pct')::numeric, 5);
    select coalesce(jsonb_agg(jsonb_build_object('entry_id', id, 'entry_date', d, 'memo', memo, 'amount', amt,
             'reason', 'Within ' || band || '% below the ' || lim || ' approval limit') order by d), '[]'::jsonb), count(*)
      into rows_, n from ais_tmp_pop where amt < lim and amt >= lim * (1 - band / 100);
  elsif p_kind = 'GAP' then
    select coalesce(jsonb_agg(jsonb_build_object('entry_id', null, 'entry_date', null, 'memo', 'INV-' || g, 'amount', null,
             'reason', 'Invoice number ' || g || ' is missing from the sequence') order by g), '[]'::jsonb), count(*)
      into rows_, n from generate_series((select min(ref) from ais_tmp_pop), (select max(ref) from ais_tmp_pop)) g where not exists (select 1 from ais_tmp_pop p where p.ref = g);
  else
    select count(*) into total from ais_tmp_pop where amt > 0;
    for i in 1..9 loop
      select count(*) into act from ais_tmp_pop where amt > 0 and left(regexp_replace(amt::text, '^0\.0*|\.', ''), 1) = i::text;
      exp_p := log(1 + 1.0 / i);
      digits := digits || jsonb_build_object('digit', i, 'actual', act, 'actual_pct', case when total > 0 then round(act::numeric / total, 4) else 0 end, 'expected_pct', round(exp_p, 4));
      if total > 0 then mad := mad + abs(act::numeric / total - exp_p); end if;
    end loop;
    mad := mad / 9;
    stats := jsonb_build_object('n', total, 'digits', digits, 'mad', round(mad, 5),
      'conformity', case when total < 300 then 'Too few entries for a reliable Benford test (about 300 are needed).' when mad <= 0.006 then 'Close conformity' when mad <= 0.012 then 'Acceptable conformity'
                         when mad <= 0.015 then 'Marginally acceptable conformity' else 'Nonconformity: investigate' end);
  end if;

  insert into ais_test_runs (tenant_id, kind, params, flagged, run_by) values (t, p_kind, p_params, n, auth.uid());
  if jsonb_array_length(rows_) > 200 then
    select jsonb_agg(x.value) into shown from (select value from jsonb_array_elements(rows_) limit 200) x;
  else shown := rows_; end if;
  return jsonb_build_object('kind', p_kind, 'flagged', n, 'rows', shown, 'stats', stats, 'population', (select count(*) from ais_tmp_pop));
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- sampling: the same seed always draws the same sample ----------
create or replace function ais_sample_draw(p_method text, p_n int, p_seed bigint, p_interval numeric)
returns uuid as $$
declare
  t uuid := ais__audit_tenant(true); sid uuid; sd bigint; start_at numeric; cnt int;
begin
  if p_method not in ('RANDOM', 'MUS') then raise exception 'Choose random or monetary-unit sampling.'; end if;
  sd := coalesce(p_seed, floor(random() * 2147483647)::bigint);
  select count(*) into cnt from journal_entries e where e.tenant_id = t and e.source_table is distinct from 'ais_findings';
  if cnt = 0 then raise exception 'There is nothing in the ledger to sample.'; end if;
  if p_method = 'RANDOM' and (p_n is null or p_n < 1 or p_n > 100) then raise exception 'Choose a sample size from 1 to 100.'; end if;
  if p_method = 'MUS' and (p_interval is null or p_interval <= 0) then raise exception 'Choose a sampling interval above 0 (for example the tolerable misstatement divided by the confidence factor).'; end if;
  insert into ais_samples (tenant_id, method, params, seed, created_by) values (t, p_method, jsonb_build_object('n', p_n, 'interval', p_interval), sd, auth.uid()) returning id into sid;
  if p_method = 'RANDOM' then
    insert into ais_sample_items (sample_id, tenant_id, entry_id, selection_reason)
    select sid, t, e.id, 'Random selection (seed ' || sd || ')' from journal_entries e where e.tenant_id = t and e.source_table is distinct from 'ais_findings'
     order by md5(sd::text || ':' || e.id::text) limit p_n;
  else
    start_at := floor(ais__rnd(sd, 'mus') * p_interval);
    insert into ais_sample_items (sample_id, tenant_id, entry_id, selection_reason)
    select sid, t, q.id, 'A sampling point (every ' || p_interval || ', starting at ' || start_at || ') falls in this entry'
      from (select e.id, a.amt, sum(a.amt) over (order by e.entry_date, e.created_at, e.id) as cum
              from journal_entries e join lateral (select coalesce(sum(l.debit), 0) as amt from journal_lines l where l.journal_entry_id = e.id) a on true
             where e.tenant_id = t and e.source_table is distinct from 'ais_findings') q
     where floor((q.cum + start_at) / p_interval) > floor((q.cum - q.amt + start_at) / p_interval) limit 100;
  end if;
  return sid;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_sample_items(p_sample uuid)
returns table (item_id uuid, entry_id uuid, entry_date date, memo text, amount numeric, selection_reason text, result text, note text) as $$
declare
  t uuid := ais__audit_tenant(false);
begin
  if not exists (select 1 from ais_samples s where s.id = p_sample and s.tenant_id = t) then raise exception 'That sample is not in your company.'; end if;
  return query
  select i.id, i.entry_id, e.entry_date, e.memo, (select coalesce(sum(l.debit), 0) from journal_lines l where l.journal_entry_id = e.id), i.selection_reason, i.result, i.note
    from ais_sample_items i join journal_entries e on e.id = i.entry_id where i.sample_id = p_sample order by e.entry_date, e.created_at;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais_sample_mark(p_item uuid, p_result text, p_note text)
returns void as $$
declare
  t uuid := ais__audit_tenant(true);
begin
  if p_result not in ('PASS', 'EXCEPTION') then raise exception 'Mark the item PASS or EXCEPTION.'; end if;
  update ais_sample_items set result = p_result, note = p_note where id = p_item and tenant_id = t;
  if not found then raise exception 'That sample item is not in your company.'; end if;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- workpapers and findings ----------
create or replace function ais_save_workpaper(p_id uuid, p_ref text, p_title text, p_objective text, p_procedure text, p_conclusion text, p_sample uuid)
returns uuid as $$
declare
  t uuid := ais__audit_tenant(true); w ais_workpapers%rowtype; nid uuid;
begin
  if coalesce(trim(p_ref), '') = '' or coalesce(trim(p_title), '') = '' then raise exception 'A workpaper needs a reference (for example A-1) and a title.'; end if;
  if p_sample is not null and not exists (select 1 from ais_samples s where s.id = p_sample and s.tenant_id = t) then raise exception 'That sample is not in your company.'; end if;
  if p_id is null then
    insert into ais_workpapers (tenant_id, ref_no, title, objective, procedure_text, conclusion, sample_id, created_by)
    values (t, trim(p_ref), trim(p_title), p_objective, p_procedure, p_conclusion, p_sample, auth.uid()) returning id into nid;
    return nid;
  end if;
  select * into w from ais_workpapers where id = p_id and tenant_id = t for update;
  if not found then raise exception 'That workpaper is not in your company.'; end if;
  if w.status = 'SIGNED' then raise exception 'A signed workpaper cannot be changed.'; end if;
  update ais_workpapers set ref_no = trim(p_ref), title = trim(p_title), objective = p_objective, procedure_text = p_procedure, conclusion = p_conclusion, sample_id = p_sample where id = p_id;
  return p_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_sign_workpaper(p_id uuid)
returns void as $$
declare
  t uuid := ais__audit_tenant(true); w ais_workpapers%rowtype;
begin
  select * into w from ais_workpapers where id = p_id and tenant_id = t for update;
  if not found then raise exception 'That workpaper is not in your company.'; end if;
  if w.status = 'SIGNED' then return; end if;
  if coalesce(trim(w.objective), '') = '' or coalesce(trim(w.procedure_text), '') = '' or coalesce(trim(w.conclusion), '') = '' then raise exception 'Fill in the objective, the procedure and the conclusion before signing.'; end if;
  update ais_workpapers set status = 'SIGNED', signed_at = now() where id = p_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_save_finding(p_entry uuid, p_type text, p_condition text, p_criteria text, p_cause text, p_effect text, p_recommendation text, p_severity text, p_workpaper uuid)
returns uuid as $$
declare
  t uuid := ais__audit_tenant(true); nid uuid;
begin
  if not exists (select 1 from ais_finding_types f where f.tag = p_type) then raise exception 'Choose the type of exception.'; end if;
  if char_length(coalesce(trim(p_condition), '')) < 10 then raise exception 'Describe the condition: what you found (at least a sentence).'; end if;
  if p_severity not in ('LOW', 'MODERATE', 'HIGH', 'CRITICAL') then raise exception 'Choose a severity.'; end if;
  if p_entry is not null and not exists (select 1 from journal_entries e where e.id = p_entry and e.tenant_id = t) then raise exception 'That entry is not in your company.'; end if;
  if p_workpaper is not null and not exists (select 1 from ais_workpapers w where w.id = p_workpaper and w.tenant_id = t) then raise exception 'That workpaper is not in your company.'; end if;
  if exists (select 1 from ais_findings f where f.tenant_id = t and f.entry_id is not distinct from p_entry and f.exception_type = p_type) then raise exception 'You already reported that exception for that entry.'; end if;
  insert into ais_findings (tenant_id, entry_id, exception_type, condition_text, criteria_text, cause_text, effect_text, recommendation, severity, workpaper_id, created_by)
  values (t, p_entry, p_type, trim(p_condition), p_criteria, p_cause, p_effect, p_recommendation, p_severity, p_workpaper, auth.uid()) returning id into nid;
  return nid;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- reversing a wrongly posted entry (dated after the closed period) ----------
create or replace function ais_reverse_finding(p_finding uuid, p_date date, p_reason text)
returns uuid as $$
declare
  t uuid := ais__audit_tenant(true); f ais_findings%rowtype; je journal_entries%rowtype; locked date; lines jsonb; nid uuid;
begin
  select * into f from ais_findings where id = p_finding and tenant_id = t for update;
  if not found then raise exception 'That finding is not in your company.'; end if;
  if f.entry_id is null then raise exception 'This finding is not about a single entry, so there is nothing to reverse.'; end if;
  if f.reversal_entry_id is not null then raise exception 'That entry has already been reversed.'; end if;
  if char_length(coalesce(trim(p_reason), '')) < 10 then raise exception 'Give a reason for the reversal (at least ten characters).'; end if;
  select * into je from journal_entries where id = f.entry_id and tenant_id = t;
  if je.source_table = 'ais_findings' then raise exception 'A reversal cannot itself be reversed.'; end if;
  select books_locked_through into locked from tenants where id = t;
  if p_date is null or (locked is not null and p_date <= locked) then raise exception 'The period through % is closed. Date the reversal after it.', coalesce(locked::text, 'the close'); end if;
  select jsonb_agg(jsonb_build_object('acct', a.code, 'debit', l.credit, 'credit', l.debit)) into lines
    from journal_lines l join accounts a on a.id = l.account_id where l.journal_entry_id = je.id;
  nid := ais__post_entry_src(t, p_date, 'Reversal of ' || je.memo || ' — ' || trim(p_reason), 'ais_findings', f.id, lines);
  update ais_findings set reversal_entry_id = nid, status = 'REVERSED' where id = f.id;
  return nid;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- scoring ----------
create or replace function ais__audit_score(p_tenant uuid)
returns jsonb as $$
declare
  pl record; fnd record; pts numeric := 0; maxp numeric := 0; full_ int := 0; partial_ int := 0; missed_ int := 0; fp int := 0;
  det jsonb := '[]'::jsonb; fpd jsonb := '[]'::jsonb; st text; bonus boolean; mm text;
begin
  for pl in select p.* from ais_planted p where p.tenant_id = p_tenant order by p.type, p.id loop
    maxp := maxp + 6 + case when pl.entry_id is not null then 2 else 0 end;
    bonus := false;
    select * into fnd from ais_findings f where f.tenant_id = p_tenant and f.exception_type = pl.type and f.entry_id is not distinct from pl.entry_id limit 1;
    if found then
      pts := pts + 6; full_ := full_ + 1; st := 'found';
      if pl.entry_id is not null and fnd.reversal_entry_id is not null then pts := pts + 2; bonus := true; end if;
    else
      select * into fnd from ais_findings f where f.tenant_id = p_tenant and pl.entry_id is not null and f.entry_id = pl.entry_id limit 1;
      if found then pts := pts + 3; partial_ := partial_ + 1; st := 'wrong_type';
      else missed_ := missed_ + 1; st := 'missed'; end if;
    end if;
    mm := null;
    if pl.entry_id is not null then select e.memo into mm from journal_entries e where e.id = pl.entry_id; end if;
    det := det || jsonb_build_object('type', pl.type, 'entry_id', pl.entry_id,
      'memo', coalesce(mm, case when pl.type = 'SEQUENCE_GAP' then 'Missing invoice numbers ' || (pl.detail -> 'missing')::text end), 'status', st, 'reversed', bonus);
  end loop;
  for fnd in select f.* from ais_findings f where f.tenant_id = p_tenant
     and not exists (select 1 from ais_planted p where p.tenant_id = p_tenant and p.entry_id is not distinct from f.entry_id and (f.entry_id is not null or p.type = f.exception_type)) loop
    fp := fp + 1; pts := pts - 2;
    mm := null;
    if fnd.entry_id is not null then select e.memo into mm from journal_entries e where e.id = fnd.entry_id; end if;
    fpd := fpd || jsonb_build_object('type', fnd.exception_type, 'memo', mm, 'condition', fnd.condition_text);
  end loop;
  return jsonb_build_object('visible', true, 'points', greatest(0, pts), 'max', maxp, 'planted', full_ + partial_ + missed_, 'found', full_, 'wrong_type', partial_, 'missed', missed_,
    'false_positives', fp, 'details', det, 'false_positive_details', fpd);
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais_close_audit()
returns jsonb as $$
declare
  t uuid := ais__audit_tenant(true);
begin
  update ais_instances set phase = 'CLOSED' where tenant_id = t;
  return ais__audit_score(t);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_audit_score()
returns jsonb as $$
declare
  t uuid := my_tenant_id(); inst ais_instances%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into inst from ais_instances where tenant_id = t;
  if not found then return null; end if;
  if not is_teacher() and inst.phase <> 'CLOSED' then return jsonb_build_object('visible', false, 'message', 'The audit score appears when you close the audit.'); end if;
  return ais__audit_score(t);
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais_teacher_audit_score(p_tenant uuid)
returns jsonb as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see the planted exceptions.'; end if;
  perform assert_ais_tenant(p_tenant);
  return ais__audit_score(p_tenant);
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- turn the population on for the first practice set ----------
update ais_sets set meta = meta || jsonb_build_object('population', jsonb_build_object('count', 300, 'from', '2027-01-04', 'to', '2027-01-29', 'approval_limit', 150000))
 where id = 'sinag-revenue-jan-2027';

-- ---------- who may call what ----------
revoke execute on function ais__sim_ts(date, uuid), ais__post_entry_src(uuid, date, text, text, uuid, jsonb), ais__seed_population(uuid, jsonb), ais__seed_population_trg(), ais__plant_from_desk(),
  ais__audit_tenant(boolean), ais__audit_score(uuid) from public, anon, authenticated;
revoke execute on function ais_audit_overview(), ais_audit_entries(date, date, numeric, numeric, text, int), ais_test_run(text, jsonb), ais_sample_draw(text, int, bigint, numeric),
  ais_sample_items(uuid), ais_sample_mark(uuid, text, text), ais_save_workpaper(uuid, text, text, text, text, text, uuid), ais_sign_workpaper(uuid),
  ais_save_finding(uuid, text, text, text, text, text, text, text, uuid), ais_reverse_finding(uuid, date, text), ais_close_audit(), ais_audit_score(), ais_teacher_audit_score(uuid) from public, anon;
grant execute on function ais_audit_overview(), ais_audit_entries(date, date, numeric, numeric, text, int), ais_test_run(text, jsonb), ais_sample_draw(text, int, bigint, numeric),
  ais_sample_items(uuid), ais_sample_mark(uuid, text, text), ais_save_workpaper(uuid, text, text, text, text, text, uuid), ais_sign_workpaper(uuid),
  ais_save_finding(uuid, text, text, text, text, text, text, text, uuid), ais_reverse_finding(uuid, date, text), ais_close_audit(), ais_audit_score(), ais_teacher_audit_score(uuid) to authenticated;
