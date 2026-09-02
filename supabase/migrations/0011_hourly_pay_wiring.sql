-- ============================================================
-- Classroom ERP — upgrade migration 0011
-- Wires time tracking into pay calculation for hourly employees.
--
-- Monthly-paid employees are unaffected — their pay stays fixed,
-- matching real practice (they log time for attendance records,
-- not pay proration). Hourly employees' gross pay is now computed
-- directly from hours logged in the pay period × their rate.
-- ============================================================

alter table employees add column if not exists pay_type text not null default 'monthly' check (pay_type in ('monthly', 'hourly'));
alter table employees add column if not exists hourly_rate numeric;
