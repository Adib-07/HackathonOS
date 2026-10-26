# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.test.ts >> Smoke tests against live site >> /sign-in page renders
- Location: scripts/smoke/smoke.test.ts:84:3

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
    - link "hackathonos" [ref=e5] [cursor=pointer]:
      - /url: /
    - generic [ref=e11]:
      - generic [ref=e12]: PRIVATE HACKATHON WORKSPACE
      - heading [level=1] [ref=e13]:
        - text: Back to the
        - emphasis [ref=e14]: build window.
      - paragraph [ref=e15]: Your deadlines, constraints, and verified work stay in one place.
    - generic [ref=e17]:
      - generic [ref=e18]:
        - generic [ref=e19]:
          - link [ref=e21] [cursor=pointer]:
            - /url: https://hackathonos-mu.vercel.app/
            - img "HackathonOS" [ref=e22]
          - generic [ref=e23]:
            - heading "Welcome back" [level=1] [ref=e24]
            - paragraph [ref=e25]: Sign in to return to your private workspace.
        - generic [ref=e26]:
          - button "Continue with Google" [ref=e29] [cursor=pointer]
          - paragraph [ref=e36]: or
          - generic [ref=e38]:
            - generic [ref=e39]:
              - generic [ref=e42]:
                - generic [ref=e43]: Email address
                - textbox "Email address" [ref=e45]:
                  - /placeholder: Enter your email address
              - generic:
                - generic: Password
                - generic:
                  - textbox:
                    - /placeholder: Enter your password
                  - button
            - button "Continue" [ref=e48] [cursor=pointer]
      - generic [ref=e52]:
        - generic [ref=e53]:
          - generic [ref=e54]: Don’t have an account?
          - link "Sign up" [ref=e55] [cursor=pointer]:
            - /url: https://hackathonos-mu.vercel.app/sign-up
        - paragraph [ref=e58]: Development mode
    - generic [ref=e59]:
      - generic [ref=e60]: HACKATHONOS / ACCESS CONTROL
      - generic [ref=e61]: PRIVATE BY DESIGN
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
  54  |     expect(hasSignIn).toBeGreaterThan(0);
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
> 93  |     expect(hasSignInForm).toBeGreaterThan(0);
      |                           ^ Error: expect(received).toBeGreaterThan(expected)
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