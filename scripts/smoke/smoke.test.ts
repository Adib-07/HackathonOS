import { test, expect } from '@playwright/test';

// Collect console errors and CSP violations
function collectConsoleErrors(page: any) {
  const consoleErrors: string[] = [];
  const cspViolations: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (error) => {
    consoleErrors.push(error.message);
  });

  // Listen for CSP violations (they appear as console errors)
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('Content Security Policy') || text.includes('CSP')) {
      cspViolations.push(text);
    }
  });

  return { consoleErrors, cspViolations };
}

test.describe('Smoke tests against live site', () => {
  let consoleErrors: string[] = [];
  let cspViolations: string[] = [];

  test.beforeEach(async ({ page }) => {
    const collectors = collectConsoleErrors(page);
    consoleErrors = collectors.consoleErrors;
    cspViolations = collectors.cspViolations;
  });

  test('home page renders real UI with zero console errors and zero CSP violations', async ({ page }) => {
    const response = await page.goto('/', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);

    // Wait for the page to fully load and React to hydrate
    await page.waitForLoadState('domcontentloaded');
    
    // Wait for Clerk to determine auth state and React to render content
    // The landing page should show "PRIVATE HACKATHON WORKSPACE" or sign-in button
    await page.waitForSelector('text=PRIVATE HACKATHON WORKSPACE, text=Welcome back, text=Sign in', { timeout: 15000 });
    
    // Check that the page has actual content (not blank)
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText?.length).toBeGreaterThan(50);

    // Check for Clerk sign-in button or landing page content
    const hasSignIn = await page.locator('text=Sign in, text=Welcome back, text=PRIVATE HACKATHON WORKSPACE').count();
    expect(hasSignIn).toBeGreaterThan(0);

    // Report console errors
    if (consoleErrors.length > 0) {
      console.log('Console errors found:', consoleErrors);
    }
    expect(consoleErrors).toHaveLength(0);

    // Report CSP violations
    if (cspViolations.length > 0) {
      console.log('CSP violations found:', cspViolations);
    }
    expect(cspViolations).toHaveLength(0);
  });

  test('/api/healthz returns 200', async ({ request }) => {
    const response = await request.get('/api/healthz');
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ status: 'ok' });
  });

  test('/api/readyz returns JSON', async ({ request }) => {
    const response = await request.get('/api/readyz');
    // readyz can return 200 or 503 depending on DB connectivity
    expect([200, 503]).toContain(response.status());
    const json = await response.json();
    expect(json).toHaveProperty('status');
  });

  test('/sign-in page renders', async ({ page }) => {
    const response = await page.goto('/sign-in', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);

    await page.waitForLoadState('domcontentloaded');
    
    // Wait for Clerk sign-in form to render
    await page.waitForSelector('text=Welcome back, text=Sign in, text=Email address', { timeout: 15000 });

    // Check for Clerk sign-in form
    const hasSignInForm = await page.locator('text=Welcome back, text=Sign in, text=Email address').count();
    expect(hasSignInForm).toBeGreaterThan(0);

    // Check console errors
    if (consoleErrors.length > 0) {
      console.log('Console errors on /sign-in:', consoleErrors);
    }
    expect(consoleErrors).toHaveLength(0);
  });

  test('unauthenticated protected route returns 401 (not 500)', async ({ request }) => {
    // Test a protected API route that requires authentication
    const response = await request.get('/api/competitions');
    // Should return 401, not 500
    expect(response.status()).toBe(401);

    const json = await response.json();
    expect(json).toHaveProperty('error');
  });
});