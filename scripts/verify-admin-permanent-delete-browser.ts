import puppeteer from "puppeteer-core";
import { PrismaClient, UserRole, UserStatus, AccountActivationStatus, ProfileCreatedFor, ProfileStatus } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const SCREENSHOTS_DIR = path.resolve(__dirname, "../screenshots/admin_permanent_delete");
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
  console.log("MANGLAM MATRIMONY — ADMIN PERMANENT ACCOUNT DELETION BROWSER VERIFICATION");
  console.log("==================================================");

  const timestamp = Date.now();
  const desktopCandidateEmail = `candidate.desktop.delete.${timestamp}@manglam.test`;
  const mobileCandidateEmail = `candidate.mobile.delete.${timestamp}@manglam.test`;

  // Pre-seed 2 candidate users
  console.log("[SETUP] Pre-seeding candidate users for browser test...");
  const defaultLang = await prisma.language.findFirst();
  assert(Boolean(defaultLang), "Default language exists in DB");

  const desktopUser = await prisma.user.create({
    data: {
      email: desktopCandidateEmail,
      phone: `+9198${String(timestamp).slice(-8)}`,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      activationStatus: AccountActivationStatus.ACTIVE,
      profile: {
        create: {
          profileCreatedFor: ProfileCreatedFor.MYSELF,
          profileStatus: ProfileStatus.ACTIVE,
          completionPercentage: 85,
          personalDetails: {
            create: {
              firstName: "Aarav",
              lastName: "Sharma",
              gender: "MALE",
              dateOfBirth: new Date("1994-06-12"),
              maritalStatus: "NEVER_MARRIED",
              heightCm: 176,
              motherTongueId: defaultLang!.id,
              city: "Jaipur",
              state: "Rajasthan",
            },
          },
        },
      },
    },
    include: { profile: true },
  });

  const mobileUser = await prisma.user.create({
    data: {
      email: mobileCandidateEmail,
      phone: `+9197${String(timestamp).slice(-8)}`,
      role: UserRole.USER,
      status: UserStatus.SUSPENDED,
      activationStatus: AccountActivationStatus.ACTIVE,
      profile: {
        create: {
          profileCreatedFor: ProfileCreatedFor.MYSELF,
          profileStatus: ProfileStatus.INCOMPLETE,
          completionPercentage: 60,
          personalDetails: {
            create: {
              firstName: "Diya",
              lastName: "Patel",
              gender: "FEMALE",
              dateOfBirth: new Date("1996-03-25"),
              maritalStatus: "NEVER_MARRIED",
              heightCm: 162,
              motherTongueId: defaultLang!.id,
              city: "Ahmedabad",
              state: "Gujarat",
            },
          },
        },
      },
    },
    include: { profile: true },
  });

  // Launch browser with Chrome executable
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1440,900"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // 1. Admin Login
    console.log("\n[STEP 1: Admin Login]");
    await page.goto("http://localhost:3000/admin/login", { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', "admin@gmail.com");
    await page.type('input[type="password"]', "admin123@");
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle2" });
    assert(page.url().includes("/admin"), "Admin successfully logged in");

    // 2. Navigate to /admin/users
    console.log("\n[STEP 2: Navigate to Admin Users page]");
    await page.goto("http://localhost:3000/admin/users", { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 1500));

    // Search for desktop candidate user
    console.log("  Searching for desktop candidate user...");
    await page.waitForSelector("#admin-users-search-input", { timeout: 5000 });
    await page.type("#admin-users-search-input", desktopCandidateEmail);
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 1500));

    // Open candidate user detail modal using deterministic ID
    console.log("\n[STEP 3: Open Candidate User Detail Modal]");
    const viewButtonSelector = `#admin-user-action-view-${desktopUser.id}`;
    await page.waitForSelector(viewButtonSelector, { timeout: 5000 });
    await page.click(viewButtonSelector);
    await new Promise((r) => setTimeout(r, 1200));

    // Screenshot 1: Modal opened with user details
    const ss1 = path.join(SCREENSHOTS_DIR, "01_user_detail_modal_with_danger_zone.png");
    await page.screenshot({ path: ss1, fullPage: false });
    copyToArtifacts("01_user_detail_modal_with_danger_zone.png");

    // Scroll to Danger Zone
    console.log("\n[STEP 4: Inspect Danger Zone Section]");
    await page.evaluate(() => {
      const dangerBtn = document.getElementById("btn-open-delete-modal");
      if (dangerBtn) {
        dangerBtn.scrollIntoView({ behavior: "instant", block: "center" });
      }
    });
    await new Promise((r) => setTimeout(r, 500));

    const ss2 = path.join(SCREENSHOTS_DIR, "02_danger_zone_section.png");
    await page.screenshot({ path: ss2, fullPage: false });
    copyToArtifacts("02_danger_zone_section.png");

    // Click "Delete Account" button
    console.log("\n[STEP 5: Open Permanent Delete Confirmation Modal]");
    await page.click("#btn-open-delete-modal");
    await new Promise((r) => setTimeout(r, 600));

    const ss3 = path.join(SCREENSHOTS_DIR, "03_delete_confirmation_modal_opened.png");
    await page.screenshot({ path: ss3, fullPage: false });
    copyToArtifacts("03_delete_confirmation_modal_opened.png");

    // Verify Delete Permanently button is disabled initially
    const isInitiallyDisabled = await page.evaluate(() => {
      const btn = document.getElementById("btn-confirm-permanent-delete") as HTMLButtonElement;
      return btn ? btn.disabled : false;
    });
    assert(isInitiallyDisabled, "Delete Permanently button is initially DISABLED");

    // Type lowercase "delete"
    console.log("\n[STEP 6: Test strict confirmation input safeguards]");
    await page.type("#confirm-delete-input", "delete");
    await new Promise((r) => setTimeout(r, 300));

    const isStillDisabled = await page.evaluate(() => {
      const btn = document.getElementById("btn-confirm-permanent-delete") as HTMLButtonElement;
      return btn ? btn.disabled : false;
    });
    assert(isStillDisabled, "Button remains DISABLED with lowercase 'delete'");

    const ss4 = path.join(SCREENSHOTS_DIR, "04_lowercase_delete_disabled.png");
    await page.screenshot({ path: ss4, fullPage: false });
    copyToArtifacts("04_lowercase_delete_disabled.png");

    // Clear and type exact "DELETE"
    await page.evaluate(() => {
      const input = document.getElementById("confirm-delete-input") as HTMLInputElement;
      if (input) {
        input.value = "";
      }
    });
    await page.type("#confirm-delete-input", "DELETE");
    await new Promise((r) => setTimeout(r, 300));

    const isNowEnabled = await page.evaluate(() => {
      const btn = document.getElementById("btn-confirm-permanent-delete") as HTMLButtonElement;
      return btn ? !btn.disabled : false;
    });
    assert(isNowEnabled, "Button is now ENABLED with exact 'DELETE'");

    const ss5 = path.join(SCREENSHOTS_DIR, "05_exact_DELETE_button_enabled.png");
    await page.screenshot({ path: ss5, fullPage: false });
    copyToArtifacts("05_exact_DELETE_button_enabled.png");

    // Click "Delete Permanently"
    console.log("\n[STEP 7: Execute Permanent Account Deletion]");
    await page.click("#btn-confirm-permanent-delete");
    await new Promise((r) => setTimeout(r, 2000));

    // Verify success toast and modal closed
    const ss6 = path.join(SCREENSHOTS_DIR, "06_deletion_success_toast_table_updated.png");
    await page.screenshot({ path: ss6, fullPage: false });
    copyToArtifacts("06_deletion_success_toast_table_updated.png");

    const toastText = await page.evaluate(() => {
      const toast = document.getElementById("admin-user-success-toast");
      return toast ? toast.textContent?.trim() : null;
    });
    assert(Boolean(toastText && toastText.includes("User account permanently deleted")), "Success notification toast displayed");

    // Verify deleted user no longer in table
    const tableContainsDeleted = await page.evaluate((email) => {
      return document.body.textContent?.includes(email) || false;
    }, desktopCandidateEmail);
    assert(!tableContainsDeleted, "Deleted user immediately removed from active users table without full page reload");

    // Search specifically for deleted user
    console.log("\n[STEP 8: Search for deleted user to confirm absence]");
    await page.evaluate(() => {
      const input = document.getElementById("admin-users-search-input") as HTMLInputElement;
      if (input) input.value = "";
    });
    await page.type("#admin-users-search-input", desktopCandidateEmail);
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 1500));

    const ss7 = path.join(SCREENSHOTS_DIR, "07_search_deleted_user_not_found.png");
    await page.screenshot({ path: ss7, fullPage: false });
    copyToArtifacts("07_search_deleted_user_not_found.png");

    // Verify DB confirms permanent removal
    const dbDeleted = await prisma.user.findUnique({ where: { id: desktopUser.id } });
    assert(dbDeleted === null, "Confirmed: user database row completely removed");

    // ========================================================================
    // MOBILE VIEWPORT VERIFICATION (390px)
    // ========================================================================
    console.log("\n[STEP 9: Mobile Viewport Verification (390px)]");
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto("http://localhost:3000/admin/users", { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 1500));

    // Search for mobile candidate user
    await page.waitForSelector("#admin-users-search-input", { timeout: 5000 });
    await page.type("#admin-users-search-input", mobileCandidateEmail);
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 1500));

    // Click mobile view button
    const mobileViewBtn = `#admin-user-action-view-mobile-${mobileUser.id}`;
    await page.waitForSelector(mobileViewBtn, { timeout: 5000 });
    await page.click(mobileViewBtn);
    await new Promise((r) => setTimeout(r, 1200));

    // Scroll to mobile Danger Zone
    await page.evaluate(() => {
      const btn = document.getElementById("btn-open-delete-modal");
      if (btn) btn.scrollIntoView({ behavior: "instant", block: "center" });
    });
    await new Promise((r) => setTimeout(r, 500));

    // Verify no horizontal overflow in modal
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    assert(!hasHorizontalOverflow, "No horizontal overflow detected at 390px");

    const ss8 = path.join(SCREENSHOTS_DIR, "08_mobile_danger_zone_390px.png");
    await page.screenshot({ path: ss8, fullPage: false });
    copyToArtifacts("08_mobile_danger_zone_390px.png");

    // Open confirmation modal on mobile
    await page.click("#btn-open-delete-modal");
    await new Promise((r) => setTimeout(r, 500));

    await page.type("#confirm-delete-input", "DELETE");
    await new Promise((r) => setTimeout(r, 300));

    const ss9 = path.join(SCREENSHOTS_DIR, "09_mobile_confirmation_modal_390px.png");
    await page.screenshot({ path: ss9, fullPage: false });
    copyToArtifacts("09_mobile_confirmation_modal_390px.png");

    // Execute delete on mobile
    await page.click("#btn-confirm-permanent-delete");
    await new Promise((r) => setTimeout(r, 2000));

    const ss10 = path.join(SCREENSHOTS_DIR, "10_mobile_success_state_390px.png");
    await page.screenshot({ path: ss10, fullPage: false });
    copyToArtifacts("10_mobile_success_state_390px.png");

    const mobileDbDeleted = await prisma.user.findUnique({ where: { id: mobileUser.id } });
    assert(mobileDbDeleted === null, "Confirmed: mobile user row completely removed from DB");

    console.log("\n==================================================");
    console.log("BROWSER VERIFICATION COMPLETED SUCCESSFULLY!");
    console.log("==================================================");
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

runBrowserVerification()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ BROWSER VERIFICATION FAILED:", err);
    process.exit(1);
  });
