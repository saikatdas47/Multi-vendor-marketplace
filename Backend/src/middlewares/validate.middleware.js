import ApiError from "../utils/apiError.js";

const isPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value);

export const validateBody = (fields, options = {}) => (req, _res, next) => {
  const body = isPlainObject(req.body) ? req.body : {};
  const errors = [];
  const clean = options.allowUnknown ? { ...body } : {};

  for (const [name, rules] of Object.entries(fields)) {
    let value = body[name];

    if (value === undefined || value === null || value === "") {
      if (rules.required) errors.push({ field: name, message: `${name} is required.` });
      continue;
    }

    if (rules.type === "string" && typeof value !== "string") {
      errors.push({ field: name, message: `${name} must be a string.` });
      continue;
    }
    if (rules.type === "array" && !Array.isArray(value)) {
      errors.push({ field: name, message: `${name} must be an array.` });
      continue;
    }
    if (rules.trim && typeof value === "string") value = value.trim();
    if (rules.minLength && value.length < rules.minLength) {
      errors.push({ field: name, message: `${name} must be at least ${rules.minLength} characters.` });
    }
    if (rules.maxLength && value.length > rules.maxLength) {
      errors.push({ field: name, message: `${name} must be at most ${rules.maxLength} characters.` });
    }
    if (rules.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push({ field: name, message: `${name} must be a valid email address.` });
    }
    if (rules.oneOf && !rules.oneOf.includes(value)) {
      errors.push({ field: name, message: `${name} must be one of: ${rules.oneOf.join(", ")}.` });
    }
    clean[name] = value;
  }

  if (errors.length) return next(new ApiError(400, "Request validation failed.", errors));
  req.body = clean;
  next();
};
