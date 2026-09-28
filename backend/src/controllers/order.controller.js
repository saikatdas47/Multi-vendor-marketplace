import { query, transaction } from "../db/index.js";
import ApiError from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { pageValues, paginated } from "../utils/helpers.js";
import { emitUser } from "../socket.js";

const orderDetails = async (number,userId,role="customer")=>{
  let sql="SELECT * FROM orders WHERE number=$1"; const values=[number];
  if(role==="customer"){values.push(userId);sql+=" AND customer_id=$2";}
  const order=(await query(sql,values)).rows[0]; if(!order) return null;
  order.items=(await query("SELECT *, (unit_price*quantity)::numeric AS line_total FROM order_items WHERE order_id=$1 ORDER BY created_at",[order.id])).rows;
  order.events=(await query("SELECT * FROM order_events WHERE order_id=$1 ORDER BY created_at",[order.id])).rows;
  order.shipping_address={full_name:order.ship_to_name||"",phone:order.ship_to_phone||"",line1:order.ship_to_line1||"",line2:order.ship_to_line2||"",city:order.ship_to_city||"",state:order.ship_to_state||"",postal_code:order.ship_to_postal_code||"",country:order.ship_to_country||""};
  order.item_count=order.items.reduce((s,i)=>s+i.quantity,0); order.can_customer_cancel=["pending","confirmed"].includes(order.status);
  return order;
};

export const checkout = asyncHandler(async(req,res)=>{
  const address=(await query("SELECT * FROM addresses WHERE id=$1 AND user_id=$2",[req.body.address,req.user.id])).rows[0];
  if(!address) throw new ApiError(400,"A valid shipping address is required.");
  const order=await transaction(async(client)=>{
    const cart=(await client.query("SELECT id FROM carts WHERE user_id=$1",[req.user.id])).rows[0];
    const items=cart?(await client.query(`SELECT ci.*,p.name,p.slug,p.sku,p.stock,p.price,p.seller_id,s.shop_name,
      pv.stock AS variant_stock,pv.name AS variant_name,pv.value AS variant_value,pv.price_delta,
      COALESCE((SELECT image FROM product_images WHERE product_id=p.id ORDER BY is_primary DESC LIMIT 1),'') AS image
      FROM cart_items ci JOIN products p ON p.id=ci.product_id JOIN seller_profiles s ON s.id=p.seller_id LEFT JOIN product_variants pv ON pv.id=ci.variant_id WHERE ci.cart_id=$1 FOR UPDATE OF p`,[cart.id])).rows:[];
    if(!items.length) throw new ApiError(400,"Your cart is empty.");
    for(const item of items){ const stock=item.variant_id?item.variant_stock:item.stock; if(stock<item.quantity) throw new ApiError(400,`${item.name} does not have enough stock.`); }
    const subtotal=items.reduce((s,i)=>s+Number(i.unit_price)*i.quantity,0), shipping=Number(req.body.shipping_fee||0), tax=Number(req.body.tax||0), discount=Number(req.body.discount||0);
    const number=`CX-${Date.now()}-${Math.floor(Math.random()*900+100)}`;
    const created=await client.query(`INSERT INTO orders(number,customer_id,customer_email,payment_method,ship_to_name,ship_to_phone,ship_to_line1,ship_to_line2,ship_to_city,ship_to_state,ship_to_postal_code,ship_to_country,subtotal,shipping_fee,tax,discount,total,customer_note)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,[number,req.user.id,req.user.email,req.body.payment_method||"cod",address.full_name,address.phone,address.line1,address.line2,address.city,address.state,address.postal_code,address.country,subtotal,shipping,tax,discount,subtotal+shipping+tax-discount,req.body.customer_note||""]);
    for(const item of items){
      const price=Number(item.price)+Number(item.price_delta||0);
      const made=await client.query(`INSERT INTO order_items(order_id,product_id,variant_id,seller_id,product_name,product_sku,product_slug,variant_label,seller_name,unit_price,quantity,image_url)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,[created.rows[0].id,item.product_id,item.variant_id,item.seller_id,item.name,item.sku,item.slug,item.variant_id?`${item.variant_name}: ${item.variant_value}`:"",item.shop_name,price,item.quantity,item.image]);
      if(item.variant_id) await client.query("UPDATE product_variants SET stock=stock-$1 WHERE id=$2",[item.quantity,item.variant_id]); else await client.query("UPDATE products SET stock=stock-$1 WHERE id=$2",[item.quantity,item.product_id]);
      await client.query("INSERT INTO order_events(order_id,item_id,status,actor_id,note) VALUES($1,$2,'pending',$3,'Order placed')",[created.rows[0].id,made.rows[0].id,req.user.id]);
    }
    await client.query("DELETE FROM cart_items WHERE cart_id=$1",[cart.id]); return created.rows[0];
  });
  res.status(201).json(await orderDetails(order.number,req.user.id));
});

export const orders=asyncHandler(async(req,res)=>{const {pageSize,offset}=pageValues(req.query);const count=await query("SELECT COUNT(*) FROM orders WHERE customer_id=$1",[req.user.id]);const rows=await query(`SELECT o.*,(SELECT COUNT(*)::int FROM order_items WHERE order_id=o.id) AS item_count FROM orders o WHERE customer_id=$1 ORDER BY placed_at DESC LIMIT $2 OFFSET $3`,[req.user.id,pageSize,offset]);res.json(paginated(rows.rows,Number(count.rows[0].count),req,pageSize));});
export const order=asyncHandler(async(req,res)=>{const data=await orderDetails(req.params.number,req.user.id);if(!data)throw new ApiError(404,"Not found.");res.json(data);});
export const cancelOrder=asyncHandler(async(req,res)=>{const current=await orderDetails(req.params.number,req.user.id);if(!current)throw new ApiError(404,"Not found.");if(!current.can_customer_cancel)throw new ApiError(400,"This order can no longer be cancelled.");await transaction(async client=>{await client.query("UPDATE orders SET status='cancelled',cancel_reason=$1,updated_at=NOW() WHERE id=$2",[req.body.reason||"",current.id]);for(const item of current.items){if(item.variant_id)await client.query("UPDATE product_variants SET stock=stock+$1 WHERE id=$2",[item.quantity,item.variant_id]);else if(item.product_id)await client.query("UPDATE products SET stock=stock+$1 WHERE id=$2",[item.quantity,item.product_id]);}await client.query("UPDATE order_items SET status='cancelled',stock_released=TRUE WHERE order_id=$1",[current.id]);});res.json(await orderDetails(req.params.number,req.user.id));});

const sellerProfile=async userId=>(await query("SELECT * FROM seller_profiles WHERE user_id=$1",[userId])).rows[0];
export const sellerItems=asyncHandler(async(req,res)=>{const seller=await sellerProfile(req.user.id);const rows=await query(`SELECT oi.*,o.number AS order_number,o.customer_email,o.placed_at,o.ship_to_name,o.ship_to_city FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.seller_id=$1 ORDER BY o.placed_at DESC`,[seller?.id]);res.json({count:rows.rowCount,next:null,previous:null,results:rows.rows});});
export const sellerSummary=asyncHandler(async(req,res)=>{const seller=await sellerProfile(req.user.id);const rows=await query(`SELECT COUNT(*)::int AS total_items,COALESCE(SUM(unit_price*quantity),0)::numeric AS gross_sales,COUNT(*) FILTER(WHERE status='pending')::int AS pending,COUNT(*) FILTER(WHERE status='shipped')::int AS shipped FROM order_items WHERE seller_id=$1`,[seller?.id]);res.json(rows.rows[0]);});
export const setItemStatus=asyncHandler(async(req,res)=>{const seller=await sellerProfile(req.user.id);const allowed={pending:["confirmed","cancelled"],confirmed:["packed","cancelled"],packed:["shipped","cancelled"],shipped:["out_for_delivery","delivered"],out_for_delivery:["delivered"],delivered:["completed","refunded"]};const current=(await query("SELECT * FROM order_items WHERE id=$1 AND seller_id=$2",[req.params.id,seller?.id])).rows[0];if(!current)throw new ApiError(404,"Not found.");if(!allowed[current.status]?.includes(req.body.status))throw new ApiError(400,"Invalid status transition.");if(req.body.status==="shipped"&&!req.body.tracking_number&&!current.tracking_number)throw new ApiError(400,"Tracking number is required when shipping.");const updated=await query("UPDATE order_items SET status=$1,tracking_number=COALESCE($2,tracking_number),updated_at=NOW() WHERE id=$3 RETURNING *",[req.body.status,req.body.tracking_number,req.params.id]);await query("INSERT INTO order_events(order_id,item_id,status,note,actor_id) VALUES($1,$2,$3,$4,$5)",[current.order_id,current.id,req.body.status,req.body.note||"",req.user.id]);const items=(await query("SELECT status FROM order_items WHERE order_id=$1",[current.order_id])).rows.map(x=>x.status);let orderStatus="confirmed";if(items.every(x=>x==="cancelled"))orderStatus="cancelled";else if(items.every(x=>["delivered","completed","refunded"].includes(x)))orderStatus="delivered";else if(items.some(x=>["shipped","out_for_delivery"].includes(x)))orderStatus="shipped";else if(items.some(x=>["confirmed","packed"].includes(x)))orderStatus="processing";const order=(await query("UPDATE orders SET status=$1,delivered_at=CASE WHEN $3 THEN NOW() ELSE delivered_at END,updated_at=NOW() WHERE id=$2 RETURNING number,customer_id,status",[orderStatus,current.order_id,orderStatus==="delivered"])).rows[0];emitUser(order.customer_id,"order:updated",{order_number:order.number,status:order.status,item:updated.rows[0]});res.json({...updated.rows[0],order_status:order.status});});

export const adminOrders=asyncHandler(async(req,res)=>{const rows=await query("SELECT * FROM orders ORDER BY placed_at DESC");res.json({count:rows.rowCount,next:null,previous:null,results:rows.rows});});
