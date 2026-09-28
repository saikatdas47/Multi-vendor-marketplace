import { query, transaction } from "../db/index.js";
import ApiError from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { pageValues, paginated, slugify } from "../utils/helpers.js";

const productSelect = `
  SELECT p.*, c.name AS category_name, c.slug AS category_slug,
    s.shop_name AS seller_name, s.slug AS seller_slug,
    COALESCE((SELECT image FROM product_images WHERE product_id=p.id ORDER BY is_primary DESC,sort_order LIMIT 1),'') AS primary_image,
    COALESCE((SELECT ROUND(AVG(rating)::numeric,1) FROM reviews WHERE product_id=p.id AND is_approved=TRUE),0) AS avg_rating,
    (SELECT COUNT(*)::int FROM reviews WHERE product_id=p.id AND is_approved=TRUE) AS review_count
  FROM products p JOIN categories c ON c.id=p.category_id JOIN seller_profiles s ON s.id=p.seller_id`;

const formatProduct = (row) => ({
  ...row,
  price: Number(row.price).toFixed(2),
  compare_at_price: row.compare_at_price == null ? null : Number(row.compare_at_price).toFixed(2),
  avg_rating: Number(row.avg_rating || 0),
  discount_percent: row.compare_at_price > row.price ? Math.round((1 - row.price / row.compare_at_price) * 100) : 0,
  is_low_stock: row.stock > 0 && row.stock <= row.low_stock_threshold,
  is_out_of_stock: row.stock === 0,
  category: { id: row.category_id, name: row.category_name, slug: row.category_slug },
  seller: { id: row.seller_id, shop_name: row.seller_name, slug: row.seller_slug },
});

const sellerFor = async (userId) => {
  const result = await query("SELECT * FROM seller_profiles WHERE user_id=$1", [userId]);
  return result.rows[0];
};

export const categories = asyncHandler(async (req, res) => {
  const result = await query(`SELECT c.*,
    (SELECT COUNT(*)::int FROM products p WHERE p.category_id=c.id AND p.status='published' AND p.deleted_at IS NULL) AS product_count
    FROM categories c WHERE c.is_active=TRUE ORDER BY c.sort_order,c.name`);
  res.json(result.rows);
});

export const categoryTree = asyncHandler(async (_req, res) => {
  const rows = (await query(`SELECT c.*,
    (SELECT COUNT(*)::int FROM products p WHERE p.category_id=c.id AND p.status='published' AND p.deleted_at IS NULL) AS product_count
    FROM categories c WHERE c.is_active=TRUE ORDER BY c.sort_order,c.name`)).rows;
  const children = new Map();
  for (const row of rows) {
    const key = row.parent_id || "root";
    children.set(key, [...(children.get(key) || []), row]);
  }
  const build = (row) => ({ ...row, children: (children.get(row.id) || []).map(build) });
  res.json((children.get("root") || []).map(build));
});

export const products = asyncHandler(async (req, res) => {
  const { pageSize, offset } = pageValues(req.query);
  const values = [];
  const where = ["p.deleted_at IS NULL"];
  if (!req.user || req.user.role === "customer") where.push("p.status='published'");
  if (req.query.search) { values.push(`%${req.query.search}%`); where.push(`(p.name ILIKE $${values.length} OR p.description ILIKE $${values.length})`); }
  if (req.query.category) { values.push(req.query.category); where.push(`(c.slug=$${values.length} OR c.parent_id=(SELECT id FROM categories WHERE slug=$${values.length}))`); }
  if (req.query.seller) { values.push(req.query.seller); where.push(`s.slug=$${values.length}`); }
  if (req.query.status) { values.push(req.query.status); where.push(`p.status=$${values.length}`); }
  if (req.query.featured) where.push("p.is_featured=TRUE");
  if (req.query.min_price) { values.push(req.query.min_price); where.push(`p.price >= $${values.length}`); }
  if (req.query.max_price) { values.push(req.query.max_price); where.push(`p.price <= $${values.length}`); }
  if (req.user?.role === "seller" && !req.query.seller) { values.push(req.user.id); where.push(`s.user_id=$${values.length}`); }
  const ordering = { price: "p.price", "-price": "p.price DESC", name: "p.name", "-created_at": "p.created_at DESC" }[req.query.ordering] || "p.created_at DESC";
  const count = await query(`SELECT COUNT(*) FROM products p JOIN categories c ON c.id=p.category_id JOIN seller_profiles s ON s.id=p.seller_id WHERE ${where.join(" AND ")}`, values);
  values.push(pageSize, offset);
  const rows = await query(`${productSelect} WHERE ${where.join(" AND ")} ORDER BY ${ordering} LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
  res.json(paginated(rows.rows.map(formatProduct), Number(count.rows[0].count), req, pageSize));
});

export const productDetail = asyncHandler(async (req, res) => {
  const result = await query(`${productSelect} WHERE p.slug=$1 AND p.deleted_at IS NULL`, [req.params.slug]);
  if (!result.rowCount) throw new ApiError(404, "Not found.");
  const product = formatProduct(result.rows[0]);
  product.images = (await query("SELECT id,image,alt_text,is_primary,sort_order FROM product_images WHERE product_id=$1 ORDER BY is_primary DESC,sort_order", [product.id])).rows;
  product.variants = (await query("SELECT *, (price_delta+$2::numeric)::numeric AS final_price FROM product_variants WHERE product_id=$1 AND is_active=TRUE", [product.id, product.price])).rows;
  await query("UPDATE products SET view_count=view_count+1 WHERE id=$1", [product.id]);
  res.json(product);
});

export const createProduct = asyncHandler(async (req, res) => {
  const seller = await sellerFor(req.user.id);
  if (!seller || seller.status !== "approved") throw new ApiError(403, "Approved seller account required.");
  const b = req.body;
  if (!b.name || !(b.category || b.category_id) || !b.price || !b.sku) throw new ApiError(400, "name, category, price and sku are required.");
  const slug = slugify(b.slug || b.name) + `-${Date.now().toString().slice(-5)}`;
  const result = await query(
    `INSERT INTO products(seller_id,category_id,name,slug,sku,short_description,description,price,compare_at_price,cost_price,stock,low_stock_threshold,status,is_featured)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING slug`,
    [seller.id,b.category || b.category_id,b.name,slug,b.sku,b.short_description||"",b.description||"",b.price,b.compare_at_price||null,b.cost_price||null,b.stock||0,b.low_stock_threshold||5,b.status||"draft",Boolean(b.is_featured)],
  );
  req.params.slug = result.rows[0].slug;
  return productDetail(req, res);
});

export const updateProduct = asyncHandler(async (req, res) => {
  const seller = await sellerFor(req.user.id);
  const existing = await query("SELECT * FROM products WHERE slug=$1 AND seller_id=$2 AND deleted_at IS NULL", [req.params.slug, seller?.id]);
  if (!existing.rowCount) throw new ApiError(404, "Not found.");
  const current = existing.rows[0];
  const b = { ...current, ...req.body };
  await query(`UPDATE products SET category_id=$1,name=$2,sku=$3,short_description=$4,description=$5,price=$6,
    compare_at_price=$7,cost_price=$8,stock=$9,low_stock_threshold=$10,status=$11,is_featured=$12,updated_at=NOW() WHERE id=$13`,
    [b.category || b.category_id,b.name,b.sku,b.short_description,b.description,b.price,b.compare_at_price,b.cost_price,b.stock,b.low_stock_threshold,b.status,b.is_featured,current.id]);
  return productDetail(req, res);
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const seller = await sellerFor(req.user.id);
  const result = await query("UPDATE products SET deleted_at=NOW() WHERE slug=$1 AND seller_id=$2 RETURNING id", [req.params.slug, seller?.id]);
  if (!result.rowCount) throw new ApiError(404, "Not found.");
  res.status(204).send();
});

export const adjustStock = asyncHandler(async (req, res) => {
  const seller = await sellerFor(req.user.id);
  const result = await query("UPDATE products SET stock=GREATEST(0,stock+$1),updated_at=NOW() WHERE slug=$2 AND seller_id=$3 RETURNING stock", [Number(req.body.adjustment || req.body.quantity || 0), req.params.slug, seller?.id]);
  if (!result.rowCount) throw new ApiError(404, "Not found.");
  res.json(result.rows[0]);
});

export const lowStock = asyncHandler(async (req, res) => {
  const seller = await sellerFor(req.user.id);
  const rows = await query(`${productSelect} WHERE p.seller_id=$1 AND p.deleted_at IS NULL AND p.stock<=p.low_stock_threshold ORDER BY p.stock`, [seller?.id]);
  res.json(rows.rows.map(formatProduct));
});

export const productReviews = asyncHandler(async (req, res) => {
  const result = await query(`SELECT r.*,u.first_name,u.last_name,u.email FROM reviews r JOIN users u ON u.id=r.user_id
    JOIN products p ON p.id=r.product_id WHERE p.slug=$1 AND r.is_approved=TRUE ORDER BY r.created_at DESC`, [req.params.slug]);
  res.json({ count: result.rowCount, next: null, previous: null, results: result.rows.map(r => ({...r,user_name:`${r.first_name} ${r.last_name}`.trim()||r.email})) });
});

export const listReviews = asyncHandler(async (req, res) => {
  const rows = await query("SELECT r.*,p.name AS product_name,p.slug AS product_slug FROM reviews r JOIN products p ON p.id=r.product_id WHERE r.user_id=$1 ORDER BY r.created_at DESC", [req.user.id]);
  res.json({ count: rows.rowCount, next: null, previous: null, results: rows.rows });
});

export const createReview = asyncHandler(async (req, res) => {
  const result = await query(`INSERT INTO reviews(product_id,user_id,rating,title,comment) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(product_id,user_id) DO UPDATE SET rating=EXCLUDED.rating,title=EXCLUDED.title,comment=EXCLUDED.comment,updated_at=NOW() RETURNING *`,
    [req.body.product,req.user.id,req.body.rating,req.body.title||"",req.body.comment||""]);
  res.status(201).json(result.rows[0]);
});

export const updateReview = asyncHandler(async (req, res) => {
  const current = await query("SELECT * FROM reviews WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  if (!current.rowCount) throw new ApiError(404, "Not found.");
  const b = { ...current.rows[0], ...req.body };
  const result = await query("UPDATE reviews SET rating=$1,title=$2,comment=$3,updated_at=NOW() WHERE id=$4 RETURNING *", [b.rating,b.title,b.comment,req.params.id]);
  res.json(result.rows[0]);
});

export const deleteReview = asyncHandler(async (req, res) => {
  await query("DELETE FROM reviews WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  res.status(204).send();
});

export const helpfulReview = asyncHandler(async (req, res) => {
  const result = await query("UPDATE reviews SET helpful_count=helpful_count+1 WHERE id=$1 RETURNING helpful_count", [req.params.id]);
  if (!result.rowCount) throw new ApiError(404, "Not found.");
  res.json(result.rows[0]);
});

export const shops = asyncHandler(async (req, res) => {
  const values=[];let search="";if(req.query.search){values.push(`%${req.query.search.trim()}%`);search="AND (s.shop_name ILIKE $1 OR s.description ILIKE $1)";}
  const rows = await query(`SELECT s.*,u.email,(SELECT COUNT(*)::int FROM products p WHERE p.seller_id=s.id AND p.status='published' AND p.deleted_at IS NULL) AS product_count
    FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE s.status='approved' ${search} ORDER BY s.shop_name`,values);
  res.json({ count: rows.rowCount, next: null, previous: null, results: rows.rows.map(s => ({...s,is_approved:true})) });
});

export const shopDetail = asyncHandler(async (req, res) => {
  const result = await query(`SELECT s.*,u.email,(SELECT COUNT(*)::int FROM products p WHERE p.seller_id=s.id AND p.status='published' AND p.deleted_at IS NULL) AS product_count
    FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE s.slug=$1 AND s.status='approved'`, [req.params.slug]);
  if (!result.rowCount) throw new ApiError(404, "Not found.");
  res.json({ ...result.rows[0], is_approved: true });
});
