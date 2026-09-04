async function verify() {
  const endpoints = [
    { name: "religions", url: "https://manglammatrimony-backend.onrender.com/api/profile/religions", expected: 10 },
    { name: "communities", url: "https://manglammatrimony-backend.onrender.com/api/profile/communities", expected: 20 },
    { name: "languages", url: "https://manglammatrimony-backend.onrender.com/api/profile/languages", expected: 21 },
    { name: "educations", url: "https://manglammatrimony-backend.onrender.com/api/profile/educations", expected: 25 },
    { name: "employmentStatuses", url: "https://manglammatrimony-backend.onrender.com/api/profile/employment-statuses", expected: 10 },
    { name: "occupations", url: "https://manglammatrimony-backend.onrender.com/api/profile/occupations", expected: 1 },
    { name: "castes", url: "https://manglammatrimony-backend.onrender.com/api/profile/castes", expected: 0 },
    { name: "subCastes", url: "https://manglammatrimony-backend.onrender.com/api/profile/sub-castes", expected: 0 },
  ];

  console.log("==================================================");
  console.log("PRODUCTION DATABASE MASTER DATA VERIFICATION");
  console.log("==================================================");

  let allGood = true;
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url);
      const json = (await res.json()) as { success: boolean; data: any[] };
      const count = Array.isArray(json.data) ? json.data.length : 0;
      const status = count === ep.expected ? "✓ OK" : (count > 0 ? `✓ (found ${count})` : "✗ EMPTY");
      console.log(`${ep.name.padEnd(20)}: ${count} items (expected ${ep.expected}) -> ${status}`);
      if (ep.expected > 0 && count === 0) {
        allGood = false;
      }
    } catch (err: any) {
      console.log(`${ep.name.padEnd(20)}: ERROR -> ${err.message}`);
      allGood = false;
    }
  }

  console.log("==================================================");
  if (allGood) {
    console.log("ALL PRODUCTION MASTER DATA ENDPOINTS RETURN DATA CORRECTLY!");
  } else {
    console.log("WAITING FOR DEPLOYMENT / SEED TO COMPLETE");
  }
}

verify();
