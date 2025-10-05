// api/download.js
module.exports = async (req, res) => {
  try {
    // allow GET (simple) and POST (large text)
    const isJson = (req.headers['content-type'] || '').includes('application/json');

    // read body (for POST)
    async function readBody() {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString('utf8');
      if (isJson) return JSON.parse(raw || '{}');
      // x-www-form-urlencoded
      const params = new URLSearchParams(raw);
      return Object.fromEntries(params.entries());
    }

    let filename = 'analysis.txt';
    let text = '';

    if (req.method === 'GET') {
      const q = req.query || {};
      filename = (q.filename || filename).toString();
      text = (q.text || '').toString();
    } else if (req.method === 'POST') {
      const body = await readBody();
      filename = (body.filename || filename).toString();
      text = (body.text || '').toString();
    } else {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).end('Method Not Allowed');
    }

    // sanitize filename
    filename = filename.replace(/[^\w.\-]/g, '_') || 'analysis.txt';

    // force download
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(text ?? '');
  } catch (e) {
    res.status(500).json({ error: 'Failed to prepare download' });
  }
};
