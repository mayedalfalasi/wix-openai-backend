import fs from "fs";
import path from "path";
import formidable from "formidable";
import pdf from "pdf-parse";
import mammoth from "mammoth";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function parseForm(req) {
  const form = formidable({ multiples: false, keepExtensions: true, maxFileSize: MAX_BYTES });
  return await new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

async function extractText(file) {
  const p = file.filepath || file.path;
  const mimetype = file.mimetype || "application/octet-stream";
  const name = file.originalFilename || path.basename(p);

  if (mimetype === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    const buf = fs.readFileSync(p);
    const out = await pdf(buf);
    return out.text || "";
  }
  if (name.toLowerCase().endsWith(".docx")) {
    const out = await mammoth.extractRawText({ path: p });
    return out.value || "";
  }
  // treat the rest as plain text
  return fs.readFileSync(p, "utf8");
}

function buildPrompt(docText, extra) {
  const system = `You are BizDoc, an AI consultant for SMEs. Analyze the document and return STRICT JSON:
{
  "summary": string,
  "highlights": string[],
  "risks": string[],
  "recommendations": string[],
  "scores": { "finance": number, "operations": number, "marketing": number, "compliance": number, "technology": number }
}
Keep summary < 300 words. Scores are 0-100. Do not add fields outside this schema.`;

  const user = `Document (first 10k chars):
"""${docText.slice(0, 10000)}"""

Extra instruction: ${extra || "(none)"}`;

  return { system, user };
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  setCORS(res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "Use POST" }); return; }

  try {
    const { fields, files } = await parseForm(req);
    const instruction = (fields.instruction && String(Array.isArray(fields.instruction) ? fields.instruction[0] : fields.instruction)) || "";
    const file = files.file && (Array.isArray(files.file) ? files.file[0] : files.file);
    if (!file) { res.status(400).json({ ok: false, error: "No file uploaded" }); return; }
    if ((file.size || 0) > MAX_BYTES) { res.status(413).json({ ok: false, error: "File too large (10MB limit)" }); return; }

    const text = await extractText(file);
    if (!OPENAI_API_KEY) { res.status(500).json({ ok: false, error: "OPENAI_API_KEY not set" }); return; }

    const { system, user } = buildPrompt(text, instruction);

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    if (!r.ok) {
      const t = await r.text();
      res.status(500).json({ ok: false, error: "OpenAI request failed", detail: t.slice(0, 500) });
      return;
    }

    const j = await r.json();
    const content = j.choices?.[0]?.message?.content || "{}";
    let analysis;
    try { analysis = JSON.parse(content); } 
    catch {
      analysis = { summary: content, highlights: [], risks: [], recommendations: [], scores: {} };
    }

    const meta = {
      originalName: file.originalFilename || "document",
      mimetype: file.mimetype || "application/octet-stream",
      sizeKB: Math.round((file.size || 0) / 1024)
    };
    const suggestedFilename = (meta.originalName.split(".")[0] || "analysis") + "_analysis";

    res.status(200).json({ ok: true, meta, analysis, suggestedFilename });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}
