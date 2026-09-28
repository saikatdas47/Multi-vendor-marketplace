import ApiError from "../utils/apiError.js";
import { verifyToken } from "../utils/tokens.js";
import { findUserById } from "../models/user.model.js";

export const verifyJWT = async (req, _res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) throw new ApiError(401, "Authentication credentials were not provided.");
    const decoded = verifyToken(token);
    if (decoded.type !== "access") throw new Error("Wrong token type");
    const user = await findUserById(decoded.user_id);
    if (!user || !user.is_active) throw new Error("User not found");
    req.user = user;
    next();
  } catch (error) {
    next(error.statusCode ? error : new ApiError(401, "Token is invalid or expired."));
  }
};

export const optionalJWT = async (req, _res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return next();
  try {
    const decoded = verifyToken(token);
    if (decoded.type !== "access") return next();
    const user = await findUserById(decoded.user_id);
    if (user?.is_active) req.user = user;
  } catch {}
  next();
};

export const allowRoles = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new ApiError(403, "You do not have permission to do that."));
  }
  next();
};
