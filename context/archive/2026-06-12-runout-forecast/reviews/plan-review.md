<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Run-out Forecast (S-01)

- **Plan**: `context/changes/runout-forecast/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-12
- **Verdict**: REVISE → SOUND (all findings fixed)
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding

7/7 existing paths ✓, symbols ✓ (PROTECTED_ROUTES, createClient, ServerError), brief↔plan ✓; `docs/reference/contract-surfaces.md` absent (check skipped). RLS auth-context claim verified by sub-agent (HIGH confidence): a freshly-created `@supabase/ssr` server client reads the session from request cookies on its first data call, so `.select()`/`.insert()` run as the authenticated user with no extra `getUser()` — no plan change needed. Blast-radius sweep found the only stray `/dashboard` reference is `Topbar.astro:13`. No pre-existing SSR data-fetch pattern exists (this is the first domain data code) — no redundant-pattern risk.

## Findings

### F1 — Topbar "/dashboard" nav link not repointed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — dashboard/redirect changes
- **Detail**: The plan converts `/dashboard` into a redirect to `/medications` and retargets post-signin, but the only nav link to it — `src/components/Topbar.astro:13` `<a href="/dashboard">Dashboard</a>` (rendered whenever a user is set, including on the public `/`) — wasn't in the change set. Authed users would hop through a redirect and see a stale label.
- **Fix**: Add `src/components/Topbar.astro` to Phase 2 — repoint the link to `/medications` and relabel "Medications".
- **Decision**: FIXED (Fix in plan — Phase 2 change #4 extended to include Topbar.astro; criterion 2.12 added)

### F2 — Empty numeric fields can misclassify a count-less med as "Out now"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — API handler / Phase 1 — computeRunout
- **Detail**: The handler parses count/doses with `Number()`, but `Number("") === 0`. A blank `pill_count` would store `0` instead of `null`; a med with dosing but a blank count would then forecast `floor(0/dose) = 0` → "Out now", contradicting the decided "No forecast" behaviour for a count-less med. `computeRunout` keys "none" on `pill_count == null`, so the `null` must survive parsing. (Wrong-pessimistic, not wrong-optimistic — not a guardrail breach, but breaks the edge case.)
- **Fix**: In the handler, test for empty/blank BEFORE `Number()`; store `null` for blank count/doses, `Number()`-parse only non-empty values.
- **Decision**: FIXED (Fix in plan — Critical Implementation Details now calls out the `Number("")===0` trap; Phase 3 contract tightened; criterion 3.10 added)

### F3 — Read-path DB error handling unspecified

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — queries.ts / Phase 2 — list page
- **Detail**: `getActiveMedications` was typed `Promise<MedicationRow[]>` with no contract for a PostgrestError. The list page only had a fallback for a null client; a query error would surface as an unhandled 500 or a silently empty list.
- **Fix**: Specify the helper's error behaviour (throw) and have the list page render an error state on failure.
- **Decision**: FIXED (Fix in plan — `getActiveMedications` now throws on error; list page wraps in try/catch and renders the Banner error variant)
