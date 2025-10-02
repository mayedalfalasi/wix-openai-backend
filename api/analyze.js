// api/analyze.js — Vercel Serverless Function (robust temp-file version)
import axios from "axios";
import PDFDocument from "pdfkit";
import { OpenAI } from "openai";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",           // lock down later
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,x-site-token",
};

export default async function handler(req, res) {
  try {
    // CORS / preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS).end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { ...CORS_HEADERS, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "method_not_allowed" }));
      return;
    }

    // Shared-secret auth with Wix
    const token = req.headers["x-site-token"];
    if (process.env.PUBLIC_PAGE_TOKEN && token !== process.env.PUBLIC_PAGE_TOKEN) {
      res.writeHead(401, { ...CORS_HEADERS, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    // Parse JSON body
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body || "{}");
    const { fileUrl, fileName, instruction } = body || {};
    if (!fileUrl) {
      res.writeHead(400, { ...CORS_HEADERS, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "fileUrl_required" }));
      return;
    }

    // 1) Download file to /tmp
    const resp = await axios.get(fileUrl, { responseType: "arraybuffer" });
    const bytes = Buffer.from(resp.data);
    const guessedName = fileName || "upload.bin";
    const tmpPath = path.join(os.tmpdir(), guessedName);
    fs.writeFileSync(tmpPath, bytes);

    // 2) Upload to OpenAI Files via stream (stable on serverless)
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const uploaded = await client.files.create({
      file: fs.createReadStream(tmpPath),
      purpose: "assistants",
    });

    // 3) Analyze with a safe default model
    const modelName = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const response = await client.responses.create({
      model: modelName,
      input: [
        { role: "system", content: "You are a precise business analyst. Output clear, organized sections." },
        {
          role: "user",
          content: [
            { type: "input_text", text: instruction || "Summarize the document with KPIs, risks, and next steps." },
            { type: "input_file", file_id: uploaded.id },
          ],
        },
      ],
    });

    const aiText = (response.output_text || "No content produced.").trim();

    // 4) Build PDF and return it
    const chunks = [];
    const doc = new PDFDocument({ margin: 48, info: { Title: "AI Analysis Report" } });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => {
      const pdf = Buffer.concat(chunks);
      res.writeHead(200, {
        ...CORS_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="ai-report.pdf"',
        "Content-Length": pdf.length,
      });
      res.end(pdf);
      try { fs.unlinkSync(tmpPath); } catch {}
    });

    if (fileName) doc.fontSize(12).text(`Source file: ${fileName}`);
    doc.fontSize(12).text(`Generated: ${new Date().toISOString()}`);
    doc.moveDown().fontSize(12).text("Instruction:");
    doc.fontSize(12).text(instruction || "Summarize the document with KPIs, risks, and next steps.");
    doc.moveDown().fontSize(12).text("— — —");
    doc.moveDown().fontSize(12).text(aiText, { align: "left" });
    doc.end();
  } catch (e) {
    const msg =
      e?.response?.data?.error?.message ||
      e?.response?.data?.error ||
      e?.message ||
      "processing_failed";
    console.error(e);
    res.writeHead(500, { ...CORS_HEADERS, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: msg }));
  }
}
