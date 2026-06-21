<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Expiry Shelf (S-02)

- **Plan**: context/changes/expiry-shelf/plan.md
- **Scope**: Phases 1–2 of 2 (full plan)
- **Date**: 2026-06-21
- **Verdict**: APPROVED
- **Findings**: 0 critical  0 warnings  1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Method

Two independent general-purpose review agents (plan-drift; safety/quality/pattern), plus automated success-criteria runs.

- **Plan drift**: all 8 source files MATCH the planned contract. No DRIFT / MISSING / EXTRA. Guardrails held — `src/pages/medications/index.astro` and `MedicationCard.astro` unchanged across both commits; no migration; no `middleware.ts` change; `getActiveMedications` reused with an in-memory expiry filter (no DB-side shelf query).
- **Security**: open-redirect surface closed via the `returnPathFor` whitelist (token-mapped, never echoes a user URL); `/api/medications` self-guards `locals.user`; all rendered user data goes through Astro's escaped `{}`; parameterized Supabase query; no secrets.
- **Success criteria**: `npx astro sync`, `npm run build`, `npm run lint` all pass (0 errors; 2 accepted `no-console` warnings matching `index.astro`). All manual Progress rows `[x]`, confirmed during implementation.

## Findings

### F1 — API date validation looser than the shelf's parser

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/pages/api/medications/index.ts:36 (consumer: src/pages/medications/shelf.astro:26)
- **Detail**: `optionalDate()` accepted any string `Date.parse()` could read (e.g. "Jan 5 2026"), while `shelf.astro` parses `expiry_date` by splitting on "-" expecting `YYYY-MM-DD`. A crafted POST could store a value that passes `Date.parse` but isn't `YYYY-MM-DD`, then renders "Invalid Date" on the shelf. Native `<input type="date">` only emits `YYYY-MM-DD`, so this was defense-in-depth.
- **Fix**: Tightened `optionalDate` to require `/^\d{4}-\d{2}-\d{2}$/` in addition to the `Date.parse` validity check, so the API accepts exactly the format the shelf consumes (rejects both "Jan 5 2026" and impossible dates like 2026-02-30).
  - Strength: Validated format now matches the consumed format; closes the "Invalid Date" render path.
  - Tradeoff: None significant — two-character regex guard, no behavior change for real date-input submissions.
  - Confidence: HIGH — verified via build + lint after the edit.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix now)
