import { cacheDeletePattern, cacheGet, cacheSet } from "../cache/redis.js";

export const cacheResponse = (namespace, ttl = 60) => async (req, res, next) => {
  const key = `${namespace}:${req.originalUrl}`;
  const cached = await cacheGet(key);
  if (cached) { res.set("X-Cache", "HIT"); console.log(`[cache] HIT ${key}`); return res.json(cached); }
  const state = process.env.REDIS_URL ? "MISS" : "BYPASS";
  res.set("X-Cache", state); console.log(`[cache] ${state} ${key}`);
  const send = res.json.bind(res);
  res.json = (body) => { if (res.statusCode < 400) cacheSet(key, body, ttl); return send(body); };
  next();
};

export const invalidateAfter = (...patterns) => (req, res, next) => {
  res.on("finish", () => {
    if (res.statusCode < 400) patterns.forEach((pattern) => cacheDeletePattern(pattern));
  });
  next();
};

export const cacheAssistant = (ttl = 300) => async (req, res, next) => {
  if (req.body.session_id) return next();
  const message = String(req.body.message || "").trim().toLowerCase();
  if (!message) return next();
  const key = `assistant:${message}`;
  const cached = await cacheGet(key);
  if (cached) { res.set("X-Cache", "HIT"); return res.json({ ...cached, cached: true }); }
  const send = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 400) cacheSet(key, { answer: body.answer, message: body.message, products: body.products }, ttl);
    return send(body);
  };
  next();
};
