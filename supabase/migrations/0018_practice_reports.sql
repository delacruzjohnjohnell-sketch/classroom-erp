-- ============================================================
-- Classroom ERP — upgrade migration 0018
-- Practice-set reports. After running the checker on a company, a
-- teacher can publish the result so the company's students can read
-- and download it from their own Dashboard.
--
--   - Only a teacher can create or delete a report.
--   - A student can read only their own company's reports.
--   - results holds one row per check. When the teacher chooses not to
--     share expected figures, those fields are never stored, so they
--     cannot be read back from the database either.
--   - Deleting a company deletes its reports (cascade).
-- ============================================================

create table practice_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  set_id text not null,
  set_name text not null,
  passed int not null,
  total int not null,
  net_income numeric not null,
  include_details boolean not null default true,
  results jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index practice_reports_tenant_idx on practice_reports (tenant_id, created_at desc);

alter table practice_reports enable row level security;

create policy "report read" on practice_reports for select
  using (tenant_id = my_tenant_id() or is_teacher());

create policy "report teacher insert" on practice_reports for insert
  with check (is_teacher() is true);

create policy "report teacher delete" on practice_reports for delete
  using (is_teacher() is true);
