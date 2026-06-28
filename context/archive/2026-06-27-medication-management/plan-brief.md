# Medication Management (S-03) — Plan Brief

> Full plan: `context/changes/medication-management/plan.md`

## What & Why

S-03 adds the three lifecycle actions on a medication record — **refill**
(FR-003, additive top-up), **edit** (FR-004, absolute correction), and **archive**
(FR-005, soft-delete) — so the run-out and expiry predictions stay trustworthy
over weeks of real use (the PRD's secondary success criterion). It's the first
slice that _updates_ the F-01 record; S-01/S-02 only added and read it.

## Starting Point

The `medications` table already has everything S-03 needs: an owner-scoped UPDATE
RLS policy, the `archived_at` column, and a `moddatetime` trigger that auto-touches
`updated_at`. `getActiveMedications` already filters `archived_at IS NULL`, so
archiving removes a med from both views for free. The create write-path
(`AddMedicationForm` → `new.astro` → `POST /api/medications` → `createMedication`)
is an exact template, and S-02 deliberately kept the cards lean for this slice.

## Desired End State

From either the run-out list or the shelf, a user clicks "Edit" on a card and
reaches `/medications/[id]/edit`, where they can edit any field (saved as absolute
values), refill (a +N additive top-up to the count), or archive (soft-delete,
guarded by a confirm). Archived meds vanish from active views but their rows are
preserved in the DB; every prediction re-computes automatically on the next render.

## Key Decisions Made

| Decision        | Choice                                                                         | Why (1 sentence)                                                                               | Source |
| --------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------ |
| Action surface  | Dedicated per-med manage page (`/medications/[id]/edit`)                       | Keeps both cards lean (one "Edit" link each) and concentrates all three actions on one surface | Plan   |
| Edit form       | Generalize `AddMedicationForm` → `MedicationForm` (initialValues/action/label) | One source of truth for fields + validation so add and edit can't drift                        | Plan   |
| Refill model    | Additive "+N" (`count = (current ?? 0) + N`)                                   | Matches the real top-up action; edit stays the absolute-correction path (PRD FR-003)           | Plan   |
| Archive scope   | One-way + confirm, no restore UI                                               | Exactly satisfies FR-005 at minimum scope; record stays DB-restorable                          | Plan   |
| Endpoint shape  | Separate route per action under `/api/medications/[id]/`                       | Each handler single-purpose; parse drift avoided by a shared module                            | Plan   |
| Edit + count    | Edit exposes absolute count; refill adds                                       | Clean FR-003/FR-004 division: refill = top-up, edit = correct drift                            | Plan   |
| Archive confirm | Native `confirm()` on submit                                                   | Smallest guard against an accidental, DB-reversible action                                     | Plan   |

## Scope

**In scope:** per-med manage page; edit all fields (absolute); additive refill;
soft-delete archive (with confirm); one "Edit" link on both card components;
shared parse module; owner-scoped fetch/update/refill/archive query helpers.

**Out of scope:** archived-list / unarchive / restore UI; hard delete; refill
history; pack-size modeling; inline card buttons; summary counts (S-04);
schema change / `db:types` regen; middleware change; row-versioning.

## Architecture / Approach

One new page (`/medications/[id]/edit.astro`) loads the row by id (RLS-scoped) and
hosts: the generalized `MedicationForm` (POST → `/api/medications/[id]/edit`), a
plain refill form (POST → `/[id]/refill`), and a confirm-guarded archive form
(POST → `/[id]/archive`). Three self-guarding API handlers update the single row;
four new query helpers in `queries.ts` carry the data access; field parsing moves
to a shared `parse.ts` consumed by both create and edit. Predictions are untouched
— `computeRunout`/`classifyExpiry` re-run on render.

## Phases at a Glance

| Phase                         | What it delivers                                                                                       | Key risk                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 1. Data-access + parse module | `getMedicationById` / `updateMedication` / `refillMedication` / `archiveMedication`; extracted parsers | Refactoring the create handler's parsers without behavior change        |
| 2. Manage page + edit         | Generalized form, `/[id]/edit` page + endpoint, "Edit" links on both cards                             | Renaming/generalizing the working add form without regressing add       |
| 3. Refill + archive           | Refill control + endpoint; confirm-guarded archive + endpoint                                          | Idempotent, never-destructive archive; not-found handling on all writes |

**Prerequisites:** F-01, S-01 (both done); a locally-configured Supabase + a
confirmed user for manual verification (auth still operationally inactive until
deploy-plan G3/G4).
**Estimated effort:** ~2-3 sessions across the 3 phases.

## Open Risks & Assumptions

- **Refill read-then-write race:** two concurrent refills could lose an update —
  accepted at single-user MVP scale (no row versioning).
- **No in-app undo for archive:** an accidental (confirmed) archive needs DB
  access to reverse — mitigated by the confirmation step; restore UI is deferred.
- **Renaming the add form** touches a working island; mitigated by additive,
  default-preserving props and a single consumer (`new.astro`).
- Sub-24h timezone edge on date-granular re-classification is the same accepted
  MVP risk carried from S-01/S-02.

## Success Criteria (Summary)

- A user can edit any field, refill additively, and archive a med entirely from
  the manage page; the list/shelf reflect the change immediately.
- Archive removes a med from both active views while its row is preserved (no hard
  delete) — the "data never silently lost" guardrail holds.
- Every write fails cleanly on a not-owned / not-found id, never touching another
  user's data.
