import { test, expect } from "@playwright/test";

test("debug: check console errors on production home page", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const cspViolations: string[] = [];

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

  const response = await page.goto("/", { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);

  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(10000); // Wait 10 seconds

  const bodyText = await page.locator("body").textContent();
  console.log("Body text length:", bodyText?.length);
  console.log("Body text:", bodyText?.substring(0, 200));

  console.log("Console errors:", consoleErrors);
  console.log("CSP violations:", cspViolations);

  // Check what elements exist
  const rootContent = await page.locator("#root").textContent();
  console.log("Root content:", rootContent?.substring(0, 200));
});
