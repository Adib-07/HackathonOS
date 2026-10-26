# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.test.ts >> Smoke tests against live site >> home page renders real UI with zero console errors and zero CSP violations
- Location: scripts/smoke/smoke.test.ts:39:3

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - banner [ref=e4]:
      - link "hackathonos" [ref=e5] [cursor=pointer]:
        - /url: /
      - generic [ref=e11]:
        - generic [ref=e12]: PRIVATE BY DESIGN
        - link "Sign in" [ref=e14] [cursor=pointer]:
          - /url: /sign-in
    - main [ref=e17]:
      - generic [ref=e18]:
        - generic [ref=e20]:
          - generic [ref=e21]: PERSONAL HACKATHON CONTROL PLANE
          - heading [level=1] [ref=e23]:
            - text: From rulesto
            - emphasis [ref=e24]: ready.
          - paragraph [ref=e25]: One private workspace for the brief, the deadline, and the work that gets you across the finish line.
          - generic [ref=e26]:
            - link "Start a workspace" [ref=e27] [cursor=pointer]:
              - /url: /sign-up
            - generic [ref=e30]: Your competition data stays yours.
        - generic "HackathonOS workspace preview" [ref=e34]:
          - generic [ref=e35]:
            - generic [ref=e40]: hackathonos / plan
            - generic [ref=e41]: EXAMPLE DATA
          - generic [ref=e43]:
            - generic [ref=e44]:
              - generic [ref=e45]:
                - generic [ref=e46]: H
                - text: workspace
              - generic [ref=e47]: Overview
              - generic [ref=e49]: Competitions
              - generic [ref=e52]: PLAN STATUS
              - generic [ref=e53]: Plan available
            - generic [ref=e55]:
              - generic [ref=e56]:
                - generic [ref=e57]:
                  - generic [ref=e58]: ACTIVE COMPETITION
                  - strong [ref=e59]: Build for Tomorrow
                - generic [ref=e60]: IN PROGRESS
              - generic [ref=e61]:
                - generic [ref=e62]:
                  - generic [ref=e63]: TIME TO SUBMISSION
                  - strong [ref=e64]: 02d 14h
                - generic [ref=e65]: 4 of 11 tasks complete
              - generic [ref=e68]:
                - generic [ref=e69]: UP NEXT
                - generic [ref=e70]: EST.
              - generic [ref=e71]:
                - generic [ref=e73]:
                  - strong [ref=e74]: Validate problem framing
                  - generic [ref=e75]: Problem definition · Critical
                - generic [ref=e76]: 45m
              - generic [ref=e77]:
                - generic [ref=e79]:
                  - strong [ref=e80]: Lock the project scope
                  - generic [ref=e81]: Specification · High priority
                - generic [ref=e82]: 60m
              - generic [ref=e83]:
                - generic [ref=e85]:
                  - strong [ref=e86]: Confirm required deliverables
                  - generic [ref=e87]: Submission · Mandatory
                - generic [ref=e88]: 20m
          - generic [ref=e89]: ILLUSTRATIVE · Example layout only; no live competition data is connected
        - generic [ref=e90]: 01 / 03COMMAND CENTER
      - generic [ref=e91]:
        - generic [ref=e92]:
          - generic [ref=e93]: "01"
          - paragraph [ref=e94]: A clearer way towork under a deadline.
        - generic [ref=e95]:
          - strong [ref=e96]: DEADLINE-AWARE
          - generic [ref=e100]: Plans are scheduled againstthe time you actually have.
        - generic [ref=e101]:
          - strong [ref=e102]: RULES IN CONTEXT
          - generic [ref=e107]: Official links and deliverablesstay close to the plan.
        - generic [ref=e108]:
          - strong [ref=e109]: EVIDENCE FIRST
          - generic [ref=e113]: Quality signals stay unverifieduntil evidence exists.
      - generic [ref=e114]:
        - generic [ref=e115]:
          - generic [ref=e116]: A SMALLER SURFACE AREA
          - heading "Keep the work in view." [level=2] [ref=e117]: Keep the workin view.
          - paragraph [ref=e118]: HackathonOS is a focused command center, not a noisy AI cockpit. It helps you see what matters next and what is still unproven.
        - generic [ref=e119]:
          - generic [ref=e120]:
            - generic [ref=e121]: "01"
            - generic [ref=e122]:
              - heading "Capture the rules" [level=3] [ref=e123]
              - paragraph [ref=e124]: Keep the official brief, tracks, and required deliverables together.
          - generic [ref=e127]:
            - generic [ref=e128]: "02"
            - generic [ref=e129]:
              - heading "Build a deadline-aware plan" [level=3] [ref=e130]
              - paragraph [ref=e131]: Turn a real deadline and available hours into ordered work.
          - generic [ref=e134]:
            - generic [ref=e135]: "03"
            - generic [ref=e136]:
              - heading "Verify before you claim" [level=3] [ref=e137]
              - paragraph [ref=e138]: Track evidence separately. Unchecked is not the same as passed.
      - generic [ref=e141]:
        - generic [ref=e147]:
          - generic [ref=e148]: A NOTE ON EVIDENCE
          - heading [level=2] [ref=e149]:
            - text: Plans are useful.
            - emphasis [ref=e150]: Proof is better.
          - paragraph [ref=e151]:
            - text: Builds, tests, browser checks, security reviews, and submission readiness begin as
            - code [ref=e152]: not_run
            - text: . HackathonOS will not claim a check passed until real evidence is connected.
        - generic [ref=e153]:
          - generic [ref=e154]:
            - text: application build
            - generic [ref=e156]: not_run
          - generic [ref=e157]:
            - text: automated tests
            - generic [ref=e159]: not_run
          - generic [ref=e160]:
            - text: submission readiness
            - generic [ref=e162]: not_run
      - generic [ref=e163]:
        - generic [ref=e164]:
          - generic [ref=e165]: START WITH THE BRIEF
          - heading "Bring one competition into focus." [level=2] [ref=e166]: Bring one competitioninto focus.
        - link "Create your account" [ref=e167] [cursor=pointer]:
          - /url: /sign-up
        - generic [ref=e170]: HOS / 001PRIVATE WORKSPACE
    - contentinfo [ref=e171]:
      - link [ref=e172] [cursor=pointer]:
        - /url: /
      - generic [ref=e177]: HackathonOS / Personal competition planning
      - generic [ref=e178]: BUILT FOR THE BUILD WINDOW
  - region "Notifications (F8)":
    - list
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | // Collect console errors and CSP violations
  4   | function collectConsoleErrors(page: any) {
  5   |   const consoleErrors: string[] = [];
  6   |   const cspViolations: string[] = [];
  7   | 
  8   |   page.on('console', (msg) => {
  9   |     if (msg.type() === 'error') {
  10  |       consoleErrors.push(msg.text());
  11  |     }
  12  |   });
  13  | 
  14  |   page.on('pageerror', (error) => {
  15  |     consoleErrors.push(error.message);
  16  |   });
  17  | 
  18  |   // Listen for CSP violations (they appear as console errors)
  19  |   page.on('console', (msg) => {
  20  |     const text = msg.text();
  21  |     if (text.includes('Content Security Policy') || text.includes('CSP')) {
  22  |       cspViolations.push(text);
  23  |     }
  24  |   });
  25  | 
  26  |   return { consoleErrors, cspViolations };
  27  | }
  28  | 
  29  | test.describe('Smoke tests against live site', () => {
  30  |   let consoleErrors: string[] = [];
  31  |   let cspViolations: string[] = [];
  32  | 
  33  |   test.beforeEach(async ({ page }) => {
  34  |     const collectors = collectConsoleErrors(page);
  35  |     consoleErrors = collectors.consoleErrors;
  36  |     cspViolations = collectors.cspViolations;
  37  |   });
  38  | 
  39  |   test('home page renders real UI with zero console errors and zero CSP violations', async ({ page }) => {
  40  |     const response = await page.goto('/', { waitUntil: 'networkidle' });
  41  |     expect(response?.status()).toBe(200);
  42  | 
  43  |     // Wait for the page to fully load and React to hydrate
  44  |     await page.waitForLoadState('domcontentloaded');
  45  |     await page.waitForTimeout(2000); // Give React time to hydrate
  46  | 
  47  |     // Check that the page has actual content (not blank)
  48  |     const bodyText = await page.locator('body').textContent();
  49  |     expect(bodyText).toBeTruthy();
  50  |     expect(bodyText?.length).toBeGreaterThan(50);
  51  | 
  52  |     // Check for Clerk sign-in button or landing page content
  53  |     const hasSignIn = await page.locator('text=Sign in, text=Welcome back, text=PRIVATE HACKATHON WORKSPACE').count();
> 54  |     expect(hasSignIn).toBeGreaterThan(0);
      |                       ^ Error: expect(received).toBeGreaterThan(expected)
  55  | 
  56  |     // Report console errors
  57  |     if (consoleErrors.length > 0) {
  58  |       console.log('Console errors found:', consoleErrors);
  59  |     }
  60  |     expect(consoleErrors).toHaveLength(0);
  61  | 
  62  |     // Report CSP violations
  63  |     if (cspViolations.length > 0) {
  64  |       console.log('CSP violations found:', cspViolations);
  65  |     }
  66  |     expect(cspViolations).toHaveLength(0);
  67  |   });
  68  | 
  69  |   test('/api/healthz returns 200', async ({ request }) => {
  70  |     const response = await request.get('/api/healthz');
  71  |     expect(response.status()).toBe(200);
  72  |     const json = await response.json();
  73  |     expect(json).toEqual({ status: 'ok' });
  74  |   });
  75  | 
  76  |   test('/api/readyz returns JSON', async ({ request }) => {
  77  |     const response = await request.get('/api/readyz');
  78  |     // readyz can return 200 or 503 depending on DB connectivity
  79  |     expect([200, 503]).toContain(response.status());
  80  |     const json = await response.json();
  81  |     expect(json).toHaveProperty('status');
  82  |   });
  83  | 
  84  |   test('/sign-in page renders', async ({ page }) => {
  85  |     const response = await page.goto('/sign-in', { waitUntil: 'networkidle' });
  86  |     expect(response?.status()).toBe(200);
  87  | 
  88  |     await page.waitForLoadState('domcontentloaded');
  89  |     await page.waitForTimeout(1000);
  90  | 
  91  |     // Check for Clerk sign-in form
  92  |     const hasSignInForm = await page.locator('text=Welcome back, text=Sign in, text=Email address').count();
  93  |     expect(hasSignInForm).toBeGreaterThan(0);
  94  | 
  95  |     // Check console errors
  96  |     if (consoleErrors.length > 0) {
  97  |       console.log('Console errors on /sign-in:', consoleErrors);
  98  |     }
  99  |     expect(consoleErrors).toHaveLength(0);
  100 |   });
  101 | 
  102 |   test('unauthenticated protected route returns 401 (not 500)', async ({ request }) => {
  103 |     // Test a protected API route that requires authentication
  104 |     const response = await request.get('/api/competitions');
  105 |     // Should return 401, not 500
  106 |     expect(response.status()).toBe(401);
  107 | 
  108 |     const json = await response.json();
  109 |     expect(json).toHaveProperty('error');
  110 |   });
  111 | });
```