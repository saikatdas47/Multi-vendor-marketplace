import "dotenv/config";
import { createServer } from "http";
import app from "./app.js";
import { connectDB } from "./db/index.js";
import { startSocket } from "./socket.js";
import { connectRedis } from "./cache/redis.js";

connectDB().then(async () => {
  await connectRedis();
  const port = process.env.PORT || 8000;
  const server = createServer(app);
  startSocket(server);
  server.listen(port, "0.0.0.0", () => {
    console.log(`CommerceX Node API running on http://localhost:${port}`);
  });
}).catch((error) => {
  console.error("Database connection failed:", error.message);
  process.exit(1);
});
