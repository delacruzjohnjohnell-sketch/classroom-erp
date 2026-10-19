-- ============================================================
-- Classroom ERP — migration 0046 (Manufacturing ERP, Phase 9a: journal vouchers)
--
-- Needs 0023–0045. Every journal entry of a Manufacturing company becomes a numbered voucher (JV-2026-00001), whether a person typed it or
-- a stock, production, purchasing or sales document posted it, and a person can prepare, approve, print and reverse a manual one.
-- Everything is additive. Standard's journal_entries and reverse_journal_entry are not changed; the one new trigger on a Standard table
-- (journal_entries, insert only) acts on Manufacturing companies and does nothing for a Standard company.
--
--   mfg_vouchers / mfg_voucher_lines   header and lines of a voucher. A manual voucher is a DRAFT here first (journal entries are
--                                      immutable and have no status), then PENDING_APPROVAL if it is large or an override, then POSTED:
--                                      only then is a journal entry written, by mfg__post_voucher, linked back to the voucher.
--   trg_mfg_register_voucher           registers every other journal entry (documents, invoices, payroll…) as a SYSTEM voucher with a
--                                      number, a type (AP / AR / Inventory / WIP / Period-end / Journal Voucher) and the source document.
--   Control accounts                   a manual voucher may not touch inventory, WIP, GR/IR, applied-cost, Accounts Receivable or Accounts
--                                      Payable unless it is flagged "system override / audit adjustment" with a reason of at least ten
--                                      characters; an override always waits for the teacher's approval.
--   Approval                           the same rule Standard uses for purchase orders: above the company's approval threshold (and always
--                                      for an override) the voucher waits for the teacher.
--   Reversal                           mfg_reverse_voucher posts a reversing voucher on the date chosen, marks the original REVERSED and
--                                      refuses a second reversal. A voucher written by a stock, production or sales document is NOT
--                                      reversed here (that would leave stock and ledger apart); it points to the document instead. When a
--                                      document is reversed (mfg__reverse_entry) the original voucher is marked REVERSED automatically.
--
-- ROLLBACK:
--   drop trigger if exists trg_mfg_register_voucher on journal_entries;
--   drop function if exists mfg_voucher_register(uuid, date, date), mfg_voucher_view(uuid), mfg_reverse_voucher(uuid, date, text),
--     mfg_reject_voucher(uuid, text), mfg_approve_voucher(uuid), mfg_submit_voucher(uuid), mfg_save_voucher(uuid, jsonb), mfg_delete_voucher(uuid),
--     mfg__post_voucher(uuid, uuid), mfg__voucher_check(uuid), mfg__is_control_account(uuid, uuid), mfg_register_voucher(), mfg__voucher_type(text), mfg__next_jv(uuid, date);
--   drop table if exists mfg_voucher_lines, mfg_vouchers;   -- then re-run 0032 to restore mfg__reverse_entry
-- ============================================================

create table if not exists mfg_vouchers (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  voucher_no            text not null,
  kind                  text not null check (kind in ('MANUAL', 'SYSTEM')),
  voucher_type          text not null default 'Journal Voucher',
  jv_type               text check (jv_type in ('GENERAL', 'ACCRUAL', 'DEPRECIATION', 'RECLASSIFICATION', 'REVERSING')),
  voucher_date          date not null,
  period                text not null,
  reference             text,
  particulars           text,
  status                text not null default 'DRAFT' check (status in ('DRAFT', 'PENDING_APPROVAL', 'POSTED', 'REVERSED')),
  journal_entry_id      uuid,
  source_table          text,
  source_id             uuid,
  override              boolean not null default false,
  override_reason       text,
  reverses_voucher_id   uuid references mfg_vouchers(id) on delete set null,
  reversed_by_voucher_id uuid references mfg_vouchers(id) on delete set null,
  reversal_reason       text,
  reject_note           text,
  prepared_by           uuid,
  prepared_at           timestamptz not null default now(),
  submitted_at          timestamptz,
  reviewed_by           uuid,
  reviewed_at           timestamptz,
  approved_by           uuid,
  approved_at           timestamptz,
  created_at            timestamptz not null default now(),
  unique (tenant_id, voucher_no)
);
create unique index if not exists mfg_vouchers_entry on mfg_vouchers (journal_entry_id) where journal_entry_id is not null;
create index if not exists mfg_vouchers_source on mfg_vouchers (tenant_id, source_id);
create index if not exists mfg_vouchers_date on mfg_vouchers (tenant_id, voucher_date desc);

create table if not exists mfg_voucher_lines (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  voucher_id     uuid not null references mfg_vouchers(id) on delete cascade,
  line_no        int not null,
  account_id     uuid not null references accounts(id),
  debit          numeric(18, 2) not null default 0 check (debit >= 0),
  credit         numeric(18, 2) not null default 0 check (credit >= 0),
  cost_center_id uuid references mfg_cost_centers(id) on delete set null,
  order_id       uuid references mfg_production_orders(id) on delete set null,
  description    text,
  check (not (debit > 0 and credit > 0))
);
create index if not exists mfg_voucher_lines_voucher on mfg_voucher_lines (voucher_id, line_no);

alter table mfg_vouchers enable row level security;
alter table mfg_voucher_lines enable row level security;
drop policy if exists "mfg read" on mfg_vouchers;
create policy "mfg read" on mfg_vouchers for select
  using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING');
drop policy if exists "mfg read" on mfg_voucher_lines;
create policy "mfg read" on mfg_voucher_lines for select
  using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING');

-- ---------- numbering and typing ----------
create or replace function mfg__next_jv(p_tenant uuid, p_date date)
returns text as $$
declare
  y text := to_char(coalesce(p_date, current_date), 'YYYY');
  n int;
begin
  insert into doc_counters (tenant_id, doc_type, next_number) values (p_tenant, 'JV' || y, 2)
  on conflict (tenant_id, doc_type) do update set next_number = doc_counters.next_number + 1
  returning next_number - 1 into n;
  return 'JV-' || y || '-' || lpad(n::text, 5, '0');
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg__voucher_type(p_source text)
returns text as $$
  select case
    when p_source in ('bills', 'mfg_vendor_invoices', 'mfg_landed_cost_vouchers') then 'AP Voucher'
    when p_source = 'invoices' then 'AR Voucher'
    when p_source = 'mfg_material_documents' then 'Inventory Voucher'
    when p_source in ('mfg_confirmations', 'mfg_production_orders', 'mfg_settlements') then 'WIP Voucher'
    when p_source = 'mfg_periods' then 'Period-End Voucher'
    when p_source = 'payroll_runs' then 'Payroll Voucher'
    when p_source = 'depreciation_entries' then 'Depreciation Voucher'
    else 'Journal Voucher' end;
$$ language sql immutable set search_path = public;

-- ---------- every other journal entry is registered as a system voucher ----------
create or replace function mfg_register_voucher()
returns trigger as $$
begin
  if tenant_edition(new.tenant_id) is distinct from 'MANUFACTURING' then return new; end if;
  if coalesce(current_setting('mfg.voucher_id', true), '') <> '' then return new; end if;     -- a manual voucher is being posted; it links itself
  insert into mfg_vouchers (tenant_id, voucher_no, kind, voucher_type, voucher_date, period, particulars, status, journal_entry_id, source_table, source_id, prepared_by, prepared_at)
  values (new.tenant_id, mfg__next_jv(new.tenant_id, new.entry_date), 'SYSTEM', mfg__voucher_type(new.source_table), new.entry_date, to_char(new.entry_date, 'YYYY-MM'),
          new.memo, 'POSTED', new.id, new.source_table, new.source_id, new.created_by, new.created_at);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_mfg_register_voucher on journal_entries;
create trigger trg_mfg_register_voucher after insert on journal_entries
  for each row execute function mfg_register_voucher();

-- vouchers for the entries that already exist, oldest first
do $$
declare r record;
begin
  for r in select e.* from journal_entries e where tenant_edition(e.tenant_id) = 'MANUFACTURING'
            and not exists (select 1 from mfg_vouchers v where v.journal_entry_id = e.id) order by e.created_at, e.id loop
    insert into mfg_vouchers (tenant_id, voucher_no, kind, voucher_type, voucher_date, period, particulars, status, journal_entry_id, source_table, source_id, prepared_by, prepared_at)
    values (r.tenant_id, mfg__next_jv(r.tenant_id, r.entry_date), 'SYSTEM', mfg__voucher_type(r.source_table), r.entry_date, to_char(r.entry_date, 'YYYY-MM'),
            r.memo, 'POSTED', r.id, r.source_table, r.source_id, r.created_by, r.created_at);
  end loop;
end $$;

-- a document that reverses its posting marks the original voucher REVERSED (ours, from 0032)
create or replace function mfg__reverse_entry(p_tenant uuid, p_je uuid, p_date date, p_memo text, p_src_table text, p_src_id uuid)
returns uuid as $$
declare
  v_lines jsonb; v_new uuid; v_old_v uuid; v_new_v uuid;
begin
  if p_je is null then return null; end if;
  select jsonb_agg(jsonb_build_object('account_id', account_id, 'debit', credit, 'credit', debit)) into v_lines
    from journal_lines where journal_entry_id = p_je;
  v_new := mfg__post_entry(p_tenant, p_date, p_memo, p_src_table, p_src_id, v_lines);
  if v_new is not null then
    select id into v_old_v from mfg_vouchers where journal_entry_id = p_je;
    select id into v_new_v from mfg_vouchers where journal_entry_id = v_new;
    if v_old_v is not null and v_new_v is not null then
      update mfg_vouchers set status = 'REVERSED', reversed_by_voucher_id = v_new_v, reversal_reason = left(p_memo, 200) where id = v_old_v and status = 'POSTED';
      update mfg_vouchers set reverses_voucher_id = v_old_v where id = v_new_v;
    end if;
  end if;
  return v_new;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- control accounts ----------
create or replace function mfg__is_control_account(p_tenant uuid, p_account uuid)
returns boolean as $$
  select exists (select 1 from mfg_account_determination d where d.tenant_id = p_tenant and d.account_id = p_account
                  and d.key in ('RM_INVENTORY', 'WIP', 'FG_INVENTORY', 'PACKAGING_INVENTORY', 'GR_IR', 'APPLIED_LABOR', 'APPLIED_MACHINE', 'APPLIED_FIXED_OH', 'LANDED_COST_CLEARING'))
      or exists (select 1 from accounts a where a.id = p_account and a.tenant_id = p_tenant and a.code in ('1100', '2000'));
$$ language sql stable security definer set search_path = public;

-- ---------- the rules a voucher must satisfy before it can be submitted or posted ----------
create or replace function mfg__voucher_check(p_id uuid)
returns numeric as $$
declare
  v mfg_vouchers; n int; d numeric; c numeric; lock_d date; bad text;
begin
  select * into v from mfg_vouchers where id = p_id;
  select count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0) into n, d, c from mfg_voucher_lines where voucher_id = p_id and (debit <> 0 or credit <> 0);
  if n < 2 then raise exception 'A journal voucher needs at least two lines with an amount.'; end if;
  if abs(d - c) >= 0.005 then raise exception 'Debits and credits differ by %. A voucher must balance before it can be posted.', abs(d - c); end if;
  if d <= 0 then raise exception 'The voucher total must be above zero.'; end if;
  select books_locked_through into lock_d from tenants where id = v.tenant_id;
  if lock_d is not null and v.voucher_date <= lock_d then
    raise exception 'The books are closed through %, so a voucher can''t be dated %. Choose a later date.', to_char(lock_d, 'Mon DD, YYYY'), to_char(v.voucher_date, 'Mon DD, YYYY');
  end if;
  select string_agg(distinct a.code || ' ' || a.name, ', ') into bad
    from mfg_voucher_lines l join accounts a on a.id = l.account_id
   where l.voucher_id = p_id and (l.debit <> 0 or l.credit <> 0) and mfg__is_control_account(v.tenant_id, l.account_id);
  if bad is not null and not v.override then
    raise exception 'A control account can''t take a manual line (%). Use the Inventory, Purchasing, Production or Sales screen so the sub-ledger moves too, or flag this voucher as a system override / audit adjustment and say why.', bad;
  end if;
  if v.override and length(trim(coalesce(v.override_reason, ''))) < 10 then
    raise exception 'A system override needs a reason of at least ten characters.';
  end if;
  return d;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- the one place a manual voucher becomes a journal entry ----------
create or replace function mfg__post_voucher(p_id uuid, p_by uuid)
returns uuid as $$
declare
  v mfg_vouchers; je uuid;
begin
  select * into v from mfg_vouchers where id = p_id for update;
  perform set_config('mfg.voucher_id', p_id::text, true);
  insert into journal_entries (tenant_id, entry_date, memo, created_by, source_table, source_id)
  values (v.tenant_id, v.voucher_date, v.voucher_no || ' — ' || coalesce(nullif(trim(v.particulars), ''), 'Journal voucher'), p_by, 'mfg_vouchers', v.id) returning id into je;
  insert into journal_lines (journal_entry_id, account_id, debit, credit)
  select je, account_id, debit, credit from mfg_voucher_lines where voucher_id = p_id and (debit <> 0 or credit <> 0) order by line_no;
  perform set_config('mfg.voucher_id', '', true);
  update mfg_vouchers set status = 'POSTED', journal_entry_id = je, approved_by = coalesce(approved_by, p_by), approved_at = coalesce(approved_at, now()) where id = p_id;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v.tenant_id, 'voucher_posted', jsonb_build_object('voucher', v.voucher_no, 'type', v.jv_type, 'override', v.override), p_by);
  return je;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- draft: create or change ----------
create or replace function mfg_save_voucher(p_id uuid, p_data jsonb)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v mfg_vouchers; v_date date; v_type text; l jsonb; n int := 0; dr numeric; cr numeric; v_acc uuid; v_cc uuid; v_ord uuid;
begin
  v_date := coalesce(nullif(p_data->>'voucher_date', '')::date, current_date);
  v_type := upper(coalesce(nullif(p_data->>'jv_type', ''), 'GENERAL'));
  if v_type not in ('GENERAL', 'ACCRUAL', 'DEPRECIATION', 'RECLASSIFICATION', 'REVERSING') then raise exception 'Choose the kind of voucher.'; end if;
  if p_id is null then
    insert into mfg_vouchers (tenant_id, voucher_no, kind, voucher_type, jv_type, voucher_date, period, prepared_by)
    values (v_t, mfg__next_jv(v_t, v_date), 'MANUAL', 'Journal Voucher', v_type, v_date, to_char(v_date, 'YYYY-MM'), auth.uid()) returning * into v;
  else
    select * into v from mfg_vouchers where id = p_id and tenant_id = v_t for update;
    if v.id is null then raise exception 'That voucher was not found.'; end if;
    if v.kind <> 'MANUAL' or v.status <> 'DRAFT' then raise exception 'Only a draft voucher can be edited (this one is %).', lower(v.status); end if;
  end if;
  update mfg_vouchers set voucher_date = v_date, period = to_char(v_date, 'YYYY-MM'), jv_type = v_type,
         reference = nullif(trim(coalesce(p_data->>'reference', '')), ''), particulars = nullif(trim(coalesce(p_data->>'particulars', '')), ''),
         override = coalesce((p_data->>'override')::boolean, false), override_reason = nullif(trim(coalesce(p_data->>'override_reason', '')), '')
   where id = v.id;
  delete from mfg_voucher_lines where voucher_id = v.id;
  for l in select * from jsonb_array_elements(coalesce(p_data->'lines', '[]'::jsonb)) loop
    v_acc := nullif(l->>'account_id', '')::uuid;
    if v_acc is null then continue; end if;
    if not exists (select 1 from accounts where id = v_acc and tenant_id = v_t) then raise exception 'One of the accounts is not in this company.'; end if;
    dr := round(coalesce(nullif(l->>'debit', '')::numeric, 0), 2);
    cr := round(coalesce(nullif(l->>'credit', '')::numeric, 0), 2);
    if dr < 0 or cr < 0 then raise exception 'An amount can''t be negative.'; end if;
    if dr > 0 and cr > 0 then raise exception 'A line is either a debit or a credit, not both.'; end if;
    v_cc := nullif(l->>'cost_center_id', '')::uuid;
    if v_cc is not null and not exists (select 1 from mfg_cost_centers where id = v_cc and tenant_id = v_t) then raise exception 'That cost center is not in this company.'; end if;
    v_ord := nullif(l->>'order_id', '')::uuid;
    if v_ord is not null and not exists (select 1 from mfg_production_orders where id = v_ord and tenant_id = v_t) then raise exception 'That production order is not in this company.'; end if;
    n := n + 1;
    insert into mfg_voucher_lines (tenant_id, voucher_id, line_no, account_id, debit, credit, cost_center_id, order_id, description)
    values (v_t, v.id, n, v_acc, dr, cr, v_cc, v_ord, nullif(trim(coalesce(l->>'description', '')), ''));
  end loop;
  return v.id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_delete_voucher(p_id uuid)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  v mfg_vouchers;
begin
  select * into v from mfg_vouchers where id = p_id and tenant_id = v_t for update;
  if v.id is null then raise exception 'That voucher was not found.'; end if;
  if v.kind <> 'MANUAL' or v.status <> 'DRAFT' then raise exception 'Only a draft can be deleted. A posted voucher is corrected by reversing it.'; end if;
  delete from mfg_vouchers where id = p_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- submit: post at once, or wait for the teacher ----------
create or replace function mfg_submit_voucher(p_id uuid)
returns text as $$
declare
  v_t uuid := mfg__my_tenant();
  v mfg_vouchers; total numeric; thr numeric;
begin
  select * into v from mfg_vouchers where id = p_id and tenant_id = v_t for update;
  if v.id is null then raise exception 'That voucher was not found.'; end if;
  if v.kind <> 'MANUAL' or v.status <> 'DRAFT' then raise exception 'Only a draft can be submitted (this one is %).', lower(v.status); end if;
  total := mfg__voucher_check(p_id);
  select approval_threshold into thr from tenants where id = v_t;
  if v.override or (thr is not null and total > thr) then
    update mfg_vouchers set status = 'PENDING_APPROVAL', submitted_at = now(), reject_note = null where id = p_id;
    insert into mfg_audit_log (tenant_id, event, detail, created_by)
    values (v_t, 'voucher_submitted', jsonb_build_object('voucher', v.voucher_no, 'total', total, 'override', v.override, 'reason', v.override_reason), auth.uid());
    return 'PENDING_APPROVAL';
  end if;
  perform mfg__post_voucher(p_id, auth.uid());
  return 'POSTED';
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_approve_voucher(p_id uuid)
returns void as $$
declare
  v mfg_vouchers;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can approve a voucher.'; end if;
  select * into v from mfg_vouchers where id = p_id for update;
  if v.id is null then raise exception 'That voucher was not found.'; end if;
  if v.status <> 'PENDING_APPROVAL' then raise exception 'That voucher is not waiting for approval (it is %).', lower(v.status); end if;
  perform mfg__voucher_check(p_id);
  update mfg_vouchers set reviewed_by = auth.uid(), reviewed_at = now(), approved_by = auth.uid(), approved_at = now() where id = p_id;
  perform mfg__post_voucher(p_id, auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_reject_voucher(p_id uuid, p_note text)
returns void as $$
declare
  v mfg_vouchers;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can send a voucher back.'; end if;
  if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Tell the student what to fix.'; end if;
  select * into v from mfg_vouchers where id = p_id for update;
  if v.id is null or v.status <> 'PENDING_APPROVAL' then raise exception 'That voucher is not waiting for approval.'; end if;
  update mfg_vouchers set status = 'DRAFT', reject_note = trim(p_note), reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v.tenant_id, 'voucher_sent_back', jsonb_build_object('voucher', v.voucher_no, 'note', trim(p_note)), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- reverse: a new voucher, never a deletion ----------
create or replace function mfg_reverse_voucher(p_id uuid, p_date date, p_reason text)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v mfg_vouchers; nv uuid; n int;
begin
  select * into v from mfg_vouchers where id = p_id and tenant_id = v_t for update;
  if v.id is null then raise exception 'That voucher was not found.'; end if;
  if v.status = 'REVERSED' then raise exception '% has already been reversed.', v.voucher_no; end if;
  if v.status <> 'POSTED' then raise exception 'Only a posted voucher can be reversed (this one is %).', lower(v.status); end if;
  if v.source_table is not null and v.source_table <> 'mfg_vouchers' then
    raise exception '% was posted by a document (%). Reverse that document instead, so the stock, the order or the invoice and the books are corrected together.', v.voucher_no, v.source_table;
  end if;
  if v.jv_type = 'REVERSING' then raise exception 'A reversing voucher can''t be reversed again. Post a new voucher instead.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why you are reversing it — the reason stays on the record.'; end if;
  if p_date is null or p_date < v.voucher_date then raise exception 'The reversal can''t be dated before the voucher (%).', to_char(v.voucher_date, 'Mon DD, YYYY'); end if;
  insert into mfg_vouchers (tenant_id, voucher_no, kind, voucher_type, jv_type, voucher_date, period, reference, particulars, reverses_voucher_id, override, override_reason, prepared_by)
  values (v_t, mfg__next_jv(v_t, p_date), 'MANUAL', 'Journal Voucher', 'REVERSING', p_date, to_char(p_date, 'YYYY-MM'), v.voucher_no,
          'Reversal of ' || v.voucher_no || coalesce(': ' || v.particulars, ''), v.id, v.override, case when v.override then 'Reversal of ' || v.voucher_no || ' — ' || trim(p_reason) end, auth.uid())
  returning id into nv;
  if v.kind = 'MANUAL' then
    insert into mfg_voucher_lines (tenant_id, voucher_id, line_no, account_id, debit, credit, cost_center_id, order_id, description)
    select v_t, nv, line_no, account_id, credit, debit, cost_center_id, order_id, description from mfg_voucher_lines where voucher_id = v.id and (debit <> 0 or credit <> 0);
  else
    insert into mfg_voucher_lines (tenant_id, voucher_id, line_no, account_id, debit, credit)
    select v_t, nv, row_number() over (order by jl.debit desc, jl.id), jl.account_id, jl.credit, jl.debit from journal_lines jl where jl.journal_entry_id = v.journal_entry_id;
  end if;
  select count(*) into n from mfg_voucher_lines where voucher_id = nv;
  if n < 2 then raise exception 'There is nothing to reverse on that voucher.'; end if;
  perform mfg__voucher_check(nv);
  perform mfg__post_voucher(nv, auth.uid());
  update mfg_vouchers set status = 'REVERSED', reversed_by_voucher_id = nv, reversal_reason = trim(p_reason) where id = v.id;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v_t, 'voucher_reversed', jsonb_build_object('voucher', v.voucher_no, 'reversal', (select voucher_no from mfg_vouchers where id = nv), 'reason', trim(p_reason)), auth.uid());
  return nv;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- the register ----------
create or replace function mfg_voucher_register(p_tenant uuid, p_from date, p_to date)
returns table (id uuid, voucher_no text, kind text, voucher_type text, jv_type text, voucher_date date, period text, reference text, particulars text, status text,
               total numeric, source_table text, source_id uuid, prepared_by_name text, override boolean, reject_note text) as $$
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  return query
  select v.id, v.voucher_no, v.kind, v.voucher_type, v.jv_type, v.voucher_date, v.period, v.reference, v.particulars, v.status,
         coalesce((select sum(jl.debit) from journal_lines jl where jl.journal_entry_id = v.journal_entry_id),
                  (select sum(l.debit) from mfg_voucher_lines l where l.voucher_id = v.id), 0),
         v.source_table, v.source_id, p.full_name, v.override, v.reject_note
    from mfg_vouchers v left join profiles p on p.id = v.prepared_by
   where v.tenant_id = p_tenant and (p_from is null or v.voucher_date >= p_from) and (p_to is null or v.voucher_date <= p_to)
   order by v.voucher_date desc, v.voucher_no desc;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- one voucher, everything the printed form shows ----------
create or replace function mfg_voucher_view(p_voucher uuid)
returns jsonb as $$
declare
  v mfg_vouchers; lines jsonb; dsum numeric; csum numeric; src jsonb := null; v_num text; v_label text; v_path text;
  who jsonb; a_no text; b_no text;
begin
  select * into v from mfg_vouchers where id = p_voucher;
  if v.id is null or not (v.tenant_id = my_tenant_id() or is_teacher()) then raise exception 'That voucher is not yours to look at.'; end if;
  if v.kind = 'MANUAL' then
    select coalesce(jsonb_agg(jsonb_build_object('account_code', a.code, 'account_name', a.name, 'cost_center', cc.code, 'order_no', o.document_number,
                    'description', l.description, 'debit', l.debit, 'credit', l.credit) order by l.line_no), '[]'::jsonb),
           coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
      into lines, dsum, csum
      from mfg_voucher_lines l join accounts a on a.id = l.account_id left join mfg_cost_centers cc on cc.id = l.cost_center_id left join mfg_production_orders o on o.id = l.order_id
     where l.voucher_id = v.id and (l.debit <> 0 or l.credit <> 0);
  else
    select coalesce(jsonb_agg(jsonb_build_object('account_code', a.code, 'account_name', a.name, 'debit', jl.debit, 'credit', jl.credit) order by (jl.debit = 0), a.code), '[]'::jsonb),
           coalesce(sum(jl.debit), 0), coalesce(sum(jl.credit), 0)
      into lines, dsum, csum
      from journal_lines jl join accounts a on a.id = jl.account_id where jl.journal_entry_id = v.journal_entry_id;
  end if;
  if v.source_table is not null and v.source_table <> 'mfg_vouchers' then
    v_label := case v.source_table
      when 'mfg_material_documents' then 'Stock document' when 'mfg_vendor_invoices' then 'Vendor invoice' when 'mfg_landed_cost_vouchers' then 'Landed cost'
      when 'mfg_confirmations' then 'Production confirmation' when 'mfg_settlements' then 'Order settlement' when 'mfg_production_orders' then 'Production order'
      when 'mfg_periods' then 'Month-end settlement' when 'invoices' then 'Sales invoice' when 'bills' then 'Vendor bill' when 'payroll_runs' then 'Payroll run'
      when 'depreciation_entries' then 'Depreciation' else initcap(replace(v.source_table, '_', ' ')) end;
    v_path := case v.source_table
      when 'mfg_material_documents' then '/mfg/inventory?tab=documents' when 'mfg_vendor_invoices' then '/mfg/purchasing' when 'mfg_landed_cost_vouchers' then '/mfg/purchasing'
      when 'bills' then '/mfg/purchasing' when 'mfg_confirmations' then '/mfg/production' when 'mfg_settlements' then '/mfg/production' when 'mfg_production_orders' then '/mfg/production'
      when 'mfg_periods' then '/mfg/period' when 'invoices' then '/mfg/sales' when 'payroll_runs' then '/mfg/payroll' when 'depreciation_entries' then '/mfg/fixed-assets' else null end;
    if v.source_table in ('mfg_material_documents', 'mfg_vendor_invoices', 'mfg_landed_cost_vouchers', 'mfg_confirmations', 'invoices', 'bills', 'mfg_production_orders') and v.source_id is not null then
      execute format('select document_number from %I where id = $1', v.source_table) into v_num using v.source_id;
    end if;
    src := jsonb_build_object('label', v_label, 'number', v_num, 'path', v_path, 'table', v.source_table);
  end if;
  select voucher_no into a_no from mfg_vouchers where id = v.reverses_voucher_id;
  select voucher_no into b_no from mfg_vouchers where id = v.reversed_by_voucher_id;
  who := jsonb_build_object(
    'prepared', jsonb_build_object('name', (select full_name from profiles where id = v.prepared_by), 'at', v.prepared_at),
    'reviewed', jsonb_build_object('name', (select full_name from profiles where id = v.reviewed_by), 'at', v.reviewed_at),
    'approved', jsonb_build_object('name', (select full_name from profiles where id = v.approved_by), 'at', v.approved_at));
  return jsonb_build_object(
    'id', v.id, 'voucher_no', v.voucher_no, 'kind', v.kind, 'voucher_type', v.voucher_type, 'jv_type', v.jv_type, 'voucher_date', v.voucher_date, 'period', v.period,
    'reference', v.reference, 'particulars', v.particulars, 'status', v.status, 'override', v.override, 'override_reason', v.override_reason, 'reject_note', v.reject_note,
    'reversal_reason', v.reversal_reason, 'reverses', jsonb_build_object('id', v.reverses_voucher_id, 'no', a_no), 'reversed_by', jsonb_build_object('id', v.reversed_by_voucher_id, 'no', b_no),
    'lines', lines, 'debit', dsum, 'credit', csum, 'source', src, 'signoff', who,
    'can_reverse', v.status = 'POSTED' and (v.source_table is null or v.source_table = 'mfg_vouchers') and coalesce(v.jv_type, '') <> 'REVERSING');
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- who may call what ----------
revoke execute on function mfg__next_jv(uuid, date) from public, anon, authenticated;
revoke execute on function mfg__voucher_type(text) from public, anon, authenticated;
revoke execute on function mfg_register_voucher() from public, anon, authenticated;
revoke execute on function mfg__is_control_account(uuid, uuid) from public, anon, authenticated;
revoke execute on function mfg__voucher_check(uuid) from public, anon, authenticated;
revoke execute on function mfg__post_voucher(uuid, uuid) from public, anon, authenticated;
revoke execute on function mfg_save_voucher(uuid, jsonb) from public, anon;
revoke execute on function mfg_delete_voucher(uuid) from public, anon;
revoke execute on function mfg_submit_voucher(uuid) from public, anon;
revoke execute on function mfg_approve_voucher(uuid) from public, anon;
revoke execute on function mfg_reject_voucher(uuid, text) from public, anon;
revoke execute on function mfg_reverse_voucher(uuid, date, text) from public, anon;
revoke execute on function mfg_voucher_register(uuid, date, date) from public, anon;
revoke execute on function mfg_voucher_view(uuid) from public, anon;
grant execute on function mfg_save_voucher(uuid, jsonb) to authenticated;
grant execute on function mfg_delete_voucher(uuid) to authenticated;
grant execute on function mfg_submit_voucher(uuid) to authenticated;
grant execute on function mfg_approve_voucher(uuid) to authenticated;
grant execute on function mfg_reject_voucher(uuid, text) to authenticated;
grant execute on function mfg_reverse_voucher(uuid, date, text) to authenticated;
grant execute on function mfg_voucher_register(uuid, date, date) to authenticated;
grant execute on function mfg_voucher_view(uuid) to authenticated;
