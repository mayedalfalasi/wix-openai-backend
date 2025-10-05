// api/analyze.js (CommonJS, Node runtime on Vercel)
const fs = require("fs");
const path = require("path");
const formidable = require("formidable");
const pdfParse = require("pdf-parse");

// Tell Vercel not to auto-parse the body
module.exports.config = {
  api: { bodyParser: false },
};

const ALLOWED_ORIGINS = ["*"]; // You can harden this later to your Wix/Vercel domains

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function toText(file) {
  const p = file.filepath || file.path; // formidable v3 vs v2
  const buf = await fs.promises.readFile(p);

  // Handle PDFs with pdf-parse, otherwise try UTF-8 as a simple fallback
  if ((file.mimetype || file.mimetype) === "application/pdf" || /\.pdf$/i.test(file.originalFilename || file.newFilename || file.name || "")) {
    const parsed = await pdfParse(buf);
    return parsed.text || "";
  }
  return buf.toString("utf8");
}

async function analyzeWithOpenAI(text, instruction = "") {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY env var");
  }

  // Keep the prompt within a reasonable size for latency/cost
  const MAX_CHARS = 80000; // ~20k tokens rough upper bound safety
  const clipped = text.slice(0, MAX_CHARS);

  const body = {
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are BizDoc, an analyst. Produce a clear, structured report with: Executive Summary, Key Findings, KPIs/Numbers, Risks, Red Flags, and Next Actions. Be concise and actionable.",
      },
      {
        role: "user",
        content:
          `Instruction (optional): ${instruction || "Summarize the key insights and action items."}\n\n--- DOCUMENT TEXT START ---\n${clipped}\n--- DOCUMENT TEXT END ---`,
      },
    ],
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
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
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Use POST" });
    return;
  }

  try {
    const form = formidable({ multiples: false, keepExtensions: true });
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, flds, fls) => (err ? reject(err) : resolve({ fields: flds, files: fls })));
    });

    const uploaded =
      files.file?.[0] || files.file || files.document || files.upload || null;
    if (!uploaded) {
      throw new Error("No file received (field name should be 'file').");
    }

    const text = await toText(uploaded);
    if (!text || !text.trim()) {
      throw new Error("Could not extract text from file.");
    }

    const analysis = await analyzeWithOpenAI(text, fields.instruction?.toString() || "");
    res.status(200).json({ ok: true, analysis });
  } catch (e) {
    console.error("[/api/analyze] ERROR:", e);
    res.status(500).json({ ok: false, error: e.message || "Unknown error" });
  }
};
