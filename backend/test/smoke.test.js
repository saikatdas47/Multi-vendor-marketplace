import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import app from "../src/app.js";

async function withServer(run) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("health endpoint exposes service and cache state", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/health/`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.service, "commercex-node");
    assert.ok(["connected", "fallback"].includes(body.redis));
  });
});

test("protected customer endpoint rejects anonymous requests", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/v1/cart/`);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).detail, "Authentication credentials were not provided.");
  });
});
