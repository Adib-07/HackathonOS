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

test.describe('Missing config tests', () => {
  let consoleErrors: string[] = [];
  let cspViolations: string[] = [];

  test.beforeEach(async ({ page }) => {
    const collectors = collectConsoleErrors(page);
    consoleErrors = collectors.consoleErrors;
    cspViolations = collectors.cspViolations;
  });

  test('home page shows readable error screen when VITE_CLERK_PUBLISHABLE_KEY is missing', async ({ page }) => {
    const response = await page.goto('/', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);

    // Wait for the page to fully load and React to hydrate
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000); // Give React time to hydrate

    // Check that the page shows an error screen (not blank)
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText?.length).toBeGreaterThan(50);

    // Check for error screen content
    const hasErrorTitle = await page.locator('text=Configuration Error').count();
    expect(hasErrorTitle).toBeGreaterThan(0);

    // Check that the error message names the missing VITE_* variable
    const hasMissingVarMessage = await page.locator('text=VITE_CLERK_PUBLISHABLE_KEY').count();
    expect(hasMissingVarMessage).toBeGreaterThan(0);

    // Check that it mentions "Missing client environment variables"
    const hasMissingEnvMessage = await page.locator('text=Missing client environment variables').count();
    expect(hasMissingEnvMessage).toBeGreaterThan(0);

    // Report console errors - we expect one from ErrorBoundary.componentDidCatch logging
    if (consoleErrors.length > 0) {
      console.log('Console errors found:', consoleErrors);
    }
    // The error boundary catches the error and renders the fallback, but componentDidCatch still logs to console
    // Allow the expected config error to be logged
    const unexpectedErrors = consoleErrors.filter(e => !e.includes('Missing client environment variables'));
    expect(unexpectedErrors).toHaveLength(0);

    // Report CSP violations
    if (cspViolations.length > 0) {
      console.log('CSP violations found:', cspViolations);
    }
    expect(cspViolations).toHaveLength(0);
  });

  test('/sign-in page shows readable error screen when config is missing', async ({ page }) => {
    const response = await page.goto('/sign-in', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Check for error screen content
    const hasErrorTitle = await page.locator('text=Configuration Error').count();
    expect(hasErrorTitle).toBeGreaterThan(0);

    const hasMissingVarMessage = await page.locator('text=VITE_CLERK_PUBLISHABLE_KEY').count();
    expect(hasMissingVarMessage).toBeGreaterThan(0);

    if (consoleErrors.length > 0) {
      console.log('Console errors on /sign-in:', consoleErrors);
    }
    const unexpectedErrors = consoleErrors.filter(e => !e.includes('Missing client environment variables'));
    expect(unexpectedErrors).toHaveLength(0);
    expect(cspViolations).toHaveLength(0);
  });
});