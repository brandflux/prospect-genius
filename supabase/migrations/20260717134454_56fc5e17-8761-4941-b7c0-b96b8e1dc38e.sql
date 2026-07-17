create extension if not exists "pgcrypto";

do $$ begin
  create type public.app_role as enum ('admin', 'user');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lead_status as enum ('novo', 'contatado', 'respondeu', 'negociacao', 'cliente', 'perdido');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_channel as enum ('whatsapp', 'email', 'instagram');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create policy "user_roles_select_own" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create table if not exists public.searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  keyword text not null,
  city text,
  state text,
  country text,
  radius_km integer not null default 10,
  result_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists searches_user_created_idx on public.searches(user_id, created_at desc);
grant select, insert, update, delete on public.searches to authenticated;
grant all on public.searches to service_role;
alter table public.searches enable row level security;
create policy "searches_owner_all" on public.searches for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  search_id uuid references public.searches(id) on delete set null,
  google_place_id text,
  name text not null,
  category text,
  address text,
  latitude double precision,
  longitude double precision,
  phone text,
  whatsapp text,
  website text,
  rating numeric(3,2),
  reviews_count integer,
  opening_hours jsonb,
  google_maps_url text,
  has_website boolean generated always as (website is not null and length(trim(website)) > 0) stored,
  lead_score integer not null default 0,
  status public.lead_status not null default 'novo',
  notes_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, google_place_id)
);
create index if not exists companies_user_status_idx on public.companies(user_id, status);
create index if not exists companies_user_score_idx on public.companies(user_id, lead_score desc);
grant select, insert, update, delete on public.companies to authenticated;
grant all on public.companies to service_role;
alter table public.companies enable row level security;
create policy "companies_owner_all" on public.companies for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.calculate_lead_score(_company_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare c public.companies; score integer := 0;
begin
  select * into c from public.companies where id = _company_id;
  if not found then return 0; end if;
  if not c.has_website then score := score + 50; end if;
  if c.rating is not null and c.rating > 4.5 then score := score + 20; end if;
  if c.reviews_count is not null and c.reviews_count > 100 then score := score + 15; end if;
  if c.phone is not null and length(trim(c.phone)) > 0 then score := score + 10; end if;
  if c.whatsapp is not null and length(trim(c.whatsapp)) > 0 then score := score + 10; end if;
  if score > 100 then score := 100; end if;
  update public.companies set lead_score = score, updated_at = now() where id = _company_id;
  return score;
end $$;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  channel public.message_channel not null,
  content text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists messages_user_created_idx on public.messages(user_id, created_at desc);
grant select, insert, update, delete on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create policy "messages_owner_all" on public.messages for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.notes to authenticated;
grant all on public.notes to service_role;
alter table public.notes enable row level security;
create policy "notes_owner_all" on public.notes for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activities_user_created_idx on public.activities(user_id, created_at desc);
grant select, insert, update, delete on public.activities to authenticated;
grant all on public.activities to service_role;
alter table public.activities enable row level security;
create policy "activities_owner_all" on public.activities for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, company_id)
);
grant select, insert, update, delete on public.favorites to authenticated;
grant all on public.favorites to service_role;
alter table public.favorites enable row level security;
create policy "favorites_owner_all" on public.favorites for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  channel public.message_channel not null,
  template text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.campaigns to authenticated;
grant all on public.campaigns to service_role;
alter table public.campaigns enable row level security;
create policy "campaigns_owner_all" on public.campaigns for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();