// pages/api/analyze.js
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DEFAULT_INSTRUCTION = `
Summarize the document overall for a general business audience.
Include a short executive summary, 3–7 bullet highlights, and any key risks or next steps.
Be concise and objective.
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileUrl, filename, instruction } = req.body;

    const prompt = `${DEFAULT_INSTRUCTION}\n\nUser instruction: ${instruction || "None."}\n\nFile: ${filename}\nURL: ${fileUrl}`;
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const summary = completion.choices[0]?.message?.content || "No response.";
    res.status(200).json({ summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

