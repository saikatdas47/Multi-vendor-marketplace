import "dotenv/config";
import fs from "fs/promises";
import { transaction } from "../src/db/index.js";

if (process.env.ALLOW_DATABASE_RESET !== "YES") {
  throw new Error("Set ALLOW_DATABASE_RESET=YES before resetting the database.");
}

const schema = await fs.readFile(new URL("./schema.sql", import.meta.url), "utf8");
await transaction(async (client) => {
  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("CREATE SCHEMA public");
  await client.query("SET LOCAL search_path TO public");
  await client.query(schema);
});
console.log("Database schema reset complete");
process.exit(0);
