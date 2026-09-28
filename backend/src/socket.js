import { Server } from "socket.io";
import { verifyToken } from "./utils/tokens.js";
import { allowedOrigins } from "./config/origins.js";
import { findUserById } from "./models/user.model.js";
import { query } from "./db/index.js";

let io;

export const startSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const decoded = verifyToken(socket.handshake.auth?.token);
      const user = await findUserById(decoded.user_id);
      if (!user || !user.is_active) return next(new Error("Unauthorized"));
      socket.user = user;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    socket.join(`user:${socket.user.id}`);
    if (socket.user.role === "admin") socket.join("admins");
    if (socket.user.role === "seller") {
      const result = await query("SELECT id FROM seller_profiles WHERE user_id=$1", [socket.user.id]);
      if (result.rows[0]) socket.join(`seller:${result.rows[0].id}`);
    }
  });

  return io;
};

export const emitMessage = (sellerId, payload) => {
  if (!io) return;
  io.to("admins").to(`seller:${sellerId}`).emit("message:new", payload);
};

export const emitUser = (userId, event, payload) => {
  if (io && userId) io.to(`user:${userId}`).emit(event, payload);
};
