---
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
---

## Why this stack

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
