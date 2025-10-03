// api/analyze.js
// Accepts either:
// 1) multipart/form-data with a 'file' field (+ optional instruction, filename)
// 2) JSON: { fileUrl, filename, instruction }
module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const ctype = req.headers["content-type"] || "";

    // Case A: multipart/form-data (direct upload)
    if (ctype.startsWith("multipart/form-data")) {
      const formData = await parseMultipart(req); // helper below
      const file = formData.file;
      const instruction = formData.instruction || "";
      const filename = formData.filename || (file && file.filename) || "file";

      if (!file || !file.buffer) {
        return res.status(400).json({ error: "file is required (multipart field 'file')" });
      }

      // TODO: do real analysis with file.buffer (a Buffer) + instruction.
      const sizeKB = Math.round(file.buffer.length / 1024);
      const summary = `Received ${filename} (${sizeKB} KB) with instruction: ${instruction || "(none)"}`;

      return res.status(200).json({
        ok: true,
        mode: "multipart",
        filename,
        sizeKB,
        summary,
        receivedAt: new Date().toISOString()
      });
    }

    // Case B: JSON body (URL-based)
    if (ctype.includes("application/json")) {
      const { fileUrl, filename, instruction } = req.body || {};
      if (!fileUrl) return res.status(400).json({ error: "fileUrl is required" });

      // TODO: fetch(fileUrl) and analyze content if you want actual processing
      const summary = `Received ${filename || "file"} via URL with instruction: ${instruction || "(none)"}`;

      return res.status(200).json({
        ok: true,
        mode: "json",
        fileUrl,
        filename: filename || null,
        summary,
        receivedAt: new Date().toISOString()
      });
    }

    return res.status(400).json({ error: "Unsupported Content-Type" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * Minimal multipart/form-data parser for Vercel functions.
 * Parses the 'file' field into { filename, buffer } and other text fields.
 */
async function parseMultipart(req) {
  // Read raw body
  const chunks = [];
  await new Promise((resolve, reject) => {
    req.on("data", (c) => chunks.push(c));
    req.on("end", resolve);
    req.on("error", reject);
  });
  const body = Buffer.concat(chunks);

  const contentType = req.headers["content-type"] || "";
  const boundary = getBoundary(contentType);
  if (!boundary) return {};

  const parts = body.toString("binary").split(`--${boundary}`);
  const result = {};

  for (const part of parts) {
    if (!part || part === "--\r\n") continue;
    const [rawHeaders, rawValue] = splitOnce(part, "\r\n\r\n");
    if (!rawHeaders || !rawValue) continue;

    const valueBinary = rawValue.slice(0, -2); // strip trailing \r\n
    const headers = rawHeaders.split("\r\n").filter(Boolean);

    let name = null;
    let filename = null;
    for (const h of headers) {
      if (h.toLowerCase().startsWith("content-disposition")) {
        const mName = /name="([^"]+)"/i.exec(h);
        const mFile = /filename="([^"]+)"/i.exec(h);
        if (mName) name = mName[1];
        if (mFile) filename = decodeURIComponent(mFile[1]);
      }
    }
    if (!name) continue;

    // File field
    const isFile = !!filename;
    if (isFile) {
      // Convert binary string -> Buffer
      const buf = Buffer.from(valueBinary, "binary");
      result[name] = { filename, buffer: buf };
    } else {
      // Text field
      result[name] = Buffer.from(valueBinary, "binary").toString("utf8");
    }
  }
  return result;
}

function getBoundary(ct) {
  const m = /boundary=([^;]+)/i.exec(ct);
  return m ? m[1] : null;
}

function splitOnce(s, sep) {
  const idx = s.indexOf(sep);
  if (idx === -1) return [s, ""];
  return [s.slice(0, idx), s.slice(idx + sep.length)];
}
