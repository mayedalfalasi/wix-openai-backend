// Generates a PDF from posted text and forces a download.
// Accepts POST (JSON or x-www-form-urlencoded) and GET (for quick tests).
const PDFDocument = require("pdfkit");

module.exports = async (req, res) => {
  try {
    async function readBody() {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString("utf8");
      const ct = (req.headers["content-type"] || "").toLowerCase();
      if (ct.includes("application/json")) {
        try { return JSON.parse(raw || "{}"); } catch { return {}; }
      }
      const params = new URLSearchParams(raw);
      return Object.fromEntries(params.entries());
    }

    let filename = "analysis.pdf";
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

    filename = filename.replace(/[^\w.\-]/g, "_") || "analysis.pdf";
    if (!/\.pdf$/i.test(filename)) filename += ".pdf";

    // Create PDF
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 56, bottom: 56, left: 56, right: 56 }
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", String(pdfBuffer.length));
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.status(200).send(pdfBuffer);
    });

    // Title + timestamp
    doc.font("Helvetica").fontSize(18).text("AI Document Analysis", { align: "left" });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("gray").text(new Date().toLocaleString());
    doc.moveDown(0.75).fillColor("black");

    // Body content
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.fontSize(12).text(text && text.trim() ? text : "(No content)", {
      width, align: "left"
    });

    doc.end();
  } catch (e) {
    console.error("download-pdf.js error:", e?.message || e);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
};
