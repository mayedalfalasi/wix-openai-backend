import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import tmp from 'tmp';
import { OpenAI } from 'openai';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors({ origin: true })); // allow all while testing

// Auth check (optional, but safer)
app.use((req, res, next) => {
  const token = req.header('x-site-token');
  if (process.env.PUBLIC_PAGE_TOKEN && token !== process.env.PUBLIC_PAGE_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

// Download file helper
async function downloadToTemp(url, filenameGuess = 'upload.bin') {
  const tmpHandle = tmp.fileSync({ postfix: '-' + filenameGuess });
  const writer = fs.createWriteStream(tmpHandle.name);
  const resp = await axios.get(url, { responseType: 'stream' });
  await new Promise((resolve, reject) => {
    resp.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
  return tmpHandle;
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/api/analyze', async (req, res) => {
  try {
    const { fileUrl, fileName, instruction } = req.body || {};
    if (!fileUrl) return res.status(400).json({ error: 'fileUrl_required' });

    const tmpHandle = await downloadToTemp(fileUrl, fileName || 'upload.bin');

    const uploaded = await client.files.create({
      file: fs.createReadStream(tmpHandle.name),
      purpose: 'assistants'
    });

    const response = await client.responses.create({
      model: 'gpt-4.1', // safer choice for most accounts
      input: [
        { role: 'system', content: 'You are a precise business analyst. Output clear, organized sections.' },
        { role: 'user', content: [
            { type: 'input_text', text: instruction || 'Summarize the document with KPIs, risks, and next steps.' },
            { type: 'input_file', file_id: uploaded.id }
          ]
        }
      ]
    });

    const aiText = response.output_text?.trim() || 'No content produced.';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="ai-report.pdf"');

    const doc = new PDFDocument({ margin: 48, info: { Title: 'AI Analysis Report' } });
    doc.pipe(res);
    if (fileName) doc.fontSize(12).text(`Source file: ${fileName}`);
    doc.fontSize(12).text(`Generated: ${new Date().toISOString()}`);
    doc.moveDown().fontSize(12).text('Instruction:');
    doc.fontSize(12).text(instruction || 'Summarize the document with KPIs, risks, and next steps.');
    doc.moveDown().fontSize(12).text('— — —');
    doc.moveDown().fontSize(12).text(aiText, { align: 'left' });
