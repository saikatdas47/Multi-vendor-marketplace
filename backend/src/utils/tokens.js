import crypto from "crypto";
import jwt from "jsonwebtoken";
import { query } from "../db/index.js";

const secret = () => process.env.JWT_SECRET || process.env.SECRET_KEY;
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

export const createTokens = async (user) => {
  const access = jwt.sign(
    { user_id: user.id, email: user.email, role: user.role, type: "access" },
    secret(),
    { expiresIn: `${process.env.JWT_ACCESS_MINUTES || 30}m` },
  );
  const refresh = jwt.sign(
    { user_id: user.id, type: "refresh" },
    secret(),
    { expiresIn: `${process.env.JWT_REFRESH_DAYS || 7}d` },
  );
  const decoded = jwt.decode(refresh);
  await query(
    "INSERT INTO refresh_tokens(user_id, token_hash, expires_at) VALUES($1,$2,to_timestamp($3))",
    [user.id, hash(refresh), decoded.exp],
  );
  return { access, refresh };
};

export const verifyToken = (token) => jwt.verify(token, secret());
export const tokenHash = hash;
