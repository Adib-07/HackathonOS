# Environment Variables

## Client-Side (Vite)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key (pk_test_* or pk_live_*) |
| `VITE_CLERK_PROXY_URL` | No | Explicit proxy URL. **Only use for production deployments with a custom domain.** |

### Clerk Proxy URL Logic

The proxy URL is determined automatically:

```typescript
const isDevClerkKey = VITE_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_");
const clerkProxyUrl =
  VITE_CLERK_PROXY_URL ??
  (import.meta.env.PROD && !isDevClerkKey
    ? new URL("/api/__clerk", window.location.origin).toString()
    : undefined);
```

**Rules:**
1. If `VITE_CLERK_PROXY_URL` is explicitly set → use it
2. If key is `pk_test_*` (development instance) → **never use proxy** (Clerk's proxy doesn't work for dev instances)
3. If key is `pk_live_*` AND in production build (`import.meta.env.PROD`) → use `/api/__clerk` proxy
4. In development (`import.meta.env.DEV`) → never use proxy

### ⚠️ Do NOT set VITE_CLERK_PROXY_URL for pk_test_ keys

Clerk's proxy middleware **does not work** for development instances (pk_test_*). The proxy requires a production Clerk instance with a custom domain. Setting the proxy for a pk_test_ key will cause Clerk to fail to load.

## Server-Side (API)

| Variable | Required | Description |
|----------|----------|-------------|
| `CLERK_SECRET_KEY` | Yes | Clerk secret key (sk_test_* or sk_live_*) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NODE_ENV` | No | Set to `production` in production |

## Production Deployment

For production with a custom domain:

1. Set `VITE_CLERK_PUBLISHABLE_KEY` to your `pk_live_*` key
2. Set `CLERK_SECRET_KEY` to your `sk_live_*` key
3. **Option A (Recommended)**: Don't set `VITE_CLERK_PROXY_URL` - let the auto-detection use `/api/__clerk`
4. **Option B**: Set `VITE_CLERK_PROXY_URL` to your custom proxy URL (e.g., `https://your-domain.com/api/__clerk`)

The `/api/__clerk` route is handled by the API server's Clerk proxy middleware (requires `CLERK_SECRET_KEY` and `NODE_ENV=production`).