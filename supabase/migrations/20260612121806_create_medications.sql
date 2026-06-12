-- Foundation F-01 (medication-data-model).
-- One record per medication, owner-scoped, soft-deletable, backing both the
-- run-out (daily) and expiry (shelf) views. Owner-only RLS is the enforcement
-- point for the "medication data is readable only by its owner" NFR — and since
-- SUPABASE_KEY is the RLS-respecting publishable key, these policies are the
-- actual confidentiality boundary, not a convenience.

-- updated_at auto-touch trigger source (lives in the `extensions` schema on Supabase).
create extension if not exists moddatetime schema extensions;

create table public.medications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null,
  active_substance text,
  description      text,
  pill_count       numeric,
  dose_morning     numeric,
  dose_midday      numeric,
  dose_night       numeric,
  expiry_date      date,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint medications_name_not_blank
    check (char_length(trim(name)) > 0),
  constraint medications_pill_count_non_negative
    check (pill_count is null or pill_count >= 0),
  constraint medications_dose_morning_non_negative
    check (dose_morning is null or dose_morning >= 0),
  constraint medications_dose_midday_non_negative
    check (dose_midday is null or dose_midday >= 0),
  constraint medications_dose_night_non_negative
    check (dose_night is null or dose_night >= 0)
);

comment on table public.medications is
  'One record per medication; optional count + morning/midday/night dosing (run-out view) and/or expiry_date (shelf view). archived_at IS NULL = active. Owner-scoped via RLS.';

-- Every RLS policy filters by user_id, so index it.
create index medications_user_id_idx on public.medications (user_id);

-- Keep updated_at fresh on every row update (data-integrity guardrail).
create trigger medications_set_updated_at
  before update on public.medications
  for each row
  execute function extensions.moddatetime (updated_at);

alter table public.medications enable row level security;

-- Owner-only policies, scoped to the authenticated role. `(select auth.uid())`
-- is Supabase's recommended form (the planner caches the result per statement).
create policy "Users can view their own medications"
  on public.medications for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own medications"
  on public.medications for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own medications"
  on public.medications for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own medications"
  on public.medications for delete
  to authenticated
  using ((select auth.uid()) = user_id);
