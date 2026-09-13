import { runStep7TestSuite } from "../tests/admin/admin-profile-editing.test";

runStep7TestSuite()
  .then(() => {
    console.log("\nAll Step 7 profile editing tests passed successfully!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\nTest suite failed:", err);
    process.exit(1);
  });
