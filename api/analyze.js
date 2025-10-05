// /api/analyze.js
import OpenAI from "openai";
import pdfParse from "pdf-parse";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DEFAULT_INSTRUCTION =
  "Summarize the document overall for a general business audience. " +
  "Include a short executive summary, 3–7 bullet highlights, and any key risks/next steps. " +
  "Be concise and objective.";

// Build the final instruction: default + user add-on (if any)
function buildInstruction(userInstruction) {
  const ui = (userInstruction || "").trim();
  return ui ? `${DEFAULT_INSTRUCTION}\n\nUser instruction: ${ui}` : DEFAULT_INSTRUCTION;
}

// Download the file (PDF) into a Buffer
async function fetchFileBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download file: ${res.status} ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Extract text from PDF using pdf-parse
async function extractTextFromPdf(buffer) {
  const parsed = await pdfParse(buffer);
  // pdfParse returns { text, info, metadata, numpages, version }
  return (parsed.text || "").trim();
}

// Create an OpenAI summary from text content
async function summarizeText({ text, instruction }) {
  const prompt = [
    `You are a business analyst. Summarize the document for a general business audience.`,
    `Instruction: ${instruction}`,
    `---`,
    `Document text (may be partial):`,
    text.slice(0, 12000) // keep within token limits
  ].join("\n\n");

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You summarize business documents clearly and concisely." },
      { role: "user", content: prompt }
    ],
    temperature: 0.2
  });

  const out = resp.choices?.[0]?.message?.content?.trim();
  return out || "No summary produced.";
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, message: "Method not allowed" });
      return;
    }

    const { fileUrl, filename, instruction } = req.body || {};
    if (!fileUrl) {
      res.status(400).json({ ok: false, message: "Missing fileUrl" });
      return;
    }

    const finalInstruction = buildInstruction(instruction);

    // 1) Download file
    const fileBuffer = await fetchFileBuffer(fileUrl);

    // 2) Try to parse as PDF
    // (If you want to support DOCX/others later, branch here by file extension or content-type)
    const text = await extractTextFromPdf(fileBuffer);
    if (!text) {
      throw new Error("Could not extract text from the PDF (empty text).");
    }

    // 3) Summarize with OpenAI
    const summary = await summarizeText({ text, instruction: finalInstruction });

    res.status(200).json({ ok: true, filename: filename || "document.pdf", summary });
  } catch (err) {
    console.error("analyze error:", err);
    res.status(500).json({
      ok: false,
      message: err?.message || "Server error"
    });
  }
}
