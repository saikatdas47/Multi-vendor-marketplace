import "dotenv/config";
import { execFileSync } from "node:child_process";
import { query } from "../src/db/index.js";
import { shopMedia } from "./shopMedia.js";

const count = await query("SELECT COUNT(*)::int AS count FROM users");
if (count.rows[0].count === 0) {
  execFileSync(process.execPath, ["scripts/seed.js"], { stdio: "inherit" });
} else {
  console.log("Database already contains data; seed skipped.");
}

for (const [slug, media] of Object.entries(shopMedia)) {
  await query(
    "UPDATE seller_profiles SET logo=COALESCE(NULLIF(logo,''),$1),banner=COALESCE(NULLIF(banner,''),$2),updated_at=NOW() WHERE slug=$3",
    [media.logo, media.banner, slug],
  );
}
console.log("Shop profile and banner media verified.");
process.exit(0);
