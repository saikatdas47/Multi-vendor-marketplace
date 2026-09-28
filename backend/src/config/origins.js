const configured = (process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const renderOrigin = process.env.RENDER_EXTERNAL_HOSTNAME
  ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
  : null;

export const allowedOrigins = [...new Set([...configured, renderOrigin].filter(Boolean))];

export const frontendOrigin = process.env.FRONTEND_URL
  || renderOrigin
  || "http://localhost:5173";
