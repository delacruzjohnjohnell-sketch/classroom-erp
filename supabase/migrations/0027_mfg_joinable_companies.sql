-- ============================================================
-- Classroom ERP — migration 0027 (Manufacturing ERP, join list)
--
-- ADDITIVE ONLY. Needs 0023. One new function: the companies a signed-in person may pick from when
-- joining an existing company — Standard companies only. A Manufacturing company belongs to the one
-- student who set it up, so it is not offered in the join lists (/companies and the first-login picker).
-- A student cannot see other companies' edition rows (row-level security), so this has to be a
-- database function rather than a filter in the page.
--
-- ROLLBACK:  drop function if exists joinable_companies();
-- ============================================================
create or replace function joinable_companies()
returns table (id uuid, name text) as $$
  select t.id, t.name
    from tenants t
   where auth.uid() is not null
     and tenant_edition(t.id) = 'STANDARD'
   order by t.created_at;
$$ language sql stable security definer set search_path = public;

revoke execute on function joinable_companies() from public, anon;
grant execute on function joinable_companies() to authenticated;
