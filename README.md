# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Portal integration

This repo contains the marketing site in `src/` and a separate client portal app in `backend/`.

The marketing site's admin area can show an **Open Client Portal** button when this environment variable is set:

- `VITE_PORTAL_URL` (example: `https://app.meetingmanagerpro.com`)

## Supabase (multi-tenant MVP)

This repo includes a retention-first, multi-tenant schema draft for the Client Portal + Master Admin reporting:

- `supabase_multitenant_jobs_mvp.sql`

Key idea: detailed attendee/lead records in `responses` have an `expires_at` (default 30 days). You retain only aggregate per-job stats long-term in `job_stats`.
