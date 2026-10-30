import { chromium } from "playwright";

const PREVIEW_URL =
  "https://hackathonos-dg8cnw9k2-pesmobileefootball1234-8316s-projects.vercel.app/";
const PROD_URL = "https://hackathonos-mu.vercel.app/";

async function audit(url, label) {
  console.log(`\n========== ${label}: ${url} ==========`);
  const browser = await chromium.launch({
    headless: true,
    ignoreHTTPSErrors: true,
  });
  const page = await browser.newPage();

  const consoleMessages = [];
  const failedRequests = [];
  const allRequests = [];

  page.on("console", (msg) => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
    });
  });

  page.on("pageerror", (err) => {
    consoleMessages.push({
      type: "pageerror",
      text: err.message,
      stack: err.stack,
    });
  });

  page.on("requestfinished", (req) => {
    const resp = req.response();
    if (resp) {
      const status =
        typeof resp.status === "function" ? resp.status() : resp.status;
      const headers =
        typeof resp.headers === "function" ? resp.headers() : resp.headers;
      allRequests.push({
        url: req.url(),
        method: req.method(),
        status,
        contentType: headers?.["content-type"],
        resourceType: req.resourceType(),
      });
      if (status >= 400) {
        failedRequests.push({
          url: req.url(),
          status,
          resourceType: req.resourceType(),
        });
      }
    }
  });

  page.on("requestfailed", (req) => {
    failedRequests.push({
      url: req.url(),
      error: req.failure()?.errorText,
      resourceType: req.resourceType(),
    });
  });

  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    console.log(`HTTP status for /: ${response?.status()}`);

    // Wait 10 seconds for Clerk to load and React to render
    await page.waitForTimeout(10000);

    // Check #root children - use evaluate instead
    const rootData = await page.evaluate(() => {
      const root = document.getElementById("root");
      return {
        hasChildren: root?.innerHTML?.trim().length > 0,
        innerHTMLLength: root?.innerHTML?.length || 0,
        textContent: root?.textContent?.substring(0, 500) || "",
      };
    });
    console.log(`#root has children: ${rootData.hasChildren}`);
    console.log(`#root innerHTML length: ${rootData.innerHTMLLength}`);
    console.log(`#root textContent (first 500): ${rootData.textContent}`);

    // Check for Clerk-specific elements
    const clerkElements = await page.evaluate(
      () =>
        document.querySelectorAll(
          '[data-clerk-element], [data-testid*="clerk"], iframe[src*="clerk"]',
        ).length,
    );
    console.log(`Clerk elements found: ${clerkElements}`);

    // Console messages
    console.log(`\n--- Console messages (${consoleMessages.length}) ---`);
    consoleMessages.forEach((m) =>
      console.log(`  [${m.type}] ${m.text.substring(0, 200)}`),
    );

    // Failed requests
    console.log(`\n--- Failed/Non-200 requests (${failedRequests.length}) ---`);
    failedRequests.forEach((r) =>
      console.log(
        `  ${r.status || "FAILED"} ${r.method || ""} ${r.url} ${r.error ? `(${r.error})` : ""}`,
      ),
    );

    // All /api/ and clerk requests
    const apiRequests = allRequests.filter(
      (r) =>
        r.url.includes("/api/") ||
        r.url.includes("clerk.accounts.dev") ||
        r.url.includes("clerk.com") ||
        r.url.includes("/api/__clerk"),
    );
    console.log(`\n--- API/Clerk requests (${apiRequests.length}) ---`);
    apiRequests.forEach((r) =>
      console.log(`  ${r.status} ${r.method} ${r.url} (${r.contentType})`),
    );

    return { consoleMessages, failedRequests, allRequests, rootData };
  } catch (e) {
    console.error(`Error auditing ${label}:`, e.message);
    return null;
  } finally {
    await browser.close();
  }
}

async function main() {
  const preview = await audit(PREVIEW_URL, "PREVIEW");
  const prod = await audit(PROD_URL, "PRODUCTION");

  console.log("\n========== DIFF ==========");
  if (preview && prod) {
    console.log(`Preview root has content: ${preview.rootData.hasChildren}`);
    console.log(`Production root has content: ${prod.rootData.hasChildren}`);
    console.log(`Preview failed requests: ${preview.failedRequests.length}`);
    console.log(`Production failed requests: ${prod.failedRequests.length}`);
  }
}

main().catch(console.error);
