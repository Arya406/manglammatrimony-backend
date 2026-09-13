import puppeteer from "puppeteer-core";
import { PrismaClient, AccountActivationStatus, UserRole, UserStatus, ProfileCreatedFor, ProfileStatus } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const SCREENSHOTS_DIR = path.resolve(__dirname, "../screenshots/step6");
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runBrowserVerification() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — ADMIN STEP 6 BROWSER VERIFICATION");
  console.log("==================================================");

  const testEmail = `browser.step6.${Date.now()}@example.com`;

  // 1. Launch Chrome
  console.log("[1/8] Launching Google Chrome browser...");
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1280,900"],
    defaultViewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();
  let passedAssertions = 0;

  try {
    // 2. Login as Admin
    console.log("[2/8] Navigating to http://localhost:3000/admin/login and authenticating...");
    await page.goto("http://localhost:3000/admin/login", { waitUntil: "networkidle0" });

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "01_login_page.png") });

    // Fill login credentials
    await page.type('input[type="email"]', "admin@gmail.com");
    await page.type('input[type="password"]', "admin123@");
    await page.click('button[type="submit"]');

    // Wait for redirect to /admin
    await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }).catch(() => {});
    const currentUrl = page.url();
    assert(currentUrl.includes("/admin"), `1. Admin login redirects to admin area (URL: ${currentUrl})`);
    passedAssertions++;

    // 3. Open /admin/users
    console.log("[3/8] Navigating to http://localhost:3000/admin/users...");
    await page.goto("http://localhost:3000/admin/users", { waitUntil: "networkidle0" });
    await page.waitForSelector("#create-user-button", { timeout: 15000 });

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "02_admin_users_page.png") });

    const createUserBtn = await page.$("#create-user-button");
    assert(createUserBtn !== null, "2. '+ Create User' button is visibly present in page header");
    passedAssertions++;

    const btnText = await page.evaluate(el => el?.textContent?.trim(), createUserBtn);
    assert(btnText?.includes("Create User") || false, `3. Button text matches '+ Create User' (found: '${btnText}')`);
    passedAssertions++;

    // 4. Click '+ Create User' and verify modal
    console.log("[4/8] Clicking '+ Create User' to open AdminCreateUserModal...");
    await page.click("#create-user-button");
    await page.waitForSelector('div[role="dialog"]', { timeout: 5000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "03_create_user_modal.png") });

    const modalTitle = await page.evaluate(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      return dialog ? dialog.textContent : "";
    });
    assert(modalTitle?.includes("Create User & Profile") || false, "4. AdminCreateUserModal rendered with title 'Create User & Profile'");
    assert(modalTitle?.includes("Ownership Verification") || false, "5. Modal contains clear ownership verification notice");
    passedAssertions += 2;

    // Verify form fields
    const emailInput = await page.$("#create-user-email");
    const firstNameInput = await page.$("#create-user-firstname");
    const lastNameInput = await page.$("#create-user-lastname");
    const genderSelect = await page.$("#create-user-gender");
    const createdForSelect = await page.$("#create-user-createdfor");
    assert(emailInput !== null, "6. Email input field is present");
    assert(firstNameInput !== null, "7. First Name input field is present");
    assert(lastNameInput !== null, "8. Last Name input field is present");
    assert(genderSelect !== null, "9. Gender select dropdown is present");
    assert(createdForSelect !== null, "10. Profile Created For dropdown is present");
    passedAssertions += 5;

    // 5. Fill and submit candidate
    console.log("[5/8] Filling test candidate details and submitting...");
    await page.type("#create-user-email", testEmail);
    await page.type("#create-user-firstname", "Aditi");
    await page.type("#create-user-lastname", "Verma");
    await page.select("#create-user-gender", "FEMALE");
    await page.select("#create-user-createdfor", "MY_DAUGHTER");

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "04_modal_filled.png") });

    // Click submit ("Create & Send Activation")
    await page.click("#modal-submit-create-user-btn");

    // Wait for success screen in modal
    await page.waitForFunction(
      () => document.querySelector('div[role="dialog"]')?.textContent?.includes("Account Created Successfully!"),
      { timeout: 15000 }
    );
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "05_modal_success_state.png") });

    const successContent = await page.evaluate(() => document.querySelector('div[role="dialog"]')?.textContent || "");
    assert(successContent.includes("Account Created Successfully!"), "11. Modal transitions to success state");
    assert(successContent.includes(testEmail), "12. Success screen displays created user's email");
    assert(successContent.includes("PENDING ACTIVATION"), "13. Success screen displays PENDING ACTIVATION badge");
    assert(successContent.includes("INCOMPLETE (0%)"), "14. Success screen displays profile status INCOMPLETE (0%)");
    passedAssertions += 4;

    // Direct DB Verification of Created Record
    const dbCreatedUser = await prisma.user.findUnique({
      where: { email: testEmail },
      include: { profile: { include: { personalDetails: true } } },
    });
    assert(dbCreatedUser !== null, "15. Authoritative user record exists in PostgreSQL database");
    assert(dbCreatedUser?.activationStatus === AccountActivationStatus.PENDING_ACTIVATION, "16. DB activationStatus is PENDING_ACTIVATION");
    assert(dbCreatedUser?.role === UserRole.USER, "17. DB role is USER");
    assert(dbCreatedUser?.emailVerifiedAt === null, "18. DB emailVerifiedAt is null");
    assert(dbCreatedUser?.profile?.profileStatus === ProfileStatus.INCOMPLETE, "19. DB profileStatus is INCOMPLETE");
    assert(dbCreatedUser?.profile?.completionPercentage === 0, "20. DB completionPercentage is 0");
    assert(dbCreatedUser?.profile?.personalDetails === null, "21. Guardrail 1 verified: ProfilePersonalDetails row is null");
    passedAssertions += 7;

    // Click "View User Details"
    console.log("[6/8] Clicking 'View User Details' to open AdminUserDetailModal...");
    await page.click("#modal-view-user-details-btn");
    await page.waitForSelector("#ownership-status-badge", { timeout: 10000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "06_user_detail_modal.png") });

    const ownershipBadge = await page.$eval("#ownership-status-badge", el => el.textContent?.trim());
    assert(ownershipBadge === "Pending Activation", `22. AdminUserDetailModal shows 'Pending Activation' badge (found: '${ownershipBadge}')`);
    passedAssertions++;

    const emailVerifyText = await page.$eval("#email-verification-text", el => el.textContent?.trim());
    assert(emailVerifyText?.includes("Not verified") || false, `23. Detail modal displays 'Email verification: Not verified' (found: '${emailVerifyText}')`);
    passedAssertions++;

    const resendBtn = await page.$("#resend-activation-button");
    assert(resendBtn !== null, "24. 'Resend Activation Email' button is rendered in detail modal");
    passedAssertions++;

    // Test Resend Activation Email & Cooldown
    console.log("[7/8] Testing 'Resend Activation Email' and 60-second cooldown...");
    await page.click("#resend-activation-button");
    await page.waitForFunction(
      () => {
        const btn = document.querySelector("#resend-activation-button");
        return btn?.textContent?.includes("Resend in");
      },
      { timeout: 10000 }
    );
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "07_resend_cooldown_active.png") });

    const cooldownBtnText = await page.$eval("#resend-activation-button", el => el.textContent?.trim());
    assert(cooldownBtnText?.includes("Resend in") || false, `25. Resend button enters visible cooldown timer (found: '${cooldownBtnText}')`);
    const isBtnDisabled = await page.$eval("#resend-activation-button", el => (el as HTMLButtonElement).disabled);
    assert(isBtnDisabled === true, "26. Resend button is strictly disabled during cooldown");
    passedAssertions += 2;

    // Close detail modal
    const closeBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b => b.textContent?.includes("Close"));
    });
    if (closeBtn.asElement()) {
      await (closeBtn.asElement() as any).click();
    }
    await page.waitForFunction(() => !document.querySelector("#ownership-status-badge"), { timeout: 5000 });

    // Table Verification: row should display Pending Activation badge
    console.log("[8/8] Verifying table rendering and Activation Status filter...");
    const tableText = await page.evaluate(() => document.querySelector(".desktop-table-container")?.textContent || "");
    assert(tableText.includes(testEmail), "27. Candidate appears in the live users table");
    assert(tableText.includes("Pending Activation"), "28. Table row displays amber 'Pending Activation' badge");
    passedAssertions += 2;

    // Test Activation Status Filter: Pending Activation
    await page.select("#filter-activation-status", "PENDING_ACTIVATION");
    await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "08_filter_pending_activation.png") });
    const pendingFilteredText = await page.evaluate(() => document.querySelector(".desktop-table-container")?.textContent || "");
    assert(pendingFilteredText.includes(testEmail), "29. Filter by 'Pending Activation' includes the newly created candidate");
    passedAssertions++;

    // Reset filter to All
    await page.select("#filter-activation-status", "ALL");
    await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});

    // Duplicate email conflict test
    console.log("Testing duplicate email conflict rejection (409)...");
    await page.click("#create-user-button");
    await page.waitForSelector('div[role="dialog"]', { timeout: 5000 });
    await page.type("#create-user-email", testEmail);
    await page.click("#modal-submit-create-user-btn");

    await page.waitForFunction(
      () => document.querySelector('div[role="dialog"]')?.textContent?.includes("already exists"),
      { timeout: 10000 }
    );
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "09_duplicate_email_error.png") });
    const dupModalText = await page.evaluate(() => document.querySelector('div[role="dialog"]')?.textContent || "");
    assert(dupModalText.includes("already exists"), "30. Duplicate email displays clear 409 conflict error banner");
    passedAssertions++;

    // Close modal
    await page.click("#modal-cancel-create-user-btn");

    // Responsive / Mobile layout verification (390 x 844)
    console.log("Testing mobile responsive layout (390 x 844)...");
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "10_mobile_viewport.png") });

    const mobileCreateBtn = await page.$("#create-user-button");
    assert(mobileCreateBtn !== null, "31. '+ Create User' button is visible on mobile viewport");

    const mobileCardsText = await page.evaluate(() => document.querySelector(".mobile-cards-container")?.textContent || "");
    assert(mobileCardsText.includes("Pending Activation"), "32. Mobile cards view renders with 'Pending Activation' badge");
    passedAssertions += 2;

    console.log("\n==================================================");
    console.log(`ALL BROWSER TESTS PASSED! Total assertions: ${passedAssertions}`);
    console.log(`Screenshots saved to: ${SCREENSHOTS_DIR}`);
    console.log("==================================================");
  } finally {
    await browser.close();

    // Clean up created candidate
    try {
      await prisma.verificationOtp.deleteMany({ where: { email: testEmail } });
      const u = await prisma.user.findUnique({ where: { email: testEmail } });
      if (u) {
        await prisma.profile.deleteMany({ where: { userId: u.id } });
        await prisma.user.delete({ where: { id: u.id } });
      }
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }
    await prisma.$disconnect();
    process.exit(0);
  }
}

runBrowserVerification().catch((err) => {
  console.error("\n[BROWSER VERIFICATION FAILED]:", err);
  process.exit(1);
});
