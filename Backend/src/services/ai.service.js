const defaultReply = (products) => products.length
  ? `I found ${products.length} product${products.length === 1 ? "" : "s"} that match your request. Open any product below to see details.`
  : "I could not find an exact match. Try a product name, category, or price range.";

export const createShoppingReply = async (message, products) => {
  if (!process.env.GROQ_API_KEY || !products.length) return defaultReply(products);

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.GROQ_TIMEOUT_MS || 20000),
  );

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        messages: [
          {
            role: "system",
            content: "You are a concise shopping assistant. Use short natural sentences and avoid em dashes. Only recommend supplied products.",
          },
          { role: "user", content: `Question: ${message}\nProducts: ${JSON.stringify(products)}` },
        ],
        max_tokens: Number(process.env.ASSISTANT_MAX_TOKENS || 320),
      }),
    });

    if (!response.ok) return defaultReply(products);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || defaultReply(products);
  } catch (error) {
    console.warn("AI provider unavailable, using catalogue fallback:", error.message);
    return defaultReply(products);
  } finally {
    clearTimeout(timeout);
  }
};
