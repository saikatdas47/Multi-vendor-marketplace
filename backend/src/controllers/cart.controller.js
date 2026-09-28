import { query } from "../db/index.js";
import ApiError from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";

const getCartId = async (userId) => {
  const result = await query("INSERT INTO carts(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET updated_at=NOW() RETURNING id", [userId]);
  return result.rows[0].id;
};

const cartPayload = async (userId) => {
  const cartId = await getCartId(userId);
  const items = await query(`SELECT ci.*,p.name AS product_name,p.slug AS product_slug,p.stock,p.status,
    s.shop_name AS seller_name,pv.name AS variant_name,pv.value AS variant_value,pv.stock AS variant_stock,
    COALESCE((SELECT image FROM product_images WHERE product_id=p.id ORDER BY is_primary DESC,sort_order LIMIT 1),'') AS image
    FROM cart_items ci JOIN products p ON p.id=ci.product_id JOIN seller_profiles s ON s.id=p.seller_id
    LEFT JOIN product_variants pv ON pv.id=ci.variant_id WHERE ci.cart_id=$1 ORDER BY ci.created_at`, [cartId]);
  const formatted = items.rows.map(i => ({
    ...i, product: { id:i.product_id,name:i.product_name,slug:i.product_slug,primary_image:i.image,seller:{shop_name:i.seller_name} },
    variant: i.variant_id ? {id:i.variant_id,name:i.variant_name,value:i.variant_value} : null,
    unit_price: Number(i.unit_price).toFixed(2), line_total: (Number(i.unit_price)*i.quantity).toFixed(2),
    available_stock: i.variant_id ? i.variant_stock : i.stock,
  }));
  const subtotal = formatted.reduce((sum, item) => sum + Number(item.line_total), 0);
  return { id:cartId, items:formatted, subtotal:subtotal.toFixed(2), total_quantity:formatted.reduce((s,i)=>s+i.quantity,0), distinct_items:formatted.length, issues:[] };
};

export const getCart = asyncHandler(async (req, res) => res.json(await cartPayload(req.user.id)));
export const clearCart = asyncHandler(async (req, res) => { const id=await getCartId(req.user.id); await query("DELETE FROM cart_items WHERE cart_id=$1",[id]); res.status(204).send(); });

export const addItem = asyncHandler(async (req, res) => {
  const cartId=await getCartId(req.user.id);
  const product=(await query("SELECT * FROM products WHERE id=$1 AND status='published' AND deleted_at IS NULL",[req.body.product])).rows[0];
  if(!product) throw new ApiError(404,"Product not found.");
  const variantId=req.body.variant||null;
  let price=Number(product.price), stock=product.stock;
  if(variantId){ const v=(await query("SELECT * FROM product_variants WHERE id=$1 AND product_id=$2 AND is_active=TRUE",[variantId,product.id])).rows[0]; if(!v) throw new ApiError(400,"Invalid variant."); price+=Number(v.price_delta); stock=v.stock; }
  const quantity=Number(req.body.quantity||1); if(quantity<1||quantity>stock) throw new ApiError(400,"Requested quantity is not available.");
  await query(`INSERT INTO cart_items(cart_id,product_id,variant_id,quantity,unit_price) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(cart_id,product_id,variant_id) DO UPDATE SET quantity=cart_items.quantity+EXCLUDED.quantity,unit_price=EXCLUDED.unit_price,updated_at=NOW()`,[cartId,product.id,variantId,quantity,price]);
  res.status(201).json(await cartPayload(req.user.id));
});

export const updateItem = asyncHandler(async (req,res)=>{ const cartId=await getCartId(req.user.id); const result=await query("UPDATE cart_items SET quantity=$1,updated_at=NOW() WHERE id=$2 AND cart_id=$3 RETURNING id",[req.body.quantity,req.params.id,cartId]); if(!result.rowCount) throw new ApiError(404,"Not found."); res.json(await cartPayload(req.user.id)); });
export const removeItem = asyncHandler(async (req,res)=>{ const cartId=await getCartId(req.user.id); await query("DELETE FROM cart_items WHERE id=$1 AND cart_id=$2",[req.params.id,cartId]); res.json(await cartPayload(req.user.id)); });
export const resyncPrice = asyncHandler(async (req,res)=>{ const cartId=await getCartId(req.user.id); await query(`UPDATE cart_items ci SET unit_price=p.price+COALESCE(v.price_delta,0),updated_at=NOW() FROM products p LEFT JOIN product_variants v ON v.id=ci.variant_id WHERE ci.product_id=p.id AND ci.id=$1 AND ci.cart_id=$2`,[req.params.id,cartId]); res.json(await cartPayload(req.user.id)); });

export const wishlist = asyncHandler(async (req,res)=>{ const rows=await query(`SELECT w.id,w.created_at,p.*,COALESCE((SELECT image FROM product_images WHERE product_id=p.id ORDER BY is_primary DESC LIMIT 1),'') AS primary_image FROM wishlist_items w JOIN products p ON p.id=w.product_id WHERE w.user_id=$1 ORDER BY w.created_at DESC`,[req.user.id]); res.json({count:rows.rowCount,next:null,previous:null,results:rows.rows.map(r=>({id:r.id,created_at:r.created_at,product:r}))}); });
export const toggleWishlist = asyncHandler(async (req,res)=>{ const found=await query("DELETE FROM wishlist_items WHERE user_id=$1 AND product_id=$2 RETURNING id",[req.user.id,req.body.product]); if(found.rowCount) return res.json({added:false}); const item=await query("INSERT INTO wishlist_items(user_id,product_id) VALUES($1,$2) RETURNING *",[req.user.id,req.body.product]); res.status(201).json({added:true,item:item.rows[0]}); });
export const removeWishlist = asyncHandler(async (req,res)=>{ await query("DELETE FROM wishlist_items WHERE id=$1 AND user_id=$2",[req.params.id,req.user.id]); res.status(204).send(); });
export const moveWishlist = asyncHandler(async (req,res)=>{ const item=(await query("SELECT product_id FROM wishlist_items WHERE id=$1 AND user_id=$2",[req.params.id,req.user.id])).rows[0]; if(!item) throw new ApiError(404,"Not found."); req.body={product:item.product_id,quantity:1}; await query("DELETE FROM wishlist_items WHERE id=$1",[req.params.id]); return addItem(req,res); });
