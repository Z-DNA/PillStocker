# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## PillStocker — project notes

> Hand-written section. Everything between the `BEGIN/END @przeprogramowani/10x-cli` markers below is tool-managed — don't edit it; edit here instead.

**What we're building:** PillStocker — medication inventory with run-out & expiry forecasting. The product spec is authoritative in `@context/foundation/prd.md`; stack decisions in `@context/foundation/tech-stack.md`; setup/run/deploy in `@README.md`. Read these before implementing a feature — don't infer requirements from code alone.

**Timeline:** 3-week solo MVP, hard deadline **2026-06-27**. Build the smallest slice that satisfies a user story's acceptance criteria in `@context/foundation/prd.md`; don't add config options, abstraction layers, or features the story doesn't require, and skip anything the PRD lists as a non-goal or v2.

### Conventions an agent will otherwise miss

- **Server-only secrets via `astro:env/server`.** `SUPABASE_URL` / `SUPABASE_KEY` are imported from `astro:env/server` (see `@src/lib/supabase.ts`), never from `import.meta.env` or client code. The client factory returns `null` when env is missing, and `@src/middleware.ts` handles that by setting `context.locals.user = null`. Preserve this null-safe pattern — don't assume a client exists.
- **Protected routes are code, not config.** Add a path to the `PROTECTED_ROUTES` array in `@src/middleware.ts` to require auth. `/api/auth/*` endpoints are intentionally excluded and must guard themselves and own their error responses.
- **Imports use the `@/*` alias** (`@/components/...`, `@/lib/...`), not relative `../../` paths.
- **UI primitives use Radix `Slot` (`asChild`) + CVA** — see `@src/components/ui/`. Match that pattern for new primitives rather than `forwardRef` boilerplate.
- **Two local secret files kept in sync:** `.env` and Cloudflare's `.dev.vars` (Wrangler). See `@README.md`.

### Build / verify

- Run `npx astro sync` before `npm run lint` / `npm run build` to regenerate Astro types — CI does this, and type errors surface without it.
- **No test runner is configured** — `npm test` does not exist. Don't claim changes are suite-verified; verify with `npm run build` and reasoning until a framework is added.
- Formatting and lint are auto-fixed at commit by husky + lint-staged — no need to hand-format.

### How I should work here

- Propose a short plan and get sign-off before non-trivial changes.
- Keep changes minimal — touch only what the task needs; no unprompted refactors or features.
- When choosing between approaches, briefly state the tradeoff.
- Be terse; skip end-of-turn recaps.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code review (lesson focus)** | |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome** | |
| `/10x-lesson` | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note. |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
