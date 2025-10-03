// api/analyze.js
// Accepts EITHER:
//  - multipart/form-data: fields -> file (binary), instruction (text, optional), filename (optional)
//  - JSON: { fileUrl, filename, instruction }
// Extracts text (PDF/DOCX/TXT/CSV) and asks OpenAI for a business-style summary.

const OpenAI = require("openai");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

const MAX_BYTES = 12 * 1024 * 1024; // 12MB safety
const SUPPORTED = [".pdf", ".docx", ".txt", ".csv"];

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const contentType = (req.headers["content-type"] || "").toLowerCase();
    let filename = null;
    let instruction = "";
    let fileBuffer = null;
    let fileUrl = null;

    if (contentType.startsWith("multipart/form-data")) {
      // ---- Multipart path (browser upload) ----
      const form = await parseMultipart(req);
      instruction = (form.instruction || "").toString();
      filename = form.filename || (form.file && form.file.filename) || "file";
      if (!form.file || !form.file.buffer) {
        return res.status(400).json({ error: "file is required (multipart field 'file')" });
      }
      fileBuffer = form.file.buffer;
    } else {
      // ---- JSON path (URL-based) ----
      if (!contentType.includes("application/json")) {
        return res.status(400).json({ error: "Unsupported Content-Type. Use multipart/form-data or application/json." });
      }
      const body = req.body || {};
      fileUrl = body.fileUrl;
      filename = body.filename || (fileUrl ? fileUrl.split("/").pop() : "file");
      instruction = body.instruction || "";
      if (!fileUrl) return res.status(400).json({ error: "fileUrl is required in JSON mode" });
      const fetched = await fetch(fileUrl);
      if (!fetched.ok) return res.status(400).json({ error: `Unable to fetch fileUrl (${fetched.status})` });
      const ab = await fetched.arrayBuffer();
      fileBuffer = Buffer.from(ab);
    }

    // Basic validations
    if (fileBuffer.length > MAX_BYTES) {
      return res.status(400).json({ error: `File too large. Max ${Math.round(MAX_BYTES/1024/1024)}MB.` });
    }

    const ext = guessExt(filename, contentType);
    if (!SUPPORTED.includes(ext)) {
      return res.status(400).json({ error: `Unsupported file type ${ext}. Supported: ${SUPPORTED.join(", ")}` });
    }

    // Extract text
    const extracted = await extractText(fileBuffer, ext);
    if (!extracted || extracted.trim().length === 0) {
      return res.status(400).json({ error: "Could not extract text from the file." });
    }

    // Ask OpenAI
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = buildPrompt(extracted, instruction);

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are BizDoc, an expert business analyst. Be concise, structured, and practical." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 900
    });

    const analysis = completion.choices?.[0]?.message?.content || "(no content)";

    return res.status(200).json({
      ok: true,
      mode: fileUrl ? "json-url" : "multipart-upload",
      filename,
      sizeKB: Math.round(fileBuffer.length / 1024),
      instruction,
      summary: analysis,
      receivedAt: new Date().toISOString()
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
};

// ---------- Helpers ----------

function guessExt(filename, contentType) {
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".pdf")) return ".pdf";
  if (lower.endsWith(".docx")) return ".docx";
  if (lower.endsWith(".txt")) return ".txt";
  if (lower.endsWith(".csv")) return ".csv";
  // simple fallback via content-type
  if (contentType.includes("pdf")) return ".pdf";
  if (contentType.includes("wordprocessingml")) return ".docx";
  if (contentType.includes("text/plain")) return ".txt";
  if (contentType.includes("csv")) return ".csv";
  return ".txt"; // best-effort
}

async function extractText(buffer, ext) {
  if (ext === ".pdf") {
    const data = await pdfParse(buffer);
    return data.text || "";
  }
  if (ext === ".docx") {
    const { value } = await mammoth.extractRawText({ buffer });
    return value || "";
  }
  if (ext === ".txt" || ext === ".csv") {
    return buffer.toString("utf8");
  }
  return "";
}

function buildPrompt(extractedText, instruction) {
  const clipped = extractedText.length > 12000 ? extractedText.slice(0, 12000) + "\n...[truncated]" : extractedText;
  const userAsk = instruction && instruction.trim().length > 0
    ? `\n\nUser instruction:\n${instruction.trim()}`
    : "";

  return `Analyze the following business document and provide a structured executive summary.
Focus on:
- Key takeaways (bulleted)
- KPIs / metrics table (if present)
- Risks & mitigations
- Action items with owners & timelines (make reasonable assumptions if missing)
- Opportunities or cost savings
- One-paragraph conclusion

Document text (raw, may be messy):
"""
${clipped}
"""${userAsk}

Output format:
1) **Executive Summary**
- ...

2) **KPIs**
| Metric | Value | Source/Note |

3) **Risks & Mitigations**
- Risk: ... | Mitigation: ...

4) **Action Items**
- Owner | Task | Due | Next Step

5) **Opportunities**
- ...

6) **Conclusion**
`;
}

/**
 * Minimal multipart/form-data parser
 * Returns { file: { filename, buffer }, filename, instruction, ...textFields }
 */
async function parseMultipart(req) {
  const chunks = [];
  await new Promise((resolve, reject) => {
    req.on("data", (c) => chunks.push(c));
    req.on("end", resolve);
    req.on("error", reject);
  });
  const body = Buffer.concat(chunks);

  const ct = req.headers["content-type"] || "";
  const boundary = /boundary=([^;]+)/i.exec(ct)?.[1];
  if (!boundary) return {};

  const parts = body.toString("binary").split(`--${boundary}`);
  const result = {};
  for (const part of parts) {
    if (!part || part === "--\r\n") continue;
    const [rawHeaders, rawValue] = splitOnce(part, "\r\n\r\n");
    if (!rawHeaders || !rawValue) continue;

    const valueBinary = rawValue.slice(0, -2); // drop trailing CRLF
    const headers = rawHeaders.split("\r\n").filter(Boolean);

    let name = null, filename = null;
    for (const h of headers) {
      const hl = h.toLowerCase();
      if (hl.startsWith("content-disposition")) {
        const m1 = /name="([^"]+)"/i.exec(h);
        const m2 = /filename="([^"]+)"/i.exec(h);
        if (m1) name = m1[1];
        if (m2) filename = decodeURIComponent(m2[1]);
      }
    }
    if (!name) continue;

    if (filename) {
      result[name] = { filename, buffer: Buffer.from(valueBinary, "binary") };
    } else {
      result[name] = Buffer.from(valueBinary, "binary").toString("utf8");
    }
  }
  return result;
}

function splitOnce(s, sep) {
  const i = s.indexOf(sep);
  if (i === -1) return [s, ""];
  return [s.slice(0, i), s.slice(i + sep.length)];
}
