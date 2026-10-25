# HackathonOS Deployment Guide

This document describes how to deploy HackathonOS to Vercel.

## Architecture Overview

HackathonOS is a pnpm monorepo with two deployable workspaces:

- **`artifacts/hackathon-os`** — React + Vite frontend (SPA)
- **`artifacts/api-server`** — Express API server (deployed as Vercel Serverless Functions)

The `artifacts/mockup-sandbox` workspace is a development/design tool and is **not deployed**.

## Prerequisites

1. **Vercel Account** — [Sign up](https://vercel.com/signup) if you don't have one
2. **GitHub Repository** — Connected to Vercel
3. **PostgreSQL Database** — Vercel Postgres, Neon, Supabase, or any managed PostgreSQL
4. **Clerk Application** — For authentication

## Required Environment Variables

Configure these in Vercel Project Settings → Environment Variables:

| Variable | Scope | Description |
|----------|-------|-------------|
| `DATABASE_URL` | Production, Preview | PostgreSQL connection string (required) |
| `CLERK_SECRET_KEY` | Production, Preview | Clerk backend secret key |
| `CLERK_PUBLISHABLE_KEY` | Production, Preview | Clerk backend publishable key |
| `VITE_CLERK_PUBLISHABLE_KEY` | Production, Preview | Frontend Clerk publishable key |
| `BASE_PATH` | Production, Preview | Base path for frontend (default: `/`) |
| `VITE_CLERK_PROXY_URL` | Production, Preview | Optional: Clerk proxy URL (e.g., `https://your-app.vercel.app/api/__clerk`) |
| `OPENAI_API_KEY` | Production, Preview | Optional: OpenAI API key for AI features |
| `OPENAI_BASE_URL` | Production, Preview | Optional: Custom OpenAI-compatible endpoint |
| `OPENAI_MODEL` | Production, Preview | Optional: Model to use (default: `gpt-4o-mini`) |
| `LOG_LEVEL` | Production, Preview | Optional: Log level (default: `info`) |

### Clerk Configuration

1. Create a Clerk application at [clerk.com](https://clerk.com)
2. In Clerk Dashboard → Settings → Domains:
   - Add your Vercel production domain (e.g., `your-app.vercel.app`)
   - Add preview deployment domains (Vercel auto-generates these)
3. Copy the **Secret Key** and **Publishable Key** to Vercel environment variables
4. For the frontend, use the same Publishable Key as `VITE_CLERK_PUBLISHABLE_KEY`

### Database Setup

1. Create a PostgreSQL database (Vercel Postgres recommended for Vercel deployments)
2. Run migrations:
   ```bash
   # Locally with DATABASE_URL set
   cd lib/db
   pnpm run migrate
   ```
3. The `drizzle` migration folder is committed to the repository

## Deployment Steps

### 1. Connect Repository to Vercel

1. In Vercel Dashboard, click **Add New...** → **Project**
2. Import your GitHub repository: `Adib-07/HackathonOS`
3. Vercel will auto-detect the configuration from `vercel.json`

### 2. Configure Project Settings

The `vercel.json` at the repository root configures:
- **Build Command**: `pnpm run build` (builds both frontend and API)
- **Install Command**: `pnpm install --frozen-lockfile`
- **Output Directory**: `artifacts/hackathon-os/dist/public`
- **Functions**: `artifacts/api-server/src/vercel.ts` (API serverless function)

### 3. Add Environment Variables

In Vercel Project Settings → Environment Variables, add all required variables from the table above.

### 4. Deploy

1. Push to `main` branch
2. Vercel will automatically build and deploy
3. Check the deployment logs for any errors

## Vercel Configuration Details

### `vercel.json`

```json
{
  "buildCommand": "pnpm run build",
  "installCommand": "pnpm install --frozen-lockfile",
  "framework": "vite",
  "functions": {
    "artifacts/api-server/src/vercel.ts": {
      "maxDuration": 30,
      "runtime": "nodejs20.x"
    }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/artifacts/api-server/src/vercel.ts" },
    { "source": "/(.*)", "destination": "/artifacts/hackathon-os/dist/public/$1" }
  ],
  "outputDirectory": "artifacts/hackathon-os/dist/public"
}
```

### API Serverless Function

The API is deployed as a single serverless function at `artifacts/api-server/src/vercel.ts`:

```typescript
import app from "./app";
export default app;
```

This exports the Express app directly, which Vercel handles as a serverless function.

### Routing

- `/api/*` → API serverless function (all backend routes)
- `/*` → Frontend SPA (with fallback to `index.html` for client-side routing)

## Local Development

### Frontend Only

```bash
cd artifacts/hackathon-os
PORT=19678 BASE_PATH=/ pnpm run dev
```

### Full Stack (Frontend + API)

```bash
# Terminal 1: API Server
cd artifacts/api-server
PORT=8080 DATABASE_URL=... CLERK_SECRET_KEY=... CLERK_PUBLISHABLE_KEY=... pnpm run dev

# Terminal 2: Frontend (proxies /api to API server)
cd artifacts/hackathon-os
PORT=19678 BASE_PATH=/ API_PROXY_ORIGIN=http://127.0.0.1:8080 pnpm run dev
```

## Database Migrations

### Local Development

```bash
cd lib/db
# Generate new migration from schema changes
pnpm run generate

# Apply migrations
pnpm run migrate
```

### Production

Migrations are applied manually or via CI/CD:
```bash
# On production database
DATABASE_URL=... pnpm --filter @workspace/db run migrate
```

**Never use `drizzle-kit push` in production.** Use `migrate` only.

## Troubleshooting

### Build Failures

1. **TypeScript errors**: Run `pnpm run typecheck` locally
2. **Missing environment variables**: Check Vercel project settings
3. **Database connection**: Ensure `DATABASE_URL` is correct and database allows Vercel IPs

### Runtime Errors

1. **Clerk authentication fails**: Verify Clerk keys and authorized domains
2. **API returns 500**: Check Vercel function logs
3. **Database connection timeout**: Consider using a connection pooler (PgBouncer)

### Large Bundle Warning

The frontend build may warn about chunks > 500 kB. This is acceptable for the current feature set. To optimize:
- Add `manualChunks` to `vite.config.ts` for better code splitting
- Lazy-load more routes

## Security Notes

- All API routes require authentication (401 if unauthenticated)
- Rate limiting applied per-user/IP
- Helmet security headers enabled
- CSP configured for API responses
- Secret scanning in evidence submission
- CORS restricted to same-origin

## Monitoring

- Health check: `GET /api/healthz` (returns `{ "status": "ok" }`)
- Vercel Analytics and Speed Insights can be enabled in project settings
- Pino structured logging in API functions

## Rollback

In Vercel Dashboard → Deployments, click the three-dot menu on a previous deployment → **Promote to Production**.