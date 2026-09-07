import * as fs from "fs";
import * as path from "path";

const reportPath = path.join(__dirname, "../master-data/reports/batch-1.1-religion-community-classification.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));

console.log("Total slug collisions:", report.slugCollisionReport.length);
const collisionsBySlug = new Map<string, any[]>();
for (const item of report.slugCollisionReport) {
  const s = item.proposedSlug;
  if (!collisionsBySlug.has(s)) collisionsBySlug.set(s, []);
  collisionsBySlug.get(s)!.push(item);
}

for (const [slug, items] of collisionsBySlug.entries()) {
  console.log(`Slug: '${slug}' collided across:`, items.map((i: any) => `${i.sourceReligion} -> ${i.sourceValue}`));
}
