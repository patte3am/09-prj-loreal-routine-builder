const DEFAULT_ALLOWED_ORIGIN = "https://patte3am.github.io";
const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 16_000;
const MAX_TOTAL_CHARS = 48_000;
const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60_000;
const rateLimitBuckets = new Map();

const SYSTEM_MESSAGE = {
  role: "system",
  content:
    "You are a professional, friendly beauty advisor focused on skincare, haircare, makeup, fragrance, and beauty routines. Help users understand their selected products, build personalized routines, explain product order and timing, and answer beauty-related follow-up questions. Use the web_search tool to verify current L'Oréal product information, ingredients, availability, recommendations, and routines when current information is needed or details are missing from the conversation. Prefer official L'Oréal brand and product websites; otherwise use reliable sources such as authorized retailers, regulators, and recognized medical or scientific organizations. Clearly distinguish regional availability and cite web-sourced facts with the provided source citations. Do not invent ingredients, claims, prices, or medical diagnoses. For potentially irritating products, provide appropriate general precautions. State when details cannot be verified. Politely redirect questions unrelated to beauty.",
};

class PayloadTooLargeError extends Error {}

function jsonResponse(body, status, origin, allowedOrigin = DEFAULT_ALLOWED_ORIGIN) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });

  if (origin === allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.set("Vary", "Origin");
  }

  return new Response(JSON.stringify(body), { status, headers });
}

function getClientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

function isRateLimited(ip, now) {
  const recentRequests = (rateLimitBuckets.get(ip) || []).filter(
    (timestamp) => now - timestamp < RATE_WINDOW_MS
  );

  if (rateLimitBuckets.size > 2_000) {
    for (const [bucketIp, timestamps] of rateLimitBuckets) {
      if (!timestamps.some((timestamp) => now - timestamp < RATE_WINDOW_MS)) {
        rateLimitBuckets.delete(bucketIp);
      }
    }
  }

  if (recentRequests.length >= RATE_LIMIT) {
    rateLimitBuckets.set(ip, recentRequests);
    return true;
  }

  recentRequests.push(now);
  rateLimitBuckets.set(ip, recentRequests);
  return false;
}

async function readJsonBody(request) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    throw new PayloadTooLargeError();
  }

  if (!request.body) {
    throw new Error("Request body is required.");
  }

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 2 || messages.length > MAX_MESSAGES) {
    return null;
  }

  const normalizedMessages = [];
  let totalChars = 0;
  let sawSystemMessage = false;

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (
      !message ||
      typeof message !== "object" ||
      typeof message.content !== "string" ||
      !message.content.trim() ||
      message.content.length > MAX_MESSAGE_CHARS
    ) {
      return null;
    }

    totalChars += message.content.length;
    if (totalChars > MAX_TOTAL_CHARS) {
      return null;
    }

    if (message.role === "system") {
      if (index !== 0 || sawSystemMessage) {
        return null;
      }
      sawSystemMessage = true;
      continue;
    }

    if (message.role !== "user" && message.role !== "assistant") {
      return null;
    }

    normalizedMessages.push({
      role: message.role,
      content: message.content.trim(),
    });
  }

  if (!normalizedMessages.length || normalizedMessages[normalizedMessages.length - 1].role !== "user") {
    return null;
  }

  return [SYSTEM_MESSAGE, ...normalizedMessages];
}

function getAssistantResponse(responseData) {
  const textParts = [];
  const citations = [];

  for (const item of responseData?.output || []) {
    if (item.type !== "message" || item.role !== "assistant") {
      continue;
    }

    for (const content of item.content || []) {
      if (content.type !== "output_text" || typeof content.text !== "string") {
        continue;
      }

      textParts.push(content.text);
      for (const annotation of content.annotations || []) {
        if (annotation.type !== "url_citation" || typeof annotation.url !== "string") {
          continue;
        }

        try {
          const url = new URL(annotation.url);
          if (url.protocol !== "https:") {
            continue;
          }

          citations.push({
            title:
              typeof annotation.title === "string" && annotation.title.trim()
                ? annotation.title.trim()
                : url.hostname,
            url: url.href,
          });
        } catch {
          continue;
        }
      }
    }
  }

  const uniqueCitations = [];
  const citedUrls = new Set();
  for (const citation of citations) {
    if (!citedUrls.has(citation.url)) {
      citedUrls.add(citation.url);
      uniqueCitations.push(citation);
    }
  }

  return {
    content: textParts.join("\n").trim(),
    citations: uniqueCitations,
  };
}

async function handleChatRequest(request, env, origin, allowedOrigin) {
  if (origin !== allowedOrigin) {
    return jsonResponse({ error: "Origin is not allowed." }, 403, origin, allowedOrigin);
  }

  if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") {
    return jsonResponse(
      { error: "Content-Type must be application/json." },
      415,
      origin,
      allowedOrigin
    );
  }

  if (isRateLimited(getClientIp(request), Date.now())) {
    return jsonResponse(
      { error: "Too many requests. Please wait a minute and try again." },
      429,
      origin,
      allowedOrigin
    );
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    const isTooLarge = error instanceof PayloadTooLargeError;
    return jsonResponse(
      { error: isTooLarge ? "Request body is too large." : error.message },
      isTooLarge ? 413 : 400,
      origin,
      allowedOrigin
    );
  }

  const messages = validateMessages(body?.messages);
  if (!messages) {
    return jsonResponse(
      {
        error:
          "messages must contain valid user and assistant messages, with no more than 40 messages or 48,000 characters.",
      },
      400,
      origin,
      allowedOrigin
    );
  }

  if (!env.OPENAI_API_KEY) {
    return jsonResponse(
      { error: "The AI service is not configured." },
      503,
      origin,
      allowedOrigin
    );
  }

  let openAiResponse;
  try {
    openAiResponse = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-6-astra",
        tools: [{ type: "web_search", search_context_size: "medium" }],
        input: messages,
        max_output_tokens: 1200,
      }),
    });
  } catch {
    return jsonResponse(
      { error: "Could not reach the AI service. Please try again." },
      502,
      origin,
      allowedOrigin
    );
  }

  if (!openAiResponse.ok) {
    const status = openAiResponse.status === 429 ? 429 : 502;
    return jsonResponse(
      {
        error:
          status === 429
            ? "The AI service is busy. Please wait a moment and try again."
            : "The AI service could not complete the request.",
      },
      status,
      origin,
      allowedOrigin
    );
  }

  let openAiData;
  try {
    openAiData = await openAiResponse.json();
  } catch {
    return jsonResponse(
      { error: "The AI service returned an invalid response." },
      502,
      origin,
      allowedOrigin
    );
  }

  const { content, citations } = getAssistantResponse(openAiData);
  if (typeof content !== "string" || !content.trim()) {
    return jsonResponse(
      { error: "The AI service returned an empty response." },
      502,
      origin,
      allowedOrigin
    );
  }

  return jsonResponse(
    {
      choices: [
        {
          message: {
            role: "assistant",
            content,
          },
        },
      ],
      citations,
    },
    200,
    origin,
    allowedOrigin
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const allowedOrigin = env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;

    if (url.pathname === "/api/health" && request.method === "GET") {
      return jsonResponse(
        { ok: true, service: "loreal-routine-builder" },
        200,
        origin,
        allowedOrigin
      );
    }

    if (url.pathname === "/api/chat") {
      if (request.method === "OPTIONS") {
        if (origin !== allowedOrigin) {
          return jsonResponse(
            { error: "Origin is not allowed." },
            403,
            origin,
            allowedOrigin
          );
        }

        const headers = new Headers({
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin",
        });
        return new Response(null, { status: 204, headers });
      }

      if (request.method !== "POST") {
        return jsonResponse(
          { error: "Method not allowed." },
          405,
          origin,
          allowedOrigin
        );
      }

      return handleChatRequest(request, env, origin, allowedOrigin);
    }

    return env.ASSETS.fetch(request);
  },
};
