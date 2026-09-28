SET search_path TO public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(254) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  first_name VARCHAR(150) DEFAULT '',
  last_name VARCHAR(150) DEFAULT '',
  phone VARCHAR(20) DEFAULT '',
  avatar TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','seller','admin')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE email_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(20) NOT NULL,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE TABLE customer_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date_of_birth DATE,
  newsletter_opt_in BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE seller_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_name VARCHAR(150) UNIQUE NOT NULL,
  slug VARCHAR(170) UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  logo TEXT,
  banner TEXT,
  business_email VARCHAR(254) DEFAULT '',
  business_phone VARCHAR(20) DEFAULT '',
  tax_id VARCHAR(60) DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10,
  approved_at TIMESTAMPTZ,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL DEFAULT 'shipping',
  label VARCHAR(50) DEFAULT '', full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(20) NOT NULL, line1 VARCHAR(255) NOT NULL, line2 VARCHAR(255) DEFAULT '',
  city VARCHAR(100) NOT NULL, state VARCHAR(100) DEFAULT '', postal_code VARCHAR(20) NOT NULL,
  country VARCHAR(100) NOT NULL DEFAULT 'Bangladesh', is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY, actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(20) NOT NULL, target_model VARCHAR(100) DEFAULT '', target_id VARCHAR(64) DEFAULT '',
  changes JSONB NOT NULL DEFAULT '{}', ip_address VARCHAR(64), user_agent VARCHAR(255) DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) UNIQUE NOT NULL, description TEXT DEFAULT '', image TEXT,
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE, sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(parent_id, name)
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), seller_id INTEGER NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id), name VARCHAR(200) NOT NULL,
  slug VARCHAR(230) UNIQUE NOT NULL, sku VARCHAR(64) UNIQUE NOT NULL,
  short_description VARCHAR(300) DEFAULT '', description TEXT DEFAULT '',
  price NUMERIC(12,2) NOT NULL CHECK (price > 0), compare_at_price NUMERIC(12,2), cost_price NUMERIC(12,2),
  stock INTEGER NOT NULL DEFAULT 0, low_stock_threshold INTEGER NOT NULL DEFAULT 5, weight_grams INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'draft', is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  view_count INTEGER NOT NULL DEFAULT 0, deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_images (
  id BIGSERIAL PRIMARY KEY, product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image TEXT NOT NULL, alt_text VARCHAR(150) DEFAULT '', is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_variants (
  id BIGSERIAL PRIMARY KEY, product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL, value VARCHAR(100) NOT NULL, sku VARCHAR(64) UNIQUE NOT NULL,
  price_delta NUMERIC(10,2) NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE, UNIQUE(product_id, name, value)
);

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title VARCHAR(150) DEFAULT '', comment TEXT DEFAULT '', is_verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
  is_approved BOOLEAN NOT NULL DEFAULT TRUE, helpful_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, user_id)
);

CREATE TABLE carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id BIGINT REFERENCES product_variants(id) ON DELETE CASCADE, quantity INTEGER NOT NULL CHECK(quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cart_id, product_id, variant_id)
);

CREATE TABLE wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), number VARCHAR(32) UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES users(id) ON DELETE SET NULL, customer_email VARCHAR(254) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid',
  payment_method VARCHAR(20) NOT NULL DEFAULT 'cod', payment_reference VARCHAR(120) DEFAULT '',
  ship_to_name VARCHAR(150) NOT NULL, ship_to_phone VARCHAR(20) NOT NULL, ship_to_line1 VARCHAR(255) NOT NULL,
  ship_to_line2 VARCHAR(255) DEFAULT '', ship_to_city VARCHAR(100) NOT NULL, ship_to_state VARCHAR(100) DEFAULT '',
  ship_to_postal_code VARCHAR(20) NOT NULL, ship_to_country VARCHAR(100) NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0, shipping_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0, tax NUMERIC(10,2) NOT NULL DEFAULT 0, total NUMERIC(12,2) NOT NULL DEFAULT 0,
  customer_note TEXT DEFAULT '', cancel_reason TEXT DEFAULT '', placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL, variant_id BIGINT REFERENCES product_variants(id) ON DELETE SET NULL,
  seller_id INTEGER REFERENCES seller_profiles(id) ON DELETE SET NULL, product_name VARCHAR(200) NOT NULL,
  product_sku VARCHAR(64) NOT NULL, product_slug VARCHAR(230) DEFAULT '', variant_label VARCHAR(120) DEFAULT '',
  seller_name VARCHAR(150) NOT NULL, unit_price NUMERIC(12,2) NOT NULL, quantity INTEGER NOT NULL,
  image_url TEXT DEFAULT '', status VARCHAR(20) NOT NULL DEFAULT 'pending', tracking_number VARCHAR(120) DEFAULT '',
  stock_released BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_events (
  id BIGSERIAL PRIMARY KEY, order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES order_items(id) ON DELETE CASCADE, status VARCHAR(20) NOT NULL,
  note VARCHAR(255) DEFAULT '', actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  subject VARCHAR(160) NOT NULL, body TEXT NOT NULL, audience VARCHAR(10) NOT NULL DEFAULT 'selected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE notice_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), notice_id UUID NOT NULL REFERENCES admin_notices(id) ON DELETE CASCADE,
  seller_id INTEGER NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE, read_at TIMESTAMPTZ,
  UNIQUE(notice_id, seller_id)
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), seller_id INTEGER UNIQUE NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), admin_unread INTEGER NOT NULL DEFAULT 0,
  seller_unread INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL, side VARCHAR(8) NOT NULL, body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), seller_id INTEGER NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  period DATE NOT NULL, amount NUMERIC(10,2) NOT NULL DEFAULT 29, status VARCHAR(12) NOT NULL DEFAULT 'due', due_date DATE NOT NULL,
  payment_reference VARCHAR(120) DEFAULT '', submitted_at TIMESTAMPTZ, paid_at TIMESTAMPTZ,
  confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL, note VARCHAR(255) DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(seller_id, period)
);

CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(140) DEFAULT '', message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL, content TEXT NOT NULL, product_ids JSONB NOT NULL DEFAULT '[]',
  retrieval_meta JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX products_catalog_idx ON products(status, created_at DESC);
CREATE INDEX products_seller_idx ON products(seller_id, status);
CREATE INDEX reviews_product_idx ON reviews(product_id, created_at DESC);
CREATE INDEX orders_customer_idx ON orders(customer_id, placed_at DESC);
CREATE INDEX order_items_seller_idx ON order_items(seller_id, status);
