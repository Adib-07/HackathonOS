import { test, expect } from "@playwright/test";

// Only run these tests if credentials are provided
const hasCredentials =
  !!process.env.TEST_USER_EMAIL && !!process.env.TEST_USER_PASSWORD;

(hasCredentials ? test.describe : test.describe.skip)(
  "Authenticated smoke tests",
  () => {
    let consoleErrors: string[] = [];
    let cspViolations: string[] = [];
    let failedRequests: Array<{ url: string; status: number; error: string }> =
      [];

    test.beforeEach(async ({ page }) => {
      consoleErrors = [];
      cspViolations = [];
      failedRequests = [];

      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      page.on("pageerror", (error) => {
        consoleErrors.push(error.message);
      });

      page.on("console", (msg) => {
        const text = msg.text();
        if (text.includes("Content Security Policy") || text.includes("CSP")) {
          cspViolations.push(text);
        }
      });

      page.on("response", (response) => {
        if (response.status() >= 400 && response.url().includes("/api/")) {
          failedRequests.push({
            url: response.url(),
            status: response.status(),
            error: response.statusText(),
          });
        }
      });
    });

    async function signIn(page: any) {
      await page.goto("/sign-in", { waitUntil: "networkidle" });
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1000);

      // Fill in Clerk sign-in form
      const emailInput = page
        .locator(
          'input[type="email"], input[name="emailAddress"], input[id*="email"]',
        )
        .first();
      const passwordInput = page
        .locator(
          'input[type="password"], input[name="password"], input[id*="password"]',
        )
        .first();

      if ((await emailInput.count()) > 0 && (await passwordInput.count()) > 0) {
        await emailInput.fill(process.env.TEST_USER_EMAIL!);
        await passwordInput.fill(process.env.TEST_USER_PASSWORD!);
        await page
          .locator(
            'button[type="submit"], button:has-text("Sign in"), button:has-text("Continue")',
          )
          .first()
          .click();
        await page.waitForURL("/", {
          waitUntil: "networkidle",
          timeout: 30000,
        });
        await page.waitForTimeout(2000);
      }
    }

    test("overview page with empty database shows lock tooltip on Retrospective and Settings link in nav", async ({
      page,
    }) => {
      await signIn(page);

      // Navigate to overview (should be home after sign in)
      await page.goto("/", { waitUntil: "networkidle" });
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);

      // Check that Retrospective lifecycle stage is visible in sidebar
      const retrospectiveItem = page.locator(
        '[data-testid="lifecycle-retrospective"]',
      );
      await expect(retrospectiveItem).toBeVisible();

      // Settings is no longer a lifecycle stage - check it's in primary navigation
      const settingsLink = page.locator('[data-testid="link-settings"]');
      await expect(settingsLink).toBeVisible();

      // Check that lock icon is present for Retrospective (planned until unlocked)
      const retrospectiveLock = retrospectiveItem.locator(
        '[data-testid="lifecycle-lock-retrospective"]',
      );
      await expect(retrospectiveLock).toBeVisible();

      // Check that IN PLAN chips are present for non-planned stages
      const intakeItem = page.locator('[data-testid="lifecycle-intake"]');
      const intakeChip = intakeItem.locator("text=IN PLAN");
      await expect(intakeChip).toBeVisible();

      // Hover over lock to verify tooltip appears
      await retrospectiveLock.hover();
      await page.waitForTimeout(300);
      const tooltip = page.locator(".tooltip-text:visible").first();
      await expect(tooltip).toBeVisible();
      const tooltipText = await tooltip.textContent();
      expect(tooltipText).toContain(
        "Unlocks when Submission is complete or the deadline has passed",
      );

      // Check no console errors
      expect(consoleErrors).toHaveLength(0);
      expect(cspViolations).toHaveLength(0);
    });

    test("workflow page shows lock tooltip for Retrospective when locked", async ({
      page,
    }) => {
      await signIn(page);

      // First create a competition to have a valid workflow page
      await page.goto("/", { waitUntil: "networkidle" });
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);

      // Click "Add a competition" button
      await page
        .locator('[data-testid="button-dashboard-add-competition"]')
        .click();
      await page.waitForTimeout(500);

      // Fill in competition form
      await page
        .locator('[data-testid="input-competition-name"]')
        .fill("Test Competition");
      const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const deadlineStr = deadline.toISOString().slice(0, 16);
      await page
        .locator('[data-testid="input-competition-deadline"]')
        .fill(deadlineStr);
      await page.locator('[data-testid="button-submit-create"]').click();
      await page.waitForURL(/\/competitions\/.*/, {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      await page.waitForTimeout(2000);

      // Navigate to workflow page
      const competitionId = page.url().match(/\/competitions\/([^/]+)/)?.[1];
      if (competitionId) {
        await page.goto(`/competitions/${competitionId}/workflow`, {
          waitUntil: "networkidle",
        });
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(2000);

        // Check that Retrospective stage has lock icon with tooltip
        const retrospectiveStage = page.locator(
          '[data-testid="stage-retrospective"]',
        );
        await expect(retrospectiveStage).toBeVisible();

        // Settings is no longer a lifecycle stage
        const settingsStage = page.locator('[data-testid="stage-settings"]');
        await expect(settingsStage).not.toBeVisible();

        // Check lock icon for Retrospective
        const retrospectiveLock = retrospectiveStage.locator(
          ".stage-lock-tooltip",
        );
        await expect(retrospectiveLock).toBeVisible();

        // Hover to verify tooltip
        await retrospectiveLock.hover();
        await page.waitForTimeout(300);
        const tooltip = page.locator(".tooltip-text:visible").first();
        await expect(tooltip).toBeVisible();
        const tooltipText = await tooltip.textContent();
        expect(tooltipText).toContain(
          "Unlocks when Submission is complete or the deadline has passed",
        );
      }

      expect(consoleErrors).toHaveLength(0);
      expect(cspViolations).toHaveLength(0);
    });

    test("Personal workspace switcher has no chevron", async ({ page }) => {
      await signIn(page);
      await page.goto("/", { waitUntil: "networkidle" });
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);

      const workspaceSelector = page.locator(".workspace-selector");
      await expect(workspaceSelector).toBeVisible();

      // Verify no chevron down icon in workspace selector
      const chevron = workspaceSelector.locator("svg.lucide-chevron-down");
      await expect(chevron).toHaveCount(0);

      // Verify text content
      await expect(
        workspaceSelector.locator("text=Personal workspace"),
      ).toBeVisible();
      await expect(
        workspaceSelector.locator("text=PRIVATE · SINGLE USER"),
      ).toBeVisible();
    });

    test("New workspace button opens modal and creates competition", async ({
      page,
    }) => {
      await signIn(page);
      await page.goto("/", { waitUntil: "networkidle" });
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);

      // Click "New workspace" button in header
      await page
        .locator('[data-testid="button-dashboard-add-competition"]')
        .click();
      await page.waitForTimeout(500);

      // Check modal opens
      await expect(
        page.locator('[data-testid="dialog-create-competition"]'),
      ).toBeVisible();

      // Fill form
      await page
        .locator('[data-testid="input-competition-name"]')
        .fill("Playwright Test Competition");
      const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const deadlineStr = deadline.toISOString().slice(0, 16);
      await page
        .locator('[data-testid="input-competition-deadline"]')
        .fill(deadlineStr);

      // Submit
      await page.locator('[data-testid="button-submit-create"]').click();
      await page.waitForURL(/\/competitions\/.*/, {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      await page.waitForTimeout(2000);

      // Verify competition was created
      await expect(
        page.locator("text=Playwright Test Competition"),
      ).toBeVisible();

      expect(consoleErrors).toHaveLength(0);
      expect(cspViolations).toHaveLength(0);
    });

    test("Add a competition button in empty state works", async ({ page }) => {
      await signIn(page);
      await page.goto("/", { waitUntil: "networkidle" });
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);

      // If no competition, check empty state button
      const emptyStateButton = page.locator(
        '[data-testid="link-add-first-competition"]',
      );
      if ((await emptyStateButton.count()) > 0) {
        await emptyStateButton.click();
        await page.waitForTimeout(500);
        await expect(
          page.locator('[data-testid="dialog-create-competition"]'),
        ).toBeVisible();
        await page.locator('[data-testid="button-cancel-create"]').click();
      }
    });

    test("Workflow page empty state has working Generate a plan button", async ({
      page,
    }) => {
      await signIn(page);

      // Create a competition first
      await page.goto("/", { waitUntil: "networkidle" });
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);

      await page
        .locator('[data-testid="button-dashboard-add-competition"]')
        .click();
      await page.waitForTimeout(500);
      await page
        .locator('[data-testid="input-competition-name"]')
        .fill("Workflow Test Competition");
      const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const deadlineStr = deadline.toISOString().slice(0, 16);
      await page
        .locator('[data-testid="input-competition-deadline"]')
        .fill(deadlineStr);
      await page.locator('[data-testid="button-submit-create"]').click();
      await page.waitForURL(/\/competitions\/.*/, {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      await page.waitForTimeout(2000);

      const competitionId = page.url().match(/\/competitions\/([^/]+)/)?.[1];
      if (competitionId) {
        await page.goto(`/competitions/${competitionId}/workflow`, {
          waitUntil: "networkidle",
        });
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(2000);

        // Check for empty state with Generate a plan button
        const generatePlanButton = page.locator(
          '[data-testid="link-generate-plan-from-workflow"]',
        );
        await expect(generatePlanButton).toBeVisible();

        // Click it and verify it navigates to planner
        await generatePlanButton.click();
        await page.waitForURL(/\/planner/, {
          waitUntil: "networkidle",
          timeout: 10000,
        });
        await expect(page.locator("text=Planner, text=Generate")).toBeVisible();
      }
    });

    test("All sidebar navigation links work", async ({ page }) => {
      await signIn(page);
      await page.goto("/", { waitUntil: "networkidle" });
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);

      // Test Overview link
      await page.locator('[data-testid="link-overview"]').click();
      await page.waitForURL("/", { waitUntil: "networkidle" });
      await expect(page.locator("text=PERSONAL COMMAND CENTER")).toBeVisible();

      // Test Competitions link
      await page.locator('[data-testid="link-competitions"]').click();
      await page.waitForURL("/competitions", { waitUntil: "networkidle" });
      await expect(page.locator("text=Competitions")).toBeVisible();

      // Test Workflow link (should go to competitions list if no active competition)
      await page.locator('[data-testid="link-workflow"]').click();
      await page.waitForLoadState("networkidle");

      // Test Settings link
      await page.locator('[data-testid="link-settings"]').click();
      await page.waitForURL("/settings", { waitUntil: "networkidle" });
      await expect(page.locator("text=Settings & Integrations")).toBeVisible();
    });

    test("No failed API requests during navigation", async ({ page }) => {
      await signIn(page);

      const pages = ["/", "/competitions"];
      for (const p of pages) {
        await page.goto(p, { waitUntil: "networkidle" });
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(1000);
      }

      // Check no failed API requests
      const apiFailures = failedRequests.filter(
        (r) => r.url.includes("/api/") && r.status >= 500,
      );
      expect(apiFailures).toHaveLength(0);
    });
  },
);

test.describe("Unauthenticated API tests", () => {
  test("/api/healthz returns 200", async ({ request }) => {
    const response = await request.get("/api/healthz");
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ status: "ok" });
  });

  test("/api/readyz returns JSON", async ({ request }) => {
    const response = await request.get("/api/readyz");
    expect([200, 503]).toContain(response.status());
    const json = await response.json();
    expect(json).toHaveProperty("status");
  });

  test("unauthenticated protected route returns 401 (not 500)", async ({
    request,
  }) => {
    const response = await request.get("/api/competitions");
    expect(response.status()).toBe(401);
    const json = await response.json();
    expect(json).toHaveProperty("error");
  });
});
