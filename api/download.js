import { PDFDocument, StandardFonts } from "pdf-lib";
import { Document, Packer, Paragraph, TextRun } from "docx";

function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function wrapToLines(text, maxChars = 100) {
  const words = String(text || "").split(/\s+/);
  const out = [];
  let line = "";
  for (const w of words) {
    const test = (line ? line + " " : "") + w;
    if (test.length > maxChars) {
      if (line) out.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) out.push(line);
  return out;
}

function analysisToPlain(a) {
  const s = [];
  s.push("# Summary", a.summary || "");
  s.push("", "# Highlights", ...(a.highlights || []).map(x => "- " + x));
  s.push("", "# Risks", ...(a.risks || []).map(x => "- " + x));
  s.push("", "# Recommendations", ...(a.recommendations || []).map(x => "- " + x));
  if (a.scores) {
    s.push("", "# Scores");
    for (const k of Object.keys(a.scores)) s.push(`- ${k}: ${a.scores[k]}`);
  }
  return s.join("\n");
}

export default async function handler(req, res) {
  setCORS(res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ ok:false, error:"Use POST" }); return; }

  try {
    const { type, filename, content } = await new Promise((resolve, reject) => {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch(e){ reject(new Error("Invalid JSON body")); }});
      req.on("error", reject);
    });

    const safeName = (filename || "analysis").replace(/[^a-z0-9_\-.]/gi, "_");
    const a = content || {};
    const plain = analysisToPlain(a);

    if (type === "txt") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.txt"`);
      res.status(200).send(Buffer.from(plain, "utf8"));
      return;
    }

    if (type === "pdf") {
      // Build PDF line-by-line with pagination
      const pdfDoc = await PDFDocument.create();
      const pageSize = [595.28, 841.89]; // A4
      let page = pdfDoc.addPage(pageSize);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontSize = 11;
      const margin = 40;
      const lineHeight = 14;
      const maxChars = 100;

      let y = page.getHeight() - margin;
      const lines = plain.split("\n").flatMap(l => wrapToLines(l, maxChars));

      for (const line of lines) {
        if (y < margin) {
          page = pdfDoc.addPage(pageSize);
          y = page.getHeight() - margin;
        }
        page.drawText(line, { x: margin, y, size: fontSize, font });
        y -= lineHeight;
      }

      // Ensure we send a Node Buffer
      const pdfBytes = await pdfDoc.save(); // Uint8Array
      const buf = Buffer.from(pdfBytes.buffer, pdfBytes.byteOffset, pdfBytes.byteLength);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`);
      res.status(200).send(buf);
      return;
    }

    if (type === "docx") {
      const paragraphs = [];
      const add = (title, body) => {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: title, bold: true })] }));
        if (Array.isArray(body)) for (const x of body) paragraphs.push(new Paragraph(String(x)));
        else for (const line of String(body || "").split("\n")) paragraphs.push(new Paragraph(line));
        paragraphs.push(new Paragraph(""));
      };
      add("Summary", a.summary || "");
      add("Highlights", (a.highlights || []).map(x => "• " + x));
      add("Risks", (a.risks || []).map(x => "• " + x));
      add("Recommendations", (a.recommendations || []).map(x => "• " + x));
      if (a.scores) add("Scores", Object.keys(a.scores).map(k => `${k}: ${a.scores[k]}`));

      const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
      const b = await Packer.toBuffer(doc);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.docx"`);
      res.status(200).send(b);
      return;
    }

    res.status(400).json({ ok:false, error:"Unknown type. Use txt|pdf|docx" });
  } catch (err) {
    res.status(400).json({ ok:false, error: err.message || String(err) });
  }
}
