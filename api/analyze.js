const Busboy = require('busboy');
const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const bb = Busboy({ headers: req.headers, limits: { fileSize: 20 * 1024 * 1024 } });
  let instruction = '';
  let text = '';

  bb.on('field', (n, v) => { if (n === 'instruction') instruction = v; });
  bb.on('file', (_n, file) => {
    const chunks = [];
    file.on('data', d => chunks.push(d));
    file.on('end', () => text = Buffer.concat(chunks).toString('utf8'));
  });

  bb.on('finish', async () => {
    if (!text.trim()) return res.status(400).json({ error: 'Empty or unreadable file.' });

    const prompt = instruction || 'Summarize this document for a business audience.';
    try {
      const r = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a concise document analyst.' },
          { role: 'user', content: `${prompt}\n\n---\n${text}` }
        ]
      });
      res.json({ result: r.choices[0].message.content });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  req.pipe(bb);
};
