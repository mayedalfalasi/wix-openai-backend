// pages/api/analyze.js
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DEFAULT_INSTRUCTION =
  "Summarize the document overall for a general business audience. " +
  "Include a short executive summary, 3–7 bullet highlights, and any key risks/next steps. " +
  "Be concise and objective.";

function buildInstruction(userInstruction) {
  const ui = (userInstruction || "").trim();
  return ui ? `${DEFAULT_INSTRUCTION}\n\nUser instruction: ${ui}` : DEFAULT_INSTRUCTION;
}

async function fetchBuffer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch file: ${r.status} ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).json({ ok: false, message: "Method not allowed" });
    }

    const contentType = req.headers["content-type"] || "";
    let fileBuffer = null;
    let filename = "document";
    let userInstruction = "";

    if (contentType.includes("application/json")) {
      const body = req.body || {};
      if (body.fileUrl) {
        fileBuffer = await fetchBuffer(body.fileUrl);
        filename = body.filename || "document";
      } else {
        throw new Error('Missing "fileUrl" in JSON body');
      }
      userInstruction = body.instruction || "";
    } else {
      throw new Error("Unsupported Content-Type. Use JSON with {fileUrl}.");
    }

    if (!fileBuffer) throw new Error("No file bytes were received.");

    const uploaded = await openai.files.create({
      file: new Blob([fileBuffer]),
      purpose: "assistants",
      filename,
    });

    const finalInstruction = buildInstruction(userInstruction);

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: finalInstruction }],
        },
      ],
      attachments: [{ file_id: uploaded.id, tools: [{ type: "file_search" }] }],
    });

    const text =
      response.output_text ||
      (Array.isArray(response.output)
        ? response.output.map((p) => p.content?.[0]?.text).join("\n")
        : "") ||
      "No summary was returned.";

    res.status(200).json({ ok: true, filename, summary: text, model: response.model });
  } catch (err) {
    res.status(400).json({ ok: false, message: err?.message || String(err) });
  }
}
