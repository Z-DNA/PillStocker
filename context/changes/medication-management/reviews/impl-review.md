<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Medication Management (S-03)

- **Plan**: context/changes/medication-management/plan.md
- **Scope**: Full plan (Phases 1–3 of 3)
- **Date**: 2026-06-27
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## Findings

### F1 — Manage page can 500 on a thrown DB error

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/pages/medications/[id]/edit.astro:17
- **Detail**: Top-level `await getMedicationById(supabase, id)` is not wrapped in try/catch. getMedicationById (queries.ts:53-59) throws on any non-"no-rows" Postgrest error; an uncaught throw in Astro frontmatter renders a hard 500. Sibling pages index.astro:18-27 and shelf.astro:18-34 try/catch + console.error and degrade to a banner. Only page-level query in the slice that can crash; diverges from the project's error-handling convention.
- **Fix A ⭐ Recommended**: Wrap the fetch; on error redirect to /medications.
  - Strength: Minimal targeted edit; reuses the null-med not-found path the page already takes (edit.astro:21).
  - Tradeoff: A transient error redirects silently (no banner).
  - Confidence: HIGH — top-level `return Astro.redirect` already works here.
  - Blind spot: None significant.
- **Fix B**: Wrap the fetch; set a loadError flag and render an inline banner.
  - Strength: Mirrors index.astro/shelf.astro and reuses edit.astro's configError branch; most informative.
  - Tradeoff: Threads a new flag through the template; more code.
  - Confidence: HIGH — identical pattern in two sibling pages.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A (try/catch → redirect to /medications + console.error, edit.astro:17-25)

### F2 — Manual success-criteria marked done without live verification

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/medication-management/plan.md (Progress 2.5–2.13, 3.4–3.10)
- **Detail**: All Phase 2/3 Manual rows are `- [x]` but were satisfied by code-review against the plan contract, not live execution. Runtime/DB scenarios require a locally-configured Supabase + auth (operationally unavailable per the plan). Automated checks (sync/build/lint) genuinely pass.
- **Fix**: Walk the Phase 2/3 manual scenarios against a live Supabase before /10x-archive; treat the [x] marks as "logic-verified, pending live confirmation" until then.
- **Decision**: FIXED — re-opened the 16 runtime manual rows (2.5–2.13, 3.4–3.10) to `- [ ]` with a note; they now surface as pending until run against a live Supabase. Phase 1 manual rows (1.4–1.6, static code-review) kept `[x]`.

### F3 — Unplanned eslint rule disable for all .astro files

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: eslint.config.js:67-75
- **Detail**: `@typescript-eslint/no-misused-promises` turned off for all \*_/_.astro (not in the plan). Justified: the rule crashes (not errors) on the top-level `return Astro.redirect(...)` F1's page requires, so narrowing to one file wouldn't help. Scoped to .astro only; .ts/.tsx keep it. Residual risk: misused promises in .astro inline/client scripts go unchecked (low at MVP scale). Benign and documented.
- **Fix**: Accept as-is. Optionally note in change.md for traceability; revisit if richer .astro client scripting is added.
- **Decision**: ACCEPTED AS RISK — justified, well-scoped to .astro, documented in-code. No action.

### F4 — Config-error UX differs between create and new handlers

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: edit.ts:15, refill.ts:15, archive.ts:15
- **Detail**: On a null Supabase client, the create handler redirects with a visible message (index.ts:25), while the three new handlers silently redirect to /medications. Both safe (no DB work, no info leak); the new ones give no signal the action failed due to config. Acceptable for POST-only endpoints. Not a defect.
- **Fix**: Leave as-is, or surface "?error=Supabase is not configured" on the manage page for parity. Cosmetic.
- **Decision**: SKIPPED — cosmetic; silent redirect is safe and config-null is a deploy-time state.
