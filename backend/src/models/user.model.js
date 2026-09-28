import { findOne } from "./base.model.js";

export const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  first_name: user.first_name,
  last_name: user.last_name,
  full_name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email,
  role: user.role,
  phone: user.phone,
  avatar: user.avatar,
  email_verified: user.email_verified,
  is_active: user.is_active,
  created_at: user.created_at,
});

export const findUserByEmail = (email) => findOne(
  "SELECT * FROM users WHERE LOWER(email)=LOWER($1)", [email],
);

export const findUserById = (id) => findOne("SELECT * FROM users WHERE id=$1", [id]);
