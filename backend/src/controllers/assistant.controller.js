import { query } from "../db/index.js";
import ApiError from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { createShoppingReply } from "../services/ai.service.js";

const ignoredSearchWords = new Set([
  "show", "find", "give", "want", "need", "with", "under", "over", "from",
  "products", "product", "please", "popular", "best", "rated", "ratings",
  "featured", "available", "which", "what",
]);

const searchTerms = (message) => {
  const words = message.toLowerCase().split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !ignoredSearchWords.has(word) && !/^\d+$/.test(word))
    .slice(0, 6);
  return (words.length ? words : [""]).map((word) => `%${word}%`);
};

const findCandidateProducts = async (message) => {
  const lower = message.toLowerCase();
  const priceMatch = lower.match(/(?:under|below|less than)\s*\$?\s*(\d+(?:\.\d+)?)/);
  const maxPrice = priceMatch ? Number(priceMatch[1]) : null;
  const result = await query(
    `SELECT p.id,p.name,p.slug,p.price,p.stock,p.short_description,
            s.shop_name AS seller_name,
            COALESCE(ROUND(AVG(r.rating)::numeric,1),0) AS avg_rating,
            COALESCE((SELECT image FROM product_images WHERE product_id=p.id ORDER BY is_primary DESC LIMIT 1),'') AS primary_image
     FROM products p JOIN seller_profiles s ON s.id=p.seller_id
     LEFT JOIN reviews r ON r.product_id=p.id AND r.is_approved=TRUE
     WHERE p.status='published' AND p.deleted_at IS NULL
       AND ($2::numeric IS NULL OR p.price<=$2)
       AND (p.name ILIKE ANY($1::text[]) OR p.description ILIKE ANY($1::text[]) OR p.short_description ILIKE ANY($1::text[]))
     GROUP BY p.id,s.shop_name
     ORDER BY CASE WHEN $3::boolean THEN p.view_count END DESC,
              CASE WHEN $4::boolean THEN AVG(r.rating) END DESC,
              p.is_featured DESC,avg_rating DESC LIMIT $5`,
    [searchTerms(message), maxPrice, lower.includes("popular"), lower.includes("best") || lower.includes("rated"), Number(process.env.ASSISTANT_CANDIDATES || 8)],
  );
  return result.rows;
};

const createSession = async (userId, message) => {
  const result = await query("INSERT INTO chat_sessions(user_id,title) VALUES($1,$2) RETURNING id", [userId || null, message.slice(0, 140)]);
  return result.rows[0].id;
};

const assertOwnedSession = async (sessionId, user) => {
  const session = (await query("SELECT id,user_id FROM chat_sessions WHERE id=$1", [sessionId])).rows[0];
  if (!session) throw new ApiError(404, "Chat session not found.");
  if (!user || session.user_id !== user.id) throw new ApiError(403, "You do not have access to this chat session.");
  return session;
};

export const suggestions = asyncHandler(async (_req, res) => res.json([
  "Show me popular products", "What is available under $50?", "Find featured products", "Which products have the best ratings?",
]));

export const suggest = asyncHandler(async (req, res) => {
  const text = (req.query.q || "").trim();
  if (!text) return res.json([]);
  const rows = await query(
    `SELECT name,slug,price,COALESCE((SELECT image FROM product_images WHERE product_id=products.id ORDER BY is_primary DESC LIMIT 1),'') AS image
     FROM products WHERE status='published' AND deleted_at IS NULL AND name ILIKE $1 ORDER BY is_featured DESC,name LIMIT 8`,
    [`%${text}%`],
  );
  res.json(rows.rows);
});

export const ask = asyncHandler(async (req, res) => {
  const message = req.body.message;
  let sessionId = req.body.session_id;
  if (sessionId && req.user) await assertOwnedSession(sessionId, req.user);
  if (!req.user) sessionId = null;
  if (!sessionId) sessionId = await createSession(req.user?.id, message);

  await query("INSERT INTO chat_messages(session_id,role,content) VALUES($1,'user',$2)", [sessionId, message]);
  const products = await findCandidateProducts(message);
  const reply = await createShoppingReply(message, products);
  await query(
    "INSERT INTO chat_messages(session_id,role,content,product_ids,retrieval_meta) VALUES($1,'assistant',$2,$3,$4)",
    [sessionId, reply, JSON.stringify(products.map((product) => product.id)), JSON.stringify({ candidates: products.length })],
  );
  await query("UPDATE chat_sessions SET message_count=message_count+2,updated_at=NOW() WHERE id=$1", [sessionId]);
  res.json({ session_id: sessionId, answer: reply, message: reply, products });
});

export const history = asyncHandler(async (req, res) => {
  await assertOwnedSession(req.params.id, req.user);
  const session = (await query("SELECT * FROM chat_sessions WHERE id=$1", [req.params.id])).rows[0];
  session.messages = (await query("SELECT * FROM chat_messages WHERE session_id=$1 ORDER BY created_at", [session.id])).rows;
  res.json(session);
});

export const sessions = asyncHandler(async (req, res) => {
  const rows = await query("SELECT * FROM chat_sessions WHERE user_id=$1 ORDER BY updated_at DESC", [req.user.id]);
  res.json({ count: rows.rowCount, next: null, previous: null, results: rows.rows });
});

export const draftListing = asyncHandler(async (req, res) => {
  const name = req.body.name || req.body.product_name || "Product";
  res.json({
    seo_title: name.slice(0, 60),
    description: `Discover ${name}. ${req.body.features || req.body.keywords || "Designed for everyday use."}`,
    bullets: Array.isArray(req.body.features) ? req.body.features : ["Quality construction", "Practical design", "Made for everyday use"],
    meta_description: `Shop ${name} at CommerceX.`.slice(0, 160),
  });
});

export const reviewSummary = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT r.rating,r.comment FROM reviews r JOIN products p ON p.id=r.product_id
     WHERE p.slug=$1 AND r.is_approved=TRUE ORDER BY r.created_at DESC LIMIT 25`,
    [req.params.slug],
  );
  if (!rows.rowCount) return res.status(204).send();
  const average = rows.rows.reduce((sum, review) => sum + review.rating, 0) / rows.rowCount;
  res.json({
    summary: `Customers rate this product ${average.toFixed(1)} out of 5 based on ${rows.rowCount} review${rows.rowCount === 1 ? "" : "s"}.`,
    average_rating: Number(average.toFixed(1)), review_count: rows.rowCount,
  });
});
