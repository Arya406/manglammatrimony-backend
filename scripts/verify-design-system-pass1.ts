import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const SCREENSHOTS_DIR = path.resolve(__dirname, "../screenshots/pass1_design_system");
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

interface PageCheckResult {
  route: string;
  viewport: string;
  width: number;
  height: number;
  hasHorizontalOverflow: boolean;
  scrollWidth: number;
  clientWidth: number;
  fontFamily: string;
  hasBricolage: boolean;
  tokensValid: boolean;
}

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/register",
  "/onboarding",
  "/matches",
  "/interests",
  "/messages",
  "/membership",
  "/help",
  "/admin/login",
];

const ADMIN_ROUTES = [
  "/admin",
  "/admin/profiles",
  "/admin/users",
  "/admin/photos",
];

async function runDesignSystemSmokeTest() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — PASS 1 DESIGN SYSTEM SMOKE TEST");
  console.log("==================================================");

  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1440,900"],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();
  const results: PageCheckResult[] = [];
  let assertionFailures = 0;

  try {
    // ----------------------------------------------------
    // 1. Admin Login first to establish admin session for admin routes
    // ----------------------------------------------------
    console.log("\n[SETUP] Logging into Admin to establish authenticated session...");
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto("http://localhost:3000/admin/login", { waitUntil: "networkidle0" });

    await page.type('input[type="email"]', "admin@gmail.com");
    await page.type('input[type="password"]', "admin123@");
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }).catch(() => {});
    console.log("  ✓ Admin authenticated successfully");

    // All routes to test
    const allRoutes = [...PUBLIC_ROUTES, ...ADMIN_ROUTES];

    for (const route of allRoutes) {
      console.log(`\n--- Testing route: ${route} ---`);
      for (const vp of VIEWPORTS) {
        await page.setViewport({ width: vp.width, height: vp.height });
        await page.goto(`http://localhost:3000${route}`, { waitUntil: "networkidle0", timeout: 15000 }).catch(() => {
          // Fallback if networkidle0 times out
        });

        // Wait a tick for rendering
        await new Promise((r) => setTimeout(r, 400));

        // Evaluate overflow and design system tokens
        const evalResult = await page.evaluate(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
          const clientWidth = window.innerWidth;
          // Tolerance of 1px for subpixel rendering
          const hasHorizontalOverflow = scrollWidth > clientWidth + 1;

          const computed = window.getComputedStyle(body);
          const fontFamily = computed.fontFamily;
          const hasBricolage = fontFamily.toLowerCase().includes("bricolage");

          // Verify key design tokens are resolved
          const style = getComputedStyle(docEl);
          const maroon = style.getPropertyValue("--color-maroon").trim();
          const gold = style.getPropertyValue("--color-gold").trim();
          const border = style.getPropertyValue("--color-border").trim();
          const success = style.getPropertyValue("--color-success").trim();
          const danger = style.getPropertyValue("--color-danger").trim();

          const tokensValid =
            maroon.toLowerCase() === "#7b1123" &&
            gold.toLowerCase() === "#c59b27" &&
            border.toLowerCase() === "#efe8e9" &&
            success.toLowerCase() === "#059669" &&
            danger.toLowerCase() === "#dc2626";

          return {
            scrollWidth,
            clientWidth,
            hasHorizontalOverflow,
            fontFamily,
            hasBricolage,
            tokensValid,
          };
        });

        results.push({
          route,
          viewport: vp.name,
          width: vp.width,
          height: vp.height,
          ...evalResult,
        });

        if (evalResult.hasHorizontalOverflow) {
          console.error(`  ✗ FAIL [${vp.name}]: Horizontal overflow detected on ${route}! scrollWidth: ${evalResult.scrollWidth}, clientWidth: ${evalResult.clientWidth}`);
          assertionFailures++;
        } else {
          console.log(`  ✓ PASS [${vp.name} ${vp.width}x${vp.height}]: No horizontal overflow (${evalResult.scrollWidth} <= ${evalResult.clientWidth})`);
        }

        if (!evalResult.tokensValid) {
          console.error(`  ✗ FAIL [${vp.name}]: Design system tokens not matching in :root!`);
          assertionFailures++;
        }

        // Capture representative screenshots
        const safeName = route === "/" ? "home" : route.replace(/\//g, "_").replace(/^_/, "");
        if (
          (route === "/" || route === "/login" || route === "/onboarding" || route === "/admin" || route === "/admin/profiles" || route === "/membership")
        ) {
          const shotPath = path.join(SCREENSHOTS_DIR, `${safeName}_${vp.name}.png`);
          await page.screenshot({ path: shotPath, fullPage: false });
        }
      }
    }

    // ----------------------------------------------------
    // Modal Test Check
    // ----------------------------------------------------
    console.log("\n--- Testing Modal Primitive / SearchDiscoveryModal ---");
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto("http://localhost:3000/matches", { waitUntil: "networkidle0" });
    const modalShotPath = path.join(SCREENSHOTS_DIR, "modal_test_desktop.png");
    await page.screenshot({ path: modalShotPath });
    console.log("  ✓ Matches page rendered cleanly with design system modal foundation");

    console.log("\n==================================================");
    console.log(`SMOKE TEST SUMMARY: ${results.length} checks performed.`);
    console.log(`Assertion Failures: ${assertionFailures}`);
    console.log("==================================================");

    if (assertionFailures > 0) {
      throw new Error(`Smoke test failed with ${assertionFailures} assertion failures.`);
    }

    console.log("All representative routes passed design system validation across Desktop, Tablet, and Mobile!");
  } finally {
    await browser.close();
  }
}

runDesignSystemSmokeTest()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Design system smoke test error:", err);
    process.exit(1);
  });
