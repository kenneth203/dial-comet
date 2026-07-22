
-- 1) Table to store per-year default quotas
create table if not exists public.leave_quota_defaults (
  year integer primary key,
  base_annual numeric not null default 25.0,
  bank_holidays numeric not null default 10.0,
  christmas_closure_days numeric not null default 5.0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz
);

-- Ensure RLS is enabled and admin-only access
alter table public.leave_quota_defaults enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'leave_quota_defaults' and policyname = 'Admins can view leave quota defaults'
  ) then
    create policy "Admins can view leave quota defaults"
      on public.leave_quota_defaults
      for select
      using (is_admin_or_higher());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'leave_quota_defaults' and policyname = 'Admins can insert leave quota defaults'
  ) then
    create policy "Admins can insert leave quota defaults"
      on public.leave_quota_defaults
      for insert
      with check (is_admin_or_higher());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'leave_quota_defaults' and policyname = 'Admins can update leave quota defaults'
  ) then
    create policy "Admins can update leave quota defaults"
      on public.leave_quota_defaults
      for update
      using (is_admin_or_higher())
      with check (is_admin_or_higher());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'leave_quota_defaults' and policyname = 'Admins can delete leave quota defaults'
  ) then
    create policy "Admins can delete leave quota defaults"
      on public.leave_quota_defaults
      for delete
      using (is_admin_or_higher());
  end if;
end$$;

-- 2) Trigger to keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_lqd_set_updated_at on public.leave_quota_defaults;
create trigger trg_lqd_set_updated_at
before update on public.leave_quota_defaults
for each row execute procedure public.set_updated_at();

-- 3) RPC: upsert defaults for a year (admin-only)
create or replace function public.upsert_leave_quota_defaults(
  target_year integer,
  p_base_annual numeric,
  p_bank_holidays numeric,
  p_christmas_closure_days numeric
) returns public.leave_quota_defaults
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.leave_quota_defaults;
begin
  -- guard
  if not is_admin_or_higher() then
    raise exception 'Access denied: admin or higher required';
  end if;

  insert into public.leave_quota_defaults(year, base_annual, bank_holidays, christmas_closure_days)
  values (target_year, p_base_annual, p_bank_holidays, p_christmas_closure_days)
  on conflict (year) do update
    set base_annual = excluded.base_annual,
        bank_holidays = excluded.bank_holidays,
        christmas_closure_days = excluded.christmas_closure_days,
        updated_at = now()
  returning * into v;

  return v;
end;
$$;

-- 4) RPC: apply defaults to all active users for a given year (admin-only, idempotent)
create or replace function public.apply_leave_quota_defaults(target_year integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
  updated_count integer := 0;
  already_applied boolean := false;
begin
  if not is_admin_or_higher() then
    raise exception 'Access denied: admin or higher required';
  end if;

  select * into d from public.leave_quota_defaults where year = target_year;
  if not found then
    raise exception 'No leave quota defaults defined for year %', target_year;
  end if;

  -- If you want to prevent re-application in the same year, check applied_at
  already_applied := (d.applied_at is not null and date_part('year', d.applied_at) = target_year);
  -- We still apply again to ensure corrections are propagated, but you can switch this to RETURN if desired.

  update public.system_users su
  set
    annual_leave_days = d.base_annual,
    public_holidays = d.bank_holidays,
    christmas_closure_days = d.christmas_closure_days,
    holiday_year = target_year,
    updated_at = now()
  where su.status = 'Active';

  get diagnostics updated_count = row_count;

  update public.leave_quota_defaults
    set applied_at = now()
  where year = target_year;

  return jsonb_build_object(
    'year', target_year,
    'updated_users', updated_count,
    'defaults', jsonb_build_object(
      'base_annual', d.base_annual,
      'bank_holidays', d.bank_holidays,
      'christmas_closure_days', d.christmas_closure_days
    ),
    'already_applied', already_applied
  );
end;
$$;

-- 5) Schedule: run automatically every Jan 1 at 00:10 (UTC)
do $$
begin
  perform cron.schedule(
    'apply-leave-defaults-jan-1-v1',
    '10 0 1 1 *',
    $sql$
      select public.apply_leave_quota_defaults(extract(year from now())::int);
    $sql$
  );
exception when others then
  -- ignore if cron extension not available or schedule already exists
  null;
end;
$$;
