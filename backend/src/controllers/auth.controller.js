import bcrypt from "bcrypt";
import crypto from "crypto";
import { query, transaction } from "../db/index.js";
import { findUserByEmail, findUserById, publicUser } from "../models/user.model.js";
import ApiError from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { frontendOrigin } from "../config/origins.js";
import { createTokens, tokenHash, verifyToken } from "../utils/tokens.js";
import { slugify } from "../utils/helpers.js";
import { sendEmail } from "../utils/email.js";
import jwt from "jsonwebtoken";

const passwordOk = (password) => typeof password === "string" && password.length >= Number(process.env.PASSWORD_MIN_LENGTH || 8);

export const register = asyncHandler(async (req, res) => {
  const { email, password, password_confirm, first_name = "", last_name = "", phone = "", role = "customer", shop_name = "" } = req.body;
  if (!email) throw new ApiError(400, "Email is required.");
  if (!passwordOk(password)) throw new ApiError(400, "Password must be at least 8 characters.");
  if (password !== password_confirm) throw new ApiError(400, "Passwords do not match.");
  if (!['customer', 'seller'].includes(role)) throw new ApiError(400, "Invalid role.");
  if (role === "seller" && !shop_name.trim()) throw new ApiError(400, "Shop name is required for seller accounts.");
  if (await findUserByEmail(email)) throw new ApiError(400, "An account with this email already exists.");

  const user = await transaction(async (client) => {
    const passwordHash = await bcrypt.hash(password, 10);
    const created = await client.query(
      `INSERT INTO users(email,password,first_name,last_name,phone,role)
       VALUES(LOWER($1),$2,$3,$4,$5,$6) RETURNING *`,
      [email.trim(), passwordHash, first_name, last_name, phone, role],
    );
    const newUser = created.rows[0];
    if (role === "seller") {
      let slug = slugify(shop_name) || "shop";
      const duplicate = await client.query("SELECT id FROM seller_profiles WHERE slug=$1", [slug]);
      if (duplicate.rowCount) slug = `${slug}-${newUser.id}`;
      await client.query(
        `INSERT INTO seller_profiles(user_id,shop_name,slug,business_email,commission_rate)
         VALUES($1,$2,$3,$4,$5)`,
        [newUser.id, shop_name.trim(), slug, newUser.email, process.env.DEFAULT_COMMISSION_RATE || 10],
      );
    } else {
      await client.query("INSERT INTO customer_profiles(user_id) VALUES($1)", [newUser.id]);
      await client.query("INSERT INTO carts(user_id) VALUES($1)", [newUser.id]);
    }
    return newUser;
  });
  const tokens = await createTokens(user);
  res.status(201).json({ ...tokens, user: publicUser(user) });
});

export const login = asyncHandler(async (req, res) => {
  const user = await findUserByEmail(req.body.email || "");
  if (!user || !user.is_active || !(await bcrypt.compare(req.body.password || "", user.password))) {
    throw new ApiError(401, "No active account found with the given credentials.");
  }
  const tokens = await createTokens(user);
  res.json({ ...tokens, user: publicUser(user) });
});

export const refresh = asyncHandler(async (req, res) => {
  const raw = req.body.refresh;
  let decoded;
  try {
    decoded = verifyToken(raw);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) throw new ApiError(401, "Refresh token has expired. Please sign in again.");
    throw new ApiError(401, "Refresh token is invalid.");
  }
  if (decoded.type !== "refresh") throw new ApiError(401, "Token has wrong type.");
  const stored = await query("DELETE FROM refresh_tokens WHERE token_hash=$1 AND expires_at>NOW() RETURNING user_id", [tokenHash(raw)]);
  if (!stored.rowCount) throw new ApiError(401, "Token is invalid or expired.");
  const user = await findUserById(decoded.user_id);
  if (!user || !user.is_active) throw new ApiError(401, "The account for this refresh token is unavailable.");
  res.json(await createTokens(user));
});

export const verifyAccessToken = asyncHandler(async (req, res) => {
  try {
    const decoded = verifyToken(req.body.token);
    if (decoded.type !== "access") throw new ApiError(401, "Token has wrong type.");
    const user = await findUserById(decoded.user_id);
    if (!user || !user.is_active) throw new ApiError(401, "Token user is unavailable.");
    res.json({ valid: true, user: publicUser(user) });
  } catch (error) {
    if (error.statusCode) throw error;
    if (error instanceof jwt.TokenExpiredError) throw new ApiError(401, "Access token has expired.");
    throw new ApiError(401, "Access token is invalid.");
  }
});

export const logout = asyncHandler(async (req, res) => {
  if (req.body.refresh) await query("DELETE FROM refresh_tokens WHERE token_hash=$1", [tokenHash(req.body.refresh)]);
  res.status(205).send();
});

export const me = asyncHandler(async (req, res) => res.json(publicUser(req.user)));

export const updateMe = asyncHandler(async (req, res) => {
  const { first_name, last_name, phone, avatar } = req.body;
  const result = await query(
    `UPDATE users SET first_name=COALESCE($1,first_name),last_name=COALESCE($2,last_name),
     phone=COALESCE($3,phone),avatar=COALESCE($4,avatar),updated_at=NOW() WHERE id=$5 RETURNING *`,
    [first_name, last_name, phone, avatar, req.user.id],
  );
  res.json(publicUser(result.rows[0]));
});

export const changePassword = asyncHandler(async (req, res) => {
  if (!(await bcrypt.compare(req.body.old_password || "", req.user.password))) throw new ApiError(400, "Current password is incorrect.");
  if (!passwordOk(req.body.new_password)) throw new ApiError(400, "New password must be at least 8 characters.");
  await query("UPDATE users SET password=$1,updated_at=NOW() WHERE id=$2", [await bcrypt.hash(req.body.new_password, 10), req.user.id]);
  await query("DELETE FROM refresh_tokens WHERE user_id=$1", [req.user.id]);
  res.json({ detail: "Password changed successfully." });
});

const createEmailToken = async (userId, purpose, hours) => {
  const raw = crypto.randomBytes(32).toString("hex");
  await query(
    "INSERT INTO email_tokens(user_id,purpose,token_hash,expires_at) VALUES($1,$2,$3,NOW()+($4||' hours')::interval)",
    [userId, purpose, tokenHash(raw), hours],
  );
  return raw;
};

export const sendVerification = asyncHandler(async (req, res) => {
  if (req.user.email_verified) return res.json({ detail: "Email is already verified." });
  const token = await createEmailToken(req.user.id, "verify", process.env.VERIFY_TOKEN_TTL_HOURS || 48);
  if (process.env.DEBUG === "True" || process.env.DEBUG === "true") return res.json({ detail: "Verification email created.", token });
  const url = `${frontendOrigin}/verify-email?token=${token}`;
  await sendEmail({ to: req.user.email, subject: "Verify your CommerceX email", text: `Verify your email: ${url}` });
  res.json({ detail: "Verification email sent." });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const found = await query(
    "UPDATE email_tokens SET used_at=NOW() WHERE token_hash=$1 AND purpose='verify' AND used_at IS NULL AND expires_at>NOW() RETURNING user_id",
    [tokenHash(req.body.token || "")],
  );
  if (!found.rowCount) throw new ApiError(400, "Invalid or expired token.");
  await query("UPDATE users SET email_verified=TRUE WHERE id=$1", [found.rows[0].user_id]);
  res.json({ detail: "Email verified successfully." });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const user = await findUserByEmail(req.body.email || "");
  const response = { detail: "If that account exists, a password reset email has been sent." };
  if (user) {
    const token = await createEmailToken(user.id, "reset", process.env.RESET_TOKEN_TTL_HOURS || 1);
    if (process.env.DEBUG === "True" || process.env.DEBUG === "true") response.token = token;
    else {
      const url = `${frontendOrigin}/reset-password?token=${token}`;
      await sendEmail({ to: user.email, subject: "Reset your CommerceX password", text: `Reset your password: ${url}` });
    }
  }
  res.json(response);
});

export const resetPassword = asyncHandler(async (req, res) => {
  if (req.body.new_password !== req.body.new_password_confirm) throw new ApiError(400, "Passwords do not match.");
  if (!passwordOk(req.body.new_password)) throw new ApiError(400, "Password must be at least 8 characters.");
  const found = await query(
    "UPDATE email_tokens SET used_at=NOW() WHERE token_hash=$1 AND purpose='reset' AND used_at IS NULL AND expires_at>NOW() RETURNING user_id",
    [tokenHash(req.body.token || "")],
  );
  if (!found.rowCount) throw new ApiError(400, "Invalid or expired token.");
  await query("UPDATE users SET password=$1 WHERE id=$2", [await bcrypt.hash(req.body.new_password, 10), found.rows[0].user_id]);
  await query("DELETE FROM refresh_tokens WHERE user_id=$1", [found.rows[0].user_id]);
  res.json({ detail: "Password reset successfully." });
});
