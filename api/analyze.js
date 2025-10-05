// pages/api/analyze.js
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// If your handler needs other imports or helpers, add them above.

export default async function handler(req, res) {
  // ---- CORS headers ----
  res.setHeader("Access-Control-Allow-Origin", "*");               // or restrict to your site
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.status(200).end(); // preflight OK
  }
  // ----------------------

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, message: "Method not allowed" });
    }

    const { fileUrl, filename = "document", instruction = "" } =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    if (!fileUrl) {
      return res
        .status(400)
        .json({ ok: false, message: "Missing fileUrl in request body." });
    }

    // ------- your existing analysis logic ----------
    // Example: ask OpenAI to summarize the URL (you likely already have something similar).
    const system = `You are a helpful business analyst. Summarize clearly and concisely.`;
    const user = `Summarize this document for a general business audience.
URL: ${fileUrl}
Extra instruction: ${instruction}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
    });

    const summary =
      completion.choices?.[0]?.message?.content?.trim() ||
      "No summary generated.";

    return res.status(200).json({ ok: true, filename, summary });
  } catch (err) {
    console.error("analyze error:", err);
    return res.status(500).json({
      ok: false,
      message: err?.message || "Server error",
    });
  }
}
