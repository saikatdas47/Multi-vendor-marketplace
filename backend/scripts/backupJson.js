import "dotenv/config";
import fs from "fs";
import zlib from "zlib";
import { query } from "../src/db/index.js";

const output = process.argv[2];
if (!output) throw new Error("Backup output path is required.");

const tables = await query(`
  SELECT tablename FROM pg_tables
  WHERE schemaname='public'
  ORDER BY tablename
`);

const backup = { created_at: new Date().toISOString(), tables: {} };
for (const { tablename } of tables.rows) {
  if (!/^[a-zA-Z0-9_]+$/.test(tablename)) continue;
  const rows = await query(`SELECT * FROM public."${tablename}"`);
  backup.tables[tablename] = rows.rows;
  console.log(`${tablename}: ${rows.rowCount} rows`);
}

await new Promise((resolve, reject) => {
  const gzip = zlib.createGzip();
  const file = fs.createWriteStream(output);
  gzip.pipe(file);
  gzip.end(JSON.stringify(backup));
  file.on("close", resolve);
  file.on("error", reject);
});

console.log(`Logical backup saved with ${tables.rowCount} tables`);
process.exit(0);
