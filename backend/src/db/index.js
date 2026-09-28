import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL || "";
const sslSetting = process.env.DATABASE_SSL?.toLowerCase();
const localDatabase = databaseUrl.includes("@postgres:") || databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");
const useSsl = sslSetting ? !["false", "0", "no"].includes(sslSetting) : !localDatabase;

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

export const query = (text, values = []) => pool.query(text, values);

export const transaction = async (work) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const connectDB = async () => {
  await pool.query("SELECT 1");
  console.log("PostgreSQL connected");
};

export default pool;
