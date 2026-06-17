create extension if not exists pgcrypto;

create table if not exists public.outreach_gologin_sessions (
  id uuid primary key default gen_random_uuid(),
  pipeline_id text not null,
  gologin_profile_id text not null,
  status text not null default 'starting'
    check (status in ('starting', 'active', 'stopping', 'stopped', 'error')),
  launched_by uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz,
  stopped_at timestamptz,
  error_message text,
  live_view_url text,
  launch_url text,
  response_shape jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.outreach_gologin_sessions.live_view_url is
  'Server-encrypted GoLogin Live View URL ciphertext. Never store plaintext.';
comment on column public.outreach_gologin_sessions.launch_url is
  'Server-encrypted GoLogin launch URL ciphertext. Never store plaintext.';

create unique index if not exists outreach_gologin_sessions_active_profile_idx
  on public.outreach_gologin_sessions (gologin_profile_id)
  where status in ('starting', 'active', 'stopping');

create index if not exists outreach_gologin_sessions_pipeline_idx
  on public.outreach_gologin_sessions (pipeline_id, started_at desc);

create or replace function public.set_outreach_gologin_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_outreach_gologin_sessions_updated_at
  on public.outreach_gologin_sessions;

create trigger set_outreach_gologin_sessions_updated_at
  before update on public.outreach_gologin_sessions
  for each row
  execute function public.set_outreach_gologin_sessions_updated_at();

alter table public.outreach_gologin_sessions enable row level security;

drop policy if exists "Admins can read outreach GoLogin sessions"
  on public.outreach_gologin_sessions;
create policy "Admins can read outreach GoLogin sessions"
  on public.outreach_gologin_sessions
  for select
  using (
    exists (
      select 1
      from public.app_users au
      where au.user_id = auth.uid()
        and (
          au.role in ('admin', 'super_admin')
          or coalesce(au.is_super_admin, false)
        )
    )
  );

drop policy if exists "Admins can create outreach GoLogin sessions"
  on public.outreach_gologin_sessions;
create policy "Admins can create outreach GoLogin sessions"
  on public.outreach_gologin_sessions
  for insert
  with check (
    launched_by = auth.uid()
    and exists (
      select 1
      from public.app_users au
      where au.user_id = auth.uid()
        and (
          au.role in ('admin', 'super_admin')
          or coalesce(au.is_super_admin, false)
        )
    )
  );

drop policy if exists "Admins can update outreach GoLogin sessions"
  on public.outreach_gologin_sessions;
create policy "Admins can update outreach GoLogin sessions"
  on public.outreach_gologin_sessions
  for update
  using (
    exists (
      select 1
      from public.app_users au
      where au.user_id = auth.uid()
        and (
          au.role in ('admin', 'super_admin')
          or coalesce(au.is_super_admin, false)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.app_users au
      where au.user_id = auth.uid()
        and (
          au.role in ('admin', 'super_admin')
          or coalesce(au.is_super_admin, false)
        )
    )
  );
