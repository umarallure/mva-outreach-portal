# Outreach Portal

Next.js App Router portal for Accident Payments outreach operations. The primary account surface is GoLogin Cloud Browser; FlowChat and LinkedIn URLs remain secondary account links.

## Local Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Required Setup

1. Copy `.env.example` to `.env.local`.
2. Configure Supabase public auth vars:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Configure server-only Supabase and GoLogin vars:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GOLOGIN_API_TOKEN`
   - `OUTREACH_SESSION_ENCRYPTION_KEY`
   - `OUTREACH_SESSION_STALE_MINUTES` defaults to `120`
4. Configure Calendly scheduling vars:
   - `CALENDLY_INSURANCE_API_TOKEN`
   - `CALENDLY_MVA_API_TOKEN`
   - `CALENDLY_WEBHOOK_SIGNING_KEY`
   - `CRON_SECRET`
   - optional URI overrides: `CALENDLY_INSURANCE_USER_URI`, `CALENDLY_INSURANCE_ORGANIZATION_URI`, `CALENDLY_MVA_USER_URI`, `CALENDLY_MVA_ORGANIZATION_URI`
5. Configure one `GOLOGIN_PROFILE_*` ID per outreach account.
6. Add optional `DEFAULT_TARGET_URL_*`, `FLOWCHAT_URL_*`, and `LINKEDIN_URL_*` values per account.
7. Apply the Supabase migrations in `supabase/migrations/` to the shared Supabase project.

`GOLOGIN_API_TOKEN`, `OUTREACH_SESSION_ENCRYPTION_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, Calendly tokens, webhook signing keys, Live View URLs, launch URLs, and proxy/account secrets must never be exposed through `NEXT_PUBLIC_*` variables.

## GoLogin Workflow

Account workspace pages start, stop, restart, and heartbeat cloud browser sessions through server API routes. Session URLs are encrypted before storage and the database enforces one active/starting/stopping session per GoLogin profile.

## Calendly Scheduling Workflow

The sidebar Scheduling section has Insurance Scheduling and MVA Scheduling pages. Each page uses its own Calendly account token: `CALENDLY_INSURANCE_API_TOKEN` or `CALENDLY_MVA_API_TOKEN`. Calendly webhooks post to `/api/calendly/webhook?account=insurance` or `/api/calendly/webhook?account=mva`, where the raw body is verified with `CALENDLY_WEBHOOK_SIGNING_KEY` before events and invitees are upserted through the Supabase service role. Vercel Cron calls `/api/cron/calendly-sync` hourly with `Authorization: Bearer ${CRON_SECRET}` to reconcile missed webhook deliveries and recent history.
