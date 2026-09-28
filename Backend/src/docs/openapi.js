export const openapi = {
  openapi: "3.0.3",
  info: {
    title: process.env.API_TITLE || "CommerceX API",
    version: process.env.API_VERSION || "1.0.0",
    description: "Node.js and Express API for the CommerceX multi-vendor marketplace.",
  },
  servers: [{ url: "/api/v1", description: "Current server" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      ApiError: {
        type: "object",
        properties: {
          detail: { type: "string" },
          errors: { type: "array", items: { type: "object" } },
        },
      },
      Login: {
        type: "object", required: ["email", "password"],
        properties: { email: { type: "string", format: "email" }, password: { type: "string", format: "password" } },
      },
      Refresh: {
        type: "object", required: ["refresh"], properties: { refresh: { type: "string" } },
      },
      AssistantQuestion: {
        type: "object", required: ["message"],
        properties: { message: { type: "string", maxLength: 1000 }, session_id: { type: "string", format: "uuid" } },
      },
    },
  },
  paths: {
    "/auth/login/": {
      post: { tags: ["Auth"], summary: "Sign in", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Login" } } } }, responses: { 200: { description: "JWT pair and user" }, 401: { description: "Invalid credentials" } } },
    },
    "/auth/refresh/": {
      post: { tags: ["Auth"], summary: "Rotate a refresh token", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Refresh" } } } }, responses: { 200: { description: "New JWT pair" }, 401: { description: "Invalid or expired refresh token" } } },
    },
    "/auth/verify/": {
      post: { tags: ["Auth"], summary: "Verify an access token", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token"], properties: { token: { type: "string" } } } } } }, responses: { 200: { description: "Token is valid" }, 401: { description: "Token is invalid" } } },
    },
    "/products/": {
      get: { tags: ["Catalogue"], summary: "List and search products", parameters: [{ in: "query", name: "search", schema: { type: "string" } }, { in: "query", name: "page", schema: { type: "integer" } }], responses: { 200: { description: "Paginated product list" } } },
    },
    "/assistant/ask/": {
      post: { tags: ["Assistant"], summary: "Ask the grounded shopping assistant", security: [{ bearerAuth: [] }, {}], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AssistantQuestion" } } } }, responses: { 200: { description: "Grounded answer and product candidates" }, 403: { description: "Session belongs to another user" } } },
    },
    "/assistant/history/{id}/": {
      get: { tags: ["Assistant"], summary: "Read your chat session", security: [{ bearerAuth: [] }], parameters: [{ in: "path", name: "id", required: true, schema: { type: "string", format: "uuid" } }], responses: { 200: { description: "Owned session with messages" }, 403: { description: "Not the session owner" } } },
    },
    "/checkout/": {
      post: { tags: ["Orders"], summary: "Create an order with atomic stock reservation", security: [{ bearerAuth: [] }], responses: { 201: { description: "Order created" }, 400: { description: "Invalid cart or stock" } } },
    },
    "/seller/thread/": {
      get: { tags: ["Messaging"], summary: "Get the authenticated seller conversation", security: [{ bearerAuth: [] }], responses: { 200: { description: "Conversation" } } },
      post: { tags: ["Messaging"], summary: "Send a seller message", security: [{ bearerAuth: [] }], responses: { 201: { description: "Message created" } } },
    },
  },
};

export const swaggerHtml = `<!doctype html>
<html><head><meta charset="utf-8"><title>CommerceX API Docs</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({url:'/api/docs/openapi.json',dom_id:'#swagger-ui',deepLinking:true,persistAuthorization:true});</script></body></html>`;
