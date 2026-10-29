import { test, expect } from '@playwright/test';

test.describe('Clerk loading fallback', () => {
  test('shows timeout fallback when Clerk takes too long to load', async ({ page }) => {
    // We test against a build WITH the key, but use a very short timeout
    // to verify the timeout fallback mechanism works
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Add a script to override the timeout before the app loads
    await page.addInitScript(() => {
      // @ts-ignore
      window.__CLERK_TEST_TIMEOUT_MS__ = 2000;
    });

    await page.goto('/', { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for fallback to appear (should appear within ~3 seconds: 2s timeout + buffer)
    await page.waitForSelector('[data-testid="clerk-fallback"]', { timeout: 5000 });

    // Verify fallback content
    const fallback = page.locator('[data-testid="clerk-fallback"]');
    await expect(fallback).toBeVisible();

    const title = await fallback.locator('h1').textContent();
    expect(title).toContain('Authentication Service Unavailable');

    const message = await fallback.locator('p').textContent();
    expect(message).toContain('took too long to load');

    const errorDetails = await fallback.locator('pre').textContent();
    expect(errorDetails).toContain('Authentication service did not load');

    const retryButton = await fallback.locator('button');
    await expect(retryButton).toBeVisible();
    await expect(retryButton).toContainText('Retry');

    console.log('Console errors:', consoleErrors);
  });
});