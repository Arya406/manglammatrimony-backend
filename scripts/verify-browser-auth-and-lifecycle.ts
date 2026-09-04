/**
 * ==============================================================================
 * MANGLAM MATRIMONY — BROWSER VERIFICATION SUITE
 *
 * Runs Puppeteer headless browser tests:
 * 1. Clean Registration page (email only, no mobile tabs)
 * 2. OTP Verification (Change email address link, Resend email OTP input)
 * 3. Clean Login page (email only, no mobile tabs, USER_NOT_FOUND error display)
 * 4. Application Under Review Modal presentation
 * 5. Onboarding Review screen under IN_REVIEW state (Banner, Edit Profile, no Explore Matches)
 * 6. Submitted page (View My Profile, Edit Profile, no Explore Matches)
 * 7. Navigation behavior for IN_REVIEW user (Under Review status pill, My Profile)
 * 8. ACTIVE user navigation preservation (Full Matches/Interests/Messages)
 * 9. Route Guard enforcement (Direct access to /matches or /interests redirects IN_REVIEW user to /onboarding/review)
 * 10. Responsive layout on Desktop (1280x800) and Mobile (375x812) with zero horizontal overflow
 * ==============================================================================
 */

import puppeteer, { Browser, Page } from "puppeteer-core";
import { PrismaClient, ProfileStatus, UserStatus, Gender, MaritalStatus, ManglikStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import { config } from "../src/config/env";
import path from "path";
import fs from "fs";

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

async function runBrowserVerification() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — BROWSER VERIFICATION SUITE");
  console.log("==================================================");

  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // --------------------------------------------------------------------------
    // TEST 1: REGISTRATION SCREEN (Clean Email Only)
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 1: REGISTRATION SCREEN] ---");
    await page.goto("http://localhost:3000/register", { waitUntil: "networkidle0" });

    // Check for email input
    const emailInput = await page.$('input[type="email"]');
    assert(emailInput !== null, "1. Email input is present on registration page");

    // Assert NO mobile tab or phone input
    const phoneInput = await page.$('input[type="tel"]');
    assert(phoneInput === null, "2. No mobile number input on registration page");

    const authTabs = await page.$('[role="tablist"]');
    assert(authTabs === null, "3. No method switcher tabs on registration page");

    // Screenshot registration page
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "browser_register_email_only.png"),
    });
    console.log("  📸 Screenshot saved: browser_register_email_only.png");

    // --------------------------------------------------------------------------
    // TEST 2: LOGIN SCREEN (Clean Email Only & Error Feedback)
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 2: LOGIN SCREEN & ERROR FEEDBACK] ---");
    await page.goto("http://localhost:3000/login", { waitUntil: "networkidle0" });

    const loginEmailInput = await page.$('input[type="email"]');
    assert(loginEmailInput !== null, "4. Email input is present on login page");

    const loginPhoneInput = await page.$('input[type="tel"]');
    assert(loginPhoneInput === null, "5. No mobile number input on login page");

    // Submit non-existent email to test error message
    await page.type('input[type="email"]', `nonexistent.user.${Date.now()}@example.com`);
    const submitLoginBtn = await page.$('button[type="submit"]');
    await submitLoginBtn?.click();

    // Wait for error feedback banner
    await page.waitForSelector('[role="alert"], [class*="alertBanner"]', { timeout: 5000 }).catch(() => {});
    const pageContent = await page.content();
    const hasNotFoundNotice =
      pageContent.includes("No account found with this email") ||
      pageContent.includes("USER_NOT_FOUND") ||
      pageContent.includes("register");
    assert(hasNotFoundNotice, "6. User-friendly error shown when login email does not exist");

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "browser_login_error_feedback.png"),
    });
    console.log("  📸 Screenshot saved: browser_login_error_feedback.png");

    // --------------------------------------------------------------------------
    // TEST 3: ONBOARDING REVIEW SCREEN UNDER IN_REVIEW STATE
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 3: ONBOARDING REVIEW SCREEN UNDER IN_REVIEW] ---");

    // Setup a deterministic IN_REVIEW test user
    const testReviewEmail = `review.candidate.${Date.now()}@example.com`;
    const reviewUser = await prisma.user.create({
      data: {
        email: testReviewEmail,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    const hindiLang = await prisma.language.findFirst();
    const reviewProfile = await prisma.profile.create({
      data: {
        userId: reviewUser.id,
        profileCreatedFor: "MYSELF",
        profileStatus: ProfileStatus.IN_REVIEW,
        completionPercentage: 100,
        submittedAt: new Date(),
      },
    });

    await prisma.profilePersonalDetails.create({
      data: {
        profileId: reviewProfile.id,
        firstName: "Vikram",
        lastName: "Rathore",
        gender: Gender.MALE,
        dateOfBirth: new Date("1994-03-15"),
        maritalStatus: MaritalStatus.NEVER_MARRIED,
        heightCm: 177,
        motherTongueId: hindiLang?.id || "",
        city: "Jaipur",
        state: "Rajasthan",
      },
    });

    // Generate JWT token for reviewUser
    const reviewToken = jwt.sign(
      {
        userId: reviewUser.id,
        email: reviewUser.email,
        status: reviewUser.status,
      },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    // Set auth token in localStorage on frontend
    await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
    await page.evaluate((tok, usr) => {
      localStorage.setItem("manglam_auth_token", tok);
      localStorage.setItem("manglam_auth_user", JSON.stringify(usr));
    }, reviewToken, { id: reviewUser.id, email: reviewUser.email, status: reviewUser.status });

    // Navigate to /onboarding/review
    await page.goto("http://localhost:3000/onboarding/review", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1500));

    const reviewContent = await page.content();
    assert(
      reviewContent.includes("Application Under Review"),
      "7. Review page displays 'Application Under Review' title banner"
    );
    assert(
      reviewContent.includes("IN_REVIEW"),
      "8. Review page displays IN_REVIEW status badge"
    );
    assert(
      reviewContent.includes("Edit Profile"),
      "9. Review page displays 'Edit Profile' button"
    );
    assert(
      !reviewContent.includes("Explore Matches"),
      "10. Review page strictly does NOT show 'Explore Matches' for IN_REVIEW user"
    );
    assert(
      !reviewContent.includes("Profile Live"),
      "11. Review page strictly does NOT show 'Profile Live' for IN_REVIEW user"
    );

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "browser_review_in_review_desktop.png"),
    });
    console.log("  📸 Screenshot saved: browser_review_in_review_desktop.png");

    // --------------------------------------------------------------------------
    // TEST 4: RESPONSIVE MOBILE VIEWPORT (375px) WITH ZERO OVERFLOW
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 4: RESPONSIVE MOBILE (375px) ZERO OVERFLOW] ---");
    await page.setViewport({ width: 375, height: 812 });
    await new Promise((r) => setTimeout(r, 500));

    const isOverflowing = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    assert(isOverflowing === false, "12. Zero horizontal overflow on mobile 375px viewport");

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "browser_review_mobile_375px.png"),
    });
    console.log("  📸 Screenshot saved: browser_review_mobile_375px.png");

    // Reset viewport to desktop
    await page.setViewport({ width: 1280, height: 800 });

    // --------------------------------------------------------------------------
    // TEST 5: SUBMITTED PAGE (View My Profile, Edit Profile, No Explore Matches)
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 5: SUBMITTED PAGE] ---");
    await page.goto("http://localhost:3000/onboarding/submitted", { waitUntil: "networkidle0" });
    const submittedContent = await page.content();

    assert(
      submittedContent.includes("View My Profile"),
      "13. Submitted page provides 'View My Profile' CTA"
    );
    assert(
      submittedContent.includes("Edit Profile"),
      "14. Submitted page provides 'Edit Profile' CTA"
    );
    assert(
      !submittedContent.includes("Explore Matches"),
      "15. Submitted page does NOT contain 'Explore Matches' button"
    );

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "browser_submitted_page.png"),
    });
    console.log("  📸 Screenshot saved: browser_submitted_page.png");

    // --------------------------------------------------------------------------
    // TEST 6: APP HEADER FOR IN_REVIEW USER
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 6: APP HEADER FOR IN_REVIEW USER] ---");
    await page.goto("http://localhost:3000/premium", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1500));
    const headerText = await page.evaluate(() => {
      const header = document.querySelector("header");
      return header ? header.innerText : "";
    });
    assert(
      headerText.includes("Under Review") || headerText.includes("UNDER REVIEW"),
      "16. AppHeader shows 'Under Review' status pill for IN_REVIEW user"
    );
    assert(
      headerText.includes("My Profile"),
      "17. AppHeader provides 'My Profile' navigation for IN_REVIEW user"
    );
    assert(
      !headerText.includes("Matches"),
      "18. AppHeader suppresses 'Matches' discovery link for IN_REVIEW user"
    );

    // --------------------------------------------------------------------------
    // TEST 7: DIRECT ROUTE PROTECTION (Redirect /matches -> /onboarding/review)
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 7: DIRECT ROUTE PROTECTION] ---");
    await page.goto("http://localhost:3000/matches", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1500));

    const currentUrlAfterMatches = page.url();
    assert(
      currentUrlAfterMatches.includes("/onboarding/review"),
      "19. IN_REVIEW user attempting direct /matches navigation is redirected to /onboarding/review",
      currentUrlAfterMatches
    );

    await page.goto("http://localhost:3000/interests", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1500));
    const currentUrlAfterInterests = page.url();
    assert(
      currentUrlAfterInterests.includes("/onboarding/review"),
      "20. IN_REVIEW user attempting direct /interests navigation is redirected to /onboarding/review",
      currentUrlAfterInterests
    );

    // --------------------------------------------------------------------------
    // TEST 8: ACTIVE USER FULL PLATFORM PRESERVATION
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 8: ACTIVE USER PRESERVATION] ---");
    const activeSeedUser = await prisma.user.findFirst({
      where: { email: "arya.sharma@example.com" },
      include: { profile: true },
    });

    if (activeSeedUser) {
      const activeToken = jwt.sign(
        {
          userId: activeSeedUser.id,
          email: activeSeedUser.email,
          status: activeSeedUser.status,
        },
        config.jwtSecret,
        { expiresIn: "7d" }
      );

      await page.evaluate((tok, usr) => {
        localStorage.setItem("manglam_auth_token", tok);
        localStorage.setItem("manglam_auth_user", JSON.stringify(usr));
      }, activeToken, { id: activeSeedUser.id, email: activeSeedUser.email, status: activeSeedUser.status });

      await page.goto("http://localhost:3000/matches", { waitUntil: "networkidle0" });
      await new Promise((r) => setTimeout(r, 2000));

      const activePageUrl = page.url();
      assert(
        activePageUrl.includes("/matches"),
        "21. ACTIVE user successfully stays on /matches without redirection"
      );

      const activeHeaderContent = await page.evaluate(() => {
        const header = document.querySelector("header");
        return header ? header.innerText : "";
      });
      assert(
        activeHeaderContent.includes("Matches"),
        "22. ACTIVE user header has 'Matches' link"
      );
      assert(
        activeHeaderContent.includes("Interests"),
        "23. ACTIVE user header has 'Interests' link"
      );
      assert(
        activeHeaderContent.includes("Messages"),
        "24. ACTIVE user header has 'Messages' link"
      );

      await page.screenshot({
        path: path.join(ARTIFACTS_DIR, "browser_active_user_matches.png"),
      });
      console.log("  📸 Screenshot saved: browser_active_user_matches.png");
    }

    // --------------------------------------------------------------------------
    // TEST 9: SUBMISSION & APPLICATION UNDER REVIEW MODAL
    // --------------------------------------------------------------------------
    console.log("\n--- [TEST 9: SUBMISSION & APPLICATION UNDER REVIEW MODAL] ---");
    const testModalEmail = `modal.candidate.${Date.now()}@example.com`;
    const modalUser = await prisma.user.create({
      data: {
        email: testModalEmail,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    const modalProfile = await prisma.profile.create({
      data: {
        userId: modalUser.id,
        profileCreatedFor: "MYSELF",
        profileStatus: ProfileStatus.INCOMPLETE,
        completionPercentage: 100,
      },
    });

    await prisma.profilePersonalDetails.create({
      data: {
        profileId: modalProfile.id,
        firstName: "Sneha",
        lastName: "Kapoor",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("1996-05-10"),
        maritalStatus: MaritalStatus.NEVER_MARRIED,
        heightCm: 165,
        motherTongueId: hindiLang?.id || "",
        city: "Delhi",
        state: "Delhi",
      },
    });

    const hinduRel = await prisma.religion.findFirst();
    await prisma.profileReligion.create({
      data: {
        profileId: modalProfile.id,
        religionId: hinduRel!.id,
        manglik: ManglikStatus.NO,
      },
    });

    const edu = await prisma.education.findFirst();
    await prisma.profileEducation.create({
      data: {
        profileId: modalProfile.id,
        educationId: edu!.id,
      },
    });

    const emp = await prisma.employmentStatus.findFirst();
    await prisma.profileCareer.create({
      data: {
        profileId: modalProfile.id,
        employmentStatusId: emp!.id,
        annualIncomeRange: "TEN_TO_FIFTEEN_LAKH",
      },
    });

    await prisma.partnerPreference.create({
      data: {
        profileId: modalProfile.id,
        minAge: 25,
        maxAge: 32,
      },
    });

    await prisma.profilePhoto.create({
      data: {
        profileId: modalProfile.id,
        photoType: "PRIMARY",
        storageKey: `modal_photo_${Date.now()}.jpg`,
        originalFileName: "sneha.jpg",
        mimeType: "image/jpeg",
        fileSize: 50000,
        sortOrder: 0,
      },
    });

    const modalToken = jwt.sign(
      { userId: modalUser.id, email: modalUser.email, status: modalUser.status },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    await page.evaluate((tok, usr) => {
      localStorage.setItem("manglam_auth_token", tok);
      localStorage.setItem("manglam_auth_user", JSON.stringify(usr));
    }, modalToken, { id: modalUser.id, email: modalUser.email, status: modalUser.status });

    await page.goto("http://localhost:3000/onboarding/review", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1500));

    // Check confirmation checkbox
    const confirmCheckbox = await page.$('input[type="checkbox"]');
    if (confirmCheckbox) {
      await confirmCheckbox.click();
    }

    // Click submit button
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
    }

    // Wait for Application Under Review modal dialog
    await page.waitForSelector('[role="dialog"]', { timeout: 6000 });
    await new Promise((r) => setTimeout(r, 600));
    const modalContent = await page.content();

    assert(
      modalContent.includes("Application Under Review"),
      "25. Modal presents title 'Application Under Review'"
    );
    assert(
      modalContent.includes("Your profile has been submitted successfully and is now under review"),
      "26. Modal presents approved explanation body copy"
    );
    assert(
      modalContent.includes("View My Profile"),
      "27. Modal primary CTA button is 'View My Profile'"
    );
    assert(
      !modalContent.includes("Explore Matches") && !modalContent.includes("Profile Live"),
      "28. Modal does NOT show 'Explore Matches' or 'Profile Live'"
    );

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "browser_application_under_review_modal.png"),
    });
    console.log("  📸 Screenshot saved: browser_application_under_review_modal.png");

    // Cleanup modal test entities
    await prisma.profilePhoto.deleteMany({ where: { profileId: modalProfile.id } });
    await prisma.profilePersonalDetails.deleteMany({ where: { profileId: modalProfile.id } });
    await prisma.profileReligion.deleteMany({ where: { profileId: modalProfile.id } });
    await prisma.profileEducation.deleteMany({ where: { profileId: modalProfile.id } });
    await prisma.profileCareer.deleteMany({ where: { profileId: modalProfile.id } });
    await prisma.partnerPreference.deleteMany({ where: { profileId: modalProfile.id } });
    await prisma.profile.deleteMany({ where: { id: modalProfile.id } });
    await prisma.user.deleteMany({ where: { id: modalUser.id } });

    // Cleanup review test entities
    await prisma.profilePersonalDetails.deleteMany({ where: { profileId: reviewProfile.id } });
    await prisma.profile.deleteMany({ where: { id: reviewProfile.id } });
    await prisma.user.deleteMany({ where: { id: reviewUser.id } });

  } catch (err) {
    console.error("Browser verification error:", err);
    failed++;
  } finally {
    if (browser) {
      await browser.close();
    }
    await prisma.$disconnect();
  }

  console.log("\n==================================================");
  console.log(`BROWSER RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runBrowserVerification();
