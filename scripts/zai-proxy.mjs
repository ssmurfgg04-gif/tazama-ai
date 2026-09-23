#!/usr/bin/env node
/**
 * Z.AI Local Provider Proxy — Tazama AI
 *
 * Exposes the locally-authenticated z-ai-web-dev-sdk as an OpenAI-compatible
 * HTTP API so the Tazama app can chat through it as the `zai-local` provider:
 *
 *   POST /v1/chat/completions   { model, messages }  -> { choices[0].message.content }
 *   GET  /v1/models             -> { data: [{ id }] }
 *
 * Any API key is accepted (the key field is unused — auth is local).
 * Run:  node scripts/zai-proxy.mjs          (port 8788, matches ZAI_LOCAL_BASE)
 *       PORT=9000 node scripts/zai-proxy.mjs
 */

import ZAI from "z-ai-web-dev-sdk";
import http from "node:http";

const PORT = Number(process.env.PORT || 8788);

const MODELS = [
  { id: "glm-4.6", object: "model", owned_by: "z-ai-local" },
  { id: "glm-4.5-air", object: "model", owned_by: "z-ai-local" },
];

/** Extract plain text from the SDK's possibly-rich content shape. */
function contentToText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text ?? ""))
      .join("");
  }
  return content?.text ?? "";
}

function json(res, code, body, extra = {}) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...extra,
  });
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === "OPTIONS") {
    return json(res, 204, {});
  }

  if (req.method === "GET" && (url.pathname === "/v1/models" || url.pathname === "/models")) {
    return json(res, 200, { object: "list", data: MODELS });
  }

  if (req.method === "POST" && (url.pathname === "/v1/chat/completions" || url.pathname === "/chat/completions")) {
    const body = await readBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return json(res, 400, { error: { message: "messages[] required" } });
    }
    try {
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        thinking: { type: "disabled" },
      });
      const text = contentToText(completion?.choices?.[0]?.message?.content) ||
        completion?.choices?.[0]?.message?.reasoning_content || "";
      return json(res, 200, {
        id: `chatcmpl-local-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: body.model || "glm-4.6",
        choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    } catch (err) {
      return json(res, 502, { error: { message: `z-ai sdk failure: ${err?.message || err}` } });
    }
  }

  return json(res, 404, { error: { message: `no route: ${req.method} ${url.pathname}` } });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[zai-proxy] listening on http://127.0.0.1:${PORT}  (providers: ${MODELS.map(m => m.id).join(", ")})`);
});
