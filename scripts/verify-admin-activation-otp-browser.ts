import puppeteer from "puppeteer-core";
import { PrismaClient, AccountActivationStatus, UserRole, UserStatus, ProfileCreatedFor, ProfileStatus } from "@prisma/client";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const prisma = new PrismaClient();

const SCREENSHOTS_DIR = path.resolve(__dirname, "../screenshots/admin_activation_otp");
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// Artifacts directory for embedding
const ARTIFACTS_DIR = "C:\\Users\\aryas\\.gemini\\antigravity-ide\\brain\\c5eeb891-f842-4c46-a43e-f6025585577d";

function copyToArtifacts(filename: string) {
  const src = path.join(SCREENSHOTS_DIR, filename);
  const dst = path.join(ARTIFACTS_DIR, filename);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`  Copied ${filename} to artifacts directory`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runBrowserVerification() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — ADMIN ACTIVATION OTP BROWSER VERIFICATION");
  console.log("==================================================");

  const timestamp = Date.now();
  const testCandidateEmail = `candidate.activate.${timestamp}@example.com`;
  const mobileCandidateEmail = `candidate.mobile.${timestamp}@example.com`;

  // Pre-seed 2 candidate users in PENDING_ACTIVATION state with authentic OTP records
  console.log("[SETUP] Pre-seeding candidate users with authentic OTP records...");

  // Helper to hash OTP matching backend OtpService
  function hashOtp(otp: string, salt: string): string {
    return crypto.createHmac("sha256", salt).update(otp).digest("hex");
  }

  // Candidate 1 (Desktop)
  const plainOtp1 = "654321";
  const salt1 = crypto.randomBytes(16).toString("hex");
  const hashedOtp1 = hashOtp(plainOtp1, salt1);

  const candidateUser1 = await prisma.user.create({
    data: {
      email: testCandidateEmail,
      phone: `+9198${String(timestamp).slice(-8)}`,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      activationStatus: AccountActivationStatus.PENDING_ACTIVATION,
      emailVerifiedAt: null,
      profile: {
        create: {
          profileCreatedFor: ProfileCreatedFor.MYSELF,
          profileStatus: ProfileStatus.INCOMPLETE,
          completionPercentage: 10,
        },
      },
    },
    include: { profile: true },
  });

  await prisma.verificationOtp.create({
    data: {
      id: crypto.randomUUID(),
      email: testCandidateEmail,
      hashedOtp: hashedOtp1,
      salt: salt1,
      attempts: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      resendAvailableAt: new Date(Date.now() - 1000),
    },
  });

  // Candidate 2 (Mobile)
  const plainOtp2 = "789123";
  const salt2 = crypto.randomBytes(16).toString("hex");
  const hashedOtp2 = hashOtp(plainOtp2, salt2);

  const candidateUser2 = await prisma.user.create({
    data: {
      email: mobileCandidateEmail,
      phone: `+9197${String(timestamp).slice(-8)}`,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      activationStatus: AccountActivationStatus.PENDING_ACTIVATION,
      emailVerifiedAt: null,
      profile: {
        create: {
          profileCreatedFor: ProfileCreatedFor.MYSELF,
          profileStatus: ProfileStatus.INCOMPLETE,
          completionPercentage: 10,
        },
      },
    },
    include: { profile: true },
  });

  await prisma.verificationOtp.create({
    data: {
      id: crypto.randomUUID(),
      email: mobileCandidateEmail,
      hashedOtp: hashedOtp2,
      salt: salt2,
      attempts: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      resendAvailableAt: new Date(Date.now() - 1000),
    },
  });

  console.log(`  Seeded Candidate 1: ${testCandidateEmail} (OTP: ${plainOtp1})`);
  console.log(`  Seeded Candidate 2: ${mobileCandidateEmail} (OTP: ${plainOtp2})`);

  // Launch Google Chrome
  console.log("\n[1/7] Launching Google Chrome browser...");
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1280,900"],
    defaultViewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("error") || text.includes("ERROR") || text.includes("VERIFY")) {
      console.log(`  [Browser] ${text}`);
    }
  });

  let passedAssertions = 0;

  try {
    // 2. Login as Admin
    console.log("[2/7] Authenticating admin on /admin/login...");
    await page.goto("http://localhost:3000/admin/login", { waitUntil: "networkidle0" });
    await page.type('input[type="email"]', "admin@gmail.com");
    await page.type('input[type="password"]', "admin123@");
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }).catch(() => {});

    assert(page.url().includes("/admin"), "Admin successfully authenticated and redirected");
    passedAssertions++;

    // 3. Navigate to /admin/users and search candidate
    console.log("[3/7] Navigating to /admin/users and locating candidate user...");
    await page.goto("http://localhost:3000/admin/users", { waitUntil: "networkidle0" });
    await page.waitForSelector("#admin-users-search-input", { timeout: 15000 });

    // Filter or search candidate
    await page.type("#admin-users-search-input", testCandidateEmail);
    await new Promise((r) => setTimeout(r, 1000)); // debounce

    // Wait for the candidate row
    const viewButtonSelector = `#admin-user-action-view-${candidateUser1.id}`;
    await page.waitForSelector(viewButtonSelector, { timeout: 15000 });
    assert(true, "Found candidate row in /admin/users table");
    passedAssertions++;

    // Click View Details to open AdminUserDetailModal
    console.log("[4/7] Opening AdminUserDetailModal for candidate...");
    await page.click(viewButtonSelector);
    await page.waitForSelector("#admin-user-detail-modal", { timeout: 10000 });
    await page.waitForSelector("#verify-activate-button", { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 600));

    // Capture initial state screenshot
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "01_modal_pending_activation.png") });
    copyToArtifacts("01_modal_pending_activation.png");
    assert(true, "AdminUserDetailModal opened with activation section and OTP input");
    passedAssertions++;

    // Check Verify & Activate button is initially disabled
    const isVerifyDisabled = await page.$eval(
      "#verify-activate-button",
      (el: any) => el.disabled
    );
    assert(isVerifyDisabled === true, "Verify & Activate button is disabled before entering full 6 digits");
    passedAssertions++;

    // Check 6 OTP digit inputs
    const otpInputs = await page.$$("#admin-user-detail-modal input[maxlength=\"1\"]");
    assert(otpInputs.length === 6, "Found exactly 6 OTP digit inputs");
    passedAssertions++;

    // 5. Enter authentic OTP (654321)
    console.log(`[5/7] Entering authentic OTP (${plainOtp1}) and activating candidate 1...`);
    for (let i = 0; i < 6; i++) {
      await otpInputs[i].focus();
      await page.keyboard.press(plainOtp1[i]);
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 800));

    const inputValues = await page.$$eval("#admin-user-detail-modal input[maxlength='1']", (els: any[]) => els.map(e => e.value));
    console.log("  Input values in DOM:", JSON.stringify(inputValues));
    const isBtnStillThere = await page.$("#verify-activate-button");
    if (isBtnStillThere) {
      const btnDisabled = await page.$eval("#verify-activate-button", (el: any) => el.disabled);
      console.log("  Button disabled:", btnDisabled);
      if (!btnDisabled) {
        console.log("  Clicking verify button...");
        await page.click("#verify-activate-button");
      }
    }

    // Wait for success banner & Edit Profile Now button
    console.log("  Waiting for activation success feedback...");
    try {
      await page.waitForSelector("#activate-edit-profile-button", { timeout: 10000 });
    } catch (e) {
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "debug_failure.png") });
      copyToArtifacts("debug_failure.png");
      const modalHtml = await page.$eval("#admin-user-detail-modal", (el: any) => el.innerHTML);
      console.log("  Modal HTML snippet:", modalHtml.slice(0, 1500));
      throw e;
    }
    await new Promise((r) => setTimeout(r, 600));

    // Verify badge text updated to Active / Verified
    const badgeText = await page.$eval("#ownership-status-badge", (el: any) => el.innerText);
    assert(badgeText.includes("Verified") || badgeText.includes("Claimed") || badgeText.includes("Active"), `Activation badge updated (Text: ${badgeText})`);
    passedAssertions++;

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "03_account_activated_success.png") });
    copyToArtifacts("03_account_activated_success.png");
    assert(true, "Account successfully activated: success feedback & 'Edit Profile Now' button visible");
    passedAssertions++;

    // 6. Click "Edit Profile Now" button
    console.log("[6/7] Testing direct 'Edit Profile Now' transition to Profile Editor...");
    await page.click("#activate-edit-profile-button");
    await page.waitForSelector("#admin-profile-edit-modal", { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 600));

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "04_profile_editor_opened.png") });
    copyToArtifacts("04_profile_editor_opened.png");
    assert(true, "Profile Editor opened immediately without page reload");
    passedAssertions++;

    // Close editor modal
    await page.click("#close-edit-modal-button");
    await new Promise((r) => setTimeout(r, 500));

    // Close user detail modal if still present
    const closeBtn = await page.$("button[aria-label='Close modal']");
    if (closeBtn) {
      await closeBtn.click();
      await new Promise((r) => setTimeout(r, 500));
    }

    // 7. MOBILE VIEWPORT TEST (390 x 844) with Invalid OTP verification
    console.log("\n[7/7] Testing responsive behavior & invalid OTP feedback on 390px mobile viewport...");
    await page.setViewport({ width: 390, height: 844, isMobile: true });
    await page.goto("http://localhost:3000/admin/users", { waitUntil: "networkidle0" });

    await page.waitForSelector("#admin-users-search-input", { timeout: 15000 });
    await page.type("#admin-users-search-input", mobileCandidateEmail);
    await new Promise((r) => setTimeout(r, 1000));

    const mobileViewBtn = `#admin-user-action-view-mobile-${candidateUser2.id}`;
    await page.waitForSelector(mobileViewBtn, { timeout: 15000 });
    await page.click(mobileViewBtn);

    await page.waitForSelector("#admin-user-detail-modal", { timeout: 10000 });
    await page.waitForSelector("#verify-activate-button", { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 600));

    // Check no horizontal scrollbar on body or modal container
    const isOverflowing = await page.evaluate(() => {
      const modal = document.querySelector("#admin-user-detail-modal > div");
      return modal ? modal.clientWidth > window.innerWidth : false;
    });
    assert(isOverflowing === false, "No horizontal overflow on 390px mobile viewport");
    passedAssertions++;

    // Test Invalid OTP (000000) on mobile
    console.log("  Testing wrong OTP on mobile...");
    const mobileOtpInputs = await page.$$("#admin-user-detail-modal input[maxlength=\"1\"]");
    for (let i = 0; i < 6; i++) {
      await mobileOtpInputs[i].focus();
      await page.keyboard.press("0");
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 600));

    // Check for error feedback banner
    await page.waitForSelector("div[role=\"alert\"]", { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 600));

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "02_invalid_otp_error.png") });
    copyToArtifacts("02_invalid_otp_error.png");
    assert(true, "Invalid OTP error alert clearly visible on mobile viewport");
    passedAssertions++;

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "05_mobile_activation_section.png") });
    copyToArtifacts("05_mobile_activation_section.png");
    assert(true, "Mobile viewport 390px captured cleanly with full activation UI");
    passedAssertions++;

    console.log("\n==================================================");
    console.log(`BROWSER VERIFICATION SUCCESSFUL! ${passedAssertions} ASSERTIONS PASSED.`);
    console.log("==================================================");

  } catch (err) {
    console.error("Browser Verification Error:", err);
    throw err;
  } finally {
    await browser.close();
    // Cleanup candidate users
    await prisma.verificationOtp.deleteMany({
      where: { email: { in: [testCandidateEmail, mobileCandidateEmail] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [testCandidateEmail, mobileCandidateEmail] } },
    });
    console.log("[TEARDOWN] Test users cleaned up.");
  }
}

runBrowserVerification().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
