-- ============================================================
-- Classroom ERP — migration 0072 (AIS edition: two fixes to the Audit seat, found in the 0071 dry run)
--
-- Needs 0071. Replaces our own ais_test_run and adds ais_audit_vouch. Nothing else is touched.
--
--   1. The gap test read an invoice number out of ANY memo, so a desk document titled "Invoice INV-7050: ..." stretched the sequence from 7050 to 9300 and
--      reported 1,964 false gaps. It now reads numbers only from the sales-invoice entries ("Sales invoice INV-n — customer").
--   2. An exception the Accounting seat wrongly POSTED at the desk is only a ledger line to the Audit seat. ais_audit_vouch lets the auditor vouch an entry
--      to its supporting documents: for an entry posted from a desk document it returns the document packet, the journal lines and where it came from.
--      Entries from the seeded population have no document packet (the auditor must rely on analytics and the ledger).
--
-- ROLLBACK: drop function if exists ais_audit_vouch(uuid);   (and re-run the ais_test_run definition from migration 0071)
-- ============================================================

create or replace function ais_audit_vouch(p_entry uuid)
returns jsonb as $$
declare
  t uuid := ais__audit_tenant(false); je journal_entries%rowtype; x ais_instance_txns%rowtype; src text;
begin
  select * into je from journal_entries where id = p_entry and tenant_id = t;
  if not found then raise exception 'That entry is not in your company.'; end if;
  if je.source_table = 'ais_instance_txns' then
    select * into x from ais_instance_txns where id = je.source_id and tenant_id = t;
    src := 'DESK';
  elsif je.source_table = 'ais_findings' then src := 'REVERSAL';
  else src := 'POPULATION'; end if;
  return jsonb_build_object('entry_id', je.id, 'entry_date', je.entry_date, 'memo', je.memo, 'source', src,
    'posted_at', je.created_at,
    'packet', case when src = 'DESK' then x.packet end,
    'note', case when src = 'POPULATION' then 'No supporting documents are filed for this entry. Judge it from the ledger and the analytics.'
                 when src = 'REVERSAL' then 'An adjusting entry made by the Audit seat.' end,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('acct', a.code, 'name', a.name, 'debit', l.debit, 'credit', l.credit) order by l.debit desc, a.code), '[]'::jsonb)
                from journal_lines l join accounts a on a.id = l.account_id where l.journal_entry_id = je.id));
end;
$$ language plpgsql stable security definer set search_path = public;
revoke execute on function ais_audit_vouch(uuid) from public, anon;
grant execute on function ais_audit_vouch(uuid) to authenticated;

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
           case when e.memo like 'Sales invoice INV-%' then nullif(substring(e.memo from 'INV-([0-9]+)'), '')::int end, trim(substring(e.memo from '— (.*)$'))
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
