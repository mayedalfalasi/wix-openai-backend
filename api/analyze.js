// api/analyze.js — dummy handler (echoes data back)
// POST JSON: { fileUrl: "...", filename: "...", instruction: "..." }
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { fileUrl, filename, instruction } = req.body || {};
    if (!fileUrl) return res.status(400).json({ error: "fileUrl is required" });

    // Later: download fileUrl and run real analysis.
    const summary = `Received ${filename || "file"} with instruction: ${instruction || "(none)"}; URL length=${fileUrl.length}`;

    return res.status(200).json({
      ok: true,
      summary,
      receivedAt: new Date().toISOString()
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
};
