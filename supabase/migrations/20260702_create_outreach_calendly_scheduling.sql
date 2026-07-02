create extension if not exists pgcrypto;

create table if not exists public.outreach_calendly_events (
  id uuid primary key default gen_random_uuid(),
  account_id text not null
    check (account_id in ('insurance', 'mva')),
  event_uri text not null unique,
  event_uuid text not null,
  name text,
  status text not null
    check (status in ('active', 'canceled')),
  start_time timestamptz not null,
  end_time timestamptz not null,
  event_type_uri text,
  location jsonb,
  invitees_counter jsonb,
  cancellation jsonb,
  calendar_event jsonb,
  calendly_created_at timestamptz,
  calendly_updated_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_calendly_events_account_start_idx
  on public.outreach_calendly_events (account_id, start_time desc);

create index if not exists outreach_calendly_events_status_idx
  on public.outreach_calendly_events (status);

create table if not exists public.outreach_calendly_invitees (
  id uuid primary key default gen_random_uuid(),
  account_id text not null
    check (account_id in ('insurance', 'mva')),
  event_uri text not null references public.outreach_calendly_events(event_uri) on delete cascade,
  invitee_uri text not null unique,
  invitee_uuid text not null,
  email text,
  name text,
  first_name text,
  last_name text,
  status text not null
    check (status in ('active', 'canceled')),
  timezone text,
  questions_and_answers jsonb,
  tracking jsonb,
  cancellation jsonb,
  payment jsonb,
  no_show jsonb,
  reconfirmation jsonb,
  rescheduled boolean not null default false,
  old_invitee_uri text,
  new_invitee_uri text,
  routing_form_submission_uri text,
  scheduling_method text,
  invitee_scheduled_by_uri text,
  calendly_created_at timestamptz,
  calendly_updated_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_calendly_invitees_event_idx
  on public.outreach_calendly_invitees (event_uri);

create index if not exists outreach_calendly_invitees_account_status_idx
  on public.outreach_calendly_invitees (account_id, status);

create table if not exists public.outreach_calendly_webhook_events (
  id uuid primary key default gen_random_uuid(),
  account_id text
    check (account_id is null or account_id in ('insurance', 'mva')),
  event_name text not null,
  payload_hash text not null unique,
  signature_timestamp timestamptz,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'processed', 'error')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_calendly_webhook_events_account_received_idx
  on public.outreach_calendly_webhook_events (account_id, received_at desc);

create index if not exists outreach_calendly_webhook_events_status_idx
  on public.outreach_calendly_webhook_events (status);

create table if not exists public.outreach_calendly_sync_runs (
  id uuid primary key default gen_random_uuid(),
  account_id text not null
    check (account_id in ('insurance', 'mva')),
  sync_type text not null
    check (sync_type in ('manual', 'cron', 'webhook', 'backfill')),
  status text not null
    check (status in ('success', 'error')),
  started_at timestamptz not null,
  finished_at timestamptz,
  min_start_time timestamptz,
  max_start_time timestamptz,
  events_processed integer not null default 0,
  invitees_processed integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_calendly_sync_runs_account_started_idx
  on public.outreach_calendly_sync_runs (account_id, started_at desc);

create or replace function public.set_outreach_calendly_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_outreach_calendly_events_updated_at
  on public.outreach_calendly_events;
create trigger set_outreach_calendly_events_updated_at
  before update on public.outreach_calendly_events
  for each row
  execute function public.set_outreach_calendly_updated_at();

drop trigger if exists set_outreach_calendly_invitees_updated_at
  on public.outreach_calendly_invitees;
create trigger set_outreach_calendly_invitees_updated_at
  before update on public.outreach_calendly_invitees
  for each row
  execute function public.set_outreach_calendly_updated_at();

drop trigger if exists set_outreach_calendly_webhook_events_updated_at
  on public.outreach_calendly_webhook_events;
create trigger set_outreach_calendly_webhook_events_updated_at
  before update on public.outreach_calendly_webhook_events
  for each row
  execute function public.set_outreach_calendly_updated_at();

drop trigger if exists set_outreach_calendly_sync_runs_updated_at
  on public.outreach_calendly_sync_runs;
create trigger set_outreach_calendly_sync_runs_updated_at
  before update on public.outreach_calendly_sync_runs
  for each row
  execute function public.set_outreach_calendly_updated_at();

alter table public.outreach_calendly_events enable row level security;
alter table public.outreach_calendly_invitees enable row level security;
alter table public.outreach_calendly_webhook_events enable row level security;
alter table public.outreach_calendly_sync_runs enable row level security;

drop policy if exists "Admins can read outreach Calendly events"
  on public.outreach_calendly_events;
create policy "Admins can read outreach Calendly events"
  on public.outreach_calendly_events
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

drop policy if exists "Admins can read outreach Calendly invitees"
  on public.outreach_calendly_invitees;
create policy "Admins can read outreach Calendly invitees"
  on public.outreach_calendly_invitees
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

drop policy if exists "Admins can read outreach Calendly webhook events"
  on public.outreach_calendly_webhook_events;
create policy "Admins can read outreach Calendly webhook events"
  on public.outreach_calendly_webhook_events
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

drop policy if exists "Admins can read outreach Calendly sync runs"
  on public.outreach_calendly_sync_runs;
create policy "Admins can read outreach Calendly sync runs"
  on public.outreach_calendly_sync_runs
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
