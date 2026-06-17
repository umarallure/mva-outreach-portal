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
3. Configure server-only GoLogin vars:
   - `GOLOGIN_API_TOKEN`
   - `OUTREACH_SESSION_ENCRYPTION_KEY`
   - `OUTREACH_SESSION_STALE_MINUTES` defaults to `120`
4. Configure one `GOLOGIN_PROFILE_*` ID per outreach account.
5. Add optional `DEFAULT_TARGET_URL_*`, `FLOWCHAT_URL_*`, and `LINKEDIN_URL_*` values per account.
6. Apply `supabase/migrations/20260617_create_outreach_gologin_sessions.sql` to the shared Supabase project.

`GOLOGIN_API_TOKEN`, `OUTREACH_SESSION_ENCRYPTION_KEY`, Live View URLs, launch URLs, and proxy/account secrets must never be exposed through `NEXT_PUBLIC_*` variables.

## GoLogin Workflow

Account workspace pages start, stop, restart, and heartbeat cloud browser sessions through server API routes. Session URLs are encrypted before storage and the database enforces one active/starting/stopping session per GoLogin profile.
