// api/analyze.js
// Node runtime + no default bodyParser so we can accept multipart uploads.
export const config = { api: { bodyParser: false } };

import OpenAI from "openai";
import Busboy from "busboy";
import pdf from "pdf-parse";

// ---------- CORS helpers ----------
function setCors(res) {
  // In production, you can replace '*' with your Wix site origin for tighter security.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ---------- small utilities ----------
function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers });
    let fileBuffer = null;
    let filename = "";
    let instruction = "";

    bb.on("file", (name, file, info) => {
      const chunks = [];
      filename = info?.filename || "document";
      file.on("data", (d) => chunks.push(d));
      file.on("end", () => (fileBuffer = Buffer.concat(chunks)));
    });

    bb.on("field", (name, val) => {
      if (name === "instruction") instruction = String(val || "");
      if (name === "filename" && !filename) filename = String(val || "");
    });

    bb.on("error", reject);
    bb.on("finish", () => resolve({ fileBuffer, filename, instruction }));
    req.pipe(bb);
  });
}

// ---------- OpenAI client ----------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------- main handler ----------
export default async function handler(req, res) {
  setCors(res);

  // CORS preflight
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  try {
    const ct = req.headers["content-type"] || "";
    let fileBuffer = null;
    let filename = "document";
    let instruction = "";

    if (ct.includes("application/json")) {
      // JSON: { fileUrl, filename?, instruction? }
      const body = await readJson(req);
      if (!body?.fileUrl) {
        return res
          .status(400)
          .json({ ok: false, message: "Missing 'fileUrl' in JSON body" });
      }

      filename = body.filename || filename;
      instruction = body.instruction || "";
      const r = await fetch(body.fileUrl);
      if (!r.ok) throw new Error(`Download failed: ${r.status} ${r.statusText}`);
      const ab = await r.arrayBuffer();
      fileBuffer = Buffer.from(ab);
    } else if (ct.includes("multipart/form-data")) {
      // Multipart: file + instruction (+ optional filename)
      ({ fileBuffer, filename, instruction } = await readMultipart(req));
      if (!fileBuffer) {
        return res.status(400).json({ ok: false, message: "No file received" });
      }
    } else {
      return res.status(400).json({
        ok: false,
        message: "Unsupported Content-Type. Use JSON or multipart/form-data.",
      });
    }

    // ---------- extract text (PDF first; fallback to plain text) ----------
    let text = "";
    try {
      const parsed = await pdf(fileBuffer); // works great for PDFs
      text = (parsed.text || "").trim();
    } catch (_) {
      // Not a PDF? try as UTF-8 text (best effort)
      text = fileBuffer.toString("utf8");
    }

    if (!text) throw new Error("Could not extract any text from the document");

    const DEFAULT_INSTRUCTION =
      `Summarize the document overall for a general business audience.
Include a short executive summary, 3–7 bullet highlights, and any key risks/next steps.
Be concise and objective.`;

    const fullPrompt =
      `${DEFAULT_INSTRUCTION}\n\n` +
      `User instruction: ${instruction || "(none)"}\n\n` +
      `---\n` +
      `Document content (truncated if long):\n` +
      `${text.slice(0, 150000)}\n` + // guard token size
      `---`;

    // ---------- call OpenAI ----------
    const resp = await openai.responses.create({
      model: "gpt-4o-mini",
      input: fullPrompt,
    });

    const summary =
      resp.output_text ??
      (resp.output?.[0]?.content?.[0]?.text ?? JSON.stringify(resp, null, 2));

    return res.status(200).json({ ok: true, filename, summary });
  } catch (err) {
    console.error("analyze error:", err);
    setCors(res); // ensure headers on error
    return res
      .status(500)
      .json({ ok: false, message: err?.message || "Server error" });
  }
}
