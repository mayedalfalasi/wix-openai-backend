// /api/analyze.js
import OpenAI from "openai";

// Increase body size if you later support uploads
export const config = {
  api: { bodyParser: { sizeLimit: "25mb" } },
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DEFAULT_INSTRUCTION =
  "Summarize the document overall for a general business audience. " +
  "Include a short executive summary, 3–7 bullet highlights, and any key risks/next steps. " +
  "Be concise and objective.";

async function extractTextFromPdf(arrayBuffer) {
  const pdfParse = (await import("pdf-parse")).default; // dynamic import for ESM
  const buffer = Buffer.from(arrayBuffer);
  const data = await pdfParse(buffer);
  return (data.text || "").trim();
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).json({ ok: false, message: "Method not allowed" });
    }

    const { fileUrl, filename = "document", instruction = "" } = req.body || {};
    if (!fileUrl) {
      return res.status(400).json({ ok: false, message: "fileUrl is required" });
    }

    // 1) Fetch the file from the provided URL
    const r = await fetch(fileUrl);
    if (!r.ok) {
      return res
        .status(400)
        .json({ ok: false, message: `Failed to fetch file: ${r.status}` });
    }

    const contentType = (r.headers.get("content-type") || "").toLowerCase();

    // 2) Extract text depending on type
    let text = "";

    if (contentType.includes("pdf") || filename.toLowerCase().endsWith(".pdf")) {
      const ab = await r.arrayBuffer();
      text = await extractTextFromPdf(ab);
    } else if (
      contentType.includes("text/plain") ||
      filename.toLowerCase().endsWith(".txt")
    ) {
      text = await r.text();
    } else {
      // Fallback: try PDF parse anyway (many servers don't set content-type correctly)
      try {
        const ab = await r.arrayBuffer();
        text = await extractTextFromPdf(ab);
      } catch (e) {
        return res.status(415).json({
          ok: false,
          message:
            "Unsupported file type. Please use PDF or TXT, or ensure the URL is a publicly accessible PDF.",
        });
      }
    }

    if (!text || text.trim().length < 50) {
      return res.status(400).json({
        ok: false,
        message:
          "Could not extract meaningful text. Make sure the file is a real, publicly accessible PDF/TXT.",
      });
    }

    // 3) Keep the text manageable (hard limit to ~120k chars here)
    const MAX_CHARS = 120000;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
    }

    // 4) Build the prompt
    const userInstruction = (instruction || "").trim();
    const fullPrompt =
      `${DEFAULT_INSTRUCTION}` +
      (userInstruction ? `\n\nAdditional instruction from user: ${userInstruction}` : "") +
      `\n\n---\nDocument text:\n${text}`;

    // 5) Ask the model
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a diligent business document analyst. Produce concise, structured summaries.",
        },
        { role: "user", content: fullPrompt },
      ],
    });

    const summary =
      completion.choices?.[0]?.message?.content?.trim() ||
      "No summary produced.";

    return res.status(200).json({ ok: true, filename, summary });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: `Server error: ${err?.message || err}`,
    });
  }
}
