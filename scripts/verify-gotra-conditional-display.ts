import puppeteer, { Browser } from "puppeteer-core";
import { PrismaClient, UserStatus, ProfileCreatedFor } from "@prisma/client";
import jwt from "jsonwebtoken";
import { config } from "../src/config/env";

const prisma = new PrismaClient();
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

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

async function selectOptionByText(page: any, triggerId: string, optionText: string) {
  await page.click(triggerId);
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate((text: string) => {
    const options = Array.from(document.querySelectorAll('[role="option"]'));
    const opt = options.find((o) => o.textContent?.trim() === text || o.textContent?.includes(text)) as HTMLElement;
    if (opt) {
      opt.click();
    } else {
      throw new Error(`Option with text '${text}' not found!`);
    }
  }, optionText);
  await new Promise((r) => setTimeout(r, 500));
}

async function runGotraVerification() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — GOTRA CONDITIONAL DISPLAY TEST");
  console.log("==================================================");

  let browser: Browser | null = null;

  try {
    // Setup test user
    const testPhone = "+919876540077";
    await prisma.user.deleteMany({ where: { phone: testPhone } });

    const user = await prisma.user.create({
      data: {
        phone: testPhone,
        status: UserStatus.ACTIVE,
        phoneVerifiedAt: new Date(),
      },
    });

    const profile = await prisma.profile.create({
      data: {
        userId: user.id,
        profileCreatedFor: ProfileCreatedFor.MYSELF,
        completionPercentage: 30,
      },
    });

    const hindi = await prisma.language.findFirst({ where: { code: "hi" } });

    await prisma.profilePersonalDetails.create({
      data: {
        profileId: profile.id,
        firstName: "Test",
        lastName: "User",
        gender: "MALE",
        dateOfBirth: new Date("1995-01-01"),
        maritalStatus: "NEVER_MARRIED",
        heightCm: 175,
        motherTongueId: hindi!.id,
        city: "Mumbai",
        state: "Maharashtra",
      },
    });

    const token = jwt.sign(
      { userId: user.id, phone: user.phone },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

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

    await page.goto("http://localhost:3000/onboarding/religion", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 600));

    // CASE 1: Hindu → Gotra visible
    console.log("\n[TEST CASE 1 & 2] Hindu -> Gotra visible & options load");
    await selectOptionByText(page, "#religion", "Hindu");
    await selectOptionByText(page, "#community", "Brahmin");

    const gotraSelect = await page.$("#gotra");
    assert(!!gotraSelect, "Case 1: Gotra field visible when religion is Hindu and community selected");

    // CASE 2: Gotra options load
    await page.click("#gotra");
    await new Promise((r) => setTimeout(r, 400));
    const gotraOptionTexts: string[] = await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('[role="option"]'));
      return options.map((o) => o.textContent?.trim() || "");
    });

    assert(gotraOptionTexts.length >= 62, `Case 2: Gotra options load from API (found ${gotraOptionTexts.length} options)`);
    assert(gotraOptionTexts.some((t) => t.includes("Bharadwaj")), "Case 2b: Foundational Gotra 'Bharadwaj' loaded");
    assert(gotraOptionTexts.some((t) => t.includes("Kashyap")), "Case 2c: Foundational Gotra 'Kashyap' loaded");

    // CASE 3: Other visible
    const hasOther = gotraOptionTexts.some((t) => t === "Other");
    assert(hasOther, "Case 3: 'Other' option is visible in Gotra dropdown");

    // CASE 4: Not Applicable visible
    const hasNotApplicable = gotraOptionTexts.some((t) => t === "Not Applicable");
    assert(hasNotApplicable, "Case 4: 'Not Applicable' option is visible in Gotra dropdown");

    // Close dropdown
    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 200));

    // CASE 5: Muslim → Gotra hidden
    console.log("\n[TEST CASE 5] Muslim -> Gotra hidden");
    await selectOptionByText(page, "#religion", "Muslim");
    await selectOptionByText(page, "#community", "Sunni");
    const gotraMuslim = await page.$("#gotra");
    assert(gotraMuslim === null, "Case 5: Gotra completely hidden when religion is Muslim");

    // CASE 6: Christian → Gotra hidden
    console.log("\n[TEST CASE 6] Christian -> Gotra hidden");
    await selectOptionByText(page, "#religion", "Christian");
    await selectOptionByText(page, "#community", "Catholic");
    const gotraChristian = await page.$("#gotra");
    assert(gotraChristian === null, "Case 6: Gotra completely hidden when religion is Christian");

    // CASE 7: Sikh → Gotra hidden
    console.log("\n[TEST CASE 7] Sikh -> Gotra hidden");
    await selectOptionByText(page, "#religion", "Sikh");
    await selectOptionByText(page, "#community", "Jat");
    const gotraSikh = await page.$("#gotra");
    assert(gotraSikh === null, "Case 7: Gotra completely hidden when religion is Sikh");

    // CASE 8: Jain → Gotra hidden
    console.log("\n[TEST CASE 8] Jain -> Gotra hidden");
    await selectOptionByText(page, "#religion", "Jain");
    await selectOptionByText(page, "#community", "Digambar");
    const gotraJain = await page.$("#gotra");
    assert(gotraJain === null, "Case 8: Gotra completely hidden when religion is Jain");

    // CASE 9: Buddhist → Gotra hidden
    console.log("\n[TEST CASE 9] Buddhist -> Gotra hidden");
    await selectOptionByText(page, "#religion", "Buddhist");
    await selectOptionByText(page, "#community", "Mahayana");
    const gotraBuddhist = await page.$("#gotra");
    assert(gotraBuddhist === null, "Case 9: Gotra completely hidden when religion is Buddhist");

    // CASE 10: Hindu → select Gotra → change to Muslim → Gotra cleared/hidden
    console.log("\n[TEST CASE 10] Hindu -> select Gotra -> change to Muslim -> Gotra cleared/hidden");
    await selectOptionByText(page, "#religion", "Hindu");
    await selectOptionByText(page, "#community", "Brahmin");
    await selectOptionByText(page, "#gotra", "Bharadwaj");

    // Now change religion to Muslim
    await selectOptionByText(page, "#religion", "Muslim");
    const gotraAfterSwitch = await page.$("#gotra");
    assert(gotraAfterSwitch === null, "Case 10a: Gotra hidden immediately upon changing to Muslim");

    // Select Muslim community and submit
    await selectOptionByText(page, "#community", "Sunni");
    // Select caste Not Applicable
    await selectOptionByText(page, "#caste", "Not Applicable");

    // Submit form
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle0" });

    // Check DB record
    const savedMuslimProfile = await prisma.profileReligion.findUnique({
      where: { profileId: profile.id },
    });
    assert(savedMuslimProfile?.gotraId === null, "Case 10b: Saved Muslim profile in DB has gotraId = null (stale Gotra was cleared)");

    // CASE 11: Muslim → Hindu → Gotra visible with no automatic selection
    console.log("\n[TEST CASE 11] Muslim -> Hindu -> Gotra visible with no automatic selection");
    await page.goto("http://localhost:3000/onboarding/religion?mode=edit", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 600));

    // Change from Muslim to Hindu
    await selectOptionByText(page, "#religion", "Hindu");
    await selectOptionByText(page, "#community", "Rajput");

    const gotraHinduAgain = await page.$("#gotra");
    assert(!!gotraHinduAgain, "Case 11a: Gotra field visible when switched back to Hindu");

    const gotraButtonText = await page.$eval("#gotra", (el: any) => el.textContent?.trim() || "");
    assert(gotraButtonText.includes("Select gotra"), `Case 11b: Gotra has no automatic selection (displays placeholder: '${gotraButtonText}')`);

    // CASE 12: Existing profile edit does not retain Gotra after changing to non-Hindu
    console.log("\n[TEST CASE 12] Existing profile edit does not retain Gotra after changing to non-Hindu");
    // Manually set Hindu + Gotra on profile in DB
    const kashyap = await prisma.gotra.findFirst({ where: { slug: "kashyap" } });
    const hinduRel = await prisma.religion.findFirst({ where: { slug: "hindu" } });
    const brahminCom = await prisma.community.findFirst({ where: { slug: "brahmin" } });

    await prisma.profileReligion.update({
      where: { profileId: profile.id },
      data: {
        religionId: hinduRel!.id,
        communityId: brahminCom!.id,
        gotraId: kashyap!.id,
        manglik: "NO",
      },
    });

    // Reload edit page
    await page.goto("http://localhost:3000/onboarding/religion?mode=edit", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 600));

    // Verify Gotra is loaded
    const initialGotraText = await page.$eval("#gotra", (el: any) => el.textContent?.trim() || "");
    assert(initialGotraText.includes("Kashyap"), `Case 12a: Edit mode loaded existing Gotra '${initialGotraText}'`);

    // Change to Christian
    await selectOptionByText(page, "#religion", "Christian");
    await selectOptionByText(page, "#community", "Catholic");
    await selectOptionByText(page, "#caste", "Not Applicable");

    // Save
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle0" });

    // Verify DB
    const editedProfile = await prisma.profileReligion.findUnique({
      where: { profileId: profile.id },
    });
    assert(editedProfile?.gotraId === null, "Case 12b: DB profile gotraId updated to null after switching from Hindu to Christian");

    // Cleanup test user
    await prisma.user.deleteMany({ where: { phone: testPhone } });

  } finally {
    if (browser) await browser.close();
    await prisma.$disconnect();
  }

  console.log("\n==================================================");
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runGotraVerification().catch((e) => {
  console.error("Test failed with exception:", e);
  process.exit(1);
});
