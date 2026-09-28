import "dotenv/config";
import { query } from "../src/db/index.js";

await query("ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS banner TEXT");
console.log("Shop media schema is ready.");
process.exit(0);
