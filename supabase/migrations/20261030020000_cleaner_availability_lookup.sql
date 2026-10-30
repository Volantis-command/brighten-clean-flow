-- ============================================================================
-- Why a cleaner reads as unavailable (BJ, 30 Oct 2026): "its also saying Lucy
-- is not available here? she is".
--
-- Lucy's roster said Monday to Friday, and 15 Nov is a Sunday, so the insert
-- trigger refused her while the dropdown gave no hint until the save failed.
-- Her roster now includes weekends, and the app can ask the same question the
-- trigger answers, so the two can never disagree.
--
-- Applied to production (ueomxjsqvmbjfufjauhe) via the Supabase MCP; this file
-- matches the recorded version so the repo and remote history agree.
-- ============================================================================

update public.profiles
   set weekly_availability = '["mon","tue","wed","thu","fri","sat","sun"]'::jsonb
 where id = '1e8e1571-5c0e-4dab-9e34-656804aa8fa9';

create or replace function public.cleaners_available_on(p_date date)
returns table (user_id uuid, available boolean, on_leave boolean)
language sql stable security definer set search_path = public as $$
  select r.user_id,
         public.cleaner_is_available_on_date(r.user_id, p_date) as available,
         exists (
           select 1 from public.staff_leave l
            where l.user_id = r.user_id and p_date between l.start_date and l.end_date
         ) as on_leave
    from (select distinct user_id from public.user_roles
           where role in ('cleaner', 'head_cleaner', 'admin')) r
$$;

revoke all on function public.cleaners_available_on(date) from public;
grant execute on function public.cleaners_available_on(date) to authenticated;
