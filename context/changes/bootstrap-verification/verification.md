---
bootstrapped_at: 2026-06-03T13:13:34Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: pill-stocker
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

Verbatim copy of `context/foundation/tech-stack.md` frontmatter and body.

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: pill-stocker
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: true
```

### Why this stack

PillStocker is a 3-week solo MVP for a single-user web app managing sensitive
health data, with a hard 2026-06-30 deadline. The PRD pins authentication and
persistent multi-device storage as non-negotiable must-haves and requires
confidentiality both in transit and at rest. The 10x Astro Starter is the
recommended default for (web-app, JavaScript/TypeScript) and bundles exactly
that shape: Supabase delivers PostgreSQL + auth + row-level security on the data
layer, Cloudflare Pages/Workers covers deploy + edge runtime, and
Astro + React + TypeScript + Tailwind handles the UI with project-wide explicit
contracts. Cloudflare Workers Cron Triggers cover FR-009's scheduled out-of-app
notifications natively, so no external job queue is needed for the MVP. The
stack clears all four agent-friendly gates (typed, convention-based, popular in
JS training, well-documented). Scaffolding confidence is first-class — the
starter is registered with a valid CLI and expected to work, with occasional
manual steps possible. CI defaults to GitHub Actions with auto-deploy-on-merge,
which fits a solo learner on a tight timeline.

## Pre-scaffold verification

| Signal      | Value                                                                   | Severity | Notes                                                                  |
| ----------- | ----------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| npm package | not run                                                                 | n/a      | `cmd_template` starts with `git clone`; no `create-*` CLI to inspect   |
| GitHub repo | github.com/przeprogramowani/10x-astro-starter last pushed 2026-05-17    | fresh    | within the last 3 months (≈17 days ago); resolved from card `docs_url` |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone (clone into temp dir, drop upstream `.git/`, move files up)
**Exit code**: 0 (after one retry; first attempt failed with `npm error E401` against the user's private CodeArtifact npm registry — the user re-authenticated and the retry succeeded)
**Files moved**: 20 total — 19 moved silently, 1 sidelined
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold` (existing `CLAUDE.md` wins; starter's copy preserved for diff)
**.gitignore handling**: moved silently (no pre-existing `.gitignore` in cwd to merge against)
**`.bootstrap-scaffold` cleanup**: deleted (empty after move-up)
**Notes**:
- Upstream `.git/` was deleted before move-up so the starter's git history does not leak into the user's repo.
- 774 npm packages installed (309 looking for funding); 4 EBADENGINE warnings — packages prefer Node `^20.19.0 || ^22.13.0 || >=24`; user has Node v23.11.0. Astro/React/Cloudflare stack still scaffolded cleanly; the engine warnings are informational and did not block install. Recommend pinning Node 22 (the card's declared `runtime_version`) or 24 to silence them.

## Post-scaffold audit

**Tool**: `npm audit --json` — initial run against the user's configured registry (`prod-186612847456.d.codeartifact.us-west-2.amazonaws.com/npm/RemitlyNode/`) returned 404 for the audit endpoint; retried with `--registry=https://registry.npmjs.org/` to surface advisory data.
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW (10 findings across 895 deps — 449 prod, 316 dev, 131 optional)
**Direct vs transitive**: 0/0/2/0 direct of total 0/1/9/0 — the HIGH finding lives in the transitive tree; only two MODERATE findings (`@astrojs/check`, `wrangler`) appear in direct deps

#### CRITICAL findings

None.

#### HIGH findings

- **devalue** (transitive) — `5.6.3 - 5.8.0`
  - Advisory: [GHSA-77vg-94rm-hx3p](https://github.com/advisories/GHSA-77vg-94rm-hx3p) — *Svelte devalue: DoS via sparse array deserialization*
  - CVSS: 7.5 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`), CWE-770
  - Fix available: yes (transitive path; runs `npm audit fix` should resolve)

#### MODERATE findings

| Package                 | Direct? | Range                                                          | Via                                  | Fix available                          |
| ----------------------- | ------- | -------------------------------------------------------------- | ------------------------------------ | -------------------------------------- |
| `@astrojs/check`        | yes     | `>=0.9.3`                                                      | `@astrojs/language-server`           | downgrade to `0.9.2` (semver-major)    |
| `wrangler`              | yes     | `<=0.0.0-kickoff-demo \|\| 3.108.0 - 4.93.0`                   | `miniflare`                          | yes                                    |
| `@astrojs/language-server` | no   | `>=2.14.0`                                                     | `volar-service-yaml`                 | downgrade `@astrojs/check` to 0.9.2    |
| `@cloudflare/vite-plugin` | no    | `<=0.0.0-fff677e35 \|\| 0.0.7 - 1.37.2`                        | `miniflare`, `wrangler`, `ws`        | yes                                    |
| `miniflare`             | no      | `<=0.0.0-fff677e35 \|\| 3.20250204.0 - 4.20260518.0`           | `ws`                                 | yes                                    |
| `volar-service-yaml`    | no      | `<=0.0.70`                                                     | `yaml-language-server`               | downgrade `@astrojs/check` to 0.9.2    |
| `ws`                    | no      | `8.0.0 - 8.20.0`                                               | (self)                               | yes                                    |
| `yaml`                  | no      | `2.0.0 - 2.8.2`                                                | (self)                               | downgrade `@astrojs/check` to 0.9.2    |
| `yaml-language-server`  | no      | (advisory range — see raw audit JSON)                          | `yaml`                               | downgrade `@astrojs/check` to 0.9.2    |

#### LOW / INFO findings

None.

## Hints recorded but not acted on

v1 reads these fields into the audit trail and surfaces them in the run summary, but does not modify the scaffold based on them. A future "Memory Architecture" skill will consume them.

| Hint                       | Value               |
| -------------------------- | ------------------- |
| bootstrapper_confidence    | first-class         |
| quality_override           | false               |
| path_taken                 | standard            |
| self_check_answers         | null                |
| team_size                  | solo                |
| deployment_target          | cloudflare-pages    |
| ci_provider                | github-actions      |
| ci_default_flow            | auto-deploy-on-merge |
| has_auth                   | true                |
| has_payments               | false               |
| has_realtime               | false               |
| has_ai                     | false               |
| has_background_jobs        | true                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review `CLAUDE.md.scaffold` and decide whether to merge anything from the starter's copy into your existing `CLAUDE.md`.
- Address audit findings per your project's risk tolerance — the 1 HIGH (`devalue`, transitive) and 9 MODERATE findings are documented above; `npm audit fix` will resolve most, and `npm audit fix --force` is needed for the `@astrojs/check` downgrade.
- Consider pinning the Node version (`.nvmrc` is set to Node 22 per the starter) to silence the 4 EBADENGINE warnings seen during install.
- Configure Supabase + Cloudflare Pages credentials per the starter `README.md` before first deploy.
