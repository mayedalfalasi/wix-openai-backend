<<<<<<< HEAD
// /api/download-pdf.js  (ESM)
export default async function handler(req, res) {
  try {
    const { default: PDFDocument } = await import("pdfkit");

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

    // Set headers before streaming
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");

    // Create and stream the PDF
    const doc = new PDFDocument({ size: "A4", margins: { top:56, bottom:56, left:56, right:56 } });
    doc.pipe(res);

    doc.font("Helvetica-Bold").fontSize(18).text("AI Document Analysis");
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(10).fillColor("gray").text(new Date().toLocaleString());
    doc.moveDown(0.75).fillColor("black");

    const content = (text && text.trim()) ? text : "(No content)";
    doc.font("Helvetica").fontSize(12).text(content, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: "left"
    });

    doc.end();
  } catch (e) {
    console.error("download-pdf (esm) error:", e?.message || e);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
}
=======
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'POST');
      return res.end('Method Not Allowed');
    }

    let body = '';
    req.on('data', d => body += d);
    await new Promise(r => req.on('end', r));

    let params = {};
    try {
      body.split('&').forEach(p => {
        const [k,v] = p.split('=');
        if (k) params[decodeURIComponent(k)] = decodeURIComponent((v||'').replace(/\+/g,' '));
      });
    } catch {}

    const text = params.text || '';
    const filename = (params.filename || 'analysis.pdf').replace(/[^\w.\-]/g,'_');
    if (!text) {
      res.statusCode = 400;
      return res.end('No text provided');
    }

    // NOTE: This is still plain text but with a PDF filename, so browsers save it.
    res.statusCode = 200;
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.end(text, 'utf-8');
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    res.end('PDF_DOWNLOAD_FAILED: ' + String(e?.message||e));
  }
};
>>>>>>> 5e49a50 (feat: stable analyze (busboy), health, download, minimal vercel.json)
