# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| `main` branch (latest) | ✅ |
| Older deployments | ❌ |

Only the latest deployment on `main` receives security updates.

---

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Use **GitHub Private Vulnerability Reporting** (recommended):

1. Go to the repository **Security** tab
2. Click **Report a vulnerability**
3. Fill in the form with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

Alternatively, email **security@adib.dev** (PGP key available on request).

### What to Include

- Affected component (frontend, API, database, auth, dependencies)
- Attack vector (XSS, SQLi, auth bypass, RCE, info disclosure, etc.)
- Proof of concept (minimal, safe)
- Environment where reproduced (local, Vercel preview, production)

---

## Response Expectations

| Severity | Acknowledgement | Fix Target |
|----------|-----------------|------------|
| Critical (RCE, auth bypass, data exfiltration) | ≤ 24 hours | ≤ 7 days |
| High (XSS, SQLi, privilege escalation) | ≤ 48 hours | ≤ 14 days |
| Medium (info disclosure, DoS) | ≤ 72 hours | ≤ 30 days |
| Low (minor CSP, header misconfig) | ≤ 7 days | Next release |

We will:
1. Acknowledge receipt within the SLA above
2. Validate the report
3. Develop and test a fix
4. Deploy to `main` (auto-deploys to Vercel)
5. Credit the reporter (unless anonymity requested)

---

## Scope

### In Scope

- `https://hackathonos-mu.vercel.app` (production)
- `https://*.vercel.app` (preview deployments)
- API endpoints under `/api/*`
- Clerk authentication flow
- Database queries via Drizzle ORM
- Evidence submission and secret scanning
- Rate limiting and CSP enforcement

### Out of Scope

- Clerk infrastructure (report to Clerk)
- Vercel infrastructure (report to Vercel)
- Neon/PostgreSQL infrastructure (report to provider)
- Third-party dependencies (report to maintainer via their process)
- Social engineering, phishing, physical attacks
- Issues requiring compromised user credentials

---

## Secret Handling

### Never Commit

- `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`
- `DATABASE_URL` (production)
- `OPENAI_API_KEY`
- Any `VITE_*` that contains a secret (they are public!)
- JWTs, session cookies, API tokens

### If You Accidentally Commit a Secret

1. **Rotate the secret immediately** (Clerk dashboard, Neon dashboard, OpenAI dashboard)
2. **Remove from git history**:
   ```bash
   # Using BFG Repo-Cleaner (recommended)
   java -jar bfg.jar --replace-text passwords.txt
   git push --force
   ```
3. **Notify maintainers** so we can verify no deployment used the old value.

### Evidence Secret Scanning

The API rejects evidence submissions containing patterns matching:
- Stripe keys (`sk_live_`, `sk_test_`, `pk_live_`, `pk_test_`)
- AWS keys (`AKIA...`)
- GitHub tokens (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`)
- Slack tokens (`xoxb-`, `xoxp-`, `xoxr-`, `xoxs-`)
- Private keys (`-----BEGIN ... PRIVATE KEY-----`)
- JWTs (`eyJ...`)

This is a **defense-in-depth** measure; secrets should never reach the API.

---

## Security Architecture Summary

| Layer | Controls |
|-------|----------|
| **Auth** | Clerk session cookies, `requireAuthenticatedUser` middleware |
| **Authorization** | Every query joins `competitions.owner_id = current_user_id` |
| **Transport** | HTTPS enforced by Vercel; HSTS via Vercel |
| **Headers** | Helmet: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` |
| **CSP** | `default-src 'self'`, allow Clerk, Cloudflare Challenges, Google Fonts, Clerk images/telemetry |
| **Input Validation** | Zod `safeParse` on all request bodies/params |
| **SQL Safety** | Drizzle ORM parameterized queries only |
| **Rate Limiting** | `express-rate-limit` per IP; in-process window limiters for research (8/min) and AI (12/min) |
| **Secret Scanning** | Evidence submission blocks credential-like strings |
| **Dependency Security** | `pnpm-workspace.yaml` `minimumReleaseAge: 1440` (1-day delay on new npm versions) |

---

## Security-Related Commands

```bash
# Audit dependencies (run in each package)
pnpm audit

# Check for outdated packages
pnpm outdated

# Run security-focused tests
pnpm --filter @workspace/api-server test  # includes security-headers.test.mjs
```

---

## Disclosure Timeline Example

```
Day 0    Reporter submits via Private Vulnerability Reporting
Day 1    Maintainer acknowledges, assigns CVE if applicable
Day 2-3  Validation & reproduction
Day 4-7  Fix developed, tested locally + preview deploy
Day 7    Fix merged to main → auto-deploy to production
Day 8    Reporter credited (if requested), advisory published
```

---

## Contact

- **Private reporting**: GitHub Security tab → Report a vulnerability
- **Questions**: Open a GitHub Issue with label `security` (non-sensitive only)