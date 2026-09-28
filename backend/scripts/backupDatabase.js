import "dotenv/config";
import { spawn } from "child_process";

const output = process.argv[2];
if (!output) throw new Error("Backup output path is required.");

const child = spawn("pg_dump", ["--dbname", process.env.DATABASE_URL, "--format=custom", "--file", output], {
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 1));
