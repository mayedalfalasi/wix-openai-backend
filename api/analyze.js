// /api/analyze.js
import OpenAI from "openai";

// ---- CORS helper (so Wix/fetch works cleanly) ----
const cors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

// ---- Default summarization instruction you wanted ----
const DEFAULT_INSTRUCTION = `
Summarize the document overall for a general business audience.
Include a short executive summary, 3–7 bullet highlights, and any key risks/next steps.
Be concise and objective.
`;

function buildInstruction(userInstruction) {
  const ui = (userInstruction || "").trim();
  return ui
    ? `${DEFAULT_INSTRUCTION}\n\nUser instruction: ${ui}`
    : DEFAULT_INSTRUCTION;
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Expecting JSON: { fileUrl, filename?, instruction? }
    const { fileUrl, filename, instruction } = req.body || {};

    if (!fileUrl) {
      return res.status(400).json({ error: "Missing 'fileUrl' in body." });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = buildInstruction(instruction);

    // Ask the model to summarize using the URL (model can fetch/interpret web docs if enabled)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are a precise business summarizer." },
        {
          role: "user",
          content: `Please summarize this document: ${fileUrl}\n\n${prompt}`,
        },
      ],
    });

    const summary =
      completion?.choices?.[0]?.message?.content?.trim() ||
      "No summary returned.";

    return res.status(200).json({
      ok: true,
      filename: filename || null,
      summary,
    });
  } catch (err) {
    console.error("Analyze error:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Internal server error",
    });
  }
}
