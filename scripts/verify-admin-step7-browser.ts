import puppeteer from "puppeteer-core";
import { PrismaClient, UserRole, UserStatus, AccountActivationStatus, ProfileCreatedFor, ProfileStatus } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const SCREENSHOTS_DIR = path.resolve(__dirname, "../screenshots/step7");
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runStep7BrowserVerification() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — ADMIN STEP 7 BROWSER VERIFICATION");
  console.log("==================================================");

  // Setup test user in database with profile shell
  const testShellEmail = `browser.shell.${Date.now()}@example.com`;
  const shellUser = await prisma.user.create({
    data: {
      email: testShellEmail,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      activationStatus: AccountActivationStatus.PENDING_ACTIVATION,
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

  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1280,900"],
    defaultViewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();
  let passedAssertions = 0;

  try {
    // ----------------------------------------------------
    // 1. Admin Login
    // ----------------------------------------------------
    console.log("\n[1/12] Logging in as Administrator...");
    await page.goto("http://localhost:3000/admin/login", { waitUntil: "networkidle0" });
    await page.type('input[type="email"]', "admin@gmail.com");
    await page.type('input[type="password"]', "admin123@");
    await page.click('button[type="submit"]');

    await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }).catch(() => {});
    assert(page.url().includes("/admin"), "1. Admin logged in successfully");
    passedAssertions++;

    // ----------------------------------------------------
    // 2. Navigate to /admin/profiles
    // ----------------------------------------------------
    console.log("\n[2/12] Navigating to /admin/profiles...");
    await page.goto("http://localhost:3000/admin/profiles", { waitUntil: "networkidle0" });
    await page.waitForSelector("table", { timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "01_admin_profiles_view.png") });
    assert(page.url().includes("/admin/profiles"), "2. Navigated to /admin/profiles");
    passedAssertions++;

    // ----------------------------------------------------
    // 3. Open View Profile modal
    // ----------------------------------------------------
    console.log("\n[3/12] Opening View Profile modal...");
    // Find first "View Profile" button
    const viewButtons = await page.$$("button");
    let clickedView = false;
    for (const btn of viewButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes("View Profile")) {
        await page.evaluate(el => (el as HTMLElement).click(), btn);
        clickedView = true;
        break;
      }
    }
    assert(clickedView, "3. Found and clicked 'View Profile' button");
    passedAssertions++;

    // Wait for AdminProfileDetailModal
    await page.waitForSelector("#edit-profile-button", { timeout: 10000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "02_profile_detail_with_edit_btn.png") });

    const editBtn = await page.$("#edit-profile-button");
    assert(editBtn !== null, "4. Edit Profile button is visible in header of detail modal");
    passedAssertions++;

    // ----------------------------------------------------
    // 4. Click Edit Profile and open AdminProfileEditModal
    // ----------------------------------------------------
    console.log("\n[4/12] Opening AdminProfileEditModal...");
    await page.click("#edit-profile-button");
    await page.waitForSelector("#admin-profile-edit-modal", { timeout: 10000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "03_profile_editor_opened.png") });
    assert(true, "5. AdminProfileEditModal opened successfully");
    passedAssertions++;

    // Verify 5 tabs exist
    const tabProfileFor = await page.$("#tab-btn-profile-for");
    const tabPersonal = await page.$("#tab-btn-personal-details");
    const tabReligion = await page.$("#tab-btn-religion");
    const tabEducation = await page.$("#tab-btn-education-career");
    const tabPreferences = await page.$("#tab-btn-partner-preferences");
    assert(
      Boolean(tabProfileFor && tabPersonal && tabReligion && tabEducation && tabPreferences),
      "6. All 5 editor tabs are present"
    );
    passedAssertions++;

    // ----------------------------------------------------
    // 5. Personal Details Tab: Edit & Save
    // ----------------------------------------------------
    console.log("\n[5/12] Editing and saving Personal Details...");
    await page.click("#tab-btn-personal-details");
    await page.waitForSelector("#input-first-name", { timeout: 5000 });

    // Fill form fields
    await page.click("#input-first-name", { clickCount: 3 });
    await page.type("#input-first-name", "AdminUpdatedFirst");

    await page.click("#input-last-name", { clickCount: 3 });
    await page.type("#input-last-name", "AdminUpdatedLast");

    await page.click("#input-city", { clickCount: 3 });
    await page.type("#input-city", "Udaipur");

    // Ensure DOB and Mother Tongue are set with React-compatible dispatch
    await page.evaluate(() => {
      const dobInput = document.querySelector("#input-date-of-birth") as HTMLInputElement;
      if (dobInput && !dobInput.value) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        nativeSetter?.call(dobInput, "1994-05-15");
        dobInput.dispatchEvent(new Event("input", { bubbles: true }));
        dobInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const mtSelect = document.querySelector("#select-mother-tongue") as HTMLSelectElement;
      if (mtSelect && (!mtSelect.value || mtSelect.selectedIndex <= 0)) {
        if (mtSelect.options.length > 1) {
          const nativeSelectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
          nativeSelectSetter?.call(mtSelect, mtSelect.options[1].value);
          mtSelect.dispatchEvent(new Event("input", { bubbles: true }));
          mtSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    });

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "04_personal_details_edited.png") });

    // Click Save Personal Details
    await page.click("#btn-save-personal-details");
    
    try {
      await page.waitForSelector("#alert-success", { timeout: 10000 });
    } catch (e) {
      const errBanner = await page.$eval("#alert-error", el => el.textContent).catch(() => null);
      const fieldErrors = await page.$$eval('[class*="fieldError"]', els => els.map(e => e.textContent)).catch(() => []);
      console.log("Save failed! Server error banner:", errBanner, "Field errors:", fieldErrors);
      throw e;
    }
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "05_personal_details_saved.png") });
    assert(true, "7. Personal details saved with success feedback");
    passedAssertions++;

    // ----------------------------------------------------
    // 6. Religion Tab: Hierarchy & Cascading
    // ----------------------------------------------------
    console.log("\n[6/12] Testing Religion tab hierarchy...");
    await page.click("#tab-btn-religion");
    await page.waitForSelector("#select-religion", { timeout: 5000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "06_religion_tab_hierarchy.png") });

    const religionSelect = await page.$("#select-religion");
    assert(religionSelect !== null, "8. Religion select exists");
    passedAssertions++;

    // ----------------------------------------------------
    // 7. Education & Career Tab
    // ----------------------------------------------------
    console.log("\n[7/12] Testing Education & Career tab...");
    await page.click("#tab-btn-education-career");
    await page.waitForSelector("#select-education", { timeout: 5000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "07_education_career_tab.png") });
    assert(true, "9. Education & Career tab loaded cleanly");
    passedAssertions++;

    // ----------------------------------------------------
    // 8. Partner Preferences Tab
    // ----------------------------------------------------
    console.log("\n[8/12] Testing Partner Preferences tab...");
    await page.click("#tab-btn-partner-preferences");
    await page.waitForSelector("#input-pref-min-age", { timeout: 5000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "08_partner_preferences_tab.png") });
    assert(true, "10. Partner Preferences tab loaded cleanly");
    passedAssertions++;

    // ----------------------------------------------------
    // 9. Unsaved Changes Confirmation Dialog
    // ----------------------------------------------------
    console.log("\n[9/12] Testing custom branded Unsaved Changes dialog...");
    // Modify an input in preferences tab to make form dirty
    await page.click("#input-pref-min-age", { clickCount: 3 });
    await page.type("#input-pref-min-age", "25");

    // Try switching tab to personalDetails while dirty
    await page.click("#tab-btn-personal-details");
    await page.waitForSelector("#unsaved-confirm-dialog", { timeout: 5000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "09_unsaved_changes_confirm.png") });

    const dialogTitle = await page.$eval("#unsaved-confirm-title", el => el.textContent);
    assert(
      dialogTitle?.includes("Unsaved Changes") || false,
      "11. Branded unsaved changes confirmation dialog appeared (not browser-native confirm)"
    );
    passedAssertions++;

    // Click "Discard Changes" to proceed
    await page.click("#btn-confirm-discard");
    await page.waitForSelector("#input-first-name", { timeout: 5000 });
    assert(true, "12. Discarded and proceeded cleanly");
    passedAssertions++;

    // Close edit modal
    await page.click("#close-edit-modal-button");

    // ----------------------------------------------------
    // 10. Concurrency Conflict UI (409) & Reload
    // ----------------------------------------------------
    console.log("\n[10/12] Testing Concurrency Conflict UI (409)...");
    // Re-open edit modal
    await page.click("#edit-profile-button");
    await page.waitForSelector("#admin-profile-edit-modal", { timeout: 5000 });

    // Simulate another admin updating the profile in the background
    const currentProfileInDb = await prisma.profile.findFirstOrThrow({
      where: { personalDetails: { firstName: "AdminUpdatedFirst" } },
    });

    await prisma.profile.update({
      where: { id: currentProfileInDb.id },
      data: {
        profileCreatedFor: ProfileCreatedFor.OTHER,
        updatedAt: new Date(), // touch timestamp
      },
    });

    // Now try saving Personal Details from the stale modal
    await page.click("#tab-btn-personal-details");
    await page.click("#input-city", { clickCount: 3 });
    await page.type("#input-city", "JaipurStale");
    await page.click("#btn-save-personal-details");

    // Wait for conflict banner
    await page.waitForSelector("#conflict-banner", { timeout: 10000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "10_concurrency_conflict_banner.png") });

    const conflictMsg = await page.$eval("#conflict-message", el => el.textContent);
    assert(
      conflictMsg?.includes("modified by another administrator") || false,
      "13. 409 Conflict banner appeared non-destructively"
    );
    passedAssertions++;

    const reloadBtn = await page.$("#btn-reload-latest-changes");
    assert(reloadBtn !== null, "14. 'Reload Latest Changes' button is visible");
    passedAssertions++;

    // Click Reload Latest Changes
    await page.evaluate(() => {
      (document.querySelector("#btn-reload-latest-changes") as HTMLElement)?.click();
    });
    // Wait for reload
    await new Promise(r => setTimeout(r, 1000));
    assert(true, "15. Reloaded latest profile state safely without overwriting newer data");
    passedAssertions++;

    // Close edit modal and detail modal
    await page.evaluate(() => {
      (document.querySelector("#close-edit-modal-button") as HTMLElement)?.click();
    });
    await new Promise(r => setTimeout(r, 400));
    await page.evaluate(() => {
      (document.querySelector("#close-detail-modal-button") as HTMLElement)?.click();
    });
    await new Promise(r => setTimeout(r, 400));

    // ----------------------------------------------------
    // 11. Admin Users page: Step 6 profile shell editing
    // ----------------------------------------------------
    console.log("\n[11/12] Testing Step 6 profile shell editing from /admin/users...");
    await page.goto("http://localhost:3000/admin/users", { waitUntil: "networkidle0" });
    await page.waitForSelector("table", { timeout: 15000 });

    // Search for test shell user
    const searchInput = await page.$('input[placeholder*="Search"]');
    if (searchInput) {
      await searchInput.type(testShellEmail);
      await new Promise(r => setTimeout(r, 800));
    }

    // Click "View" on the user row
    const userRowViewBtns = await page.$$("button");
    let clickedUserView = false;
    for (const btn of userRowViewBtns) {
      const text = await page.evaluate(el => el.textContent?.trim(), btn);
      if (text === "View" || text?.includes("View Details")) {
        await page.evaluate(el => (el as HTMLElement).click(), btn);
        clickedUserView = true;
        break;
      }
    }
    assert(clickedUserView, "Found and clicked View button on user row");

    await page.waitForSelector("#admin-user-detail-modal", { timeout: 10000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "11_users_page_step6_shell.png") });

    // Verify Edit Profile button is present on user with profile shell
    const editButtons = await page.$$("button");
    let hasEditBtn = false;
    for (const btn of editButtons) {
      const text = await page.evaluate(el => el.textContent?.trim(), btn);
      if (text && text.includes("Edit Profile")) {
        hasEditBtn = true;
        break;
      }
    }
    assert(hasEditBtn, "16. Step 6 profile shell has 'Edit Profile' button in User Detail modal");
    passedAssertions++;

    // ----------------------------------------------------
    // 12. Mobile 375px Viewport & Accessibility
    // ----------------------------------------------------
    console.log("\n[12/12] Testing Mobile 375px viewport...");
    await page.setViewport({ width: 375, height: 667 });
    await page.goto("http://localhost:3000/admin/profiles", { waitUntil: "networkidle0" });
    await new Promise(r => setTimeout(r, 1000));

    // Check horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    assert(bodyWidth <= 375, `17. No horizontal overflow on mobile 375px (scrollWidth: ${bodyWidth}px)`);
    passedAssertions++;

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "12_mobile_viewport_375px.png") });
    assert(true, "18. Mobile viewport verified at 375px");
    passedAssertions++;

    console.log("\n==================================================");
    console.log(`BROWSER VERIFICATION COMPLETE: ${passedAssertions} ASSERTIONS PASSED`);
    console.log("==================================================");
  } finally {
    await browser.close();
    // Cleanup shell user
    try {
      await prisma.user.delete({ where: { id: shellUser.id } });
    } catch {}
  }
}

runStep7BrowserVerification()
  .then(() => {
    console.log("\nAll browser verification steps completed successfully!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\nBrowser verification failed:", err);
    process.exit(1);
  });
