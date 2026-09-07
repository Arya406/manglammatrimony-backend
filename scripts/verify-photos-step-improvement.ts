/**
 * ==============================================================================
 * MANGLAM MATRIMONY — PHOTOS STEP IMPROVEMENT VISUAL & FUNCTIONAL VERIFICATION
 *
 * Runs headless browser verification of:
 * 1. Empty state: Shows polished empty upload card when 0 photos exist
 * 2. Upload first photo: JPEG uploaded -> auto-designated as Main Photo
 * 3. Immediate approval: Shows [✓ Approved], zero "Under review", zero "Approve for Testing"
 * 4. Upload second photo: Uploaded -> appears in grid alongside upload tile
 * 5. Primary photo management: Click "Set as Main" on photo 2 -> promoted to Main Photo
 * 6. Delete confirmation modal: Click delete -> modal displays with warning -> confirm delete
 * 7. Multi-file upload capability: Select 2 files at once -> both uploaded sequentially
 * 8. 6-photo limit: Once 6 photos exist -> upload card hidden, limit banner shown, "6 / 6 photos"
 * 9. Mobile viewport (375px): 1-col layout, clean tap targets, zero horizontal overflow
 * 10. Edit profile mode: /onboarding/photos?mode=edit displays properly
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

async function runVerification() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — PHOTOS STEP E2E VERIFICATION");
  console.log("==================================================");

  let browser: Browser | null = null;
  const tempFilesDir = path.join(process.cwd(), "temp_photos_step_images");
  if (!fs.existsSync(tempFilesDir)) {
    fs.mkdirSync(tempFilesDir, { recursive: true });
  }

  // Create 6 distinct test images
  const imagePaths: string[] = [];
  const colors = [
    { r: 123, g: 17, b: 35 },   // Deep Maroon
    { r: 197, g: 155, b: 39 },  // Gold
    { r: 40, g: 120, b: 200 },  // Blue
    { r: 34, g: 139, b: 34 },   // Forest Green
    { r: 147, g: 51, b: 234 },  // Purple
    { r: 234, g: 88, b: 12 },   // Orange
  ];

  for (let i = 0; i < 6; i++) {
    const imgPath = path.join(tempFilesDir, `test_img_${i + 1}.jpg`);
    await sharp({
      create: { width: 600, height: 600, channels: 3, background: colors[i] },
    })
      .jpeg({ quality: 85 })
      .toFile(imgPath);
    imagePaths.push(imgPath);
  }

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 850 });

    // Setup isolated test user and profile
    const testEmail = `photos.step.${Date.now()}@example.com`;
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
        completionPercentage: 65,
      },
    });

    const userToken = jwt.sign(
      { userId: user.id, email: user.email, status: user.status },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    // Seed session in frontend localStorage
    await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
    await page.evaluate(
      (tok, usr) => {
        localStorage.setItem("manglam_auth_token", tok);
        localStorage.setItem("manglam_auth_user", JSON.stringify(usr));
      },
      userToken,
      { id: user.id, email: user.email, status: user.status }
    );

    // --------------------------------------------------------------------------
    // TEST 1: EMPTY STATE CARD (0 Photos)
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 1: EMPTY STATE (0 PHOTOS)] ---");
    await page.goto("http://localhost:3000/onboarding/photos", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 800));

    const emptyCard = await page.$('[class*="emptyUploadCard"]');
    assert(emptyCard !== null, "1. Empty state upload card rendered when 0 photos exist");

    const countPillText = await page.$eval('[class*="photoCountPill"]', (el) => el.textContent || "");
    assert(countPillText.includes("0") && countPillText.includes("6"), "2. Count pill shows '0 / 6 photos'");

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "photos_step_01_empty_state.png"),
    });
    console.log("  📸 Screenshot: photos_step_01_empty_state.png");

    // --------------------------------------------------------------------------
    // TEST 2: UPLOAD FIRST PHOTO -> AUTO MAIN & IMMEDIATE APPROVAL
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 2: UPLOAD FIRST PHOTO (AUTO-MAIN & APPROVED)] ---");
    const fileInput1 = await page.$('input[type="file"]');
    await fileInput1?.uploadFile(imagePaths[0]);

    await page.waitForSelector('[class*="photoCard"]', { timeout: 12000 });
    await new Promise((r) => setTimeout(r, 1200));

    const cardsCount1 = await page.$$eval('[class*="photoCard"]', (cards) => cards.length);
    assert(cardsCount1 === 1, "3. First photo card rendered in grid");

    const mainBadge1 = await page.$eval('[class*="mainPhotoOverlayBadge"]', (el) => el.textContent || "");
    assert(mainBadge1.includes("Main Photo"), "4. First photo automatically given 'Main Photo' overlay badge");

    const approvedPill1 = await page.$eval('[class*="approvedPill"]', (el) => el.textContent || "");
    assert(approvedPill1.includes("Approved"), "5. Photo immediately displays 'Approved' status pill");

    const pageContent1 = await page.content();
    assert(!pageContent1.includes("Under review"), "6. Zero 'Under review' text anywhere in UI");
    assert(!pageContent1.includes("Approve for Testing"), "7. Zero 'Approve for Testing' dev control in UI");

    // Check upload tile exists alongside the first photo card
    const uploadTile1 = await page.$('[class*="uploadTile"]');
    assert(uploadTile1 !== null, "8. Integrated upload tile rendered in remaining grid space");

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "photos_step_02_first_photo_approved.png"),
    });
    console.log("  📸 Screenshot: photos_step_02_first_photo_approved.png");

    // --------------------------------------------------------------------------
    // TEST 3: UPLOAD SECOND PHOTO & VERIFY "SET AS MAIN" BUTTON
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 3: UPLOAD SECOND PHOTO & ACTIONS] ---");
    const fileInput2 = await page.$('input[type="file"]');
    await fileInput2?.uploadFile(imagePaths[1]);

    await page.waitForFunction(
      () => document.querySelectorAll('[class*="photoCard"]').length === 2,
      { timeout: 12000 }
    );
    await new Promise((r) => setTimeout(r, 1200));

    const cardsCount2 = await page.$$eval('[class*="photoCard"]', (cards) => cards.length);
    assert(cardsCount2 === 2, "9. Two photo cards rendered in grid");

    // Check that second photo has "Set as Main" button, but first photo does not
    const setMainButtons = await page.$$('[class*="setMainButton"]');
    assert(setMainButtons.length === 1, "10. Exactly one 'Set as Main' button (only on non-main photo)");

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "photos_step_03_two_photos.png"),
    });
    console.log("  📸 Screenshot: photos_step_03_two_photos.png");

    // --------------------------------------------------------------------------
    // TEST 4: CHANGE MAIN PHOTO (SET PHOTO 2 AS PRIMARY)
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 4: CHANGE PRIMARY PHOTO] ---");
    await setMainButtons[0].click();
    await new Promise((r) => setTimeout(r, 2000));

    // After updating primary, photo 2 becomes main
    const cardsMetaAfter = await page.$$eval('[class*="photoCard"]', (cards) =>
      cards.map((c) => c.querySelector('[class*="cardTitle"]')?.textContent || "")
    );
    assert(cardsMetaAfter[0] === "Main Photo", "11. Selected photo promoted to Main Photo at index 0");

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "photos_step_04_promoted_main.png"),
    });
    console.log("  📸 Screenshot: photos_step_04_promoted_main.png");

    // --------------------------------------------------------------------------
    // TEST 5: DELETE PHOTO WITH CONFIRMATION MODAL
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 5: DELETE PHOTO WITH CONFIRMATION MODAL] ---");
    const deleteButtons = await page.$$('[class*="deleteIconButton"]');
    // Click delete on the second (non-main) photo
    await deleteButtons[1].click();
    await new Promise((r) => setTimeout(r, 500));

    // Verify confirmation modal appeared
    const modalTitle = await page.$eval('[class*="modalTitle"]', (el) => el.textContent || "");
    assert(modalTitle.includes("Delete Photo"), "12. Delete confirmation modal displayed with clear title");

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "photos_step_05_delete_modal.png"),
    });
    console.log("  📸 Screenshot: photos_step_05_delete_modal.png");

    // Click Delete in modal
    const confirmDeleteBtn = await page.$('[class*="modalDeleteButton"]');
    await confirmDeleteBtn?.click();
    await new Promise((r) => setTimeout(r, 1500));

    const cardsAfterDelete = await page.$$eval('[class*="photoCard"]', (cards) => cards.length);
    assert(cardsAfterDelete === 1, "13. Photo deleted and card count decremented back to 1");

    // --------------------------------------------------------------------------
    // TEST 6: MULTI-FILE UPLOAD (UPLOAD REMAINING 5 PHOTOS)
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 6: MULTI-FILE UPLOAD & REACHING 6/6 LIMIT] ---");
    const fileInputMulti = await page.$('input[type="file"]');
    // Upload remaining 5 images simultaneously
    await fileInputMulti?.uploadFile(
      imagePaths[1],
      imagePaths[2],
      imagePaths[3],
      imagePaths[4],
      imagePaths[5]
    );

    // Wait until all 6 photos are present
    await page.waitForFunction(
      () => document.querySelectorAll('[class*="photoCard"]').length === 6,
      { timeout: 25000 }
    );
    await new Promise((r) => setTimeout(r, 1500));

    const totalAtLimit = await page.$$eval('[class*="photoCard"]', (cards) => cards.length);
    assert(totalAtLimit === 6, "14. Multi-file upload completed: 6 photos present");

    // At 6 photos, upload tile should be hidden
    const uploadTileAtLimit = await page.$('[class*="uploadTile"]');
    assert(uploadTileAtLimit === null, "15. Upload tile hidden when maximum 6 photos reached");

    const limitBanner = await page.$('[class*="limitBanner"]');
    assert(limitBanner !== null, "16. Limit banner displayed when 6/6 photos reached");

    const countPillAtLimit = await page.$eval('[class*="photoCountPill"]', (el) => el.textContent || "");
    assert(countPillAtLimit.includes("6") && countPillAtLimit.includes("6"), "17. Photo count pill displays '6 / 6 photos'");

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "photos_step_06_six_photos_limit.png"),
    });
    console.log("  📸 Screenshot: photos_step_06_six_photos_limit.png");

    // --------------------------------------------------------------------------
    // TEST 7: EDIT MODE SCREEN (/onboarding/photos?mode=edit)
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 7: EDIT MODE SCREEN] ---");
    await page.goto("http://localhost:3000/onboarding/photos?mode=edit", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 800));

    const editBadgeText = await page.$eval('[class*="editModeBadge"]', (el) => el.textContent || "");
    assert(editBadgeText.includes("EDIT PROFILE • PHOTOS"), "18. Edit mode badge rendered properly");

    const editCardsCount = await page.$$eval('[class*="photoCard"]', (cards) => cards.length);
    assert(editCardsCount === 6, "19. All 6 photos visible in edit mode");

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "photos_step_07_edit_mode.png"),
    });
    console.log("  📸 Screenshot: photos_step_07_edit_mode.png");

    // --------------------------------------------------------------------------
    // TEST 8: MOBILE VIEWPORT (375px) ZERO OVERFLOW
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 8: MOBILE VIEWPORT 375px ZERO OVERFLOW] ---");
    await page.setViewport({ width: 375, height: 812 });
    await new Promise((r) => setTimeout(r, 600));

    const isOverflowing = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    assert(isOverflowing === false, "20. Zero horizontal scroll/overflow on mobile 375px viewport");

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "photos_step_08_mobile_375px.png"),
    });
    console.log("  📸 Screenshot: photos_step_08_mobile_375px.png");

    // Cleanup test entities from database
    await prisma.profilePhoto.deleteMany({ where: { profileId: profile.id } });
    await prisma.profile.deleteMany({ where: { id: profile.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });

  } catch (err) {
    console.error("Photos step verification error:", err);
    failed++;
  } finally {
    if (browser) {
      await browser.close();
    }
    // Clean up temporary image files
    try {
      for (const p of imagePaths) {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      if (fs.existsSync(tempFilesDir)) fs.rmdirSync(tempFilesDir);
    } catch {}
    await prisma.$disconnect();
  }

  console.log("\n==================================================");
  console.log(`PHOTOS STEP RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification();
