/**
 * ==============================================================================
 * MANGLAM MATRIMONY — BROWSER-LEVEL FAVOURITES & LIKES VERIFICATION SUITE
 * 
 * Uses Puppeteer Core connected to local Chrome to test:
 * 1. Initial server-backed heart state
 * 2. Toggle favourite persistence across reload
 * 3. Header incoming-like count dynamic updates (mock 6 eliminated)
 * 4. Account isolation (A -> B appears in B's received, not in C's)
 * 5. /interests page tabs (Received Likes vs Sent Favourites)
 * 6. Responsive 250px cards and zero mobile horizontal overflow
 * ==============================================================================
 */

import puppeteer, { Browser, Page } from "puppeteer-core";
import { PrismaClient, UserStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import { config } from "../src/config/env";
import * as path from "path";
import * as fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const FRONTEND_URL = "http://localhost:3000";
const SCREENSHOT_DIR = path.resolve(__dirname, "../screenshots_fav");

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const prisma = new PrismaClient();
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

async function setBrowserAuth(page: Page, token: string, user: { id: string; phone: string }) {
  await page.goto(FRONTEND_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate((t, u) => {
    localStorage.setItem("manglam_auth_token", t);
    localStorage.setItem("manglam_auth_user", JSON.stringify(u));
  }, token, user);
}

async function run() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — BROWSER FAVOURITES VERIFICATION");
  console.log("==================================================");

  let browser: Browser | null = null;

  try {
    // 1. Locate / verify seed accounts
    const userA = await prisma.user.findUnique({
      where: { phone: "+919888111111" },
      include: { profile: true },
    });
    const userPriya = await prisma.user.findUnique({
      where: { phone: "+919999000001" },
      include: { profile: true },
    });
    const userVikram = await prisma.user.findUnique({
      where: { phone: "+919888222222" },
      include: { profile: true },
    });

    if (!userA || !userPriya || !userVikram) {
      throw new Error("Required seed users missing. Run npx tsx prisma/seed.ts first.");
    }

    const tokenA = jwt.sign(
      { userId: userA.id, phone: userA.phone, status: userA.status },
      config.jwtSecret,
      { expiresIn: "7d" }
    );
    const tokenPriya = jwt.sign(
      { userId: userPriya.id, phone: userPriya.phone, status: userPriya.status },
      config.jwtSecret,
      { expiresIn: "7d" }
    );
    const tokenVikram = jwt.sign(
      { userId: userVikram.id, phone: userVikram.phone, status: userVikram.status },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--window-size=1280,900",
      ],
    });

    const page = await browser.newPage();
    await page.evaluateOnNewDocument("window.__name = (fn, name) => fn;");
    await page.setViewport({ width: 1280, height: 900 });

    // Clean favourites table for pristine initial state
    await prisma.profileFavourite.deleteMany({});

    // STEP 1: Log in as Account A (Arya: +919888111111)
    console.log("\n[STEP 1] Login as Account A (Arya)");
    await setBrowserAuth(page, tokenA, { id: userA.id, phone: userA.phone! });

    await page.goto(`${FRONTEND_URL}/matches`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 1200));

    // TEST 1: Header Likes Count is 0 (NOT the old mock 6)
    const headerLikesBadge = await page.$('header a[href="/interests"] span');
    const badgeText = headerLikesBadge
      ? await page.evaluate((el) => el.textContent, headerLikesBadge)
      : null;

    assert(
      badgeText === null || badgeText === "0",
      "Test 1: Header incoming likes badge is NOT hardcoded '6' (got: " + (badgeText || "no badge") + ")"
    );

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step1_header_zero_likes.png") });

    // TEST 2: Inspect candidate cards; Priya Sharma heart is initially NOT_FAVOURITED
    await page.waitForSelector('button[aria-label*="Priya Sharma"]', { timeout: 8000 });
    const initialAriaPressed = await page.$eval(
      'button[aria-label*="Priya Sharma"]',
      (el) => el.getAttribute("aria-pressed")
    );

    assert(
      initialAriaPressed === "false",
      "Test 2: Candidate card heart initially renders server-backed false"
    );

    // TEST 3: Click heart button on candidate card
    console.log("\n[STEP 2] Click Heart on Candidate Card");
    await page.$eval(
      'button[aria-label*="Priya Sharma"]',
      (el) => (el as HTMLButtonElement).click()
    );
    await new Promise((r) => setTimeout(r, 1500));

    const postClickAriaPressed = await page.$eval(
      'button[aria-label*="Priya Sharma"]',
      (el) => el.getAttribute("aria-pressed")
    );
    assert(
      postClickAriaPressed === "true",
      "Test 3: Heart button immediately transitions to active (aria-pressed=true)"
    );

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step2_heart_active.png") });

    // TEST 4: Direct PostgreSQL check: 1 row exists
    const rowInDb = await prisma.profileFavourite.findFirst({
      where: {
        userId: userA.id,
      },
    });
    assert(rowInDb !== null, "Test 4: PostgreSQL has active ProfileFavourite row for Arya");

    // TEST 5: Reload /matches page: heart state persists
    console.log("\n[STEP 3] Reload Page to verify persistence");
    await page.reload({ waitUntil: "networkidle2" });
    await page.waitForSelector('button[aria-label*="Priya Sharma"]', { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 1200));

    const reloadedAriaPressed = await page.$eval(
      'button[aria-label*="Priya Sharma"]',
      (el) => el.getAttribute("aria-pressed")
    );
    assert(
      reloadedAriaPressed === "true",
      "Test 5: Heart state persists across page reload from server response"
    );

    // TEST 6: Check /interests page under Account A
    console.log("\n[STEP 4] Verify /interests page for Account A");
    await page.goto(`${FRONTEND_URL}/interests`, { waitUntil: "networkidle2" });
    await page.waitForSelector("h1", { timeout: 8000 });

    // Sent Favourites tab has 1 item
    const sentTabBtn = await page.$('button[role="tab"]:nth-child(2)');
    await sentTabBtn?.click();
    await new Promise((r) => setTimeout(r, 1000));

    const sentCardsCount = await page.$$eval('[role="listitem"]', (els) => els.length);
    assert(
      sentCardsCount === 1,
      "Test 6: /interests Sent Favourites displays exactly 1 shortlisted card"
    );

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step4_interests_sent.png") });

    // STEP 5: Account Isolation - Login as Priya Sharma (+919999000001)
    console.log("\n[STEP 5] Account Isolation - Login as Priya Sharma");
    await setBrowserAuth(page, tokenPriya, { id: userPriya.id, phone: userPriya.phone! });

    await page.goto(`${FRONTEND_URL}/matches`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 1500));

    // TEST 7: Priya's Header shows incoming likes count = 1
    const priyaHeaderBadge = await page.$('header a[href="/interests"] span');
    const priyaBadgeText = priyaHeaderBadge
      ? await page.evaluate((el) => el.textContent, priyaHeaderBadge)
      : null;

    assert(
      priyaBadgeText === "1",
      "Test 7: Priya Sharma's header dynamically displays incoming like badge '1' (got: " + priyaBadgeText + ")"
    );

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step5_priya_header_1_like.png") });

    // TEST 8: Priya opens /interests Received Likes tab
    await page.goto(`${FRONTEND_URL}/interests`, { waitUntil: "networkidle2" });
    await page.waitForSelector("h1", { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 1000));

    const priyaReceivedCards = await page.$$eval('[role="listitem"]', (els) => els.length);
    assert(
      priyaReceivedCards >= 1,
      "Test 8: Priya's Received Likes tab lists Arya who liked her"
    );

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step5_priya_received_likes.png") });

    // STEP 6: Cross-Account Isolation - Login as Vikram Malhotra (+919888222222)
    console.log("\n[STEP 6] Cross-Account Isolation - Login as Vikram Malhotra");
    await setBrowserAuth(page, tokenVikram, { id: userVikram.id, phone: userVikram.phone! });

    await page.goto(`${FRONTEND_URL}/matches`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 1200));

    const vikramHeaderBadge = await page.$('header a[href="/interests"] span');
    const vikramBadgeText = vikramHeaderBadge
      ? await page.evaluate((el) => el.textContent, vikramHeaderBadge)
      : null;

    assert(
      vikramBadgeText === null || vikramBadgeText === "0",
      "Test 9: Unrelated user Vikram has 0 incoming likes (no cross-account leakage)"
    );

    // STEP 7: Unshortlist / Decrement verification
    console.log("\n[STEP 7] Unfavourite and count decrement");
    await setBrowserAuth(page, tokenA, { id: userA.id, phone: userA.phone! });

    await page.goto(`${FRONTEND_URL}/matches`, { waitUntil: "networkidle2" });
    await page.waitForSelector('button[aria-label*="Priya Sharma"]', { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 1200));

    await page.$eval(
      'button[aria-label*="Priya Sharma"]',
      (el) => (el as HTMLButtonElement).click()
    );
    await new Promise((r) => setTimeout(r, 2000));

    // Confirm DB row deleted
    const remainingRows = await prisma.profileFavourite.findMany({
      where: { userId: userA.id, targetProfileId: userPriya.profile!.id },
    });
    assert(
      remainingRows.length === 0,
      "Test 10: PostgreSQL row successfully deleted on heart un-toggle",
      remainingRows
    );

    // Login as Priya again to verify incoming count returned to 0
    await setBrowserAuth(page, tokenPriya, { id: userPriya.id, phone: userPriya.phone! });
    await page.goto(`${FRONTEND_URL}/matches`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 1500));

    const priyaBadgeAfterRemove = await page.$('header a[href="/interests"] span');
    const priyaBadgeTextAfterRemove = priyaBadgeAfterRemove
      ? await page.evaluate((el) => el.textContent, priyaBadgeAfterRemove)
      : null;

    assert(
      priyaBadgeTextAfterRemove === null || priyaBadgeTextAfterRemove === "0",
      "Test 11: Priya's incoming like count returns to 0 after Arya unfavourites"
    );

    // STEP 8: Responsive Layout Verification
    console.log("\n[STEP 8] Responsive Layout Verification");
    // Desktop: exactly 250px
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${FRONTEND_URL}/matches`, { waitUntil: "networkidle2" });
    await page.waitForSelector('[role="listitem"]', { timeout: 8000 });

    const cardDesktopWidth = await page.$eval('[role="listitem"]', (el) => el.getBoundingClientRect().width);
    assert(
      Math.abs(cardDesktopWidth - 250) < 2,
      `Test 12: Desktop card width is exactly 250px (got: ${cardDesktopWidth}px)`
    );

    // Mobile: 375px width, zero horizontal overflow
    await page.setViewport({ width: 375, height: 812 });
    await page.reload({ waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 1200));

    const overflowStats = await page.evaluate(() => {
      return {
        docScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        windowInnerWidth: window.innerWidth,
      };
    });

    assert(
      overflowStats.docScrollWidth <= overflowStats.windowInnerWidth,
      `Test 13: Mobile 375px viewport has zero horizontal overflow (scrollWidth: ${overflowStats.docScrollWidth}px, innerWidth: ${overflowStats.windowInnerWidth}px)`
    );

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step8_mobile_375px.png") });

  } finally {
    if (browser) {
      await browser.close();
    }
    await prisma.$disconnect();
  }

  console.log("\n==================================================");
  console.log(`BROWSER VERIFICATION SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Browser verification fatal error:", err);
  process.exit(1);
});
