// Serverless function for Vercel (Node.js)
// Endpoint: POST /api/analyze (multipart/form-data)
// Fields: file (binary), instruction (string)

const Busboy = require('busboy');
const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB
    let instruction = '';
    let fileText = '';
    let fileReceived = false;
    let fileTooLarge = false;

    bb.on('field', (name, value) => {
      if (name === 'instruction') instruction = String(value || '').trim();
    });

    bb.on('file', (_name, file, info) => {
      fileReceived = true;
      const chunks = [];
      file.on('data', (d) => chunks.push(d));
      file.on('limit', () => { fileTooLarge = true; });
      file.on('end', () => {
        fileText = Buffer.concat(chunks).toString('utf8');
      });
    });

    bb.on('error', () => {
      return res.status(400).json({ error: 'Invalid form data' });
    });

    bb.on('finish', async () => {
      if (fileTooLarge) {
        return res.status(413).json({ error: 'File too large (max 20MB)' });
      }
      if (!fileReceived) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      if (!fileText || !fileText.trim()) {
        return res.status(400).json({
          error: "Couldn't read file as text. Try a smaller text-based file (txt/csv/docx/pdf text)."
        });
      }

      const prompt = (instruction && instruction.length > 0)
        ? instruction
        : 'Summarize this document clearly for a business audience';

      try {
        const completion = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a highly accurate business document analyzer.' },
            { role: 'user', content: `${prompt}\n\n---\nDocument Content:\n${fileText}` }
          ]
        });

        const result = completion?.choices?.[0]?.message?.content || 'No result';
        return res.status(200).json({ result });
      } catch (err) {
        console.error('OpenAI error:', err?.message || err);
        return res.status(500).json({ error: 'OpenAI request failed' });
      }
    });

    req.pipe(bb);
  } catch (e) {
    console.error('Handler error:', e?.message || e);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
};
