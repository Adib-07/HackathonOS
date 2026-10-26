# Deployment Guide (Long Form)

> Step-by-step deployment to Vercel with Neon PostgreSQL and Clerk authentication. See [README.md](../README.md#deployment) for the quick reference.

---

## Prerequisites Checklist

- [ ] **GitHub account** with repo `Adib-07/HackathonOS`
- [ ] **Vercel account** ([sign up](https://vercel.com/signup))
- [ ] **Neon account** ([sign up](https://neon.tech)) or other managed PostgreSQL
- [ ] **Clerk account** ([sign up](https://clerk.com))
- [ ] **Node.js 24.x** locally (for `pnpm run build` verification)

---

## 1. Database Setup (Neon)

### Create Project

1. Go to [Neon Console](https://console.neon.tech)
2. Create project → choose region close to Vercel (e.g., `us-east-1`)
3. Copy **connection string** (pooled):
   ```
   postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/dbname?sslmode=require
   ```

### Run Migrations Locally

```bash
# In HackathonOS root
cd lib/db

# Create .env with DATABASE_URL
echo 'DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/dbname?sslmode=require"' > .env

# Apply migrations
pnpm run migrate

# Verify
pnpm run migrate:status
```

> **Never use `pnpm run push` in production.** Use `migrate` only to avoid accidental schema drops.

### Verify Schema

```bash
# Check tables exist
psql "$DATABASE_URL" -c "\dt"
```

Expected tables:
- `competitions`
- `workflow_plans`
- `workflow_tasks`
- `workflow_evidence`
- `competition_analyses`
- `analysis_requirements`
- `research_findings`
- `research_gaps`
- `idea_candidates`
- `idea_evaluations`
- `idea_rubrics`
- `build_briefs`

---

## 2. Clerk Authentication Setup

### Create Application

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. **Create Application** → name: "HackathonOS"
3. **Authentication**: Email + Password (enable others as desired)
4. **Session**: Single-session per user (recommended for single-user workspace)

### Configure Domains

1. **Settings → Domains**
2. Add production domain: `hackathonos-mu.vercel.app` (or your custom domain)
3. Add preview pattern: `*.vercel.app` (covers all Vercel preview deployments)
4. **Save**

### Copy Keys

| Key | Where to Use |
|-----|--------------|
| **Publishable Key** (`pk_test_...` / `pk_live_...`) | `CLERK_PUBLISHABLE_KEY` (API), `VITE_CLERK_PUBLISHABLE_KEY` (Frontend) |
| **Secret Key** (`sk_test_...` / `sk_live_...`) | `CLERK_SECRET_KEY` (API only) |

> **Critical**: `VITE_CLERK_PUBLISHABLE_KEY` is **baked into the frontend bundle at build time**. It must match the Clerk application used in production.

---

## 3. Vercel Project Configuration

### Import Repository

1. Vercel Dashboard → **Add New... → Project**
2. Import `Adib-07/HackathonOS`
3. **Root Directory**: `.` (repository root)
4. Vercel auto-detects `vercel.json` — **do not override** build settings manually

### Vercel Project Settings

| Setting | Value | Source |
|---------|-------|--------|
| **Framework Preset** | Other | `vercel.json` defines everything |
| **Build Command** | `pnpm run build` | `vercel.json` |
| **Install Command** | `pnpm install --frozen-lockfile` | `vercel.json` |
| **Output Directory** | `artifacts/hackathon-os/dist/public` | `vercel.json` |
| **Node.js Version** | 24.x | `package.json` `"engines"` |
| **Install Command** | `pnpm install --frozen-lockfile` | `vercel.json` |

### Environment Variables (Project Settings → Environment Variables)

| Variable | Target | Value |
|----------|--------|-------|
| `DATABASE_URL` | Production, Preview | Neon pooled connection string |
| `CLERK_SECRET_KEY` | Production, Preview | `sk_test_...` or `sk_live_...` |
| `CLERK_PUBLISHABLE_KEY` | Production, Preview | `pk_test_...` or `pk_live_...` |
| `VITE_CLERK_PUBLISHABLE_KEY` | Production, Preview | **Same as above** (public) |
| `BASE_PATH` | Production, Preview | `/` (or subpath like `/hackathonos`) |
| `VITE_CLERK_PROXY_URL` | Production, Preview | `https://hackathonos-mu.vercel.app/api/__clerk` |
| `OPENAI_API_KEY` | Production, Preview | Optional (enables AI features) |
| `OPENAI_BASE_URL` | Production, Preview | Optional |
| `OPENAI_MODEL` | Production, Preview | Optional (default `gpt-4o-mini`) |
| `LOG_LEVEL` | Production, Preview | `info` |

> **Scope**: Set all to **Production** and **Preview** so preview deployments work.

---

## 4. First Deployment

```bash
# Ensure clean main branch
git checkout main
git pull origin main

# Verify local build passes
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build

# Push to trigger deployment
git push origin main
```

### Monitor Deployment

1. Vercel Dashboard → Deployments → click latest
2. Watch **Build Logs** for:
   - `pnpm install --frozen-lockfile` succeeds
   - `pnpm run typecheck` passes
   - API build (`esbuild`) succeeds
   - Frontend build (`vite build`) succeeds
   - `cp artifacts/api-server/dist/app.mjs api/bundle.mjs` runs
3. Check **Function Logs** for `/api/healthz` and `/api/readyz`

### Verify Health Endpoints

```bash
# Production
curl https://hackathonos-mu.vercel.app/api/healthz
# → {"status":"ok"}

curl https://hackathonos-mu.vercel.app/api/readyz
# → {"status":"ready"} or 503 if DB unreachable
```

---

## 5. Post-Deployment Verification

### Smoke Test Checklist

- [ ] **Sign in** works (Clerk redirect → dashboard)
- [ ] **Overview** loads (shows "No competition yet" or current)
- [ ] **Create competition** → form submits → redirects to detail
- [ ] **Planner** → "Generate plan" → tasks appear
- [ ] **Workflow** → stages reflect planner tasks
- [ ] **Intel** → Analysis/Research/Gaps/Ideas tabs load
- [ ] **Settings** → Workspace name saves, danger zone visible
- [ ] **No console errors** (F12 → Console)
- [ ] **No failed network requests** (F12 → Network → filter 4xx/5xx)

### CSP Verification

Check browser console for CSP violations. The policy in `vercel.json` allows:
- Scripts: `self`, `*.clerk.accounts.dev`, `*.clerk.com`, `challenges.cloudflare.com`
- Styles: `self`, `unsafe-inline`, `fonts.googleapis.com`
- Fonts: `self`, `data:`, `fonts.gstatic.com`
- Images: `self`, `data:`, `blob:`, `img.clerk.com`, `*.clerk.com`
- Connect: `self`, `*.clerk.accounts.dev`, `*.clerk.com`, `clerk-telemetry.com`
- Frames: `self`, `challenges.cloudflare.com`, `*.clerk.accounts.dev`

If assets blocked → adjust `Content-Security-Policy` in `vercel.json` headers.

---

## 6. Custom Domain (Optional)

### Add Domain in Vercel

1. Project → **Settings → Domains**
2. Add `hackathonos.dev` (or your domain)
3. Configure DNS:
   - **Apex** (`hackathonos.dev`): A record → `76.76.21.21`
   - **WWW** (`www.hackathonos.dev`): CNAME → `cname.vercel-dns.com`
4. Wait for SSL provisioning

### Update Clerk

1. Clerk Dashboard → **Settings → Domains**
2. Add `hackathonos.dev` and `www.hackathonos.dev`
3. Update `VITE_CLERK_PROXY_URL` to `https://hackathonos.dev/api/__clerk`
4. Redeploy

---

## 7. Troubleshooting

### Build Failures

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid_function_runtime` | Node 20 deprecated | Ensure `engines.node: "24.x"` in root `package.json` |
| `Build output directory not found` | `outputDirectory` mismatch | Verify `vercel.json` `outputDirectory: "artifacts/hackathon-os/dist/public"` |
| TypeScript errors in build | `tsc` fails | Run `pnpm run typecheck` locally first |
| `esbuild` fails | API server syntax error | Check `artifacts/api-server/dist/` for clues |
| `vite build` fails | Frontend import error | Check `artifacts/hackathon-os/src/` imports |

### Runtime Errors

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Clerk auth fails (401) | Keys mismatch or domain not allowed | Verify `CLERK_PUBLISHABLE_KEY` = `VITE_CLERK_PUBLISHABLE_KEY`; Clerk domains include Vercel URL |
| API returns 500 | Unhandled exception | Check Vercel Function Logs → filter by request |
| `/readyz` returns 503 | DB unreachable | Verify `DATABASE_URL`; Neon allows Vercel IPs; check SSL mode |
| CSP blocks Clerk/Fonts | Policy too strict | Verify `vercel.json` headers match Clerk domains |
| `FUNCTION_INVOCATION_FAILED` | Function crashed on start | Check `PORT` env var (not needed on Vercel); check Clerk keys |
| Large bundle warning | Chunks > 500 kB | Add `manualChunks` to `vite.config.ts`; lazy-load more routes |

### Database Issues

| Issue | Fix |
|-------|-----|
| Migration fails | Check `lib/db/drizzle/` SQL; run `pnpm run migrate:status` |
| Connection timeout | Use Neon pooled connection string; add `?pgbouncer=true` |
| Schema drift | Never edit production DB directly; use migrations only |

---

## 8. Rollback Procedure

1. Vercel Dashboard → **Deployments**
2. Find last known good deployment (green checkmark)
3. Click **three-dot menu** → **Promote to Production**
4. Verify health endpoints
5. Investigate failed deployment in background

---

## 9. Monitoring & Alerts

### Vercel Built-in

- **Analytics**: Enable in Project Settings → Analytics
- **Speed Insights**: Enable in Project Settings → Speed Insights
- **Function Logs**: Real-time in Deployments tab
- **Runtime Logs**: `vercel logs` CLI

### Recommended External

- **Uptime**: UptimeRobot / Better Uptime on `/api/healthz`
- **Error Tracking**: Sentry (add `@sentry/node` to API, `@sentry/react` to frontend)
- **Database**: Neon monitoring dashboard

---

## 10. CI/CD Pipeline (GitHub Actions - When Added)

```yaml
# .github/workflows/ci.yml (future)
name: CI
on: [push, pull_request]
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: "11.17.0" }
      - uses: actions/setup-node@v4
        with: { node-version: "24", cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run typecheck
      - run: pnpm test
      - run: pnpm run build
      - uses: actions/upload-artifact@v4
        with: { name: build, path: artifacts/hackathon-os/dist/public }
```

---

## 11. Environment Variable Reference (Complete)

| Variable | Required | Scope | Where Used | Notes |
|----------|----------|-------|------------|-------|
| `DATABASE_URL` | ✅ | Runtime | API server | Neon pooled connection string |
| `CLERK_SECRET_KEY` | ✅ | Runtime | API server | `sk_test_` or `sk_live_` |
| `CLERK_PUBLISHABLE_KEY` | ✅ | Runtime | API server | `pk_test_` or `pk_live_` |
| `VITE_CLERK_PUBLISHABLE_KEY` | ✅ | **Build-time** | Frontend | **Public** — baked into bundle |
| `BASE_PATH` | ❌ | Build + Runtime | Both | Subpath deployment |
| `VITE_CLERK_PROXY_URL` | ❌ | Build-time | Frontend | Clerk proxy for cookieless |
| `OPENAI_API_KEY` | ❌ | Runtime | API (intel) | Enables AI features |
| `OPENAI_BASE_URL` | ❌ | Runtime | API (intel) | Custom endpoint |
| `OPENAI_MODEL` | ❌ | Runtime | API (intel) | Default `gpt-4o-mini` |
| `LOG_LEVEL` | ❌ | Runtime | API server | `debug`, `info`, `warn`, `error` |
| `PORT` | ❌ | Runtime | API server | Local only (Vercel ignores) |
| `NODE_ENV` | ❌ | Runtime | Both | `development`/`production` |

---

## 12. Security Checklist (Pre-Deploy)

- [ ] No secrets in repo (check `git log --all --full-history -- "**/.env*"`)
- [ ] `VITE_*` variables contain only public values
- [ ] Clerk domains include production + `*.vercel.app`
- [ ] CSP in `vercel.json` allows only necessary origins
- [ ] `minimumReleaseAge: 1440` in `pnpm-workspace.yaml` (supply chain defense)
- [ ] Dependencies audited: `pnpm audit`
- [ ] Rate limiting enabled on API routes
- [ ] Helmet headers present on all responses
- [ ] Secret scanning in evidence submission
- [ ] Row-level security via owner_id joins

---

## 13. Cost Estimation (Rough)

| Service | Tier | Monthly Cost |
|---------|------|--------------|
| Vercel | Pro | $20 (includes functions, bandwidth) |
| Neon | Free / Scale | $0 / $19+ |
| Clerk | Free / Pro | $0 / $25+ |
| OpenAI | Pay-per-use | ~$5-50 depending on usage |
| **Total (Free tiers)** | | **$0** |
| **Total (Pro)** | | **~$44-94/mo** |

---

## 14. Maintenance

### Weekly

- [ ] Check Vercel deployments for failures
- [ ] Review Neon query performance
- [ ] Check Clerk user count / auth errors

### Monthly

- [ ] `pnpm audit` → update dependencies
- [ ] `pnpm run typecheck` → fix new TS errors
- [ ] Review `pnpm outdated` → plan upgrades
- [ ] Verify backup strategy (Neon point-in-time recovery)

### Quarterly

- [ ] Rotate Clerk keys (if using live)
- [ ] Rotate `DATABASE_URL` (Neon branch + migrate)
- [ ] Review CSP for new dependencies
- [ ] Load test `/api/overview` with concurrent users