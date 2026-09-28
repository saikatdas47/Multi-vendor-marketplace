const base = process.env.BASE_URL || "http://localhost:8000";
const paths = ["/api/v1/products/?page_size=20", "/api/v1/categories/", "/api/v1/shops/"];

async function timed(path) {
  const start = performance.now();
  const response = await fetch(base + path);
  await response.arrayBuffer();
  return { ms: Number((performance.now() - start).toFixed(1)), cache: response.headers.get("x-cache") || "none" };
}

console.log("CommerceX performance benchmark");
for (const path of paths) {
  const cold = await timed(path);
  const warm = await timed(path);
  console.log(`${path}\n  first: ${cold.ms}ms (${cold.cache})\n  repeat: ${warm.ms}ms (${warm.cache})`);
}
