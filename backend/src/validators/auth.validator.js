export const loginDto = {
  email: { required: true, type: "string", trim: true, email: true, maxLength: 254 },
  password: { required: true, type: "string", maxLength: 200 },
};

export const registerDto = {
  email: { required: true, type: "string", trim: true, email: true, maxLength: 254 },
  password: { required: true, type: "string", minLength: 8, maxLength: 200 },
  password_confirm: { required: true, type: "string", maxLength: 200 },
  first_name: { type: "string", trim: true, maxLength: 150 },
  last_name: { type: "string", trim: true, maxLength: 150 },
  phone: { type: "string", trim: true, maxLength: 20 },
  role: { type: "string", oneOf: ["customer", "seller"] },
  shop_name: { type: "string", trim: true, maxLength: 150 },
};

export const refreshDto = {
  refresh: { required: true, type: "string", trim: true },
};

export const verifyDto = {
  token: { required: true, type: "string", trim: true },
};
