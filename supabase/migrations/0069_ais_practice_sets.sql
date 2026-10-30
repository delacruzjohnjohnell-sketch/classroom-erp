-- ============================================================
-- Classroom ERP — migration 0069 (AIS edition, step 3: practice sets, the Accounting desk, scoring)
--
-- Needs 0066–0068. ADDITIVE: new ais_ tables and functions only. Nothing existing is changed.
--
-- A practice SET is a list of transactions tied to a handout topic. Each transaction is a template (the document packet, with {{variables}} that are
-- filled per company from a seed, so every student's numbers differ) and a hidden KEY (the right decision, the right journal, the control that fails).
-- Assigning a set to a company makes an INSTANCE: the packets are resolved from the seed and stored, the resolved keys are stored apart.
--
--   Keys never reach a student: ais_sets, ais_instance_keys and ais_results have row-level security on and NO policy; only the functions below read them.
--   The Accounting seat decides each packet with ais_decide: POST (with a journal) or HOLD (naming the failed control). A decision is final.
--   Practice mode (IMMEDIATE): the right journal for a valid document is checked at once; a wrong one is refused (not posted) and costs a point.
--   Graded mode (AFTER_CLOSE): every decision posts as chosen, nothing is revealed, and scores appear when the Accounting phase is closed.
--   A wrongly posted exception stays in the books for the Audit seat to find.
--
--   Points per document (max 6):  valid + posted + right journal 6 (practice: minus 1 per refused try, floor 1) · valid + posted + wrong journal 3 (graded only)
--     · valid + held 0 · exception + held + right control 6 · exception + held + wrong control 3 · exception + posted 0.
--
-- ROLLBACK:
--   drop function if exists ais_teacher_review(uuid), ais_my_score(), ais_close_accounting(boolean), ais_decide(uuid, text, text, jsonb), ais_packet(uuid), ais_inbox(),
--     ais_my_instance(), ais_assign_set(uuid, text, bigint, text, date), ais_set_list(), ais_set_import(jsonb), ais__post_entry(uuid, date, text, uuid, jsonb),
--     ais__validate_lines(uuid, jsonb), ais__journal_matches(jsonb, jsonb), ais__instantiate(uuid), ais__subst(jsonb, jsonb), ais__subst_text(text, jsonb),
--     ais__resolve_vars(bigint, text, jsonb), ais__val(jsonb, jsonb), ais__rnd(bigint, text), ais__results_visible(uuid);
--   drop table if exists ais_results, ais_decisions, ais_instance_keys, ais_instance_txns, ais_instances, ais_set_txns, ais_sets, ais_controls;
-- ============================================================

-- ---------- the controls a student can name when holding a document (not secret) ----------
create table if not exists ais_controls (
  tag           text primary key,
  label         text not null,
  hall_category text not null,
  description   text not null
);
insert into ais_controls (tag, label, hall_category, description) values
  ('CREDIT_LIMIT',       'Credit limit exceeded without authorization', 'Transaction authorization', 'The sale takes the customer over the approved credit limit and there is no manager approval.'),
  ('NO_SHIPPING_NOTICE', 'Billed with no shipping notice',              'Existence / validity',        'An invoice exists but there is no signed delivery receipt or shipping notice proving the goods left.'),
  ('NO_RECEIVING_REPORT','Three-way match failed: no receiving report', 'Existence / validity',        'The supplier invoice has no receiving report, so receipt of the goods is not proven.'),
  ('DUP_INVOICE',        'Duplicate invoice',                           'Accuracy / validity',         'This invoice number and amount were already recorded.'),
  ('PRICE_MISMATCH',     'Price differs from the approved price list',  'Accuracy',                    'The unit price billed is not the approved price.'),
  ('QTY_MISMATCH',       'Quantity billed differs from quantity shipped','Accuracy / completeness',    'The invoice bills more (or fewer) units than the delivery receipt shows.'),
  ('SOD',                'Segregation of duties violation',             'Segregation of duties',       'The same person prepared and approved the document.'),
  ('NO_AUTHORIZATION',   'Missing approval signature',                  'Transaction authorization',   'A required approval is blank.'),
  ('CUTOFF',             'Cutoff error: recorded in the wrong period',  'Timing / cutoff',             'The document belongs to a different period from the one it is dated in.'),
  ('NO_CREDIT_MEMO',     'Return without an approved credit memo',      'Transaction authorization',   'Goods came back but there is no approved credit memo.'),
  ('UNAPPROVED_VENDOR',  'Supplier not on the approved vendor list',    'Master data / authorization', 'The supplier is not on the approved vendor master.'),
  ('MATH_ERROR',         'Arithmetic error on the document',            'Accuracy',                    'Extensions or totals on the document do not add up.')
on conflict (tag) do nothing;
alter table ais_controls enable row level security;
drop policy if exists "ais controls read" on ais_controls;
create policy "ais controls read" on ais_controls for select using (auth.uid() is not null);

-- ---------- sets (teacher only: no policies) ----------
create table if not exists ais_sets (
  id         text primary key,
  title      text not null,
  topic      text,
  summary    text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists ais_set_txns (
  id       uuid primary key default gen_random_uuid(),
  set_id   text not null references ais_sets(id) on delete cascade,
  seq      int not null,
  template jsonb not null,
  key      jsonb not null,
  unique (set_id, seq)
);
alter table ais_sets enable row level security;
alter table ais_set_txns enable row level security;

-- ---------- one instance per company ----------
create table if not exists ais_instances (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null unique references tenants(id) on delete cascade,
  set_id               text not null references ais_sets(id),
  seed                 bigint not null,
  mode                 text not null default 'AFTER_CLOSE' check (mode in ('IMMEDIATE', 'AFTER_CLOSE')),
  phase                text not null default 'ACCOUNTING' check (phase in ('ACCOUNTING', 'AUDIT', 'CLOSED')),
  lock_date            date,
  created_by           uuid,
  created_at           timestamptz not null default now(),
  accounting_closed_at timestamptz
);
create table if not exists ais_instance_txns (
  id               uuid primary key default gen_random_uuid(),
  instance_id      uuid not null references ais_instances(id) on delete cascade,
  tenant_id        uuid not null references tenants(id) on delete cascade,
  seq              int not null,
  title            text not null,
  doc_date         date not null,
  packet           jsonb not null,
  status           text not null default 'PENDING' check (status in ('PENDING', 'POSTED', 'HELD')),
  journal_entry_id uuid unique,
  decided_by       uuid,
  decided_at       timestamptz,
  wrong_attempts   int not null default 0,
  unique (instance_id, seq)
);
create index if not exists ais_instance_txns_tenant on ais_instance_txns (tenant_id, seq);
create table if not exists ais_instance_keys (
  txn_id uuid primary key references ais_instance_txns(id) on delete cascade,
  key    jsonb not null
);
create table if not exists ais_decisions (
  id             uuid primary key default gen_random_uuid(),
  txn_id         uuid not null unique references ais_instance_txns(id) on delete cascade,
  tenant_id      uuid not null references tenants(id) on delete cascade,
  user_id        uuid,
  decision       text not null check (decision in ('POST', 'HOLD')),
  failed_control text,
  lines          jsonb,
  created_at     timestamptz not null default now()
);
create table if not exists ais_results (
  txn_id           uuid primary key references ais_instance_txns(id) on delete cascade,
  tenant_id        uuid not null references tenants(id) on delete cascade,
  user_id          uuid,
  points           numeric not null,
  max_points       numeric not null default 6,
  correct_decision boolean not null,
  correct_control  boolean,
  journal_ok       boolean,
  detail           text
);

alter table ais_instances enable row level security;
alter table ais_instance_txns enable row level security;
alter table ais_instance_keys enable row level security;
alter table ais_decisions enable row level security;
alter table ais_results enable row level security;
drop policy if exists "ais read" on ais_instances;
create policy "ais read" on ais_instances for select using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'AIS');
drop policy if exists "ais read" on ais_instance_txns;
create policy "ais read" on ais_instance_txns for select using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'AIS');
drop policy if exists "ais read" on ais_decisions;
create policy "ais read" on ais_decisions for select using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'AIS');
-- ais_sets, ais_set_txns, ais_instance_keys, ais_results: no policy on purpose.

-- ---------- seeded randomness: same seed, same numbers, every time ----------
create or replace function ais__rnd(p_seed bigint, p_key text)
returns numeric as $$
  select (('x' || substr(md5(p_seed::text || ':' || p_key), 1, 12))::bit(48)::bigint)::numeric / 281474976710656;
$$ language sql immutable set search_path = public;

-- a number, or the name of a variable (a dotted path reaches inside a picked object)
create or replace function ais__val(p_vars jsonb, p_x jsonb)
returns numeric as $$
declare
  raw jsonb;
begin
  if p_x is null then raise exception 'A value is missing in the template.'; end if;
  if jsonb_typeof(p_x) = 'number' then return (p_x #>> '{}')::numeric; end if;
  if jsonb_typeof(p_x) = 'string' then
    raw := p_vars #> string_to_array(p_x #>> '{}', '.');
    if raw is null then raise exception 'Template uses an unknown variable "%".', p_x #>> '{}'; end if;
    return (raw #>> '{}')::numeric;
  end if;
  raise exception 'A template value must be a number or a variable name.';
end;
$$ language plpgsql immutable set search_path = public;

-- variables are declared in order, so a later one can use an earlier one:
--   {"name":"qty","range":[20,80,5]}  {"name":"cust","pick":[{...},{...}]}  {"name":"net","op":"mul","a":"qty","b":"price","fmt":"money"}
--   ops: mul(a,b)  add(terms[])  sub(a,b)  pct(a,pct)   dp = decimals to round to (default 2)
create or replace function ais__resolve_vars(p_seed bigint, p_key text, p_vars jsonb)
returns jsonb as $$
declare
  vars jsonb := '{}'::jsonb;
  fmt jsonb := '{}'::jsonb;
  e jsonb; nm text; v jsonb; arr jsonb; lo numeric; hi numeric; st numeric; n int; dp int; s numeric; tm jsonb;
begin
  for e in select x.value from jsonb_array_elements(coalesce(p_vars, '[]'::jsonb)) with ordinality as x(value, ord) order by x.ord loop
    nm := e ->> 'name';
    if nm is null then raise exception 'Every template variable needs a name.'; end if;
    dp := coalesce((e ->> 'dp')::int, 2);
    if e ? 'pick' then
      arr := e -> 'pick';
      if jsonb_typeof(arr) <> 'array' or jsonb_array_length(arr) = 0 then raise exception 'Variable "%": pick needs a list.', nm; end if;
      v := arr -> (floor(ais__rnd(p_seed, p_key || ':' || nm) * jsonb_array_length(arr)))::int;
    elsif e ? 'range' then
      lo := (e -> 'range' ->> 0)::numeric; hi := (e -> 'range' ->> 1)::numeric; st := coalesce((e -> 'range' ->> 2)::numeric, 1);
      if st <= 0 or hi < lo then raise exception 'Variable "%": range must be [low, high, step] with step above 0.', nm; end if;
      n := floor((hi - lo) / st)::int + 1;
      v := to_jsonb(lo + st * floor(ais__rnd(p_seed, p_key || ':' || nm) * n));
    elsif e ->> 'op' = 'mul' then v := to_jsonb(round(ais__val(vars, e -> 'a') * ais__val(vars, e -> 'b'), dp));
    elsif e ->> 'op' = 'sub' then v := to_jsonb(round(ais__val(vars, e -> 'a') - ais__val(vars, e -> 'b'), dp));
    elsif e ->> 'op' = 'pct' then v := to_jsonb(round(ais__val(vars, e -> 'a') * ais__val(vars, e -> 'pct') / 100, dp));
    elsif e ->> 'op' = 'add' then
      s := 0;
      for tm in select value from jsonb_array_elements(e -> 'terms') loop s := s + ais__val(vars, tm); end loop;
      v := to_jsonb(round(s, dp));
    else
      raise exception 'Variable "%": use pick, range, or an op (mul, sub, pct, add).', nm;
    end if;
    vars := vars || jsonb_build_object(nm, v);
    if e ? 'fmt' then fmt := fmt || jsonb_build_object(nm, e ->> 'fmt'); end if;
  end loop;
  return vars || jsonb_build_object('_fmt', fmt);
end;
$$ language plpgsql immutable set search_path = public;

create or replace function ais__subst_text(p_text text, p_vars jsonb)
returns text as $$
declare
  m text[]; raw jsonb; f text; val text; num numeric; r text := p_text;
begin
  for m in select regexp_matches(p_text, '\{\{([A-Za-z0-9_.]+)\}\}', 'g') loop
    raw := p_vars #> string_to_array(m[1], '.');
    if raw is null then raise exception 'Template uses an unknown variable {{%}}.', m[1]; end if;
    if jsonb_typeof(raw) = 'number' then
      num := (raw #>> '{}')::numeric;
      f := p_vars -> '_fmt' ->> m[1];
      if f = 'money' then val := to_char(num, 'FM999,999,999,990.00');
      elsif num = trunc(num) then val := num::bigint::text;
      else val := trim(trailing '0' from num::text);
      end if;
    else
      val := raw #>> '{}';
    end if;
    r := replace(r, '{{' || m[1] || '}}', val);
  end loop;
  return r;
end;
$$ language plpgsql immutable set search_path = public;

create or replace function ais__subst(p_j jsonb, p_vars jsonb)
returns jsonb as $$
begin
  if p_j is null then return null; end if;
  case jsonb_typeof(p_j)
    when 'string' then return to_jsonb(ais__subst_text(p_j #>> '{}', p_vars));
    when 'object' then return coalesce((select jsonb_object_agg(k, ais__subst(v, p_vars)) from jsonb_each(p_j) as t(k, v)), '{}'::jsonb);
    when 'array'  then return coalesce((select jsonb_agg(ais__subst(x.value, p_vars) order by x.ord) from jsonb_array_elements(p_j) with ordinality as x(value, ord)), '[]'::jsonb);
    else return p_j;
  end case;
end;
$$ language plpgsql immutable set search_path = public;

-- ---------- turn a set into an instance: resolve every packet and key from the seed ----------
create or replace function ais__instantiate(p_instance uuid)
returns int as $$
declare
  inst ais_instances%rowtype;
  s record; vars jsonb; packet jsonb; k jsonb; jr jsonb; ln jsonb; new_txn uuid; n int := 0; d date;
begin
  select * into inst from ais_instances where id = p_instance;
  if not found then raise exception 'Instance not found.'; end if;
  for s in select * from ais_set_txns where set_id = inst.set_id order by seq loop
    vars := ais__resolve_vars(inst.seed, 'tx' || s.seq, s.template -> 'vars');
    packet := ais__subst(s.template - 'vars', vars);
    d := (packet ->> 'date')::date;
    jr := '[]'::jsonb;
    if s.key ->> 'decision' = 'POST' then
      for ln in select value from jsonb_array_elements(s.key -> 'journal') loop
        jr := jr || jsonb_build_object('acct', ln ->> 'acct',
                                       'debit',  case when ln ? 'dr' then round(ais__val(vars, ln -> 'dr'), 2) else 0 end,
                                       'credit', case when ln ? 'cr' then round(ais__val(vars, ln -> 'cr'), 2) else 0 end);
      end loop;
    end if;
    k := jsonb_build_object('decision', s.key ->> 'decision', 'failed_control', s.key ->> 'failed_control',
                            'explanation', ais__subst(s.key -> 'explanation', vars), 'journal', jr);
    insert into ais_instance_txns (instance_id, tenant_id, seq, title, doc_date, packet)
    values (inst.id, inst.tenant_id, s.seq, coalesce(packet ->> 'title', 'Document ' || s.seq), d, packet) returning id into new_txn;
    insert into ais_instance_keys (txn_id, key) values (new_txn, k);
    n := n + 1;
  end loop;
  return n;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- the teacher's tools ----------
create or replace function ais_set_import(p_def jsonb)
returns int as $$
declare
  t jsonb; n int := 0; seen int[] := array[]::int[]; q int; dec text; fc text;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can import a practice set.'; end if;
  if coalesce(p_def ->> 'id', '') = '' or coalesce(p_def ->> 'title', '') = '' then raise exception 'A set needs an id and a title.'; end if;
  if jsonb_typeof(p_def -> 'txns') <> 'array' or jsonb_array_length(p_def -> 'txns') = 0 then raise exception 'A set needs at least one transaction.'; end if;
  if exists (select 1 from ais_instances where set_id = p_def ->> 'id') then raise exception 'That set is already assigned to a company; import it under a new id instead.'; end if;
  for t in select value from jsonb_array_elements(p_def -> 'txns') loop
    q := (t ->> 'seq')::int;
    if q is null or q = any (seen) then raise exception 'Every transaction needs a distinct seq.'; end if;
    seen := seen || q;
    if t -> 'template' ->> 'title' is null or t -> 'template' ->> 'date' is null or jsonb_typeof(t -> 'template' -> 'docs') <> 'array' then
      raise exception 'Transaction %: the template needs a title, a date and a list of docs.', q; end if;
    dec := t -> 'key' ->> 'decision'; fc := t -> 'key' ->> 'failed_control';
    if dec is null or dec not in ('POST', 'HOLD') then raise exception 'Transaction %: key.decision must be POST or HOLD.', q; end if;
    if dec = 'HOLD' and not exists (select 1 from ais_controls c where c.tag = fc) then raise exception 'Transaction %: key.failed_control must be one of the control tags.', q; end if;
    if dec = 'POST' and (jsonb_typeof(t -> 'key' -> 'journal') <> 'array' or jsonb_array_length(t -> 'key' -> 'journal') < 2) then raise exception 'Transaction %: a POST key needs a journal of at least two lines.', q; end if;
  end loop;
  insert into ais_sets (id, title, topic, summary, meta)
  values (p_def ->> 'id', p_def ->> 'title', p_def ->> 'topic', p_def ->> 'summary', coalesce(p_def -> 'meta', '{}'::jsonb))
  on conflict (id) do update set title = excluded.title, topic = excluded.topic, summary = excluded.summary, meta = excluded.meta;
  delete from ais_set_txns where set_id = p_def ->> 'id';
  for t in select value from jsonb_array_elements(p_def -> 'txns') loop
    insert into ais_set_txns (set_id, seq, template, key) values (p_def ->> 'id', (t ->> 'seq')::int, t -> 'template', t -> 'key');
    n := n + 1;
  end loop;
  return n;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_set_list()
returns table (id text, title text, topic text, summary text, txns int, assigned int) as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see the practice sets.'; end if;
  return query
  select s.id, s.title, s.topic, s.summary, (select count(*)::int from ais_set_txns x where x.set_id = s.id), (select count(*)::int from ais_instances i where i.set_id = s.id)
    from ais_sets s order by s.created_at desc;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais_assign_set(p_tenant uuid, p_set text, p_seed bigint, p_mode text, p_lock date)
returns uuid as $$
declare
  new_id uuid; sd bigint;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can assign a practice set.'; end if;
  perform assert_ais_tenant(p_tenant);
  if not exists (select 1 from ais_sets where id = p_set) then raise exception 'That practice set does not exist.'; end if;
  if exists (select 1 from ais_instances where tenant_id = p_tenant) then raise exception 'That company already has a practice set. Create a new company for another one.'; end if;
  if p_mode not in ('IMMEDIATE', 'AFTER_CLOSE') then raise exception 'Mode must be IMMEDIATE (practice) or AFTER_CLOSE (graded).'; end if;
  sd := coalesce(p_seed, floor(random() * 2147483647)::bigint);
  insert into ais_instances (tenant_id, set_id, seed, mode, lock_date, created_by) values (p_tenant, p_set, sd, p_mode, p_lock, auth.uid()) returning id into new_id;
  perform ais__instantiate(new_id);
  return new_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- posting (the only way into an AIS ledger) ----------
create or replace function ais__validate_lines(p_tenant uuid, p_lines jsonb)
returns jsonb as $$
declare
  ln jsonb; outl jsonb := '[]'::jsonb; d numeric; c numeric; td numeric := 0; tc numeric := 0; acct_code text;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then raise exception 'A journal entry needs at least two lines.'; end if;
  for ln in select value from jsonb_array_elements(p_lines) loop
    acct_code := ln ->> 'acct';
    d := round(coalesce((ln ->> 'debit')::numeric, 0), 2); c := round(coalesce((ln ->> 'credit')::numeric, 0), 2);
    if not exists (select 1 from accounts a where a.tenant_id = p_tenant and a.code = acct_code) then raise exception 'Account % is not in this company''s chart of accounts.', coalesce(acct_code, '(blank)'); end if;
    if d < 0 or c < 0 then raise exception 'Amounts cannot be negative.'; end if;
    if d > 0 and c > 0 then raise exception 'A line is either a debit or a credit, not both.'; end if;
    if d = 0 and c = 0 then raise exception 'Every line needs an amount.'; end if;
    td := td + d; tc := tc + c;
    outl := outl || jsonb_build_object('acct', acct_code, 'debit', d, 'credit', c);
  end loop;
  if td <> tc then raise exception 'The entry does not balance: debits % and credits %.', td, tc; end if;
  return outl;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais__post_entry(p_tenant uuid, p_date date, p_memo text, p_source uuid, p_lines jsonb)
returns uuid as $$
declare
  e uuid; ln jsonb; acc uuid;
begin
  perform set_config('ais.posting', 'on', true);
  insert into journal_entries (tenant_id, entry_date, memo, created_by, source_table, source_id)
  values (p_tenant, p_date, p_memo, auth.uid(), 'ais_instance_txns', p_source) returning id into e;
  for ln in select value from jsonb_array_elements(p_lines) loop
    select a.id into acc from accounts a where a.tenant_id = p_tenant and a.code = ln ->> 'acct';
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values (e, acc, (ln ->> 'debit')::numeric, (ln ->> 'credit')::numeric);
  end loop;
  perform set_config('ais.posting', 'off', true);
  return e;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais__journal_matches(p_student jsonb, p_key jsonb)
returns boolean as $$
  with s as (select x.acct, sum(coalesce(x.debit, 0)) d, sum(coalesce(x.credit, 0)) c from jsonb_to_recordset(p_student) as x(acct text, debit numeric, credit numeric) group by x.acct),
       k as (select x.acct, sum(coalesce(x.debit, 0)) d, sum(coalesce(x.credit, 0)) c from jsonb_to_recordset(p_key) as x(acct text, debit numeric, credit numeric) group by x.acct)
  select not exists (
    select 1 from s full join k using (acct)
     where abs(coalesce(s.d, 0) - coalesce(k.d, 0)) > 0.005 or abs(coalesce(s.c, 0) - coalesce(k.c, 0)) > 0.005);
$$ language sql immutable set search_path = public;

create or replace function ais__results_visible(p_instance uuid)
returns boolean as $$
  select coalesce((select i.mode = 'IMMEDIATE' or i.phase <> 'ACCOUNTING' from ais_instances i where i.id = p_instance), false);
$$ language sql stable security definer set search_path = public;

-- ---------- the Accounting desk ----------
create or replace function ais_my_instance()
returns jsonb as $$
declare
  t uuid := my_tenant_id(); i ais_instances%rowtype; s ais_sets%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if t is null then return null; end if;
  perform assert_ais_tenant(t);
  select * into i from ais_instances where tenant_id = t;
  if not found then return null; end if;
  select * into s from ais_sets where id = i.set_id;
  return jsonb_build_object('set_id', s.id, 'title', s.title, 'topic', s.topic, 'summary', s.summary, 'mode', i.mode, 'phase', i.phase, 'lock_date', i.lock_date,
    'total', (select count(*) from ais_instance_txns x where x.instance_id = i.id),
    'pending', (select count(*) from ais_instance_txns x where x.instance_id = i.id and x.status = 'PENDING'),
    'posted', (select count(*) from ais_instance_txns x where x.instance_id = i.id and x.status = 'POSTED'),
    'held', (select count(*) from ais_instance_txns x where x.instance_id = i.id and x.status = 'HELD'));
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais_inbox()
returns table (id uuid, seq int, title text, doc_date date, status text, wrong_attempts int, points numeric, max_points numeric) as $$
declare
  t uuid := ais__my_tenant('ACCOUNTING'); inst uuid; vis boolean;
begin
  select i.id into inst from ais_instances i where i.tenant_id = t;
  if inst is null then return; end if;
  vis := ais__results_visible(inst);
  return query
  select x.id, x.seq, x.title, x.doc_date, x.status, x.wrong_attempts,
         case when vis then r.points end, case when vis then r.max_points end
    from ais_instance_txns x left join ais_results r on r.txn_id = x.id
   where x.instance_id = inst order by x.seq;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais_packet(p_txn uuid)
returns jsonb as $$
declare
  t uuid := ais__my_tenant('ACCOUNTING'); x ais_instance_txns%rowtype; d ais_decisions%rowtype;
begin
  select * into x from ais_instance_txns where id = p_txn and tenant_id = t;
  if not found then raise exception 'That document is not in your company.'; end if;
  select * into d from ais_decisions where txn_id = p_txn;
  return jsonb_build_object('id', x.id, 'seq', x.seq, 'title', x.title, 'doc_date', x.doc_date, 'status', x.status, 'wrong_attempts', x.wrong_attempts,
    'packet', x.packet, 'decision', d.decision, 'failed_control', d.failed_control, 'lines', d.lines);
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais_decide(p_txn uuid, p_decision text, p_failed_control text, p_lines jsonb)
returns jsonb as $$
declare
  t uuid := ais__my_tenant('ACCOUNTING');
  inst ais_instances%rowtype; x ais_instance_txns%rowtype; k jsonb; lines jsonb; locked date;
  key_dec text; ok_j boolean := null; ok_c boolean := null; pts numeric := 0; entry uuid; vis boolean; detail text;
begin
  select * into inst from ais_instances where tenant_id = t;
  if not found then raise exception 'No practice set has been assigned to this company yet.'; end if;
  if inst.phase <> 'ACCOUNTING' then raise exception 'The Accounting phase is closed.'; end if;
  select * into x from ais_instance_txns where id = p_txn and tenant_id = t for update;
  if not found then raise exception 'That document is not in your company.'; end if;
  if x.status <> 'PENDING' then raise exception 'You already decided this document. A decision is final.'; end if;
  if p_decision not in ('POST', 'HOLD') then raise exception 'Decide to POST or to HOLD.'; end if;
  select ik.key into k from ais_instance_keys ik where ik.txn_id = x.id;
  key_dec := k ->> 'decision';

  if p_decision = 'HOLD' then
    if not exists (select 1 from ais_controls c where c.tag = p_failed_control) then raise exception 'Name the control that failed.'; end if;
    ok_c := (p_failed_control = k ->> 'failed_control');
    if key_dec = 'HOLD' then pts := case when ok_c then 6 else 3 end; detail := case when ok_c then 'Held for the right reason.' else 'Held, but a different control failed.' end;
    else pts := 0; detail := 'A valid document was held.'; end if;
    update ais_instance_txns set status = 'HELD', decided_by = auth.uid(), decided_at = now() where id = x.id;
    insert into ais_decisions (txn_id, tenant_id, user_id, decision, failed_control) values (x.id, t, auth.uid(), 'HOLD', p_failed_control);
    insert into ais_results (txn_id, tenant_id, user_id, points, correct_decision, correct_control, detail) values (x.id, t, auth.uid(), pts, key_dec = 'HOLD', ok_c, detail);
  else
    select books_locked_through into locked from tenants where id = t;
    if locked is not null and x.doc_date <= locked then raise exception 'That document is dated in a closed period.'; end if;
    lines := ais__validate_lines(t, p_lines);
    if key_dec = 'POST' then ok_j := ais__journal_matches(lines, k -> 'journal'); end if;
    if key_dec = 'POST' and inst.mode = 'IMMEDIATE' and not ok_j then
      update ais_instance_txns set wrong_attempts = wrong_attempts + 1 where id = x.id;
      return jsonb_build_object('status', 'PENDING', 'result', 'journal_mismatch', 'wrong_attempts', x.wrong_attempts + 1,
        'message', 'That journal does not match what this document supports. Nothing was posted. Check the accounts and amounts and try again.');
    end if;
    if key_dec = 'POST' then
      pts := case when ok_j then greatest(1, 6 - x.wrong_attempts) else 3 end;
      detail := case when ok_j then 'Posted with the right journal.' else 'Right decision, wrong journal.' end;
    else pts := 0; detail := 'An exception was posted; it stays in the books for the Audit seat.'; end if;
    entry := ais__post_entry(t, x.doc_date, x.title, x.id, lines);
    update ais_instance_txns set status = 'POSTED', journal_entry_id = entry, decided_by = auth.uid(), decided_at = now() where id = x.id;
    insert into ais_decisions (txn_id, tenant_id, user_id, decision, lines) values (x.id, t, auth.uid(), 'POST', lines);
    insert into ais_results (txn_id, tenant_id, user_id, points, correct_decision, journal_ok, detail) values (x.id, t, auth.uid(), pts, key_dec = 'POST', ok_j, detail);
  end if;

  vis := inst.mode = 'IMMEDIATE';
  return jsonb_build_object('status', case when p_decision = 'POST' then 'POSTED' else 'HELD' end, 'entry_id', entry,
    'points', case when vis then pts end, 'max_points', case when vis then 6 end, 'detail', case when vis then detail end,
    'explanation', case when vis then k -> 'explanation' end);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_close_accounting(p_force boolean)
returns jsonb as $$
declare
  t uuid := ais__my_tenant('ACCOUNTING'); inst ais_instances%rowtype; pend int; x record;
begin
  select * into inst from ais_instances where tenant_id = t for update;
  if not found then raise exception 'No practice set has been assigned to this company yet.'; end if;
  if inst.phase <> 'ACCOUNTING' then raise exception 'The Accounting phase is already closed.'; end if;
  select count(*) into pend from ais_instance_txns where instance_id = inst.id and status = 'PENDING';
  if pend > 0 and not coalesce(p_force, false) then raise exception '% document(s) are still waiting for a decision. Decide them, or close anyway to score them as not done.', pend; end if;
  for x in select id from ais_instance_txns where instance_id = inst.id and status = 'PENDING' loop
    update ais_instance_txns set status = 'HELD', decided_by = auth.uid(), decided_at = now() where id = x.id;
    insert into ais_results (txn_id, tenant_id, user_id, points, correct_decision, detail) values (x.id, t, auth.uid(), 0, false, 'Not decided before the phase closed.');
  end loop;
  update ais_instances set phase = 'AUDIT', accounting_closed_at = now() where id = inst.id;
  if inst.lock_date is not null then
    perform set_config('ais.posting', 'on', true);
    update tenants set books_locked_through = inst.lock_date where id = t;
    perform set_config('ais.posting', 'off', true);
  end if;
  return ais_my_score();
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_my_score()
returns jsonb as $$
declare
  t uuid := my_tenant_id(); inst ais_instances%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into inst from ais_instances where tenant_id = t;
  if not found then return null; end if;
  if not (is_teacher() or ais__results_visible(inst.id)) then
    return jsonb_build_object('visible', false, 'message', 'Scores appear when the Accounting phase is closed.');
  end if;
  return jsonb_build_object('visible', true,
    'points', coalesce((select sum(r.points) from ais_results r join ais_instance_txns x on x.id = r.txn_id where x.instance_id = inst.id), 0),
    'max', (select count(*) * 6 from ais_instance_txns x where x.instance_id = inst.id),
    'decided', (select count(*) from ais_instance_txns x where x.instance_id = inst.id and x.status <> 'PENDING'),
    'total', (select count(*) from ais_instance_txns x where x.instance_id = inst.id));
end;
$$ language plpgsql stable security definer set search_path = public;

-- the teacher sees the key, what the student did and why it scored as it did
create or replace function ais_teacher_review(p_tenant uuid)
returns table (seq int, title text, status text, key jsonb, decision text, failed_control text, student_lines jsonb, points numeric, detail text, wrong_attempts int) as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see the answer key.'; end if;
  perform assert_ais_tenant(p_tenant);
  return query
  select x.seq, x.title, x.status, k.key, d.decision, d.failed_control, d.lines, r.points, r.detail, x.wrong_attempts
    from ais_instance_txns x join ais_instance_keys k on k.txn_id = x.id
    left join ais_decisions d on d.txn_id = x.id left join ais_results r on r.txn_id = x.id
   where x.tenant_id = p_tenant order by x.seq;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- who may call what ----------
revoke execute on function ais__rnd(bigint, text), ais__val(jsonb, jsonb), ais__resolve_vars(bigint, text, jsonb), ais__subst_text(text, jsonb), ais__subst(jsonb, jsonb),
  ais__instantiate(uuid), ais__validate_lines(uuid, jsonb), ais__post_entry(uuid, date, text, uuid, jsonb), ais__journal_matches(jsonb, jsonb), ais__results_visible(uuid)
  from public, anon, authenticated;
revoke execute on function ais_set_import(jsonb), ais_set_list(), ais_assign_set(uuid, text, bigint, text, date), ais_my_instance(), ais_inbox(), ais_packet(uuid),
  ais_decide(uuid, text, text, jsonb), ais_close_accounting(boolean), ais_my_score(), ais_teacher_review(uuid) from public, anon;
grant execute on function ais_set_import(jsonb), ais_set_list(), ais_assign_set(uuid, text, bigint, text, date), ais_my_instance(), ais_inbox(), ais_packet(uuid),
  ais_decide(uuid, text, text, jsonb), ais_close_accounting(boolean), ais_my_score(), ais_teacher_review(uuid) to authenticated;
