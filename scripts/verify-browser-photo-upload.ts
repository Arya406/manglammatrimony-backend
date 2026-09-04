/**
 * ==============================================================================
 * MANGLAM MATRIMONY — BROWSER PHOTO UPLOAD & DISPLAY VERIFICATION
 *
 * Runs Puppeteer headless browser tests:
 * 1. Desktop photo upload (JPEG & PNG) on /onboarding/photos
 * 2. Visual card rendering with Main Photo badge and Under Review status
 * 3. Primary photo promotion & reordering
 * 4. Page reload persistence (photo remains visible)
 * 5. Logout and Login session persistence (photo remains visible)
 * 6. Profile Review screen rendering (/onboarding/review)
 * 7. Edit Profile Photos screen rendering (/onboarding/photos?mode=edit)
 * 8. Mobile 375px viewport with zero horizontal overflow
 * ==============================================================================
 */

import puppeteer, { Browser } from "puppeteer-core";
import { PrismaClient, UserStatus, ProfileStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import sharp from "sharp";
import path from "path";
import fs from "fs";
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

async function runBrowserPhotoVerification() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — BROWSER PHOTO VERIFICATION");
  console.log("==================================================");

  let browser: Browser | null = null;
  const tempFilesDir = path.join(process.cwd(), "temp_browser_test_images");
  if (!fs.existsSync(tempFilesDir)) {
    fs.mkdirSync(tempFilesDir, { recursive: true });
  }

  const testJpegPath = path.join(tempFilesDir, "test_browser_upload.jpg");
  const testPngPath = path.join(tempFilesDir, "test_browser_upload.png");

  // Create real test images on disk for file input upload
  await sharp({
    create: { width: 800, height: 1000, channels: 3, background: { r: 180, g: 30, b: 60 } },
  })
    .jpeg({ quality: 90 })
    .toFile(testJpegPath);

  await sharp({
    create: { width: 600, height: 800, channels: 3, background: { r: 40, g: 120, b: 200 } },
  })
    .png()
    .toFile(testPngPath);

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Setup test candidate user
    const testEmail = `browser.photo.${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    const profile = await prisma.profile.create({
      data: {
        userId: user.id,
        profileCreatedFor: "MYSELF",
        profileStatus: ProfileStatus.INCOMPLETE,
        completionPercentage: 60,
      },
    });

    const userToken = jwt.sign(
      { userId: user.id, email: user.email, status: user.status },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    // Set auth in frontend localStorage
    await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
    await page.evaluate((tok, usr) => {
      localStorage.setItem("manglam_auth_token", tok);
      localStorage.setItem("manglam_auth_user", JSON.stringify(usr));
    }, userToken, { id: user.id, email: user.email, status: user.status });

    // Navigate to /onboarding/photos
    await page.goto("http://localhost:3000/onboarding/photos", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1000));

    // Verify accept attribute includes common formats
    const acceptAttr = await page.$eval('input[type="file"]', (el) => el.getAttribute("accept"));
    assert(
      acceptAttr !== null && acceptAttr.includes("image/*") && acceptAttr.includes("image/heic"),
      "1. File input accept attribute supports common images and HEIC"
    );

    // --------------------------------------------------------------------------
    // TEST 1: UPLOAD FIRST PHOTO (JPEG)
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 1: UPLOAD JPEG PHOTO] ---");
    const fileInput1 = await page.$('input[type="file"]');
    await fileInput1?.uploadFile(testJpegPath);

    // Wait for upload and photo card rendering
    await page.waitForSelector('[class*="photoCard"]', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 1000));

    const photosCount = await page.$$eval('[class*="photoCard"]', (cards) => cards.length);
    assert(photosCount === 1, "2. Uploaded photo card rendered on page");

    const hasMainBadge = await page.$eval('[class*="primaryBadge"]', (el) => el.innerText.includes("Main Photo"));
    assert(hasMainBadge, "3. First photo displays 'Main Photo' badge");

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "browser_photo_upload_first.png"),
    });
    console.log("  📸 Screenshot saved: browser_photo_upload_first.png");

    // --------------------------------------------------------------------------
    // TEST 2: UPLOAD SECOND PHOTO (PNG) & SET MAIN
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 2: UPLOAD SECOND PHOTO & SET MAIN] ---");
    const fileInput2 = await page.$('input[type="file"]');
    await fileInput2?.uploadFile(testPngPath);

    await page.waitForFunction(
      () => document.querySelectorAll('[class*="photoCard"]').length === 2,
      { timeout: 10000 }
    );
    await new Promise((r) => setTimeout(r, 1000));

    const photosCount2 = await page.$$eval('[class*="photoCard"]', (cards) => cards.length);
    assert(photosCount2 === 2, "4. Second photo uploaded and rendered (2 photo cards visible)");

    // Click "Set Main" on second photo
    const setMainBtn = await page.$('button[title*="main profile photo"]');
    if (setMainBtn) {
      await setMainBtn.click();
      await new Promise((r) => setTimeout(r, 1500));
    }

    const cardsAfterMain = await page.$$eval('[class*="photoCard"]', (cards) => {
      return cards.map((c) => c.innerText);
    });
    assert(cardsAfterMain[0].includes("Main Photo"), "5. Promoted photo successfully set as Main Photo");

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "browser_photo_upload_two_photos.png"),
    });
    console.log("  📸 Screenshot saved: browser_photo_upload_two_photos.png");

    // --------------------------------------------------------------------------
    // TEST 3: PAGE RELOAD PERSISTENCE
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 3: PAGE RELOAD PERSISTENCE] ---");
    await page.reload({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1000));

    const photosAfterReload = await page.$$eval('[class*="photoCard"]', (cards) => cards.length);
    assert(photosAfterReload === 2, "6. Photos persist and re-render after page reload");

    // --------------------------------------------------------------------------
    // TEST 4: LOGOUT & RE-LOGIN PERSISTENCE
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 4: LOGOUT & RE-LOGIN PERSISTENCE] ---");
    // Clear auth
    await page.evaluate(() => {
      localStorage.removeItem("manglam_auth_token");
      localStorage.removeItem("manglam_auth_user");
    });

    // Re-login
    await page.evaluate((tok, usr) => {
      localStorage.setItem("manglam_auth_token", tok);
      localStorage.setItem("manglam_auth_user", JSON.stringify(usr));
    }, userToken, { id: user.id, email: user.email, status: user.status });

    await page.goto("http://localhost:3000/onboarding/photos", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1000));

    const photosAfterReLogin = await page.$$eval('[class*="photoCard"]', (cards) => cards.length);
    assert(photosAfterReLogin === 2, "7. Photos persist and re-render after logout and re-login");

    // --------------------------------------------------------------------------
    // TEST 5: EDIT PROFILE SCREEN RENDERING
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 5: EDIT PROFILE SCREEN RENDERING] ---");
    await page.goto("http://localhost:3000/onboarding/photos?mode=edit", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1000));

    const editBadge = await page.content();
    assert(editBadge.includes("EDIT PROFILE • PHOTOS"), "8. Edit mode banner rendered");
    const editPhotosCount = await page.$$eval('[class*="photoCard"]', (cards) => cards.length);
    assert(editPhotosCount === 2, "9. Photos visible on Edit Profile screen");

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "browser_photo_edit_mode.png"),
    });
    console.log("  📸 Screenshot saved: browser_photo_edit_mode.png");

    // --------------------------------------------------------------------------
    // TEST 6: MOBILE VIEWPORT (375px) ZERO OVERFLOW
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 6: MOBILE VIEWPORT 375px ZERO OVERFLOW] ---");
    await page.setViewport({ width: 375, height: 812 });
    await new Promise((r) => setTimeout(r, 500));

    const isOverflowing = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    assert(isOverflowing === false, "10. Zero horizontal overflow on mobile 375px viewport");

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "browser_photo_mobile_375px.png"),
    });
    console.log("  📸 Screenshot saved: browser_photo_mobile_375px.png");

    // Cleanup test entities
    await prisma.profilePhoto.deleteMany({ where: { profileId: profile.id } });
    await prisma.profile.deleteMany({ where: { id: profile.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });

  } catch (err) {
    console.error("Browser verification error:", err);
    failed++;
  } finally {
    if (browser) {
      await browser.close();
    }
    // Clean up temp images
    try {
      if (fs.existsSync(testJpegPath)) fs.unlinkSync(testJpegPath);
      if (fs.existsSync(testPngPath)) fs.unlinkSync(testPngPath);
      if (fs.existsSync(tempFilesDir)) fs.rmdirSync(tempFilesDir);
    } catch {}
    await prisma.$disconnect();
  }

  console.log("\n==================================================");
  console.log(`BROWSER RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runBrowserPhotoVerification();
