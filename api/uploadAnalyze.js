const fs = require("fs");
const formidable = require("formidable");
const pdfParse = require("pdf-parse");

module.exports.config = { api: { bodyParser: false } }; // harmless if not Next.js

const ALLOWED_ORIGINS = ["*"]; // tighten later to your Wix domain
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function readJSONBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function toTextFromUpload(file) {
  const p = file.filepath || file.path;
  const buf = await fs.promises.readFile(p);
  const name = file.originalFilename || file.newFilename || file.name || "";
  const mimetype = file.mimetype || "";

  if (mimetype === "application/pdf" || /\.pdf$/i.test(name)) {
    const parsed = await pdfParse(buf);
    return parsed.text || "";
  }
  return buf.toString("utf8");
}

async function analyzeWithOpenAI(text, instruction = "") {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY env var");

  const MAX_CHARS = 80000;
  const clipped = (text || "").slice(0, MAX_CHARS);

  const body = {
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: "You are BizDoc. Produce a structured, concise report with: Executive Summary, Key Findings, KPIs/Numbers, Risks, and Next Actions." },
      { role: "user", content: `Instruction: ${instruction || "Summarize key insights and actions."}\n\n--- DOCUMENT TEXT START ---\n${clipped}\n--- DOCUMENT TEXT END ---` }
    ]
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI error: ${resp.status} ${errText}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use POST" });

  const ct = req.headers["content-type"] || "";
  console.log("[/api/analyze] content-type:", ct);

  try {
    let text = "", instruction = "";

    if (ct.includes("multipart/form-data")) {
      const form = formidable({ multiples: false, keepExtensions: true });
      const { fields, files } = await new Promise((resolve, reject) => {
        form.parse(req, (err, flds, fls) => (err ? reject(err) : resolve({ fields: flds, files: fls })));
      });
      const uploaded = files.file?.[0] || files.file || files.document || files.upload;
      if (!uploaded) throw new Error("No file received (field name should be 'file').");
      instruction = (fields.instruction || "").toString();
      text = await toTextFromUpload(uploaded);
    } else if (ct.includes("application/json") || !ct) {
      // JSON fallback: { text: "...", instruction?: "..." }
      const body = await readJSONBody(req);
      instruction = body.instruction || "";
      text = body.text || "";
      if (!text) throw new Error("No text provided. Send multipart 'file' or JSON { text }.");
    } else {
      throw new Error(`Unsupported Content-Type: ${ct}. Use multipart/form-data or application/json.`);
    }

    if (!text.trim()) throw new Error("Could not extract text from input.");

    const analysis = await analyzeWithOpenAI(text, instruction);
    return res.status(200).json({ ok: true, analysis });
  } catch (e) {
    console.error("[/api/analyze] ERROR:", e);
    const msg = e && e.message ? e.message : "Unknown error";
    return res.status(400).json({ ok: false, error: msg });
  }
};
