# Deploy Plan — PillStocker → Cloudflare Workers

**Status:** **Live** at https://pillstocker.z-dna.dev — first deploy 2026-06-07, version `90986545-9dcd-493f-9f65-bb63528bcde5`, HTTP 200 + valid TLS. Runtime secrets (`SUPABASE_URL`/`SUPABASE_KEY`) and Supabase Auth URLs still pending — **auth is inactive until those are set**.
**Recorded:** 2026-06-06
**Inputs:** `@context/foundation/infrastructure.md` (platform decision) · `@context/foundation/tech-stack.md`

## Decision summary

- **Platform:** Cloudflare Workers (per `infrastructure.md`; $0 free tier, zero migration, best agent docs).
- **Public host:** `https://pillstocker.z-dna.dev` — custom domain on the existing Cloudflare zone `z-dna.dev` (subdomain; apex left free for a future landing page). `*.workers.dev` remains a free fallback.
- **Worker name:** `pillstocker`.
- **Data layer:** Supabase (external cloud project — Auth-only, no custom tables/migrations).
- **Background jobs:** none — FR-009 out-of-app notifications + Cron Triggers are **deferred to v2**.

## Done in-repo (committed config)

- `wrangler.jsonc` — `name: "pillstocker"`, `account_id: "1e20d55e91d475b729501ee844e56654"`, `routes: [{ pattern: "pillstocker.z-dna.dev", custom_domain: true }]`, and a pinned `kv_namespaces` SESSION binding (`id: dbe97344a302415680aacce2464e9689`, auto-provisioned on the first deploy) so CI/local deploys reuse the same namespace. Existing: `compatibility_flags: ["nodejs_compat"]`, `assets` → `./dist`, observability on.
- `package.json` — added `"deploy": "astro build && wrangler deploy"`.
- `.github/workflows/ci.yml` — added a `deploy` job (`needs: ci`, gated on push to `master`) using `cloudflare/wrangler-action@v3` with the **`CLOUDFLARE_API_TOKEN`** repo secret only — account id is pinned in `wrangler.jsonc`, and `SUPABASE_*` are runtime Worker secrets (dropped from CI; the `astro:env` `secret` vars aren't build-inlined). PRs still run lint+build only.
- Unchanged/reused: `astro.config.mjs` (`@astrojs/cloudflare`, `output: "server"`, `astro:env` schema), `src/lib/supabase.ts` (null-safe `createClient`), `src/middleware.ts` (`PROTECTED_ROUTES = ["/dashboard"]`).

## Build verification (2026-06-06)

- `npx astro sync && npm run build` → success.
- `npx wrangler deploy --dry-run` → **Total Upload 1910.79 KiB / gzip 390.31 KiB** (well under the 3 MB free-tier limit).
- Runtime bindings the Worker expects (adapter-injected): `env.SESSION` (KV namespace, Astro sessions), `env.IMAGES` (Cloudflare Images), `env.ASSETS` (static assets). **The `SESSION` KV namespace is provisioned on the first interactive `wrangler deploy`** — CI deploys then reuse it.

## Manual gates (human)

- [x] **G1 — Cloudflare auth.** _(done 2026-06-07)_ `! npx wrangler login` (use the account holding the `z-dna.dev` zone). Accept the `*.workers.dev` subdomain prompt if shown.
- [x] **G2 — Supabase cloud project.** _(done 2026-06-07)_ supabase.com → **Settings → API Keys** → **Project URL** (`SUPABASE_URL`) + **Publishable key** (`SUPABASE_KEY` — `sb_publishable_…`, RLS-respecting; never the Secret key `sb_secret_…`).
- [ ] **G3 — CI credential.** Cloudflare → **My Profile → API Tokens** → create an **"Edit Cloudflare Workers"** token (scope it to your account + the `z-dna.dev` zone). Add **one** GitHub repo secret: `CLOUDFLARE_API_TOKEN`. (Account id is pinned in `wrangler.jsonc`; `SUPABASE_*` live on the Worker, not needed in CI.)
- [ ] **G4 — Supabase Auth URLs.** Supabase → **Authentication → URL Configuration** → Site URL + Redirect URL = `https://pillstocker.z-dna.dev`. Set **Email → Confirm email** on/off for MVP.

## Deploy procedure

1. ✅ First deploy done (2026-06-07) via `! npx wrangler deploy` — provisioned the `SESSION` KV namespace (`dbe97344…`, now pinned), registered the custom domain, and issued TLS.
2. Runtime secrets (Worker exists now): `! npx wrangler secret put SUPABASE_URL` and `! npx wrangler secret put SUPABASE_KEY` (paste G2 values). Read at runtime via `astro:env/server` — never client-exposed.
3. Complete G4 (Auth URLs) once the domain resolves.
4. Thereafter, merges to `master` auto-deploy via the CI `deploy` job.

## Verification

1. `wrangler deploy` succeeds, reports `pillstocker.z-dna.dev` (+ workers.dev fallback), gzip size under 3 MB.
2. `https://pillstocker.z-dna.dev` loads over HTTPS (`.dev` is HSTS-preloaded; allow minutes for cert issuance).
3. `/auth/signup` → user appears in Supabase → Authentication → Users; `/auth/signin` logs in.
4. `/dashboard` redirects to `/auth/signin` when logged out; renders when authed.
5. `! npx wrangler tail` shows requests with no unhandled errors (a null Supabase client = missing/incorrect secret).
6. Push a trivial change to `master` → CI `deploy` job redeploys; confirm live.

## Out of scope

- Apex / marketing page on `z-dna.dev` (only the `pillstocker.` subdomain is wired).
- FR-009 notifications + Cron Triggers (deferred to v2 — no `[triggers]` here).
- DB migrations (Auth-only; none).
- Production-scale concerns (multi-region, HA, alerting beyond `wrangler tail`).
