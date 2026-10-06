-- Applied to Supabase project ISM6427c (ygrlzdgzxpxvzrtkmdus) on 2026-10-06.
-- Kept here as a record of the database schema the app depends on.

-- One profile per signed-in user.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 50),
  home_name text not null default 'Boca Raton' check (char_length(home_name) between 1 and 100),
  home_label text not null default 'Florida Atlantic University · Florida, US' check (char_length(home_label) <= 150),
  home_latitude double precision not null default 26.3705 check (home_latitude between -90 and 90),
  home_longitude double precision not null default -80.1024 check (home_longitude between -180 and 180),
  temperature_unit text not null default 'fahrenheit' check (temperature_unit in ('fahrenheit', 'celsius')),
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Owl Weather user profiles: name and preferences. One row per auth user.';

-- Row-level security: users can only see and change their own row.
alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users can create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Signed-out visitors get nothing; signed-in users can't delete (rows go away with the account).
revoke all on public.profiles from anon;
revoke delete, truncate, references, trigger on public.profiles from authenticated;

-- Keep updated_at current.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create an empty profile automatically for every new sign-up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill users who signed up before this table existed.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
