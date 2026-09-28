import { createClient } from "redis";

let client;
let ready = false;

export const connectRedis = async () => {
  if (!process.env.REDIS_URL) { console.log("Redis disabled: using PostgreSQL directly"); return false; }
  client = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 1500, reconnectStrategy: false } });
  client.on("error", (error) => console.warn("Redis unavailable, using PostgreSQL:", error.message));
  try { await client.connect(); ready = true; console.log("Redis cache connected"); } catch { ready = false; }
  return ready;
};
export const cacheGet = async (key) => { if (!ready) return null; try { const value = await client.get(key); return value ? JSON.parse(value) : null; } catch { return null; } };
export const cacheSet = async (key, value, ttl = 60) => { if (!ready) return false; try { await client.set(key, JSON.stringify(value), { EX: ttl }); return true; } catch { return false; } };
export const cacheDeletePattern = async (pattern) => { if (!ready) return; try { for await (const keys of client.scanIterator({ MATCH: pattern, COUNT: 100 })) if (keys.length) await client.del(keys); } catch {} };
export const redisStatus = () => ready;
