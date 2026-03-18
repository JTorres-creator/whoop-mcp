import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { createWhoopMcpServer } from "./src/server";

const app = express();
app.use(express.json());

// Helper to get credentials from env or query
function getCredentials(req: express.Request) {
  const whoopEmail =
    (req.query.whoopEmail as string) || process.env.WHOOP_EMAIL;
  const whoopPassword =
    (req.query.whoopPassword as string) || process.env.WHOOP_PASSWORD;
  const mcpAuthToken =
    (req.query.mcpAuthToken as string) || process.env.MCP_AUTH_TOKEN;
  return { whoopEmail, whoopPassword, mcpAuthToken };
}

// Auth check helper
function checkAuth(req: express.Request, mcpAuthToken: string | undefined, res: express.Response): boolean {
  if (!mcpAuthToken) return true;

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: "Unauthorized", message: "Authorization header is required" });
    return false;
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token || token !== mcpAuthToken) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid authentication token" });
    return false;
  }

  return true;
}

// --- Streamable HTTP transport (POST /mcp) ---
app.post("/mcp", async (req, res) => {
  const { whoopEmail, whoopPassword, mcpAuthToken } = getCredentials(req);

  if (!whoopEmail || !whoopPassword) {
    return res.status(400).json({
      error: "Bad Request",
      message: "whoopEmail and whoopPassword are required (via query params or environment variables)",
    });
  }

  if (!checkAuth(req, mcpAuthToken, res)) return;

  const server = createWhoopMcpServer({ email: whoopEmail, password: whoopPassword });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    transport.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// --- SSE transport (GET /sse + POST /messages) ---
// This is what Claude.ai custom connectors use
const sseTransports = new Map<string, SSEServerTransport>();

app.get("/sse", async (req, res) => {
  const { whoopEmail, whoopPassword, mcpAuthToken } = getCredentials(req);

  if (!whoopEmail || !whoopPassword) {
    return res.status(400).json({
      error: "Bad Request",
      message: "whoopEmail and whoopPassword are required",
    });
  }

  if (!checkAuth(req, mcpAuthToken, res)) return;

  const server = createWhoopMcpServer({ email: whoopEmail, password: whoopPassword });
  const transport = new SSEServerTransport("/messages", res);

  sseTransports.set(transport.sessionId, transport);

  res.on("close", () => {
    sseTransports.delete(transport.sessionId);
    transport.close();
  });

  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = sseTransports.get(sessionId);

  if (!transport) {
    return res.status(400).json({ error: "Bad Request", message: "Invalid or expired session" });
  }

  await transport.handlePostMessage(req, res, req.body);
});

// --- Also support GET /mcp for SSE (Claude.ai may try this path) ---
app.get("/mcp", async (req, res) => {
  const { whoopEmail, whoopPassword, mcpAuthToken } = getCredentials(req);

  if (!whoopEmail || !whoopPassword) {
    return res.status(400).json({
      error: "Bad Request",
      message: "whoopEmail and whoopPassword are required",
    });
  }

  if (!checkAuth(req, mcpAuthToken, res)) return;

  const server = createWhoopMcpServer({ email: whoopEmail, password: whoopPassword });
  const transport = new SSEServerTransport("/messages", res);

  sseTransports.set(transport.sessionId, transport);

  res.on("close", () => {
    sseTransports.delete(transport.sessionId);
    transport.close();
  });

  await server.connect(transport);
});

// DELETE handler for session cleanup
app.delete("/mcp", async (req, res) => {
  res.status(200).json({ ok: true });
});

// Health check endpoints
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", service: "whoop-mcp-server" });
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "whoop-mcp-server" });
});

const port = parseInt(process.env.PORT || "3000");
app
  .listen(port, () => {
    console.log(`Whoop MCP Server running on http://localhost:${port}`);
    console.log("  Streamable HTTP: POST /mcp");
    console.log("  SSE: GET /sse + POST /messages (or GET /mcp)");
  })
  .on("error", (error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
