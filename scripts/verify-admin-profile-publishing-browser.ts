import puppeteer, { Browser, Page } from "puppeteer-core";
import {
  PrismaClient,
  UserRole,
  UserStatus,
  AccountActivationStatus,
  ProfileStatus,
  ProfileCreatedFor,
  Gender,
  MaritalStatus,
  ManglikStatus,
  PhotoType,
  ModerationStatus,
} from "@prisma/client";
import jwt from "jsonwebtoken";
import { config } from "../src/config/env";
import path from "path";
import fs from "fs";

const prisma = new PrismaClient();
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\aryas\\.gemini\\antigravity-ide\\brain\\c5eeb891-f842-4c46-a43e-f6025585577d";
const SCREENSHOTS_DIR = path.resolve(__dirname, "../screenshots/admin_publish");

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function copyToArtifacts(filename: string) {
  const src = path.join(SCREENSHOTS_DIR, filename);
  const dst = path.join(ARTIFACTS_DIR, filename);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`  [ARTIFACT] Copied ${filename} to artifacts directory`);
  }
}

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
  console.log("MANGLAM MATRIMONY — ADMIN PROFILE PUBLISHING BROWSER VERIFICATION");
  console.log("==================================================");

  let browser: Browser | null = null;

  try {
    const admin = await prisma.user.findFirst({ where: { role: UserRole.ADMIN } });
    const religion = await prisma.religion.findFirst();
    const language = await prisma.language.findFirst();
    const education = await prisma.education.findFirst();
    const employmentStatus = await prisma.employmentStatus.findFirst();
    const occupation = await prisma.occupation.findFirst();

    if (!admin || !religion || !language || !education || !employmentStatus) {
      throw new Error("Missing reference master data in database.");
    }

    // 1. Prepare Controlled Candidate: Kavita Verma (Female, 100% complete, INCOMPLETE status, PENDING_ACTIVATION)
    const candidateEmail = "kavita.verma@manglam.test";
    await prisma.user.deleteMany({ where: { email: candidateEmail } });

    const candidate = await prisma.user.create({
      data: {
        email: candidateEmail,
        phone: "+919876543210",
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        activationStatus: AccountActivationStatus.PENDING_ACTIVATION,
        emailVerifiedAt: null,
        profile: {
          create: {
            profileCreatedFor: ProfileCreatedFor.MYSELF,
            profileStatus: ProfileStatus.INCOMPLETE,
            completionPercentage: 100,
            personalDetails: {
              create: {
                firstName: "Kavita",
                lastName: "Verma",
                gender: Gender.FEMALE,
                dateOfBirth: new Date("1997-08-20"),
                maritalStatus: MaritalStatus.NEVER_MARRIED,
                heightCm: 168,
                motherTongueId: language.id,
                city: "Jaipur",
                state: "Rajasthan",
              },
            },
            languages: {
              create: {
                languageId: language.id,
              },
            },
            religion: {
              create: {
                religionId: religion.id,
                manglik: ManglikStatus.NO,
              },
            },
            education: {
              create: {
                educationId: education.id,
              },
            },
            career: {
              create: {
                employmentStatusId: employmentStatus.id,
                occupationId: occupation?.id || null,
              },
            },
            partnerPreference: {
              create: {
                minAge: 25,
                maxAge: 35,
              },
            },
            photos: {
              create: {
                storageKey: "profiles/demo/kavita.webp",
                storageProvider: "local",
                originalFileName: "kavita.webp",
                mimeType: "image/webp",
                fileSize: 10240,
                width: 300,
                height: 300,
                photoType: PhotoType.PRIMARY,
                moderationStatus: ModerationStatus.APPROVED,
                moderatedAt: new Date(),
                moderatedByUserId: admin.id,
              },
            },
          },
        },
      },
      include: { profile: true },
    });

    console.log(`[SETUP] Seeded candidate Kavita Verma (ID: ${candidate.id})`);

    // 2. Prepare Browsing Member: Vikram Malhotra (Male, ACTIVE, 100% complete)
    const memberEmail = "vikram.malhotra@manglam.test";
    await prisma.user.deleteMany({ where: { email: memberEmail } });

    const member = await prisma.user.create({
      data: {
        email: memberEmail,
        phone: "+919888999999",
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        activationStatus: AccountActivationStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        profile: {
          create: {
            profileCreatedFor: ProfileCreatedFor.MYSELF,
            profileStatus: ProfileStatus.ACTIVE,
            completionPercentage: 100,
            personalDetails: {
              create: {
                firstName: "Vikram",
                lastName: "Malhotra",
                gender: Gender.MALE,
                dateOfBirth: new Date("1995-03-12"),
                maritalStatus: MaritalStatus.NEVER_MARRIED,
                heightCm: 180,
                motherTongueId: language.id,
                city: "Jaipur",
                state: "Rajasthan",
              },
            },
            languages: {
              create: {
                languageId: language.id,
              },
            },
            religion: {
              create: {
                religionId: religion.id,
                manglik: ManglikStatus.NO,
              },
            },
            education: {
              create: {
                educationId: education.id,
              },
            },
            career: {
              create: {
                employmentStatusId: employmentStatus.id,
                occupationId: occupation?.id || null,
              },
            },
            partnerPreference: {
              create: {
                minAge: 20,
                maxAge: 32,
              },
            },
            photos: {
              create: {
                storageKey: "profiles/demo/vikram.webp",
                storageProvider: "local",
                originalFileName: "vikram.webp",
                mimeType: "image/webp",
                fileSize: 10240,
                width: 300,
                height: 300,
                photoType: PhotoType.PRIMARY,
                moderationStatus: ModerationStatus.APPROVED,
                moderatedAt: new Date(),
                moderatedByUserId: admin.id,
              },
            },
          },
        },
      },
      include: { profile: true },
    });

    console.log(`[SETUP] Seeded browsing member Vikram Malhotra (ID: ${member.id})`);

    // Launch Browser
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1440,900"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // --------------------------------------------------------------------------
    // STEP 1: Admin Login
    // --------------------------------------------------------------------------
    console.log("\n[STEP 1: Admin Login]");
    await page.goto("http://localhost:3000/admin/login", { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', "admin@gmail.com");
    await page.type('input[type="password"]', "admin123@");
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));
    assert(page.url().includes("/admin"), "Admin successfully authenticated to portal");

    // --------------------------------------------------------------------------
    // STEP 2: Navigate to Admin Users & Find Kavita Verma
    // --------------------------------------------------------------------------
    console.log("\n[STEP 2: Navigate to Admin Users]");
    await page.goto("http://localhost:3000/admin/users", { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 1500));

    // Search for candidate
    await page.waitForSelector("#admin-users-search-input", { timeout: 5000 });
    await page.type("#admin-users-search-input", candidateEmail);
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 1500));

    // --------------------------------------------------------------------------
    // STEP 3: Open User Detail Modal
    // --------------------------------------------------------------------------
    console.log("\n[STEP 3: Open Candidate User Detail Modal]");
    const viewButtonSelector = `#admin-user-action-view-${candidate.id}`;
    await page.waitForSelector(viewButtonSelector, { timeout: 5000 });
    await page.click(viewButtonSelector);
    await new Promise((r) => setTimeout(r, 1500));

    // Scroll to Associated Matrimonial Profile
    await page.evaluate(() => {
      const publishBtn = document.getElementById("publish-profile-button");
      if (publishBtn) {
        publishBtn.scrollIntoView({ behavior: "instant", block: "center" });
      }
    });
    await new Promise((r) => setTimeout(r, 600));

    // Verify "Activate & Publish Profile" button is present and NOT disabled
    const isPublishButtonActive = await page.evaluate(() => {
      const btn = document.getElementById("publish-profile-button") as HTMLButtonElement;
      return btn && !btn.disabled;
    });
    assert(Boolean(isPublishButtonActive), "Publish button is visible and active for 100% complete profile");

    const ss1 = path.join(SCREENSHOTS_DIR, "01_desktop_candidate_detail_with_publish_button.png");
    await page.screenshot({ path: ss1, fullPage: false });
    copyToArtifacts("01_desktop_candidate_detail_with_publish_button.png");

    // --------------------------------------------------------------------------
    // STEP 4: Click "Activate & Publish Profile" -> Confirmation Modal
    // --------------------------------------------------------------------------
    console.log("\n[STEP 4: Open Publish Confirmation Modal]");
    await page.click("#publish-profile-button");
    await new Promise((r) => setTimeout(r, 600));

    const isModalOpen = await page.evaluate(() => {
      const title = document.getElementById("publish-modal-title");
      return title && title.textContent?.includes("Publish this profile?");
    });
    assert(Boolean(isModalOpen), "Confirmation modal is rendered with title 'Publish this profile?'");

    const ss2 = path.join(SCREENSHOTS_DIR, "02_desktop_publish_confirmation_modal.png");
    await page.screenshot({ path: ss2, fullPage: false });
    copyToArtifacts("02_desktop_publish_confirmation_modal.png");

    // --------------------------------------------------------------------------
    // STEP 5: Confirm Publication
    // --------------------------------------------------------------------------
    console.log("\n[STEP 5: Confirm Publication]");
    await page.click("#confirm-publish-profile-button");
    await new Promise((r) => setTimeout(r, 1500));

    // Scroll to the published badge & message area
    await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll("h4")).find((el) =>
        el.textContent?.includes("Associated Matrimonial Profile")
      );
      if (heading) heading.scrollIntoView({ behavior: "instant", block: "center" });
    });
    await new Promise((r) => setTimeout(r, 500));

    // Verify success alert message and "Profile Published" badge
    const publishSuccessResult = await page.evaluate(() => {
      const alert = document.querySelector('[role="alert"]');
      const text = alert ? alert.textContent : "";
      const isPublishedBadge = document.body.textContent?.includes("Profile Published");
      return { text, isPublishedBadge };
    });
    assert(
      publishSuccessResult.text?.includes("Profile published successfully"),
      "Success alert confirms profile publication"
    );
    assert(
      Boolean(publishSuccessResult.isPublishedBadge),
      "Green 'Profile Published' badge is displayed in modal"
    );

    const ss3 = path.join(SCREENSHOTS_DIR, "03_desktop_profile_published_success.png");
    await page.screenshot({ path: ss3, fullPage: false });
    copyToArtifacts("03_desktop_profile_published_success.png");

    // --------------------------------------------------------------------------
    // STEP 6: Verify Database State
    // --------------------------------------------------------------------------
    console.log("\n[STEP 6: Verify Authoritative PostgreSQL State]");
    const updatedCandidate = await prisma.user.findUnique({
      where: { id: candidate.id },
      include: { profile: true },
    });
    assert(
      updatedCandidate?.profile?.profileStatus === ProfileStatus.ACTIVE,
      "PostgreSQL profile.profileStatus transitioned to ACTIVE"
    );
    assert(
      updatedCandidate?.activationStatus === AccountActivationStatus.PENDING_ACTIVATION,
      "PostgreSQL user.activationStatus strictly remains PENDING_ACTIVATION"
    );
    assert(
      updatedCandidate?.emailVerifiedAt === null,
      "PostgreSQL user.emailVerifiedAt strictly remains null"
    );

    // --------------------------------------------------------------------------
    // STEP 7: Close Modal & Verify Admin Users Table Display
    // --------------------------------------------------------------------------
    console.log("\n[STEP 7: Inspect Admin Users Table Display]");
    // Close modal using deterministic button ID
    await page.click("#admin-user-detail-close-btn");
    await new Promise((r) => setTimeout(r, 1500));

    const ss4 = path.join(SCREENSHOTS_DIR, "04_desktop_admin_users_table_active_profile.png");
    await page.screenshot({ path: ss4, fullPage: false });
    copyToArtifacts("04_desktop_admin_users_table_active_profile.png");

    // --------------------------------------------------------------------------
    // STEP 8: Mobile Viewport Responsiveness (390px)
    // --------------------------------------------------------------------------
    console.log("\n[STEP 8: Mobile Viewport Check (390px)]");
    await page.setViewport({ width: 390, height: 844 });
    await new Promise((r) => setTimeout(r, 500));

    // Open modal on mobile
    await page.evaluate((candId) => {
      const btn =
        document.getElementById(`admin-user-action-view-mobile-${candId}`) ||
        document.getElementById(`admin-user-action-view-${candId}`) ||
        document.querySelector(`[id*="${candId}"]`);
      if (btn) (btn as HTMLElement).click();
    }, candidate.id);
    await new Promise((r) => setTimeout(r, 1500));

    // Scroll to profile section
    await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll("h4")).find((el) =>
        el.textContent?.includes("Associated Matrimonial Profile")
      );
      if (heading) heading.scrollIntoView({ behavior: "instant", block: "center" });
    });
    await new Promise((r) => setTimeout(r, 600));

    const ss5 = path.join(SCREENSHOTS_DIR, "05_mobile_publish_button_responsive.png");
    await page.screenshot({ path: ss5, fullPage: false });
    copyToArtifacts("05_mobile_publish_button_responsive.png");

    // --------------------------------------------------------------------------
    // STEP 9: Member Discovery in /matches
    // --------------------------------------------------------------------------
    console.log("\n[STEP 9: Normal Member Discovery in /matches]");
    await page.setViewport({ width: 1440, height: 900 });

    // Generate JWT token for Vikram Malhotra
    const memberToken = jwt.sign(
      { userId: member.id, email: member.email, status: member.status },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    // Navigate to frontend and set member auth
    await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
    await page.evaluate(
      (tok, usr) => {
        localStorage.setItem("manglam_auth_token", tok);
        localStorage.setItem("manglam_auth_user", JSON.stringify(usr));
      },
      memberToken,
      { id: member.id, email: member.email, role: "USER", status: "ACTIVE" }
    );

    // Go to /matches
    await page.goto("http://localhost:3000/matches", { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 2000));

    // Check if Kavita Verma appears in matches
    const matchesContent = await page.evaluate(() => document.body.textContent || "");
    const foundKavita = matchesContent.includes("Kavita");
    assert(foundKavita, "Kavita Verma appears in /matches discovery feed for compatible member Vikram");

    const ss6 = path.join(SCREENSHOTS_DIR, "06_member_discovery_matches_published_candidate.png");
    await page.screenshot({ path: ss6, fullPage: false });
    copyToArtifacts("06_member_discovery_matches_published_candidate.png");

    // --------------------------------------------------------------------------
    // STEP 10: View Profile Details and Verify Privacy
    // --------------------------------------------------------------------------
    console.log("\n[STEP 10: View Profile Details & Privacy Check]");
    // Click "View Profile" on Kavita's card
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const viewProfileBtn = buttons.find((b) => b.textContent?.includes("View Profile"));
      if (viewProfileBtn) {
        viewProfileBtn.click();
      }
    });
    await new Promise((r) => setTimeout(r, 1500));

    // Verify private data is protected
    const profilePageContent = await page.evaluate(() => document.body.textContent || "");
    assert(
      !profilePageContent.includes("kavita.verma@manglam.test"),
      "Candidate private email is NOT exposed in member public view"
    );
    assert(
      !profilePageContent.includes("+919876543210"),
      "Candidate raw phone number is NOT exposed in member public view"
    );
    assert(
      profilePageContent.includes("Kavita") && profilePageContent.includes("Jaipur"),
      "Public profile details (Name, Location) are displayed in profile view"
    );

    const ss7 = path.join(SCREENSHOTS_DIR, "07_member_view_published_profile_details.png");
    await page.screenshot({ path: ss7, fullPage: false });
    copyToArtifacts("07_member_view_published_profile_details.png");

    console.log("\n==================================================");
    console.log(`BROWSER VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================");
  } catch (error) {
    console.error("Browser verification error:", error);
    failed++;
  } finally {
    if (browser) {
      await browser.close();
    }
    await prisma.$disconnect();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runBrowserVerification();
