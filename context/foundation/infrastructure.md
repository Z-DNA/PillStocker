---
project: PillStocker
researched_at: 2026-06-06
recommended_platform: Cloudflare Workers
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 + React 19
  runtime: Cloudflare Workers (workerd)
---

## Recommendation

**Deploy on Cloudflare Workers.**

The project is already built for it — `@astrojs/cloudflare` is the configured adapter, `astro:env` server-secrets, `wrangler.jsonc`, and the GitHub Actions CI all assume Cloudflare, so the migration cost is zero. It passes all five agent-friendly criteria, runs at **$0** on the free tier at this scale (single-user health app, low QPS). (FR-009 out-of-app notifications were deferred to v2 on 2026-06-06, so the MVP needs no scheduled jobs; Cloudflare's **free-tier Cron Triggers** remain a v2 advantage — mapping directly onto FR-009 with no external job queue when it returns.) Every other candidate requires an adapter swap and a non-native cron story; under the developer's stated "minimize cost" priority, none of them beats free + already-wired. The interview's "single region is fine" removes Cloudflare's edge advantage as a *deciding* factor, but cost and zero-migration carry the decision on their own.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent docs | Deploy API | MCP / integration | Total | Cost @ scale | Migration |
|---|---|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass | **5 Pass** | **$0** | none |
| Netlify | Partial | Pass | Partial | Pass | Pass | 3 Pass / 2 Partial | $0 (maybe $20) | adapter swap |
| Railway | Pass | Partial | Pass | Pass | Pass | 4 Pass / 1 Partial | ~$5/mo | adapter swap |
| Vercel | Pass | Pass | Pass | Pass | Pass | 5 Pass | ~$20/mo forced | adapter swap |
| Render | Partial | Pass | Pass | Pass | Pass | 4 Pass / 1 Partial | ~$8/mo | adapter swap |
| Fly.io | Pass | Partial | Partial | Pass | Partial | 3 Pass / 2 Partial | ~$4/mo | adapter swap + Dockerfile |

Per-platform notes (all checked 2026-06-06 against official docs):

- **Cloudflare Workers** — `wrangler deploy` / `wrangler rollback` / `wrangler tail` (all GA). Docs published as `llms.txt` + `llms-full.txt`. Free tier: 100k req/day, 10 ms CPU/req, **5 Cron Triggers free**. Bundle limit 3 MB gzip (free) / 10 MB (paid $5/mo). MCP servers on Workers exist but the ecosystem is evolving (no hard GA stamp). **Astro 6 deploys to Workers, not Pages** (Pages support removed) — `astro dev` now runs on `workerd`, so local mirrors prod.
- **Netlify** — clean `@astrojs/netlify` adapter swap; **Scheduled Functions are free on all plans** (1-min granularity, 30 s execution cap). No dedicated `netlify rollback` CLI command (rollback via UI or `netlify api restoreSiteDeploy`) → CLI-first Partial. `llms.txt` partial (`llms-full.txt` 404). Official `@netlify/mcp` (recent, treat as preview-grade). Credit-based pricing makes cost forecasting fuzzy; heavy months → Pro $20/mo. Strongest off-Cloudflare option.
- **Railway** — `@astrojs/node` long-lived service (Nixpacks build). Best agent story: Railway MCP + remote MCP + CLI agent skills (2026-04). Native cron (5-min min). **No free tier — $5/mo minimum, always-on billing** (no scale-to-zero), so idle low-traffic time still burns the included credit.
- **Vercel** — five clean passes on the criteria, but **Hobby is non-commercial only** (a health app = commercial → Pro **$20/mo**) and Hobby cron is **once-per-day max** — FR-009 needs sub-daily precision, so you can't even prototype notifications for free. The cost weight drops it below the cheaper options.
- **Render** — `@astrojs/node` web service. Free tier **spins down after 15 min** (cold starts, "not for production"). **Cron is paid-only** ($1/mo/job, 10-min min interval). Realistic floor ~$8/mo (Starter $7 + cron). Hosted MCP can't trigger deploys.
- **Fly.io** — `@astrojs/node` in a container (**Dockerfile mandatory**). No free tier; ~$2–4/mo with auto-stop machines. **No native cron** — needs a separate always-on Supercronic machine (+~$2/mo). Highest ops literacy required; worst fit for a tight solo timeline.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Wins on the two heaviest-weighted criteria (CLI-first, managed/serverless) plus a stable deploy API and agent-readable docs, while being the only option with **zero migration** and **$0 cost**. Free Cron Triggers cover FR-009 natively. The whole repo (adapter, `astro:env`, `wrangler.jsonc`, README, CI) already targets it.

#### 2. Netlify

The best alternative if Cloudflare's free-tier bundle/CPU ceilings ever bite. Free scheduled cron, a clean one-config adapter swap, and an official MCP server. The gaps vs. the recommendation: weaker CLI rollback, a 30 s function cap that constrains notification work, and credit-based pricing that's harder to forecast.

#### 3. Railway

Strongest agent/MCP tooling of the pool and a real native cron, but it's a paid, always-on PaaS ($5/mo floor with no scale-to-zero) and needs a Node-adapter migration. Worth it only if you later want a long-lived process model that Workers' request/response edge runtime doesn't fit.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **3 MB gzipped Worker size limit on the free tier.** Astro SSR output + React 19 islands + the Supabase client + date libraries can creep toward it as the UI grows; exceeding it breaks deploys and forces the $5 paid tier or aggressive code-splitting — and it's discovered only at deploy time.
2. **10 ms CPU per request on the free tier.** The forecasting math is cheap, but server-rendering a growing medication list (plus JSON work from Supabase responses) is CPU that must fit the budget; a heavy page can force the upgrade.
3. **Cron Triggers are best-effort, not precise.** Schedule changes propagate up to ~15 min and execution timing isn't guaranteed-exact. FR-009's guardrail is that the reminder must *not* arrive late — a delayed or skipped cron silently violates the app's core promise.
4. **The notification channel is unsolved (PRD Open Question 4).** Workers cannot open SMTP sockets; sending email/push requires an external HTTP provider. The platform gives you the *scheduler* but not the *delivery* — an unscoped dependency.
5. **`nodejs_compat` is not full Node.** A Supabase auth/crypto dependency on an unpolyfilled Node API fails at runtime, not at build — a class of bug that hides until production traffic hits the path.

### Pre-Mortem — How This Could Fail

The team shipped PillStocker on Cloudflare Workers. Six months later it's a quiet disaster. First, the dashboard's React-island bundle plus the Supabase client crept past the 3 MB free-tier gzip limit during a feature push; deploys started failing and the solo dev scrambled onto the paid tier mid-sprint. Worse, FR-009 was wired to a Cron Trigger, but the email channel was never built — it was an open question that never got closed — so for weeks the cron dutifully computed run-out dates that reached no one. When email finally landed via a third-party API, the best-effort cron timing meant a handful of "you're running low" warnings arrived a day late, violating the never-late guardrail that is the entire reason the app exists. A patient missed a refill. Trust evaporated, and users drifted back to counting pills by hand on Sunday nights — exactly the behavior PillStocker was built to replace.

### Unknown Unknowns

- **Astro 6 dropped Cloudflare *Pages* support — it's Workers now.** `tech-stack.md` still records `deployment_target: cloudflare-pages`, which is stale. Production deploy is `wrangler deploy` (Workers), **not** `wrangler pages deploy`; older Pages tutorials (`output: 'hybrid'`, `wrangler pages deploy`) will actively mislead.
- **`astro dev` already runs on `workerd` in Astro 6** — you do *not* need a separate `wrangler dev` for runtime fidelity. The README's `npm run dev` mirrors production; guides telling you otherwise are outdated.
- **Cron Triggers don't fire in local dev and have no built-in delivery feedback.** To trust FR-009 you must build your own execution logging and a dead-man's-switch — the platform won't tell you a run was missed.
- **Free-tier ceilings are per-account, not per-project, and surface at deploy/runtime.** Measure a production build's gzipped size early and watch CPU; don't assume the free tier holds as the app grows.

## Operational Story

- **Preview deploys**: `npx wrangler versions upload` publishes a non-production *version* with its own preview URL (`<version>-<worker>.<subdomain>.workers.dev`) without shifting production traffic; promote with `wrangler deploy`. Per-PR previews are wired by calling `versions upload` from GitHub Actions. Preview URLs are public — gate them with Cloudflare Access if they expose real health data.
- **Secrets**: production secrets live as **Workers secrets** — `npx wrangler secret put SUPABASE_URL` / `SUPABASE_KEY` (encrypted, write-only, never re-readable) or via the Cloudflare dashboard. Local dev reads `.dev.vars`. CI passes `CLOUDFLARE_API_TOKEN` from GitHub repo secrets. Rotate by re-running `wrangler secret put` (overwrites in place).
- **Rollback**: `npx wrangler rollback [version-id]` reverts production to a prior version near-instantly (history via `wrangler versions list`; limited to the last 100 versions, and blocked if bindings changed). **Caveat**: this rolls back *code only* — Supabase schema migrations are separate and do not roll back with it.
- **Approval**: a human approves the production publish (the Plan-Mode deploy gate). An agent may run read-only ops unattended (`wrangler tail`, `wrangler versions list`, `wrangler deployments list`) and upload preview versions; **production `wrangler deploy`, secret rotation, and any destructive Supabase migration require a human.**
- **Logs**: `npx wrangler tail` streams live runtime logs read-only; `wrangler deployments list` / `wrangler versions list` show deploy history; the Cloudflare dashboard's Workers Logs/observability holds retained logs. CI step logs live in GitHub Actions.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 3 MB gzip Worker limit exceeded as the UI grows | Devil's advocate | M | M | Add a gzipped-size check on `dist` in CI; code-split React islands; the $5 paid tier lifts the cap to 10 MB |
| 10 ms CPU/request ceiling (free tier) | Devil's advocate | L | M | Keep SSR light, precompute/forecast on the client where possible; upgrade to paid (higher CPU) if measured to hit it |
| (v2 — FR-009 deferred) Cron Trigger fires late or is skipped → late run-out warning | Pre-mortem | M | H | Log every `scheduled()` run + add a dead-man's-switch alert; send the reminder margin *earlier* than the contractual minimum; monitor delivery |
| (v2 — FR-009 deferred) Notification channel (email/push) never built (PRD Open Q4) | Unknown unknowns / Pre-mortem | H | H | Decide the channel now (Resend/Postmark/web-push over HTTP — no SMTP on Workers); scope it as an explicit task gating FR-009 |
| `nodejs_compat` gap breaks a Supabase/crypto dependency at runtime | Devil's advocate | L | M | Keep `nodejs_compat` on; exercise the full auth flow on `astro dev` (workerd) before each deploy; pin dependency versions |
| Stale `cloudflare-pages` target misleads the deploy step | Unknown unknowns / Research finding | M | L | Deploy with `wrangler deploy` (Workers); update `tech-stack.md` `deployment_target` to `cloudflare-workers` |
| Supabase direct-Postgres connection cliff if ever needed | Research finding | L | M | Stay on the Supabase REST/PostgREST HTTP client (current); add Hyperdrive/a pooler only if a direct PG connection becomes necessary |

## Getting Started

Version-accurate for Astro 6 + `@astrojs/cloudflare` v13 + Wrangler v4 (do **not** copy older Pages-era commands):

1. **Adapter is already wired** — `@astrojs/cloudflare` is installed and set in `astro.config.mjs` (`output: 'server'`). No `astro add` step needed.
2. **Local dev already mirrors prod** — `npm run dev` runs on `workerd`. You do *not* need `wrangler dev` for runtime fidelity.
3. **Set production secrets** — `npx wrangler secret put SUPABASE_URL` then `npx wrangler secret put SUPABASE_KEY` (or set them in the Cloudflare dashboard). Local values stay in `.dev.vars`.
4. **Build & deploy to Workers** — `npm run build` then `npx wrangler deploy`. (Not `wrangler pages deploy` — Astro 6 targets Workers.)
5. **(v2) Wire FR-009 cron** — *deferred to v2; not part of the MVP.* When notifications return: add a `triggers.crontab` entry to `wrangler.jsonc` plus a `scheduled()` handler (free tier allows 5 triggers), and choose an HTTP notification provider (no SMTP on Workers).
6. **CI auto-deploy** — the GitHub Actions workflow already runs lint + build; add a deploy step using `cloudflare/wrangler-action` with `CLOUDFLARE_API_TOKEN` and the account ID as repo secrets to get auto-deploy-on-merge.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (beyond noting the existing GitHub Actions flow)
- Production-scale architecture (multi-region, HA, DR)
