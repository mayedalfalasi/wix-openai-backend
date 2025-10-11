const Busboy = require('busboy');
<<<<<<< HEAD
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
=======

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(res, 405, { ok:false, error:'Method not allowed' });
    }

    const bb = Busboy({ headers: req.headers, limits: { fileSize: 20 * 1024 * 1024 } });
    let instruction = '';
    let text = '';
    let fileReceived = false;

    bb.on('field', (name, value) => {
      if (name === 'instruction') instruction = String(value || '');
    });

    bb.on('file', (_name, file) => {
      fileReceived = true;
      const chunks = [];
      file.on('data', d => chunks.push(d));
      file.on('end', () => { text = Buffer.concat(chunks).toString('utf8') });
    });

    bb.on('error', (e) => {
      return send(res, 400, { ok:false, error:'UPLOAD_PARSE_FAILED', detail:String(e?.message||e) });
    });

    bb.on('finish', async () => {
      try {
        if (!fileReceived) return send(res, 400, { ok:false, error:'NO_FILE', detail:'Upload a file under the "file" field.' });
        if (!text.trim())  return send(res, 400, { ok:false, error:'EMPTY_FILE', detail:'File was empty or unreadable.' });

        const prompt = instruction || 'Summarize this document for a business audience.';

        // Bypass OpenAI if ?noai=1 or no key set
        const skipAI = (req.url || '').includes('noai=1') || !process.env.OPENAI_API_KEY;
        if (skipAI) {
          return send(res, 200, {
            ok:true,
            mode: 'noai',
            instruction: prompt,
            bytes: Buffer.byteLength(text),
            preview: text.slice(0, 600)
          });
        }

        // OpenAI call
        let result = 'No result.';
        try {
          const OpenAI = require('openai');
          const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const r = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You are a concise document analyst.' },
              { role: 'user', content: `${prompt}\n\n---\n${text}` }
            ],
            temperature: 0.2
          });
          result = (r.choices?.[0]?.message?.content || '').trim() || result;
        } catch (e) {
          return send(res, 500, { ok:false, error:'OPENAI_FAILED', detail:String(e?.message||e) });
        }

        return send(res, 200, { ok:true, result });
      } catch (e) {
        return send(res, 500, { ok:false, error:'ANALYZE_FAILED', detail:String(e?.message||e) });
      }
    });

    req.pipe(bb);
  } catch (e) {
    return send(res, 500, { ok:false, error:'HANDLER_CRASH', detail:String(e?.message||e) });
  }
>>>>>>> 5e49a50 (feat: stable analyze (busboy), health, download, minimal vercel.json)
};
