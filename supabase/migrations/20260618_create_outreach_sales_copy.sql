create extension if not exists pgcrypto;

create table if not exists public.outreach_sales_copy_sets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outreach_sales_copy_pipeline_assignments (
  pipeline_id text primary key,
  set_id uuid not null references public.outreach_sales_copy_sets(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outreach_sales_copy_sections (
  id uuid primary key default gen_random_uuid(),
  set_id uuid references public.outreach_sales_copy_sets(id) on delete cascade,
  pipeline_id text,
  source_section_id uuid references public.outreach_sales_copy_sections(id) on delete set null,
  title text not null,
  description text,
  section_type text not null default 'templates'
    check (section_type in ('templates', 'resources')),
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (set_id is not null and pipeline_id is null)
    or (set_id is null and pipeline_id is not null)
  )
);

create table if not exists public.outreach_sales_copy_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.outreach_sales_copy_sections(id) on delete cascade,
  source_item_id uuid references public.outreach_sales_copy_items(id) on delete set null,
  title text not null,
  body text not null default '',
  item_type text not null default 'message'
    check (item_type in ('message', 'link', 'contact')),
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_sales_copy_sections_set_idx
  on public.outreach_sales_copy_sections (set_id, sort_order);

create index if not exists outreach_sales_copy_sections_pipeline_idx
  on public.outreach_sales_copy_sections (pipeline_id, sort_order);

create index if not exists outreach_sales_copy_sections_source_idx
  on public.outreach_sales_copy_sections (source_section_id);

create index if not exists outreach_sales_copy_items_section_idx
  on public.outreach_sales_copy_items (section_id, sort_order);

create index if not exists outreach_sales_copy_items_source_idx
  on public.outreach_sales_copy_items (source_item_id);

create or replace function public.set_outreach_sales_copy_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_outreach_sales_copy_sets_updated_at
  on public.outreach_sales_copy_sets;
create trigger set_outreach_sales_copy_sets_updated_at
  before update on public.outreach_sales_copy_sets
  for each row
  execute function public.set_outreach_sales_copy_updated_at();

drop trigger if exists set_outreach_sales_copy_assignments_updated_at
  on public.outreach_sales_copy_pipeline_assignments;
create trigger set_outreach_sales_copy_assignments_updated_at
  before update on public.outreach_sales_copy_pipeline_assignments
  for each row
  execute function public.set_outreach_sales_copy_updated_at();

drop trigger if exists set_outreach_sales_copy_sections_updated_at
  on public.outreach_sales_copy_sections;
create trigger set_outreach_sales_copy_sections_updated_at
  before update on public.outreach_sales_copy_sections
  for each row
  execute function public.set_outreach_sales_copy_updated_at();

drop trigger if exists set_outreach_sales_copy_items_updated_at
  on public.outreach_sales_copy_items;
create trigger set_outreach_sales_copy_items_updated_at
  before update on public.outreach_sales_copy_items
  for each row
  execute function public.set_outreach_sales_copy_updated_at();

alter table public.outreach_sales_copy_sets enable row level security;
alter table public.outreach_sales_copy_pipeline_assignments enable row level security;
alter table public.outreach_sales_copy_sections enable row level security;
alter table public.outreach_sales_copy_items enable row level security;

drop policy if exists "Admins can read outreach sales copy sets"
  on public.outreach_sales_copy_sets;
create policy "Admins can read outreach sales copy sets"
  on public.outreach_sales_copy_sets
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

drop policy if exists "Admins can write outreach sales copy sets"
  on public.outreach_sales_copy_sets;
create policy "Admins can write outreach sales copy sets"
  on public.outreach_sales_copy_sets
  for all
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

drop policy if exists "Admins can read outreach sales copy assignments"
  on public.outreach_sales_copy_pipeline_assignments;
create policy "Admins can read outreach sales copy assignments"
  on public.outreach_sales_copy_pipeline_assignments
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

drop policy if exists "Admins can write outreach sales copy assignments"
  on public.outreach_sales_copy_pipeline_assignments;
create policy "Admins can write outreach sales copy assignments"
  on public.outreach_sales_copy_pipeline_assignments
  for all
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

drop policy if exists "Admins can read outreach sales copy sections"
  on public.outreach_sales_copy_sections;
create policy "Admins can read outreach sales copy sections"
  on public.outreach_sales_copy_sections
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

drop policy if exists "Admins can write outreach sales copy sections"
  on public.outreach_sales_copy_sections;
create policy "Admins can write outreach sales copy sections"
  on public.outreach_sales_copy_sections
  for all
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

drop policy if exists "Admins can read outreach sales copy items"
  on public.outreach_sales_copy_items;
create policy "Admins can read outreach sales copy items"
  on public.outreach_sales_copy_items
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

drop policy if exists "Admins can write outreach sales copy items"
  on public.outreach_sales_copy_items;
create policy "Admins can write outreach sales copy items"
  on public.outreach_sales_copy_items
  for all
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

insert into public.outreach_sales_copy_sets (id, slug, name, description)
values
  (
    '00000000-0000-4000-8000-000000000101',
    'publisher-fex-outreach',
    'Publisher/FEX Outreach',
    'Shared sales copy for publisher, FE, and BPO partner outreach.'
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    'lawyer-mva-outreach',
    'Lawyer/MVA Outreach',
    'Shared sales copy and portal resources for MVA lawyer outreach.'
  )
on conflict (id) do update
set
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description;

insert into public.outreach_sales_copy_pipeline_assignments (pipeline_id, set_id)
values
  ('publisher-keller', '00000000-0000-4000-8000-000000000101'),
  ('global-fe-keller', '00000000-0000-4000-8000-000000000101'),
  ('josh-bpo-colombia', '00000000-0000-4000-8000-000000000101'),
  ('ben-bpo-dominican-republic', '00000000-0000-4000-8000-000000000101'),
  ('ben-bpo-south-africa', '00000000-0000-4000-8000-000000000101'),
  ('flutra-bpo-el-salvador', '00000000-0000-4000-8000-000000000101'),
  ('flutra-bpo-venezuela', '00000000-0000-4000-8000-000000000101'),
  ('monica-personal-connections', '00000000-0000-4000-8000-000000000102')
on conflict (pipeline_id) do update
set set_id = excluded.set_id;

insert into public.outreach_sales_copy_sections (
  id,
  set_id,
  title,
  description,
  section_type,
  sort_order
)
values
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000101',
    'Initial Message',
    'First outbound message for new Publisher/FEX connections.',
    'templates',
    100
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000101',
    'Follow-up Message',
    'Follow-up message when the first touch has not received a response.',
    'templates',
    200
  ),
  (
    '00000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000101',
    'Positive Responses',
    'Replies for warm or positive responses.',
    'templates',
    300
  ),
  (
    '00000000-0000-4000-8000-000000000204',
    '00000000-0000-4000-8000-000000000101',
    'Interested',
    'Replies for prospects who want to learn more.',
    'templates',
    400
  ),
  (
    '00000000-0000-4000-8000-000000000205',
    '00000000-0000-4000-8000-000000000101',
    'Has Questions',
    'Replies for prospects who ask for clarification.',
    'templates',
    500
  ),
  (
    '00000000-0000-4000-8000-000000000206',
    '00000000-0000-4000-8000-000000000101',
    'Wants to Schedule',
    'Replies for prospects ready to book a call.',
    'templates',
    600
  ),
  (
    '00000000-0000-4000-8000-000000000207',
    '00000000-0000-4000-8000-000000000101',
    'Schedule Links',
    'Booking links for Publisher/FEX conversations.',
    'resources',
    1000
  ),
  (
    '00000000-0000-4000-8000-000000000208',
    '00000000-0000-4000-8000-000000000101',
    'Websites and Contacts',
    'Portal, landing page, and contact snippets.',
    'resources',
    1100
  ),
  (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000102',
    'Positive Responses',
    'Replies for warm MVA lawyer responses.',
    'templates',
    100
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000102',
    'Interested',
    'Replies for MVA prospects who want details.',
    'templates',
    200
  ),
  (
    '00000000-0000-4000-8000-000000000303',
    '00000000-0000-4000-8000-000000000102',
    'Has Questions',
    'Replies for MVA prospects asking for clarification.',
    'templates',
    300
  ),
  (
    '00000000-0000-4000-8000-000000000304',
    '00000000-0000-4000-8000-000000000102',
    'Wants to Schedule',
    'Replies for MVA prospects ready to schedule.',
    'templates',
    400
  ),
  (
    '00000000-0000-4000-8000-000000000305',
    '00000000-0000-4000-8000-000000000102',
    'Lawyer Portal Links',
    'Website resources for lawyer-facing MVA outreach.',
    'resources',
    1000
  )
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  section_type = excluded.section_type,
  sort_order = excluded.sort_order;

insert into public.outreach_sales_copy_items (
  id,
  section_id,
  title,
  body,
  item_type,
  sort_order
)
values
  (
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000201',
    'Initial Message',
    $copy$[first_name_without_title], thanks for connecting.

I'm going to give you an offer you can’t refuse (yes, that is a Godfather reference).
Cutting directly to the chase: are you willing to work with a new campaign at the moment?

We are an insurance agency based in the USA, and we have lead generation publishers that we work with across three different continents.

 We have some of the most competitive commission structures in the insurance industry at the moment. 

Would you be totally opposed to hearing more about it?$copy$,
    'message',
    100
  ),
  (
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000202',
    'Follow-up Message',
    $copy$URGENT RESPONSE REQUIRED
Just kidding, but I do want to see if you're currently doing sales and lead generation campaigns at the moment.

 If so, our team is looking to find new preferred partners for our insurance agencies. I'd be happy to talk to you more about how our business is structured so you can see the quality of business that we run.

Here is the link to connect and contact more:
https://calendly.com/insurvas/new-bpo-consultation Or my number—send me a whatsapp text or  Call at : +1 (864) 559-6318 admin@insurvas.com

I double dog dare you.$copy$,
    'message',
    100
  ),
  (
    '00000000-0000-4000-8000-000000000403',
    '00000000-0000-4000-8000-000000000207',
    'Publisher/FEX Scheduling Link',
    'https://calendly.com/insurvas/new-bpo-consultation',
    'link',
    100
  ),
  (
    '00000000-0000-4000-8000-000000000404',
    '00000000-0000-4000-8000-000000000208',
    'Internal Lead Generation Landing Page',
    'https://www.accidentpayments.com/',
    'link',
    100
  ),
  (
    '00000000-0000-4000-8000-000000000405',
    '00000000-0000-4000-8000-000000000208',
    'WhatsApp / Call',
    '+1 (864) 559-6318',
    'contact',
    200
  ),
  (
    '00000000-0000-4000-8000-000000000406',
    '00000000-0000-4000-8000-000000000208',
    'Email',
    'admin@insurvas.com',
    'contact',
    300
  ),
  (
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000305',
    'MVA Lawyer Portal',
    'https://www.getsignedcases.com/',
    'link',
    100
  )
on conflict (id) do update
set
  title = excluded.title,
  body = excluded.body,
  item_type = excluded.item_type,
  sort_order = excluded.sort_order;
