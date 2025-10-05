// api/download.js
// Vercel serverless function to download analysis text as a file.
// - GET:  /api/download?filename=analysis.txt&text=... (good for short text)
// - POST: /api/download  (send { filename, text } as JSON or form-encoded; good for long text)

module.exports = async (req, res) => {
  try {
    // Helper: read request body safely (supports JSON and x-www-form-urlencoded)
    async function readBody() {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString("utf8");

      const ct = (req.headers["content-type"] || "").toLowerCase();
      if (ct.includes("application/json")) {
        try { return JSON.parse(raw || "{}"); } catch { return {}; }
      }
      // Treat everything else as URL-encoded
      const params = new URLSearchParams(raw);
      return Object.fromEntries(params.entries());
    }

    // Extract filename/text from GET or POST
    let filename = "analysis.txt";
    let text = "";

    if (req.method === "GET") {
      const q = req.query || {};
      filename = (q.filename || filename).toString();
      text = (q.text || "").toString();
    } else if (req.method === "POST") {
      const body = await readBody();
      filename = (body.filename || filename).toString();
      text = (body.text || "").toString();
    } else {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).end("Method Not Allowed");
    }

    // Sanitize filename (avoid path traversal and illegal chars)
    filename = filename.replace(/[^\w.\-]/g, "_") || "analysis.txt";
    // Ensure it has an extension
    if (!/\.[a-z0-9]{1,8}$/i.test(filename)) filename += ".txt";

    const contentBuffer = Buffer.from(text ?? "", "utf8");

    // Response headers to force the download
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(contentBuffer.length));
    // Optional: prevent caches from storing user content
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");

    return res.status(200).send(contentBuffer);
  } catch (e) {
    console.error("download.js error:", e?.message || e);
    return res.status(500).json({ error: "Failed to prepare download" });
  }
};
