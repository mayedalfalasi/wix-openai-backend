import OpenAI from "openai";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const DEBUG = process.env.DEBUG_ANALYZE === "true";
const dbg = (...a) => DEBUG && console.log("[/api/analyze]", ...a);

function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function badRequest(res, message, extra = {}) {
  res.statusCode = 400;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: false, error: message, ...extra }));
}

function serverError(res, e, extra = {}) {
  console.error("[/api/analyze] ERROR:", e?.stack || e);
  res.statusCode = 500;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: false, error: e?.message || "Server error", ...extra }));
}

async function fetchArrayBufferFromUrl(url) {
  dbg("Fetching URL:", url);
  const r = await fetch(url);
  dbg("Fetch status:", r.status);
  if (!r.ok) throw new Error(`Failed to fetch fileUrl: ${r.status} ${r.statusText}`);
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

async function extractTextFromBuffer(buf, filename = "") {
  const lower = (filename || "").toLowerCase();
  dbg("Extracting text for:", filename);

  if (lower.endsWith(".pdf")) {
    dbg("Lazy importing pdf-parse");
    const { default: pdf } = await import("pdf-parse");
    const data = await pdf(buf);
    dbg("PDF text length:", data?.text?.length || 0);
    return data.text || "";
  }

  if (lower.endsWith(".txt")) return buf.toString("utf8");
  try { return buf.toString("utf8"); } catch { return ""; }
}

function createOpenAIOrThrow() {
  const apiKey = process.env.OPENAI_API_KEY;
  dbg("Has OPENAI_API_KEY:", Boolean(apiKey));
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey });
}

async function summarizeText(text, instruction) {
  const openai = createOpenAIOrThrow();
  dbg("Summarizing with model:", OPENAI_MODEL, "textLength:", text.length);
  const system =
    "You are BizDoc, a precise business-document assistant. Summarize for a general business audience. Be concise and objective. Prefer bullet lists for highlights.";
  const userPrompt = [
    instruction?.trim()
      ? `Instruction:\n${instruction.trim()}\n`
      : `Instruction:\nSummarize the document overall.\n`,
    "\nDocument:\n",
    text.slice(0, 200000),
  ].join("");

  const resp = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
  });

  return resp?.choices?.[0]?.message?.content?.trim() || "(No content returned)";
}

export default async function handler(req, res) {
  setCORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return badRequest(res, "Use POST");

  dbg("Handler start");
  // Read raw body then parse JSON
  let body;
  try {
    const raw = await new Promise((resolve, reject) => {
      let d = "";
      req.on("data", c => d += c);
      req.on("end", () => resolve(d));
      req.on("error", reject);
    });
    dbg("Raw length:", raw?.length || 0);
    body = raw ? JSON.parse(raw) : {};
  } catch (e) {
    return badRequest(res, "Invalid JSON body", { detail: e.message });
  }

  try {
    const { fileUrl, fileBase64, filename = "document.pdf", text, instruction } = body || {};
    dbg("Input keys:", { hasUrl: !!fileUrl, hasB64: !!fileBase64, hasText: !!text, filename });

    if (!fileUrl && !fileBase64 && !text) {
      return badRequest(res, "Provide one of: fileUrl, fileBase64+filename, or text");
    }

    let docText = "";
    if (text?.trim()) {
      docText = text.trim();
      dbg("Using plain text path, length:", docText.length);
    } else if (fileBase64) {
      const buf = Buffer.from(fileBase64, "base64");
      dbg("Decoded base64, bytes:", buf.length);
      docText = await extractTextFromBuffer(buf, filename);
      if (!docText) return badRequest(res, "Could not extract text from base64 file");
    } else if (fileUrl) {
      const buf = await fetchArrayBufferFromUrl(fileUrl);
      const guessed = filename || (new URL(fileUrl).pathname.split("/").pop() || "document.pdf");
      dbg("Downloaded URL bytes:", buf.length, "guessedName:", guessed);
      docText = await extractTextFromBuffer(buf, guessed);
      if (!docText) return badRequest(res, "Could not extract text from fileUrl");
    }

    const summary = await summarizeText(docText, instruction);
    dbg("Summary length:", summary.length);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, filename, summary }));
  } catch (e) {
    return serverError(res, e);
  }
}
