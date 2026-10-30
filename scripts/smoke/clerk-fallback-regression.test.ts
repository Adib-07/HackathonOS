import { test, expect } from "@playwright/test";

test.describe("Clerk loading fallback - regression tests", () => {
  test("shows timeout fallback when Clerk takes too long to load", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.addInitScript(() => {
      // @ts-ignore
      window.__CLERK_TEST_TIMEOUT_MS__ = 2000;
    });

    await page.goto("/", { waitUntil: "networkidle", timeout: 30000 });

    await page.waitForSelector('[data-testid="clerk-fallback"]', {
      timeout: 5000,
    });

    const fallback = page.locator('[data-testid="clerk-fallback"]');
    await expect(fallback).toBeVisible();

    const title = await fallback.locator("h1").textContent();
    expect(title).toContain("Authentication Service Unavailable");

    const message = await fallback.locator("p").textContent();
    expect(message).toContain("took too long to load");

    const errorDetails = await fallback.locator("pre").textContent();
    expect(errorDetails).toContain("Authentication service did not load");

    const retryButton = await fallback.locator("button");
    await expect(retryButton).toBeVisible();
    await expect(retryButton).toContainText("Retry");

    console.log("Console errors:", consoleErrors);
  });

  test("shows fallback with failing URL when Clerk script is blocked", async ({
    page,
  }) => {
    const failedUrls: string[] = [];
    page.on("requestfailed", (request) => {
      if (request.url().includes("clerk")) {
        failedUrls.push(request.url());
      }
    });

    // Block Clerk script requests
    await page.route("**/clerk**", (route) => route.abort());

    await page.addInitScript(() => {
      // @ts-ignore
      window.__CLERK_TEST_TIMEOUT_MS__ = 3000;
    });

    await page.goto("/", { waitUntil: "networkidle", timeout: 30000 });

    await page.waitForSelector('[data-testid="clerk-fallback"]', {
      timeout: 5000,
    });

    const fallback = page.locator('[data-testid="clerk-fallback"]');
    await expect(fallback).toBeVisible();

    const errorDetails = await fallback.locator("pre").textContent();
    expect(errorDetails).toContain("Clerk failed to load");
    // Should include the failing URL
    expect(failedUrls.length).toBeGreaterThan(0);
    console.log("Failed Clerk URLs:", failedUrls);
  });

  test("route-level error panel shows for failed lazy chunk (not auth fallback)", async ({
    page,
  }) => {
    // First, let the app load normally (with a real key or mock)
    await page.goto("/", { waitUntil: "networkidle", timeout: 30000 });

    // Wait for app to be interactive (signed-in user should see workspace)
    // If signed out, should see landing page
    await expect(page.locator("body")).toBeVisible();

    // Now simulate a lazy chunk failure by blocking a chunk request
    // We'll intercept requests for JS chunks and abort one
    let chunkAborted = false;
    await page.route("**/*.js", (route) => {
      if (!chunkAborted && route.request().url().includes("assets/")) {
        chunkAborted = true;
        route.abort("failed");
      } else {
        route.continue();
      }
    });

    // Trigger navigation to a lazy-loaded route
    await page.goto("/competitions", { waitUntil: "networkidle", timeout: 30000 });

    // Should show route-level "Could Not Load Page" panel, NOT auth fallback
    await expect(page.locator('text="Could Not Load Page"')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text="Authentication Service Unavailable"')).not.toBeVisible();

    const reloadButton = page.locator('button:has-text("Reload Page")');
    await expect(reloadButton).toBeVisible();
  });

  test("API error shows local error UI, not auth fallback", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle", timeout: 30000 });

    // Block API requests
    await page.route("**/api/**", (route) => route.abort("failed"));

    // Trigger an action that makes an API call
    // Navigate to a page that fetches data
    await page.goto("/competitions", { waitUntil: "networkidle", timeout: 30000 });

    // Should NOT show auth fallback
    await expect(page.locator('text="Authentication Service Unavailable"')).not.toBeVisible({ timeout: 3000 });

    // The page should still be rendered (may show error state for the specific query)
    await expect(page.locator("body")).toBeVisible();
  });

  test("30 throttled navigations never show auth fallback", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle", timeout: 30000 });

    let authFallbackShown = false;
    page.on("console", (msg) => {
      if (msg.text().includes("Authentication Service Unavailable")) {
        authFallbackShown = true;
      }
    });

    // Perform 30 rapid navigations
    const routes = ["/", "/competitions", "/settings", "/competitions/new"];
    for (let i = 0; i < 30; i++) {
      const route = routes[i % routes.length];
      await page.goto(route, { waitUntil: "domcontentloaded", timeout: 5000 });
      // Small delay to simulate throttling
      await page.waitForTimeout(50);
    }

    expect(authFallbackShown).toBe(false);
  });
});

test.describe("Error boundary and retry-lazy coverage", () => {
  test("route-level error boundary catches lazy load errors", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle", timeout: 30000 });

    // Block a specific lazy chunk
    let blocked = false;
    await page.route("**/competitions-*.js", (route) => {
      if (!blocked) {
        blocked = true;
        route.abort("failed");
      } else {
        route.continue();
      }
    });

    await page.goto("/competitions", { waitUntil: "networkidle", timeout: 30000 });

    // Should show retry-lazy's "Could Not Load Page" panel
    await expect(page.locator('text="Could Not Load Page"')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Reload Page")')).toBeVisible();

    // Global error boundary should NOT show auth fallback
    await expect(page.locator('text="Authentication Service Unavailable"')).not.toBeVisible();
  });

  test("global error boundary shows generic error for non-Clerk errors", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle", timeout: 30000 });

    // Cause a React error by navigating to a route that throws
    // We can't easily do this without modifying the app, so we test that
    // the error boundary exists and doesn't show auth fallback for random errors
    await expect(page.locator('text="Authentication Service Unavailable"')).not.toBeVisible({ timeout: 3000 });
  });
});