import "dotenv/config";
import bcrypt from "bcrypt";
import { transaction } from "../src/db/index.js";
import { shopMedia } from "./shopMedia.js";

const demoPassword = "CommerceX123!";
const password = await bcrypt.hash(demoPassword, 10);

const shops = [
  ["Dhaka Essentials", "dhaka-essentials", "Everyday electronics and useful home products."],
  ["Urban Thread", "urban-thread", "Comfortable fashion made for daily life."],
  ["Green Basket", "green-basket", "Fresh pantry goods and sustainable choices."],
  ["Tech Harbor", "tech-harbor", "Smart devices and dependable accessories."],
  ["Crafted Home", "crafted-home", "Warm, practical pieces for modern homes."],
  ["Mira Crafts", "mira-crafts", "Handmade local products awaiting approval."],
];

const categories = [
  ["Electronics", "electronics", "Devices and accessories"],
  ["Fashion", "fashion", "Clothing and everyday style"],
  ["Home & Living", "home-living", "Comfortable home essentials"],
  ["Beauty", "beauty", "Personal care and beauty"],
  ["Groceries", "groceries", "Pantry and fresh essentials"],
  ["Sports", "sports", "Fitness and outdoor gear"],
  ["Books", "books", "Books for learning and leisure"],
  ["Accessories", "accessories", "Useful lifestyle accessories"],
];

const productNames = [
  "Lumen 7 Pro Smartphone", "Wireless Studio Headphones", "Portable Bluetooth Speaker", "Smart Fitness Watch",
  "Classic Cotton Shirt", "Everyday Canvas Sneakers", "Lightweight Travel Jacket", "Minimal Leather Wallet",
  "Linen Table Lamp", "Ceramic Dinner Set", "Soft Cotton Bedsheet", "Bamboo Storage Basket",
  "Hydrating Face Serum", "Natural Body Lotion", "Matte Lip Color", "Herbal Hair Oil",
  "Premium Basmati Rice", "Organic Honey Jar", "Roasted Coffee Beans", "Healthy Snack Box",
  "Yoga Exercise Mat", "Adjustable Dumbbell Set", "Insulated Water Bottle", "Training Resistance Bands",
  "JavaScript Made Simple", "Modern Web Design", "Productivity Planner", "Bangladesh Travel Guide",
  "Laptop Sleeve", "USB-C Fast Charger", "Crossbody Day Bag", "Polarized Sunglasses",
];

const images = [
  "photo-1511707171634-5f897ff02aa9", "photo-1505740420928-5e560c06d30e", "photo-1608043152269-423dbba4e7e1", "photo-1523275335684-37898b6baf30",
  "photo-1598033129183-c4f50c736f10", "photo-1542291026-7eec264c27ff", "photo-1551028719-00167b16eac5", "photo-1627123424574-724758594e93",
  "photo-1507473885765-e6ed057f782c", "photo-1578749556568-bc2c40e68b61", "photo-1631679706909-1844bbd07221", "photo-1523413651479-597eb2da0ad6",
  "photo-1620916566398-39f1143ab7be", "photo-1556228720-195a672e8a03", "photo-1586495777744-4413f21062fa", "photo-1608248543803-ba4f8c70ae0b",
  "photo-1586201375761-83865001e31c", "photo-1587049352846-4a222e784d38", "photo-1447933601403-0c6688de566e", "photo-1604719312566-8912e9227c6a",
  "photo-1592432678016-e910b452f9a2", "photo-1638536532686-d610adfc8e5c", "photo-1602143407151-7111542de6e8", "photo-1598289431512-b97b0917affc",
  "photo-1516321318423-f06f85e504b3", "photo-1498050108023-c5249f4df085", "photo-1484480974693-6ca0a78fb36b", "photo-1526772662000-3f88f10405ff",
  "photo-1525547719571-a2d4ac8945e2", "photo-1583863788434-e58a36330cf0", "photo-1553062407-98eeb64c6a62", "photo-1511499767150-a48a237f0083",
];

await transaction(async (client) => {
  const addUser = async (email, first, last, role) => {
    const result = await client.query(
      `INSERT INTO users(email,password,first_name,last_name,phone,role,email_verified)
       VALUES($1,$2,$3,$4,$5,$6,TRUE) RETURNING *`,
      [email, password, first, last, `0170000${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`, role],
    );
    return result.rows[0];
  };

  const admin = await addUser("admin@commercex.test", "CommerceX", "Admin", "admin");
  const customers = [];
  const customerNames = [["Nadia", "Rahman"], ["Arif", "Hossain"], ["Sadia", "Islam"], ["Tanvir", "Ahmed"], ["Maliha", "Noor"], ["Rafi", "Hasan"], ["Nusrat", "Jahan"], ["Imran", "Kabir"]];
  for (let i = 0; i < customerNames.length; i += 1) {
    const [first, last] = customerNames[i];
    const email = i === 0 ? "customer@commercex.test" : `customer${i + 1}@commercex.test`;
    const user = await addUser(email, first, last, "customer");
    customers.push(user);
    await client.query("INSERT INTO customer_profiles(user_id,newsletter_opt_in) VALUES($1,$2)", [user.id, i % 2 === 0]);
    await client.query("INSERT INTO carts(user_id) VALUES($1)", [user.id]);
    await client.query(`INSERT INTO addresses(user_id,label,full_name,phone,line1,city,postal_code,country,is_default)
      VALUES($1,'Home',$2,$3,$4,$5,$6,'Bangladesh',TRUE)`, [user.id, `${first} ${last}`, user.phone, `${12 + i} Lake Road`, i % 3 === 0 ? "Chattogram" : "Dhaka", `12${String(i).padStart(2, "0")}`]);
  }

  const sellers = [];
  for (let i = 0; i < shops.length; i += 1) {
    const email = i === 0 ? "seller@commercex.test" : `seller${i + 1}@commercex.test`;
    const user = await addUser(email, shops[i][0].split(" ")[0], "Seller", "seller");
    const approved = i < shops.length - 1;
    const [shopName, slug, description] = shops[i];
    const media = shopMedia[slug];
    const result = await client.query(`INSERT INTO seller_profiles
      (user_id,shop_name,slug,description,logo,banner,business_email,business_phone,tax_id,status,commission_rate,approved_at,approved_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [user.id, shopName, slug, description, media.logo, media.banner, email, user.phone, `TAX-CX-${1000 + i}`, approved ? "approved" : "pending", 8 + i, approved ? new Date() : null, approved ? admin.id : null]);
    sellers.push({ ...result.rows[0], user });
  }

  const categoryRows = [];
  for (let i = 0; i < categories.length; i += 1) {
    const row = await client.query("INSERT INTO categories(name,slug,description,sort_order) VALUES($1,$2,$3,$4) RETURNING *", [...categories[i], i + 1]);
    categoryRows.push(row.rows[0]);
  }

  const products = [];
  for (let i = 0; i < productNames.length; i += 1) {
    const seller = sellers[i % 5];
    const category = categoryRows[Math.floor(i / 4)];
    const price = 18 + (i * 17) % 380;
    const slug = productNames[i].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const row = await client.query(`INSERT INTO products
      (seller_id,category_id,name,slug,sku,short_description,description,price,compare_at_price,cost_price,stock,low_stock_threshold,status,is_featured,view_count)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,5,'published',$12,$13) RETURNING *`,
      [seller.id, category.id, productNames[i], slug, `CX-${String(i + 1).padStart(4, "0")}`, `A dependable ${productNames[i].toLowerCase()} for everyday use.`, `Carefully selected by ${seller.shop_name}. Quality checked, practical, and ready for delivery.`, price, price + 25, Math.round(price * 0.62), 12 + (i * 7) % 80, i < 12, 40 + i * 13]);
    const product = row.rows[0];
    products.push(product);
    const image = `https://images.unsplash.com/${images[i]}?auto=format&fit=crop&w=900&q=80`;
    await client.query("INSERT INTO product_images(product_id,image,alt_text,is_primary) VALUES($1,$2,$3,TRUE)", [product.id, image, product.name]);
    if (i % 3 === 0) {
      await client.query("INSERT INTO product_variants(product_id,name,value,sku,price_delta,stock) VALUES($1,'Option',$2,$3,$4,$5)", [product.id, i % 2 ? "Large" : "Premium", `${product.sku}-V1`, 8, 10]);
    }
  }

  const reviewTexts = ["Excellent quality", "Very useful", "Good value", "Fast delivery", "Matches the description", "Would buy again"];
  for (let i = 0; i < 48; i += 1) {
    const product = products[i % products.length];
    const customer = customers[i % customers.length];
    await client.query(`INSERT INTO reviews(product_id,user_id,rating,title,comment,is_verified_purchase,helpful_count)
      VALUES($1,$2,$3,$4,$5,TRUE,$6) ON CONFLICT(product_id,user_id) DO NOTHING`,
      [product.id, customer.id, 4 + (i % 2), reviewTexts[i % reviewTexts.length], `${reviewTexts[(i + 2) % reviewTexts.length]}. The product arrived safely and works well.`, i % 9]);
  }

  const statuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
  for (let i = 0; i < 18; i += 1) {
    const customer = customers[i % customers.length];
    const product = products[(i * 3) % products.length];
    const seller = sellers[(i * 3) % 5];
    const quantity = 1 + (i % 3);
    const subtotal = Number(product.price) * quantity;
    const status = statuses[i % statuses.length];
    const order = await client.query(`INSERT INTO orders
      (number,customer_id,customer_email,status,payment_status,payment_method,ship_to_name,ship_to_phone,ship_to_line1,ship_to_city,ship_to_postal_code,ship_to_country,subtotal,shipping_fee,total,customer_note,placed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Bangladesh',$12,80,$13,$14,NOW()-($15 || ' days')::interval) RETURNING id`,
      [`CX-2026-${String(1001 + i)}`, customer.id, customer.email, status, status === "delivered" ? "paid" : "unpaid", i % 3 === 0 ? "card" : "cod", `${customer.first_name} ${customer.last_name}`, customer.phone, `${20 + i} Market Road`, i % 4 === 0 ? "Sylhet" : "Dhaka", `12${String(i).padStart(2, "0")}`, subtotal, subtotal + 80, i % 2 ? "Please call before delivery." : "", i]);
    const item = await client.query(`INSERT INTO order_items
      (order_id,product_id,seller_id,product_name,product_sku,product_slug,seller_name,unit_price,quantity,image_url,status,tracking_number)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [order.rows[0].id, product.id, seller.id, product.name, product.sku, product.slug, seller.shop_name, product.price, quantity, `https://images.unsplash.com/${images[(i * 3) % images.length]}?auto=format&fit=crop&w=500&q=75`, status, status === "shipped" ? `TRK${10000 + i}` : ""]);
    await client.query("INSERT INTO order_events(order_id,item_id,status,note,actor_id) VALUES($1,$2,$3,$4,$5)", [order.rows[0].id, item.rows[0].id, status, `Order is ${status}.`, status === "pending" ? customer.id : seller.user.id]);
  }

  const notice = await client.query("INSERT INTO admin_notices(author_id,subject,body,audience) VALUES($1,'Welcome to CommerceX','Keep your inventory and orders updated for the best customer experience.','all') RETURNING id", [admin.id]);
  for (let i = 0; i < 5; i += 1) {
    const seller = sellers[i];
    await client.query("INSERT INTO notice_recipients(notice_id,seller_id,read_at) VALUES($1,$2,$3)", [notice.rows[0].id, seller.id, i < 2 ? new Date() : null]);
    const conversation = await client.query("INSERT INTO conversations(seller_id,admin_unread,seller_unread,last_message_at) VALUES($1,1,1,NOW()) RETURNING id", [seller.id]);
    await client.query("INSERT INTO messages(conversation_id,sender_id,side,body,created_at) VALUES($1,$2,'seller',$3,NOW()-interval '2 hours')", [conversation.rows[0].id, seller.user.id, `Hello, this is ${seller.shop_name}. We have updated our inventory.`]);
    await client.query("INSERT INTO messages(conversation_id,sender_id,side,body,created_at) VALUES($1,$2,'admin',$3,NOW()-interval '1 hour')", [conversation.rows[0].id, admin.id, "Thanks for the update. Your storefront looks good."]);
    await client.query("INSERT INTO messages(conversation_id,sender_id,side,body) VALUES($1,$2,'seller',$3)", [conversation.rows[0].id, seller.user.id, "Great, we are ready to process new orders."]);
    await client.query(`INSERT INTO invoices(seller_id,period,amount,due_date,status,note)
      VALUES($1,date_trunc('month',CURRENT_DATE)::date,$2,(date_trunc('month',CURRENT_DATE)+interval '1 month 7 days')::date,$3,$4)`, [seller.id, 29 + i * 5, i === 0 ? "submitted" : "due", "Monthly marketplace subscription"]);
  }

  const cart = await client.query("SELECT id FROM carts WHERE user_id=$1", [customers[0].id]);
  for (let i = 0; i < 3; i += 1) {
    await client.query("INSERT INTO cart_items(cart_id,product_id,quantity,unit_price) VALUES($1,$2,$3,$4)", [cart.rows[0].id, products[i].id, 1 + (i % 2), products[i].price]);
    await client.query("INSERT INTO wishlist_items(user_id,product_id) VALUES($1,$2)", [customers[0].id, products[i + 4].id]);
  }
});

console.log("Seed complete: 15 users, 6 sellers, 8 categories, 32 products, 18 orders, reviews, chats, notices and invoices.");
console.log(`Demo password: ${demoPassword}`);
process.exit(0);
