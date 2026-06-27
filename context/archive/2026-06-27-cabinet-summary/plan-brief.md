# Cabinet Summary (S-04) — Plan Brief

> Full plan: `context/changes/cabinet-summary/plan.md`

## What & Why

S-04 is the MVP's final slice: a **minimal summary landing screen** at
`/dashboard` showing two counts — medications **running low** and **expiring soon /
expired** — so the user gets a one-glance daily anchor on opening the app (FR-011).
It's counts-only by design, not a dashboard.

## Starting Point

`/dashboard` is a reserved, empty slot — there's no page; `middleware.ts` just
redirects it to `/medications`, and it's already in `PROTECTED_ROUTES`. The two
pure classifiers (`computeRunout`, `classifyExpiry`) and the single owner-scoped
`getActiveMedications` query already exist; the run-out list and shelf show the SSR
page pattern to mirror. Post-login currently lands on `/medications`.

## Desired End State

After signing in, the user lands on `/dashboard` and sees two clickable count
cards — "N running low" → `/medications` and "M expiring soon / expired" →
`/medications/shelf` — plus an all-clear message when nothing needs attention, or
an "add your first medication" CTA on a fresh account. A Topbar "Summary" link
reaches it from every view. The other views are unchanged.

## Key Decisions Made

| Decision            | Choice                                                            | Why (1 sentence)                                                                             | Source |
| ------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ |
| Placement & landing | `/dashboard` (reserved slot), made the post-login landing         | Matches the reserved-slot convention and FR-011's "landing screen"                           | Plan   |
| "Running low"       | run-out status `warning\|critical\|out` (< 14 days, forecastable) | Anything not green with a forecast; consistent with the cards' bands, never wrong-optimistic | Plan   |
| "Expiring soon"     | expiry status `soon\|expired` (within 90 days OR past), one count | An already-expired med is most urgent and must never be silently dropped                     | Plan   |
| Counts              | Clickable cards linking to the run-out list / shelf               | Turns the daily anchor into a one-tap jump-off to act                                        | Plan   |
| Empty state         | All-clear message + add-CTA for a fresh account                   | "All good" is a meaningful signal; a new user is guided to add                               | Plan   |

## Scope

**In scope:** `summarizeCabinet` pure helper; `/dashboard` summary page (two
clickable counts, all-clear + empty states); remove the `/dashboard` redirect;
repoint post-signin landing to `/dashboard`; Topbar "Summary" link.

**Out of scope:** any content beyond the two counts (charts/trends/breakdowns); a
separate "expired" count; a new query / DB aggregation; card / `queries.ts` / API
changes; re-branding the public home `/`; threshold config; schema /
`db:types` / `PROTECTED_ROUTES` changes.

## Architecture / Approach

A new pure `src/lib/medications/summary.ts` counts the two categories by running
the existing `computeRunout` / `classifyExpiry` over `getActiveMedications` rows in
memory. A new `dashboard.astro` (mirroring `index.astro`/`shelf.astro`: createClient
→ try/catch query → Banner on error → Topbar + glass cards) renders the counts as
links. The landing repoint is three small edits: drop the middleware redirect,
change `signin.ts`'s success target, add a Topbar link.

## Phases at a Glance

| Phase                                | What it delivers                                                      | Key risk                                                                |
| ------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1. Summary logic + `/dashboard` page | `summarizeCabinet` + the summary page; redirect removed so it renders | Count definitions must match what the run-out/shelf views show          |
| 2. Landing + nav                     | Post-signin lands on `/dashboard`; Topbar "Summary" link              | Changing S-01's established `/medications` landing without breaking nav |

**Prerequisites:** F-01, S-01, S-02 (all done). Parallel with S-03 — touches no
files S-03 touches (cards, `queries.ts`, API), so no collision. A
locally-configured Supabase + confirmed user for manual verification.
**Estimated effort:** ~1 session across the 2 phases.

## Open Risks & Assumptions

- **Count drift:** the summary must agree with the run-out and shelf views for the
  same data — mitigated by reusing the exact same classifiers (no parallel logic).
- **Landing change:** repointing post-signin to `/dashboard` changes S-01's
  established landing; small and reversible, but worth a deliberate manual check.
- Same accepted sub-24h timezone edge as S-01/S-02 (inherited from the classifiers).

## Success Criteria (Summary)

- Signing in lands on a summary showing the two counts, which match the run-out
  and shelf views for the same data.
- Each count links to its view; an all-clear shows when nothing is low/expiring;
  a fresh account is nudged to add.
- An already-expired med is always reflected in the expiry count (never dropped).
