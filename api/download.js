import { PDFDocument, StandardFonts } from "pdf-lib";
import { Document, Packer, Paragraph, TextRun } from "docx";

function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function wrapText(str, max = 90) {
  const words = (str || "").split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) { lines.push(cur.trim()); cur = w; }
    else { cur += " " + w; }
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.join("\n");
}

function analysisToPlain(a) {
  const s = [];
  s.push("# Summary\n" + (a.summary || ""));
  s.push("\n# Highlights\n- " + (a.highlights || []).join("\n- "));
  s.push("\n# Risks\n- " + (a.risks || []).join("\n- "));
  s.push("\n# Recommendations\n- " + (a.recommendations || []).join("\n- "));
  if (a.scores) {
    s.push("\n# Scores");
    for (const k of Object.keys(a.scores)) s.push(`- ${k}: ${a.scores[k]}`);
  }
  return s.join("\n");
}

export default async function handler(req, res) {
  setCORS(res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "Use POST" }); return; }

  try {
    const { type, filename, content } = await new Promise((resolve, reject) => {
      let body = "";
      req.on("data", chunk => body += chunk);
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
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([595.28, 841.89]); // first page A4
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontSize = 11, margin = 40;
      const lines = wrapText(plain, 100).split("\n");

      let page = pdfDoc.getPage(0);
      let y = page.getHeight() - margin;
      const lineHeight = 14;

      for (const line of lines) {
        if (y < margin) { page = pdfDoc.addPage([595.28, 841.89]); y = page.getHeight() - margin; }
        page.drawText(line, { x: margin, y, size: fontSize, font });
        y -= lineHeight;
      }

      const pdfBytes = await pdfDoc.save();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`);
      res.status(200).send(Buffer.from(pdfBytes));
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

    res.status(400).json({ ok: false, error: "Unknown type. Use txt|pdf|docx" });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || String(err) });
  }
}
