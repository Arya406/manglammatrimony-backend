import puppeteer, { Browser } from "puppeteer-core";
import { PrismaClient, UserStatus, ProfileCreatedFor } from "@prisma/client";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import { config } from "../src/config/env";

const prisma = new PrismaClient();
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\aryas\\.gemini\\antigravity-ide\\brain\\ef0935e4-7843-4a16-afea-2dae4828f62e";

let passed = 0;
let failed = 0;

function assert(condition: any, testName: string, detail?: any) {
  if (Boolean(condition)) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`, detail !== undefined ? detail : "");
    failed++;
  }
}

async function runBrowserReligionVerification() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — BROWSER RELIGION HIERARCHY VERIFICATION");
  console.log("==================================================");

  let browser: Browser | null = null;

  try {
    // 1. Create Onboarding Test User
    const testPhone = "+919876540099";
    await prisma.user.deleteMany({ where: { phone: testPhone } });

    const user = await prisma.user.create({
      data: {
        phone: testPhone,
        status: UserStatus.ACTIVE,
        phoneVerifiedAt: new Date(),
      },
    });

    const hindi = await prisma.language.findFirst({ where: { code: "hi" } });

    const profile = await prisma.profile.create({
      data: {
        userId: user.id,
        profileCreatedFor: ProfileCreatedFor.MYSELF,
        completionPercentage: 30,
      },
    });

    await prisma.profilePersonalDetails.create({
      data: {
        profileId: profile.id,
        firstName: "Ananya",
        lastName: "Sharma",
        gender: "FEMALE",
        dateOfBirth: new Date("1997-08-20"),
        maritalStatus: "NEVER_MARRIED",
        heightCm: 165,
        motherTongueId: hindi!.id,
        city: "Jaipur",
        state: "Rajasthan",
      },
    });

    const token = jwt.sign(
      { userId: user.id, phone: user.phone },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    // 2. Launch Puppeteer
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1280,900"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // Inject token before navigation
    await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
    await page.evaluate((tok, u) => {
      localStorage.setItem("manglam_auth_token", tok);
      localStorage.setItem(
        "manglam_auth_user",
        JSON.stringify({
          id: u.id,
          phone: u.phone,
          profileStatus: "INCOMPLETE",
        })
      );
    }, token, user);

    console.log("\n[TEST 1] Navigate to /onboarding/religion");
    await page.goto("http://localhost:3000/onboarding/religion", { waitUntil: "networkidle0" });

    // Verify Religion dropdown exists
    const religionSelect = await page.$("#religion");
    assert(!!religionSelect, "1. Religion dropdown rendered on page");

    console.log("\n[TEST 2] Select 'Other / Not listed' for Religion");
    // Click custom select trigger
    await page.click("#religion");
    await new Promise((r) => setTimeout(r, 300));

    // Select 'Other / Not listed'
    await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('[role="option"]'));
      const otherOpt = options.find((o) => o.textContent?.includes("Other / Not listed")) as HTMLElement;
      if (otherOpt) otherOpt.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    // Verify custom religion text input appeared
    const customReligionInput = await page.$("#customReligion");
    assert(!!customReligionInput, "2. Custom religion text input appeared when Other selected");

    // Type custom religion
    await page.type("#customReligion", "Bahá'í");
    assert(
      (await page.$eval("#customReligion", (el: any) => el.value)) === "Bahá'í",
      "3. Custom religion input value is 'Bahá'í'"
    );

    console.log("\n[TEST 3] Progressive disclosure: Community appears with fallback options");
    const communitySelect = await page.$("#community");
    assert(!!communitySelect, "4. Community dropdown revealed when religion selected");

    // Select 'Other / Not listed' for Community
    await page.click("#community");
    await new Promise((r) => setTimeout(r, 300));

    await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('[role="option"]'));
      const otherOpt = options.find((o) => o.textContent?.includes("Other / Not listed")) as HTMLElement;
      if (otherOpt) otherOpt.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    const customCommunityInput = await page.$("#customCommunity");
    assert(!!customCommunityInput, "5. Custom community input appeared when Other selected");

    await page.type("#customCommunity", "Lotus Community");

    console.log("\n[TEST 4] Progressive disclosure: Caste & Gotra appear");
    const casteSelect = await page.$("#caste");
    assert(!!casteSelect, "6. Caste dropdown revealed when community selected");

    // Select 'Other / Not listed' for Caste
    await page.click("#caste");
    await new Promise((r) => setTimeout(r, 300));

    await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('[role="option"]'));
      const otherOpt = options.find((o) => o.textContent?.includes("Other / Not listed")) as HTMLElement;
      if (otherOpt) otherOpt.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    const customCasteInput = await page.$("#customCaste");
    assert(!!customCasteInput, "7. Custom caste input appeared when Other selected");

    await page.type("#customCaste", "Universal");

    console.log("\n[TEST 5] Progressive disclosure: Sub-caste appears");
    const subCasteSelect = await page.$("#subCaste");
    assert(!!subCasteSelect, "8. Sub-caste dropdown revealed when caste selected");

    // Select 'Other / Not listed' for Sub-caste
    await page.click("#subCaste");
    await new Promise((r) => setTimeout(r, 300));

    await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('[role="option"]'));
      const otherOpt = options.find((o) => o.textContent?.includes("Other / Not listed")) as HTMLElement;
      if (otherOpt) otherOpt.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    const customSubCasteInput = await page.$("#customSubCaste");
    assert(!!customSubCasteInput, "9. Custom sub-caste input appeared when Other selected");

    await page.type("#customSubCaste", "Peace");

    // Capture screenshot of filled form with custom fields
    const filledFormScreenshotPath = path.join(ARTIFACTS_DIR, "browser_religion_custom_fields.png");
    await page.screenshot({ path: filledFormScreenshotPath, fullPage: true });
    console.log(`  ✓ Saved screenshot: browser_religion_custom_fields.png`);

    console.log("\n[TEST 6] Atomic Dependency Clearing: Changing Religion clears children");
    // Change religion to Christian
    await page.click("#religion");
    await new Promise((r) => setTimeout(r, 300));

    await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('[role="option"]'));
      const christianOpt = options.find((o) => o.textContent?.trim() === "Christian") as HTMLElement;
      if (christianOpt) christianOpt.click();
    });
    await new Promise((r) => setTimeout(r, 500));

    // Verify custom religion text input was removed
    const customRelAfter = await page.$("#customReligion");
    assert(!customRelAfter, "10. Custom religion input cleared upon religion switch");

    // Verify Caste and Sub-caste are not rendered (reset because community was reset)
    const casteAfter = await page.$("#caste");
    assert(!casteAfter, "11. Caste dropdown cleared upon religion switch (atomic reset)");

    const subCasteAfter = await page.$("#subCaste");
    assert(!subCasteAfter, "12. Sub-caste dropdown cleared upon religion switch (atomic reset)");

    // Capture screenshot of reset state
    const resetScreenshotPath = path.join(ARTIFACTS_DIR, "browser_religion_atomic_clear.png");
    await page.screenshot({ path: resetScreenshotPath, fullPage: true });
    console.log(`  ✓ Saved screenshot: browser_religion_atomic_clear.png`);

    console.log("\n[TEST 7] Save full custom background and verify Review screen display");
    // Switch back to Other religion and fill custom values
    await page.click("#religion");
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('[role="option"]'));
      const otherOpt = options.find((o) => o.textContent?.includes("Other / Not listed")) as HTMLElement;
      if (otherOpt) otherOpt.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.type("#customReligion", "Bahá'í");

    // Community Other
    await page.click("#community");
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('[role="option"]'));
      const otherOpt = options.find((o) => o.textContent?.includes("Other / Not listed")) as HTMLElement;
      if (otherOpt) otherOpt.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.type("#customCommunity", "Lotus Community");

    // Caste Other
    await page.click("#caste");
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('[role="option"]'));
      const otherOpt = options.find((o) => o.textContent?.includes("Other / Not listed")) as HTMLElement;
      if (otherOpt) otherOpt.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.type("#customCaste", "Universal");

    // Sub-caste Other
    await page.click("#subCaste");
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('[role="option"]'));
      const otherOpt = options.find((o) => o.textContent?.includes("Other / Not listed")) as HTMLElement;
      if (otherOpt) otherOpt.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.type("#customSubCaste", "Peace");

    // Select Manglik = No
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const noBtn = buttons.find((b) => b.textContent?.trim() === "No");
      if (noBtn) noBtn.click();
    });
    await new Promise((r) => setTimeout(r, 300));

    // Submit form
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));

    // Verify navigated to next step: education-career
    assert(page.url().includes("/onboarding/education-career"), "13. Form successfully submitted and navigated to /onboarding/education-career");

    // Navigate to /onboarding/review to inspect Section 4 display
    console.log("\n[TEST 8] Review Screen Display of Effective Values");
    await page.goto("http://localhost:3000/onboarding/review", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 800));

    const reviewText = await page.evaluate(() => document.body.innerText);

    assert(reviewText.includes("Bahá'í"), "14. Profile Review displays custom religion 'Bahá'í'");
    assert(reviewText.includes("Lotus Community"), "15. Profile Review displays custom community 'Lotus Community'");
    assert(reviewText.includes("Universal"), "16. Profile Review displays custom caste 'Universal'");
    assert(reviewText.includes("Peace"), "17. Profile Review displays custom sub-caste 'Peace'");
    assert(!reviewText.includes("Religion\nOther"), "18. Profile Review NEVER exposes literal 'Other' as religion");

    // Capture screenshot of Review Screen Section 4
    const reviewScreenshotPath = path.join(ARTIFACTS_DIR, "browser_religion_review_display.png");
    await page.screenshot({ path: reviewScreenshotPath, fullPage: true });
    console.log(`  ✓ Saved screenshot: browser_religion_review_display.png`);

    // Cleanup test user
    await prisma.user.deleteMany({ where: { phone: testPhone } });

    console.log("\n==================================================");
    console.log(`BROWSER VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Browser verification error:", error);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    await prisma.$disconnect();
  }
}

runBrowserReligionVerification();
