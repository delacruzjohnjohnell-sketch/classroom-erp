-- ============================================================
-- Classroom ERP — upgrade migration 0006
-- Adds employee statutory ID fields (TIN, SSS/PhilHealth/Pag-IBIG
-- numbers) and auto-generated employee numbers — the details a
-- real Philippine payslip needs to show.
-- ============================================================

alter table employees add column if not exists employee_number text;
alter table employees add column if not exists tin text;
alter table employees add column if not exists sss_number text;
alter table employees add column if not exists philhealth_number text;
alter table employees add column if not exists pagibig_number text;

create or replace function assign_employee_number() returns trigger as $$
begin
  if new.employee_number is null then
    new.employee_number := next_doc_number(new.tenant_id, 'employee', 'EMP');
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_emp_number before insert on employees
  for each row execute function assign_employee_number();

-- Backfill employee numbers for anyone added before this migration.
do $$
declare
  r record;
begin
  for r in select id, tenant_id from employees where employee_number is null order by name loop
    update employees set employee_number = next_doc_number(r.tenant_id, 'employee', 'EMP') where id = r.id;
  end loop;
end $$;
