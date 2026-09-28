import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pool from "../src/db/index.js";

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
const client = await pool.connect();

try {
  await client.query("SELECT pg_advisory_lock(39482017)");
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    checksum VARCHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  const existingSchema = await client.query("SELECT to_regclass('public.users') AS users");
  const applied = new Map((await client.query("SELECT name,checksum FROM schema_migrations")).rows.map((row) => [row.name, row.checksum]));

  for (const file of files) {
    const sql = await fs.readFile(path.join(directory, file), "utf8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");

    if (applied.has(file)) {
      if (applied.get(file) !== checksum) throw new Error(`Applied migration was modified: ${file}`);
      continue;
    }

    if (file === "0001_initial.sql" && existingSchema.rows[0].users) {
      await client.query("INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)", [file, checksum]);
      console.log(`Baselined existing database: ${file}`);
      continue;
    }

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)", [file, checksum]);
      await client.query("COMMIT");
      console.log(`Applied migration: ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(39482017)").catch(() => {});
  client.release();
  await pool.end();
}
