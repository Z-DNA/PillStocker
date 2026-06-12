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

## 10xDevs AI Toolkit - Module 2, Lesson 2

Turn one roadmap item into the first implementation cycle with the **change planning chain**:

```
/10x-roadmap -> /10x-new -> /10x-plan -> /10x-plan-review -> /10x-implement
```

`/10x-new`, `/10x-plan`, `/10x-plan-review`, and `/10x-implement` are the lesson focus. `/10x-frame` and `/10x-research` are not required rituals here; they are escalation paths introduced in the next lesson.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Change setup (lesson focus)** | |
| `/10x-new <change-id>` | You selected a roadmap item and need a stable change folder. Creates `context/changes/<change-id>/change.md` so planning, implementation, progress, commits, and later review all share one identity. Use AFTER roadmap selection, BEFORE `/10x-plan`. |
| **Planning (lesson focus)** | |
| `/10x-plan <change-id>` | You have a change folder and need a reviewable implementation plan. Reads roadmap context, foundation docs, codebase evidence, and any existing change notes; writes `plan.md` and `plan-brief.md` with phases, file contracts, success criteria, and `## Progress`. |
| **Plan readiness (lesson focus)** | |
| `/10x-plan-review <change-id>` | You have `plan.md` and need a light pre-code readiness check. Use it to catch missing end state, weak contracts, malformed progress, scope drift, or blind spots before code changes begin. |
| **Implementation (lesson focus)** | |
| `/10x-implement <change-id> phase <n>` | You have an approved plan and want to execute one phase with verification, manual gate, commit ritual, and SHA write-back to `## Progress`. |
| **Lifecycle closure** | |
| `/10x-archive <change-id>` | A change is merged or intentionally closed. Move it out of active `context/changes/` into archive state. |

### How the chain hands off

- `/10x-new` creates the durable change identity.
- `/10x-plan` turns that identity into an implementation contract.
- `/10x-plan-review` checks the plan before the agent mutates code.
- `/10x-implement` executes one planned phase, verifies, asks for manual confirmation when needed, commits, and records progress.

### Lesson boundaries

- Plan is the default router after roadmap selection. Start with `/10x-plan` unless the problem is unclear or external evidence is blocking.
- Do not run `/10x-frame + /10x-research` as ceremony for every change.
- Do not turn this lesson into a full end-to-end product build. A checkpoint with a planned and partially or fully implemented stream is valid.
- Code review of the implemented diff belongs to Lesson 3 via `/10x-impl-review`.
- Lifecycle closure via `/10x-archive` after a change is merged or intentionally closed.

### Paths used by this lesson

- `context/foundation/roadmap.md` - upstream roadmap
- `context/changes/<change-id>/change.md` - change identity
- `context/changes/<change-id>/plan.md` - implementation contract
- `context/changes/<change-id>/plan-brief.md` - compressed handoff
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
