// api/download-pdf.js
// Generates a PDF from posted text and forces a download.
// Accepts:
//   - POST (preferred): body { filename, text } as JSON or x-www-form-urlencoded
//   - GET  (debug):    /api/download-pdf?filename=report.pdf&text=Hello

const PDFDocument = require("pdfkit");

module.exports = async (req, res) => {
  try {
    // Helper: read body for POST (supports JSON and form-encoded)
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

    // Extract inputs
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

    // Sanitize filename and ensure .pdf
    filename = filename.replace(/[^\w.\-]/g, "_") || "analysis.pdf";
    if (!/\.pdf$/i.test(filename)) filename += ".pdf";

    // Build the PDF
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

    // Simple header
    doc.font("Helvetica").fontSize(18).text("AI Document Analysis", { align: "left" });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("gray")
       .text(new Date().toLocaleString(), { align: "left" });
    doc.moveDown(0.75);
    doc.fillColor("black");

    // Body text (auto-wraps & paginates)
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.fontSize(12).text(text && text.trim() ? text : "(No content)", {
      width: contentWidth,
      align: "left"
    });

    // Optional footer with page numbers
    const addFooter = () => {
      const range = doc.bufferedPageRange(); // { start, count }
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const bottom = doc.page.height - doc.page.margins.bottom + 20;
        doc.fontSize(9).fillColor("gray")
          .text(`Page ${i - range.start + 1} of ${range.count}`, doc.page.margins.left, bottom, {
            width: contentWidth, align: "center"
          });
      }
    };
    doc.on("pageAdded", () => {}); // keep default behavior
    doc.end();
    doc.on("end", addFooter); // after finishing, add footers to all pages
  } catch (e) {
    console.error("download-pdf error:", e?.message || e);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
};
