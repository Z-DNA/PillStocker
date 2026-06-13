<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Run-out Forecast (S-01)

- **Plan**: `context/changes/runout-forecast/plan.md`
- **Scope**: Full plan — Phases 1–3 of 3
- **Date**: 2026-06-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- Changed files exactly match the plan's file list (no drift / missing / extra). Two documented Phase-2 adaptations (middleware `/dashboard`→`/medications` redirect; deletion of `dashboard.astro`) are in place and sound.
- Automated success criteria re-run at HEAD: `npx astro sync` ✓, `npm run build` ✓, `npm run lint` ✓ (after F2 fix: exit 0 with one warn-level `no-console`). `"/medications"` present in `PROTECTED_ROUTES`. All `## Progress` items `[x]` with observable evidence.
- Security: POST `/api/medications` self-guards auth; `user_id` is server-derived (RLS-backed, not spoofable); all `?error=` redirect params `encodeURIComponent`'d; no `set:html`/injection surface.
- Intentional (not a finding): `0` pills with no dosing → "Out now" — the explicitly requested behavior.

## Findings

### F1 — "Runs out {date}" semantics (flagged by review, found sound)

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/medications/forecast.ts:45-48
- **Detail**: A sub-agent flagged `runOutDate = today + daysLeft` as one day optimistic. On inspection it is exact: `daysLeft = floor(pills/dose)` full dosing days cover `[today … today+daysLeft-1]`, so `today+daysLeft` is the first day without a full dose — the run-out day. Conservative (one day early) if today's dose was already taken. The never-wrong-optimistic guardrail is intact.
- **Fix**: Optional reword of the card label for clarity; no math change.
- **Decision**: SKIPPED (date is correct/conservative; no change needed)

### F2 — List-load error swallowed without logging

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/medications/index.astro:24-26
- **Detail**: The try/catch rendered the error banner but discarded the error object, losing debug signal on Cloudflare Workers.
- **Fix**: Add `console.error("Failed to load medications", error)` in the catch before setting `loadError`.
- **Decision**: FIXED (catch now binds `error` and logs it; `no-console` is warn-level so lint stays exit 0)
