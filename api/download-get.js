export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const type = url.searchParams.get("type") || "txt";
    const filename = (url.searchParams.get("filename") || "analysis").replace(/[^a-z0-9_\-.]/gi, "_");
    const text = url.searchParams.get("text") || "Hello from GET endpoint";

    if (type === "txt") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.txt"`);
      res.status(200).send(text);
      return;
    }
    if (type === "pdf") {
      const { PDFDocument, StandardFonts } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595.28, 841.89]);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      page.drawText(text, { x: 40, y: 790, size: 12, font });
      const pdfBytes = await pdfDoc.save();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.pdf"`);
      res.status(200).send(Buffer.from(pdfBytes));
      return;
    }
    if (type === "docx") {
      const { Document, Packer, Paragraph } = await import("docx");
      const doc = new Document({ sections: [{ properties: {}, children: [new Paragraph(text)] }] });
      const b = await Packer.toBuffer(doc);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.docx"`);
      res.status(200).send(b);
      return;
    }

    res.status(400).json({ ok: false, error: "Unknown type" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}
