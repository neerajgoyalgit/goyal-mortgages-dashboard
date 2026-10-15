-- Review in Supabase SQL Editor before running. Non-destructive setup.
create table if not exists public.dashboard_admins (user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
alter table public.dashboard_admins enable row level security;
alter table public.mortgage_rates enable row level security;
alter table public.mortgage_rate_history enable row level security;
revoke all on public.dashboard_admins from anon;
grant select on public.dashboard_admins to authenticated;
grant select on public.mortgage_rates to anon, authenticated;
revoke insert, update, delete on public.mortgage_rates from anon;
-- No public access to the history table is needed for this version.
revoke all on public.mortgage_rate_history from anon;
-- An allowlisted admin can read their own allowlist row.
create policy "Admin can see own membership" on public.dashboard_admins for select to authenticated using (user_id = (select auth.uid()));
create policy "Public can view recorded rates" on public.mortgage_rates for select to anon, authenticated using (true);
create policy "Allowlisted admins can insert rates" on public.mortgage_rates for insert to authenticated with check (exists (select 1 from public.dashboard_admins a where a.user_id=(select auth.uid())));
grant insert on public.mortgage_rates to authenticated;
grant usage, select on sequence public.mortgage_rates_id_seq to authenticated;
-- After creating your Supabase Auth user, grant access using:
-- insert into public.dashboard_admins(user_id) values ('YOUR-AUTH-USER-UUID');
