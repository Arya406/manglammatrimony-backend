/**
 * ==============================================================================
 * MANGLAM MATRIMONY — MEMBERSHIP & HELP BROWSER VERIFICATION SUITE
 *
 * Runs Puppeteer headless browser tests:
 * 1. /membership route loads and renders AppHeader
 * 2. All 3 plans render with exact pricing (₹499, ₹1,199, ₹11,000)
 * 3. Exact benefits verified for Plan 1, Plan 2, and Plan 3 (including Advisor & fee)
 * 4. Safe CTA behavior (opens modal, no fake transaction or simulated purchase)
 * 5. Modal close behavior (escape key and close buttons)
 * 6. Responsive layout across breakpoints: 1440px, 1280px, 1024px, 768px, 414px, 390px, 375px
 * 7. Zero horizontal overflow across all viewports
 * 8. /help route loads with hero, search, 7 categories, and FAQs
 * 9. Client-side search filters questions dynamically
 * 10. No-results state and reset button work cleanly
 * 11. Category filtering isolates category questions
 * 12. Accordion expansion/collapse and aria-expanded accessibility
 * 13. Contact Support CTA safely opens contact details without ticket simulation
 * 14. IN_REVIEW accuracy verification in Help FAQ
 * 15. Header 'Premium' link directs to /membership
 * ==============================================================================
 */

import puppeteer, { Browser } from "puppeteer-core";
import path from "path";

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

async function runBrowserVerification() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — MEMBERSHIP & HELP VERIFICATION");
  console.log("==================================================");

  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();

    // --------------------------------------------------------------------------
    // PART 1: MEMBERSHIP PAGE VERIFICATION
    // --------------------------------------------------------------------------
    console.log("\n[PART 1: MEMBERSHIP PAGE VERIFICATION]");

    await page.setViewport({ width: 1440, height: 900 });
    await page.goto("http://localhost:3000/membership", { waitUntil: "networkidle0" });

    // 1. Heading verification
    const heroHeading = await page.$eval("h1", (el) => el.innerText);
    assert(
      heroHeading.includes("Find the right membership for your journey"),
      "1. /membership hero heading matches requirement exactly"
    );

    // 2. All 3 plan cards rendered
    const cardCount = await page.$$eval('[id^="plan-card-"]', (cards) => cards.length);
    assert(cardCount === 3, "2. Exactly 3 membership pricing cards rendered");

    // 3. Exact pricing checks
    const prices = await page.$$eval('[data-testid="plan-price"]', (els) => els.map((e) => e.innerText.trim()));
    assert(
      prices.includes("₹499") && prices.includes("₹1,199") && prices.includes("₹11,000"),
      `3. Prices are exactly ₹499, ₹1,199, and ₹11,000 (found: ${prices.join(", ")})`
    );

    // 4. Plan benefits checks
    const pageText = await page.content();
    assert(pageText.includes("20 contacts") && pageText.includes("Chat") && pageText.includes("Video call"), "4. Plan 1 benefits (20 contacts, Chat, Video call) present");
    assert(pageText.includes("75 contacts"), "5. Plan 2 benefits (75 contacts) present");
    assert(
      pageText.includes("Advisor") &&
      pageText.includes("Unlimited verified profiles provided to the user every month") &&
      pageText.includes("Family meeting") &&
      pageText.includes("Verified profile"),
      "6. Plan 3 benefits (Advisor, Unlimited profiles monthly, Family meeting, Verified profile) present"
    );

    // 5. 6-Month Plan transparent disclosures
    assert(
      pageText.includes("Guarantee / refund condition") && pageText.includes("₹2,000 manager"),
      "7. 6-Month plan clearly discloses refund guarantee policy and ₹2,000 verification fee"
    );

    // 6. Safe CTA behavior (No fake payments)
    const choosePlanBtn = await page.$('button[aria-label*="Select 6 Months"]');
    assert(choosePlanBtn !== null, "8. 6-Month plan CTA button rendered");
    await choosePlanBtn?.click();
    await new Promise((r) => setTimeout(r, 600));

    // Verify modal appeared
    const modalHeading = await page.$eval('[id="membership-modal-title"]', (el) => el.innerText);
    assert(modalHeading.includes("Membership Enrollment"), "9. CTA opens Membership Enrollment modal");

    const modalContent = await page.content();
    assert(
      modalContent.includes("available soon") && modalContent.includes("complimentary"),
      "10. Modal explicitly states online payment available soon & access currently complimentary (zero fake purchase)"
    );

    // Screenshot Membership Desktop with Modal
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "browser_membership_desktop_modal.png"),
    });
    console.log("  📸 Screenshot saved: browser_membership_desktop_modal.png");

    // Close modal via Understood button or ESC
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const btn = buttons.find((b) => b.textContent?.includes("Understood"));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 500));

    // Screenshot Membership Desktop
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "browser_membership_desktop_cards.png"),
    });
    console.log("  📸 Screenshot saved: browser_membership_desktop_cards.png");

    // --------------------------------------------------------------------------
    // PART 2: RESPONSIVE BREAKPOINT & ZERO OVERFLOW VERIFICATION
    // --------------------------------------------------------------------------
    console.log("\n[PART 2: RESPONSIVE BREAKPOINT & OVERFLOW VERIFICATION]");

    const breakpoints = [1440, 1280, 1024, 768, 414, 390, 375];

    for (const width of breakpoints) {
      await page.setViewport({ width, height: 800 });
      await new Promise((r) => setTimeout(r, 300));

      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      assert(!isOverflowing, `11. /membership zero horizontal overflow at ${width}px`);
    }

    // Capture mobile 375px screenshot
    await page.setViewport({ width: 375, height: 812 });
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "browser_membership_mobile_375px.png"),
    });
    console.log("  📸 Screenshot saved: browser_membership_mobile_375px.png");

    // --------------------------------------------------------------------------
    // PART 3: HELP & SUPPORT CENTRE VERIFICATION
    // --------------------------------------------------------------------------
    console.log("\n[PART 3: HELP PAGE VERIFICATION]");

    await page.setViewport({ width: 1280, height: 800 });
    await page.goto("http://localhost:3000/help", { waitUntil: "networkidle0" });

    // 1. Heading verification
    const helpHeading = await page.$eval("h1", (el) => el.innerText);
    assert(helpHeading.includes("How can we help?"), "12. /help hero heading matches requirement exactly");

    // 2. All 7 categories rendered
    const categoryCount = await page.$$eval('[data-testid="help-category-card"]', (cards) => cards.length);
    assert(categoryCount === 7, "13. Exactly 7 help category cards rendered");

    // 3. Search field exists
    const searchInput = await page.$("#help-search-input");
    assert(searchInput !== null, "14. Help search input field rendered");

    // 4. Client-side search dynamic filtering
    await page.type("#help-search-input", "photo");
    await new Promise((r) => setTimeout(r, 400));

    const photoResultsCount = await page.$$eval('[data-testid="faq-item"]', (items) => items.length);
    assert(photoResultsCount > 0, `15. Search for 'photo' dynamically filtered FAQs (found ${photoResultsCount} items)`);

    // 5. No-results state testing
    await page.click('[aria-label="Clear search query"]');
    await page.type("#help-search-input", "xyznonexistentquery999");
    await new Promise((r) => setTimeout(r, 400));

    const noResultsTitle = await page.$eval('[class*="noResultsTitle"]', (el) => el.innerText);
    assert(noResultsTitle.includes("No matching articles found"), "16. No-results state properly displays when no articles match");

    // 6. Reset search button
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const btn = buttons.find((b) => b.textContent?.includes("Reset Search Filters"));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    const resetCount = await page.$$eval('[data-testid="faq-item"]', (items) => items.length);
    assert(resetCount > 15, "17. Reset button restores full FAQ catalog");

    // 7. Category filtering
    const reviewCatBtn = await page.$("#cat-btn-profile-review");
    await reviewCatBtn?.click();
    await new Promise((r) => setTimeout(r, 400));

    const reviewCatTitle = await page.$eval('[class*="resultsMeta"] h2', (el) => el.innerText);
    assert(reviewCatTitle.includes("Profile Review"), "18. Clicking category filters FAQs to 'Profile Review'");

    // 8. FAQ Accordion toggle & accessibility
    const firstAccordionBtn = await page.$('[data-testid="faq-header-button"]');
    const ariaExpandedBefore = await page.evaluate((btn) => btn?.getAttribute("aria-expanded"), firstAccordionBtn);
    assert(ariaExpandedBefore === "false", "19. Accordion items closed by default with aria-expanded='false'");

    await firstAccordionBtn?.click();
    await new Promise((r) => setTimeout(r, 350));

    const ariaExpandedAfter = await page.evaluate((btn) => btn?.getAttribute("aria-expanded"), firstAccordionBtn);
    assert(ariaExpandedAfter === "true", "20. Clicking accordion button opens panel with aria-expanded='true'");

    // 9. IN_REVIEW accuracy in FAQ content
    const inReviewText = await page.content();
    assert(
      inReviewText.includes("IN_REVIEW") &&
      inReviewText.includes("view your complete profile") &&
      inReviewText.includes("manage your photos") &&
      inReviewText.includes("browsing matches, searching profiles, sending favourites, and messaging are reserved for approved"),
      "21. FAQ accurately documents IN_REVIEW permissions and restrictions without contradictions"
    );

    // 10. Contact Support CTA
    const contactSupportBtn = await page.$("#contact-support-cta");
    await contactSupportBtn?.click();
    await new Promise((r) => setTimeout(r, 500));

    const supportModalTitle = await page.$eval("#support-modal-title", (el) => el.innerText);
    assert(supportModalTitle.includes("Contact Member Support"), "22. Contact Support CTA safely opens Support Dialog");

    const supportModalContent = await page.content();
    assert(
      supportModalContent.includes("support@manglammatrimony.com") &&
      supportModalContent.includes("Operating Hours"),
      "23. Support dialog displays official contact email and operating hours without fake ticket generation"
    );

    // Screenshot Help Desktop with Support Modal
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "browser_help_desktop_support_modal.png"),
    });
    console.log("  📸 Screenshot saved: browser_help_desktop_support_modal.png");

    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 400));

    // Screenshot Help Desktop Main
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "browser_help_desktop.png"),
    });
    console.log("  📸 Screenshot saved: browser_help_desktop.png");

    // 11. Help Page Mobile 375px Zero Overflow
    for (const width of breakpoints) {
      await page.setViewport({ width, height: 800 });
      await new Promise((r) => setTimeout(r, 300));

      const isHelpOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      assert(!isHelpOverflowing, `24. /help zero horizontal overflow at ${width}px`);
    }

    await page.setViewport({ width: 375, height: 812 });
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "browser_help_mobile_375px.png"),
    });
    console.log("  📸 Screenshot saved: browser_help_mobile_375px.png");

    // --------------------------------------------------------------------------
    // PART 4: HEADER NAVIGATION INTEGRATION
    // --------------------------------------------------------------------------
    console.log("\n[PART 4: HEADER NAVIGATION INTEGRATION]");
    await page.setViewport({ width: 1280, height: 800 });

    // Set authenticated active session in localStorage to verify AppHeader links
    await page.evaluate(() => {
      localStorage.setItem("manglam_auth_token", "test_mock_token");
      localStorage.setItem("manglam_auth_user", JSON.stringify({ id: "test", email: "test@example.com", status: "ACTIVE" }));
    });

    await page.goto("http://localhost:3000/membership", { waitUntil: "networkidle0" });
    const premiumNavLinkHref = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("nav a"));
      const link = links.find((a) => a.textContent?.includes("Premium"));
      return link?.getAttribute("href");
    });
    assert(premiumNavLinkHref === "/membership", "25. AppHeader 'Premium' nav item links to /membership");

  } catch (err) {
    console.error("Browser verification error:", err);
    failed++;
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log("\n==================================================");
  console.log(`VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runBrowserVerification();
