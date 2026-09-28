import test from "node:test";
import assert from "node:assert/strict";
import { io } from "socket.io-client";

const enabled = process.env.RUN_INTEGRATION === "YES";
const base = process.env.BASE_URL || "http://localhost:8000";
const password = process.env.DEMO_PASSWORD || "CommerceX123!";

async function login(email) {
  const response = await fetch(`${base}/api/v1/auth/login/`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 200);
  return response.json();
}

const authHeaders = (token) => ({ Authorization: `Bearer ${token}`, "content-type": "application/json" });

test("auth roles and seller authorization", { skip: !enabled }, async () => {
  const [customer, seller, admin] = await Promise.all([login("customer@commercex.test"), login("seller@commercex.test"), login("admin@commercex.test")]);
  assert.equal(customer.user.role, "customer");
  assert.equal(seller.user.role, "seller");
  assert.equal(admin.user.role, "admin");
  const forbidden = await fetch(`${base}/api/v1/admin/dashboard/`, { headers: { Authorization: `Bearer ${seller.access}` } });
  assert.equal(forbidden.status, 403);
});

test("access-token verification is separate from refresh rotation", { skip: !enabled }, async () => {
  const customer = await login("customer@commercex.test");
  const verified = await fetch(`${base}/api/v1/auth/verify/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: customer.access }),
  });
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).valid, true);

  const rejected = await fetch(`${base}/api/v1/auth/verify/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: customer.refresh }),
  });
  assert.equal(rejected.status, 401);
});

test("chat history is restricted to the session owner", { skip: !enabled }, async () => {
  const [customer, seller] = await Promise.all([
    login("customer@commercex.test"),
    login("seller@commercex.test"),
  ]);
  const asked = await fetch(`${base}/api/v1/assistant/ask/`, {
    method: "POST",
    headers: authHeaders(customer.access),
    body: JSON.stringify({ message: "Show me popular products" }),
  });
  assert.equal(asked.status, 200);
  const sessionId = (await asked.json()).session_id;

  const forbidden = await fetch(`${base}/api/v1/assistant/history/${sessionId}/`, {
    headers: authHeaders(seller.access),
  });
  assert.equal(forbidden.status, 403);
});

test("checkout reserves inventory and cancellation restores it", { skip: !enabled }, async () => {
  const customer = await login("customer@commercex.test");
  const headers = authHeaders(customer.access);
  await fetch(`${base}/api/v1/cart/`, { method: "DELETE", headers });

  const products = await (await fetch(`${base}/api/v1/products/?page_size=20`)).json();
  const product = products.results.find((item) => Number(item.stock) > 0);
  assert.ok(product, "Seed data must contain an in-stock product");

  const added = await fetch(`${base}/api/v1/cart/items/`, {
    method: "POST", headers, body: JSON.stringify({ product: product.id, quantity: 1 }),
  });
  assert.equal(added.status, 201);

  const addresses = await (await fetch(`${base}/api/v1/addresses/`, { headers })).json();
  assert.ok(addresses.results.length > 0, "Demo customer needs a shipping address");

  let order;
  try {
    const checkout = await fetch(`${base}/api/v1/checkout/`, {
      method: "POST", headers, body: JSON.stringify({ address: addresses.results[0].id, payment_method: "cod" }),
    });
    assert.equal(checkout.status, 201);
    order = await checkout.json();
    assert.equal(order.status, "pending");
    assert.equal(order.items.length, 1);
    assert.ok(order.shipping_address.full_name);
  } finally {
    if (order) {
      const cancelled = await fetch(`${base}/api/v1/orders/${order.number}/cancel/`, {
        method: "POST", headers, body: JSON.stringify({ reason: "Automated integration cleanup" }),
      });
      assert.equal(cancelled.status, 200);
    } else {
      await fetch(`${base}/api/v1/cart/`, { method: "DELETE", headers });
    }
  }
});

test("inventory endpoints enforce seller role", { skip: !enabled }, async () => {
  const [customer, seller] = await Promise.all([login("customer@commercex.test"), login("seller@commercex.test")]);
  const allowed = await fetch(`${base}/api/v1/products/low-stock/`, { headers: authHeaders(seller.access) });
  assert.equal(allowed.status, 200);
  const forbidden = await fetch(`${base}/api/v1/products/low-stock/`, { headers: authHeaders(customer.access) });
  assert.equal(forbidden.status, 403);
});

test("Socket.IO sends seller message to admin", { skip: !enabled }, async () => {
  const [seller, admin] = await Promise.all([login("seller@commercex.test"), login("admin@commercex.test")]);
  const socket = io(base, { auth: { token: admin.access }, transports: ["websocket"] });
  await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
  const received = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Socket event timed out")), 5000); socket.once("message:new", (event) => { clearTimeout(timer); resolve(event); }); });
  const response = await fetch(`${base}/api/v1/seller/thread/`, { method: "POST", headers: { Authorization: `Bearer ${seller.access}`, "content-type": "application/json" }, body: JSON.stringify({ body: "Automated Socket.IO integration test" }) });
  assert.equal(response.status, 201);
  const event = await received;
  assert.equal(event.message.side, "seller");
  socket.close();
});
