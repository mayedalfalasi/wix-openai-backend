// pages/api/analyze-upload.js
import OpenAI from "openai";
import formidable from "formidable";
import { promises as fs } from "fs";
import pdf from "pdf-parse";

export const config = {
  api: { bodyParser: false }, // allow formidable to handle multipart
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*"); // or your domain
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  try {
    // Parse multipart form
    const { fields, files } = await new Promise((resolve, reject) => {
      const form = formidable({ multiples: false, keepExtensions: true });
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const file =
      files.file ||
      files.upload ||
      (files && Object.values(files)[0]); // accept any field name

    if (!file) {
      return res
        .status(400)
        .json({ ok: false, message: "No file uploaded." });
    }

    const buffer = await fs.readFile(file.filepath);

    // Extract text (PDF or plain text)
    let text = "";
    const name = file.originalFilename || "document";
    const type = file.mimetype || "";

    if (type.includes("pdf") || name.toLowerCase().endsWith(".pdf")) {
      const parsed = await pdf(buffer);
      text = parsed.text || "";
    } else {
      // try UTF-8 text
      text = buffer.toString("utf8");
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        ok: false,
        message:
          "Could not extract text. Please upload a PDF or a text-based file.",
      });
    }

    // keep token usage reasonable
    const MAX_CHARS = 15000;
    const clipped = text.slice(0, MAX_CHARS);

    const extra =
      (fields.instruction || "Summarize the document overall for a business audience").toString();

    const system =
      "You are a helpful business analyst. Write a concise executive summary with key bullet highlights and any risks/next steps.";
    const user = `${extra}\n\n---\n${clipped}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const summary =
      completion.choices?.[0]?.message?.content?.trim() ||
      "No summary generated.";

    return res.status(200).json({
      ok: true,
      filename: name,
      summary,
    });
  } catch (err) {
    console.error("analyze-upload error:", err);
    return res.status(500).json({
      ok: false,
      message: err?.message || "Server error",
    });
  }
}
