/**
 * ==============================================================================
 * MANGLAM MATRIMONY — AUTHENTICATED NAVIGATION & HYDRATION VERIFICATION
 *
 * Strictly verifies that authenticated sessions survive client-side navigation,
 * browser back/forward, hard page refresh (F5), dropdown link clicks, multi-tab
 * synchronization, and responsive viewports across /membership and /help.
 * ==============================================================================
 */

import puppeteer, { Browser, Page } from "puppeteer-core";
import { PrismaClient, ProfileStatus, UserStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import path from "path";
import { config } from "../src/config/env";

const prisma = new PrismaClient();

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\aryas\\.gemini\\antigravity-ide\\brain\\ef0935e4-7843-4a16-afea-2dae4828f62e";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`, detail !== undefined ? detail : "");
    failed++;
  }
}

async function runVerification() {
  console.log("==================================================================");
  console.log("MANGLAM MATRIMONY — AUTHENTICATED NAVIGATION VERIFICATION SUITE");
  console.log("==================================================================");

  let browser: Browser | null = null;

  try {
    // 1. Prepare Active User and Token from Database
    const seedActiveUser = await prisma.user.findFirst({
      where: { email: "arya.sharma@example.com" },
      include: { profile: true },
    });

    if (!seedActiveUser) {
      throw new Error("Seed active user arya.sharma@example.com not found in database.");
    }

    const activeToken = jwt.sign(
      { userId: seedActiveUser.id, email: seedActiveUser.email, status: seedActiveUser.status },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    const activeUserData = {
      id: seedActiveUser.id,
      email: seedActiveUser.email,
      phone: seedActiveUser.phone || "",
      status: seedActiveUser.status,
    };

    // 2. Prepare or Create IN_REVIEW User
    let inReviewUser = await prisma.user.findFirst({
      where: { profile: { profileStatus: ProfileStatus.IN_REVIEW } },
      include: { profile: true },
    });

    if (!inReviewUser) {
      // Create temporary IN_REVIEW user
      inReviewUser = await prisma.user.create({
        data: {
          email: `inreview.verify.${Date.now()}@example.com`,
          status: UserStatus.ACTIVE,
          profile: {
            create: {
              profileStatus: ProfileStatus.IN_REVIEW,
              profileCreatedFor: "MYSELF",
              submittedAt: new Date(),
            },
          },
        },
        include: { profile: true },
      });
    }

    const inReviewToken = jwt.sign(
      { userId: inReviewUser.id, email: inReviewUser.email, status: inReviewUser.status },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    const inReviewUserData = {
      id: inReviewUser.id,
      email: inReviewUser.email,
      phone: inReviewUser.phone || "",
      status: inReviewUser.status,
    };

    // Launch Chrome
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    // Helper: establish auth session on page
    const setAuthSession = async (p: Page, token: string, user: any) => {
      await p.evaluate(
        (t, u) => {
          localStorage.setItem("manglam_auth_token", t);
          localStorage.setItem("manglam_auth_user", JSON.stringify(u));
          window.dispatchEvent(new Event("manglam_auth_state_change"));
        },
        token,
        user
      );
    };

    // --------------------------------------------------------------------------
    // PART 1: LOGIN & INITIAL AUTHENTICATED APP SESSION
    // --------------------------------------------------------------------------
    console.log("\n--- [PART 1: ACTIVE USER LOGIN & MATCHES NAVIGATION] ---");

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Open landing page to initialize origin
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
    await setAuthSession(page, activeToken, activeUserData);

    // Navigate to /matches
    await page.goto("http://localhost:3000/matches", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 600));

    // Verify token exists in localStorage
    const storedTokenMatches = await page.evaluate(() => localStorage.getItem("manglam_auth_token"));
    assert(storedTokenMatches === activeToken, "1. Active user token preserved in localStorage on /matches");

    // Verify authenticated AppHeader rendered
    const hasAppHeaderMatches = await page.evaluate(() => {
      const header = document.querySelector('header');
      return header !== null && header.innerText.includes("Matches") && header.innerText.includes("My Profile");
    });
    assert(hasAppHeaderMatches, "2. Authenticated AppHeader rendered on /matches with navigation links and profile menu");

    // --------------------------------------------------------------------------
    // PART 2: NAVIGATION TO MEMBERSHIP (PREMIUM)
    // --------------------------------------------------------------------------
    console.log("\n--- [PART 2: NAVIGATING /matches -> /membership VIA PREMIUM] ---");

    // Click "Premium" link inside AppHeader
    const premiumLink = await page.$('a[href="/membership"]');
    assert(premiumLink !== null, "3. AppHeader contains Premium link to /membership");
    await premiumLink?.click();
    await page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));

    const currentUrlMembership = page.url();
    assert(currentUrlMembership.includes("/membership"), `4. URL is /membership after clicking Premium (got: ${currentUrlMembership})`);

    // Verify authentication preserved
    const storedTokenMembership = await page.evaluate(() => localStorage.getItem("manglam_auth_token"));
    assert(storedTokenMembership === activeToken, "5. Token strictly preserved in localStorage after navigating to /membership");

    const hasAppHeaderMembership = await page.evaluate(() => {
      const header = document.querySelector('header');
      return header !== null && header.innerText.includes("Matches") && header.innerText.includes("My Profile");
    });
    assert(hasAppHeaderMembership, "6. Authenticated AppHeader remains visible on /membership (NOT public navbar)");

    const isPremiumActive = await page.evaluate(() => {
      const activeLink = document.querySelector('a[href="/membership"][aria-current="page"]');
      return activeLink !== null;
    });
    assert(isPremiumActive, "7. Premium nav link has active indicator on /membership");

    // Verify no redirect to login happened
    assert(!page.url().includes("/login"), "8. User is NOT redirected to /login");

    // --------------------------------------------------------------------------
    // PART 3: PROFILE DROPDOWN ON MEMBERSHIP
    // --------------------------------------------------------------------------
    console.log("\n--- [PART 3: PROFILE DROPDOWN ON /membership] ---");

    // Click My Profile button
    const profileBtn = await page.$('button[aria-label*="User profile"]');
    assert(profileBtn !== null, "9. My Profile button rendered on /membership");
    await profileBtn?.click();
    await new Promise((r) => setTimeout(r, 400));

    const dropdownText = await page.evaluate(() => {
      const menu = document.querySelector('[role="menu"]');
      return menu ? menu.textContent : "";
    });

    assert(dropdownText?.includes("Arya"), "10. Profile dropdown displays user name 'Arya'");
    assert(dropdownText?.includes("Profile Active"), "11. Profile dropdown displays 'Profile Active'");
    assert(dropdownText?.includes("Help Center"), "12. Profile dropdown includes 'Help Center'");
    assert(dropdownText?.includes("Logout"), "13. Profile dropdown includes 'Logout'");

    // --------------------------------------------------------------------------
    // PART 4: NAVIGATION TO HELP CENTER
    // --------------------------------------------------------------------------
    console.log("\n--- [PART 4: NAVIGATING TO /help FROM PROFILE DROPDOWN] ---");

    const helpLink = await page.$('a[role="menuitem"][href="/help"]');
    assert(helpLink !== null, "14. Help Center link rendered in dropdown");
    await helpLink?.click();
    await page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));

    const currentUrlHelp = page.url();
    assert(currentUrlHelp.includes("/help"), `15. URL is /help after clicking Help Center (got: ${currentUrlHelp})`);

    // Verify authentication preserved
    const storedTokenHelp = await page.evaluate(() => localStorage.getItem("manglam_auth_token"));
    assert(storedTokenHelp === activeToken, "16. Token strictly preserved in localStorage after navigating to /help");

    const hasAppHeaderHelp = await page.evaluate(() => {
      const header = document.querySelector('header');
      return header !== null && header.innerText.includes("Matches") && header.innerText.includes("My Profile");
    });
    assert(hasAppHeaderHelp, "17. Authenticated AppHeader remains visible on /help (NOT public navbar)");

    // --------------------------------------------------------------------------
    // PART 5: HARD REFRESH (F5) TESTS ON DUAL-ACCESS PAGES
    // --------------------------------------------------------------------------
    console.log("\n--- [PART 5: HARD REFRESH (F5) ON /membership AND /help] ---");

    // Hard reload on /help
    await page.reload({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 600));

    const tokenAfterReloadHelp = await page.evaluate(() => localStorage.getItem("manglam_auth_token"));
    assert(tokenAfterReloadHelp === activeToken, "18. Token remains intact after hard refresh (F5) on /help");

    const appHeaderAfterReloadHelp = await page.evaluate(() => {
      const header = document.querySelector('header');
      return header !== null && header.innerText.includes("Matches") && header.innerText.includes("My Profile");
    });
    assert(appHeaderAfterReloadHelp, "19. Authenticated AppHeader renders after hard refresh (F5) on /help");

    // Navigate to /membership and hard reload
    await page.goto("http://localhost:3000/membership", { waitUntil: "networkidle0" });
    await page.reload({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 600));

    const tokenAfterReloadMem = await page.evaluate(() => localStorage.getItem("manglam_auth_token"));
    assert(tokenAfterReloadMem === activeToken, "20. Token remains intact after hard refresh (F5) on /membership");

    const appHeaderAfterReloadMem = await page.evaluate(() => {
      const header = document.querySelector('header');
      return header !== null && header.innerText.includes("Matches") && header.innerText.includes("My Profile");
    });
    assert(appHeaderAfterReloadMem, "21. Authenticated AppHeader renders after hard refresh (F5) on /membership");

    // --------------------------------------------------------------------------
    // PART 6: BROWSER BACK / FORWARD NAVIGATION
    // --------------------------------------------------------------------------
    console.log("\n--- [PART 6: BROWSER BACK / FORWARD REGRESSION] ---");

    // 1. Go back to /help
    await page.goBack({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 400));
    assert(page.url().includes("/help"), "22. Browser Back navigates to /help");

    const appHeaderBackHelp = await page.evaluate(() => {
      const header = document.querySelector('header');
      return header !== null && header.innerText.includes("Matches") && header.innerText.includes("My Profile");
    });
    assert(appHeaderBackHelp, "23. Authenticated AppHeader preserved after Browser Back to /help");

    // 2. Go forward to /membership
    await page.goForward({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 400));
    assert(page.url().includes("/membership"), "24. Browser Forward navigates back to /membership");

    const appHeaderForwardMem = await page.evaluate(() => {
      const header = document.querySelector('header');
      return header !== null && header.innerText.includes("Matches") && header.innerText.includes("My Profile");
    });
    assert(appHeaderForwardMem, "25. Authenticated AppHeader preserved after Browser Forward to /membership");

    // --------------------------------------------------------------------------
    // PART 7: DROPDOWN LINKS NON-DESTRUCTION TEST
    // --------------------------------------------------------------------------
    console.log("\n--- [PART 7: DROPDOWN NAVIGATION NEVER CLEARS AUTH SESSION] ---");

    // Attach spy on localStorage.removeItem
    await page.evaluate(() => {
      (window as any).__removedKeys = [];
      const origRemove = localStorage.removeItem.bind(localStorage);
      localStorage.removeItem = function (k) {
        (window as any).__removedKeys.push(k);
        return origRemove(k);
      };
    });

    // Open menu
    const menuBtn = await page.$('button[aria-label*="User profile"]');
    await menuBtn?.click();
    await new Promise((r) => setTimeout(r, 300));

    // Click "Partner Preferences"
    const partnerPrefLink = await page.$('a[href*="partner-preferences"]');
    assert(partnerPrefLink !== null, "26. Partner Preferences link exists in menu");
    await partnerPrefLink?.click();
    await page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));

    // Verify localStorage.removeItem was NOT called for auth keys
    const removedKeys = await page.evaluate(() => (window as any).__removedKeys || []);
    assert(
      !removedKeys.includes("manglam_auth_token") && !removedKeys.includes("manglam_auth_user"),
      "27. Navigating to Partner Preferences NEVER called localStorage.removeItem for auth tokens"
    );

    const tokenAfterPartnerPref = await page.evaluate(() => localStorage.getItem("manglam_auth_token"));
    assert(tokenAfterPartnerPref === activeToken, "28. Session remains fully intact on Partner Preferences");

    // --------------------------------------------------------------------------
    // PART 8: MULTI-TAB SYNCHRONIZATION
    // --------------------------------------------------------------------------
    console.log("\n--- [PART 8: MULTI-TAB SYNCHRONIZATION (TAB A LOGOUT -> TAB B UNAUTHENTICATED)] ---");

    const pageA = await browser.newPage();
    const pageB = await browser.newPage();
    await pageA.setViewport({ width: 1280, height: 800 });
    await pageB.setViewport({ width: 1280, height: 800 });

    // Open Tab A and Tab B on /membership with active token
    await pageA.goto("http://localhost:3000/membership", { waitUntil: "networkidle0" });
    await setAuthSession(pageA, activeToken, activeUserData);
    await pageA.reload({ waitUntil: "networkidle0" });

    await pageB.goto("http://localhost:3000/membership", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 600));

    // Both tabs show AppHeader
    const tabBHeaderBefore = await pageB.evaluate(() => document.querySelector('header')?.innerText.includes("My Profile"));
    assert(tabBHeaderBefore === true, "29. Tab B renders authenticated AppHeader initially");

    // Tab A performs Logout
    await pageA.evaluate(() => {
      const menuBtn = document.querySelector('button[aria-label*="User profile"]') as HTMLButtonElement;
      if (menuBtn) menuBtn.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    await pageA.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const logoutBtn = buttons.find((b) => b.textContent && b.textContent.includes("Logout"));
      if (logoutBtn) logoutBtn.click();
    });

    await pageA.waitForFunction(() => window.location.pathname.includes("/login"), { timeout: 6000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));

    // Tab A is on /login
    assert(pageA.url().includes("/login"), "30. Tab A redirected to /login upon explicit logout");

    // Tab B detects cross-tab storage change and transitions to public Navbar
    await pageB.waitForFunction(() => {
      const header = document.querySelector('header');
      return header !== null && header.innerText.includes("Login") && header.innerText.includes("Register Free");
    }, { timeout: 6000 }).catch(() => {});

    const tabBToken = await pageB.evaluate(() => localStorage.getItem("manglam_auth_token"));
    assert(tabBToken === null, "31. Tab B reflects removed auth token");

    const tabBIsPublic = await pageB.evaluate(() => {
      const header = document.querySelector('header');
      return header !== null && header.innerText.includes("Login") && header.innerText.includes("Register Free");
    });
    assert(tabBIsPublic, "32. Tab B reactively transitioned to public Navbar without manual refresh");

    await pageA.close();
    await pageB.close();

    // --------------------------------------------------------------------------
    // PART 9: IN_REVIEW USER NAVIGATION & RESTRICTIONS
    // --------------------------------------------------------------------------
    console.log("\n--- [PART 9: IN_REVIEW USER DIRECT URLS & GATING] ---");

    const pageReview = await browser.newPage();
    await pageReview.setViewport({ width: 1440, height: 900 });

    await pageReview.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
    await setAuthSession(pageReview, inReviewToken, inReviewUserData);

    // 1. Direct URL to /membership
    await pageReview.goto("http://localhost:3000/membership", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 600));

    const inReviewMemPill = await pageReview.evaluate(() => {
      const pill = document.querySelector('header');
      return pill !== null && pill.innerText.toLowerCase().includes("under review");
    });
    assert(inReviewMemPill, "33. IN_REVIEW user on /membership sees restricted AppHeader with 'Under Review' pill");

    // 2. Direct URL to /help
    await pageReview.goto("http://localhost:3000/help", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 600));

    const inReviewHelpPill = await pageReview.evaluate(() => {
      const pill = document.querySelector('header');
      return pill !== null && pill.innerText.toLowerCase().includes("under review");
    });
    assert(inReviewHelpPill, "34. IN_REVIEW user on /help sees restricted AppHeader with 'Under Review' pill");

    // 3. Direct URL to /matches (Allowed under temporary review rule for all authenticated users)
    await pageReview.goto("http://localhost:3000/matches", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 800));
    assert(pageReview.url().includes("/matches"), `35. IN_REVIEW user navigating to /matches stays on /matches under temporary review rule (got: ${pageReview.url()})`);

    // 4. Direct URL to /interests (MUST BE GATED)
    await pageReview.goto("http://localhost:3000/interests", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 800));
    assert(pageReview.url().includes("/onboarding/review"), `36. IN_REVIEW user navigating to /interests is gated and redirected to /onboarding/review (got: ${pageReview.url()})`);

    // 5. Direct URL to /messages (MUST BE GATED)
    await pageReview.goto("http://localhost:3000/messages", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 800));
    assert(pageReview.url().includes("/onboarding/review"), `37. IN_REVIEW user navigating to /messages is gated and redirected to /onboarding/review (got: ${pageReview.url()})`);

    await pageReview.evaluate(() => localStorage.clear());
    await pageReview.close();

    // --------------------------------------------------------------------------
    // PART 10: PUBLIC (UNAUTHENTICATED) DUAL-ACCESS NAVIGATION
    // --------------------------------------------------------------------------
    console.log("\n--- [PART 10: PUBLIC UNAUTHENTICATED NAVIGATION] ---");

    const publicContext = await browser.createBrowserContext();
    const pagePublic = await publicContext.newPage();
    await pagePublic.setViewport({ width: 1440, height: 900 });

    // Open /membership with completely clean storage
    await pagePublic.goto("http://localhost:3000/membership", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 600));

    const isPublicMem = await pagePublic.evaluate(() => {
      const header = document.querySelector('header');
      return header !== null && header.innerText.includes("Login") && header.innerText.includes("Register Free");
    });
    assert(isPublicMem, "38. Unauthenticated visitor on /membership sees public Navbar with Login & Register Free");

    // Open /help with clean storage
    await pagePublic.goto("http://localhost:3000/help", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 600));

    const isPublicHelp = await pagePublic.evaluate(() => {
      const header = document.querySelector('header');
      return header !== null && header.innerText.includes("Login") && header.innerText.includes("Register Free");
    });
    assert(isPublicHelp, "39. Unauthenticated visitor on /help sees public Navbar with Login & Register Free");

    await pagePublic.close();
    await publicContext.close();

    // --------------------------------------------------------------------------
    // PART 11: RESPONSIVE BREAKPOINT & OVERFLOW AUDIT
    // --------------------------------------------------------------------------
    console.log("\n--- [PART 11: RESPONSIVE BREAKPOINTS (1440px to 375px)] ---");

    const pageResp = await browser.newPage();
    await pageResp.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
    await setAuthSession(pageResp, activeToken, activeUserData);

    const breakpoints = [1440, 1280, 1024, 768, 414, 390, 375];

    // Test /membership
    await pageResp.goto("http://localhost:3000/membership", { waitUntil: "networkidle0" });
    for (const width of breakpoints) {
      await pageResp.setViewport({ width, height: 850 });
      await new Promise((r) => setTimeout(r, 100));
      const overflow = await pageResp.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      assert(!overflow, `40. /membership zero horizontal overflow at ${width}px`);
    }

    // Test /help
    await pageResp.goto("http://localhost:3000/help", { waitUntil: "networkidle0" });
    for (const width of breakpoints) {
      await pageResp.setViewport({ width, height: 850 });
      await new Promise((r) => setTimeout(r, 100));
      const overflow = await pageResp.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      assert(!overflow, `41. /help zero horizontal overflow at ${width}px`);
    }

    await pageResp.close();
  } catch (err) {
    console.error("Test execution encountered an unhandled error:", err);
    failed++;
  } finally {
    if (browser) {
      await browser.close();
    }
    await prisma.$disconnect();
  }

  console.log("\n==================================================");
  console.log(`AUTHENTICATED NAVIGATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification();
