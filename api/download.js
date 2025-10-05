// Simple download endpoint for Wix embed.
// Supports GET (easy) and POST (for large text).
module.exports = async (req, res) => {
  try {
    const filename = (req.method === 'GET'
      ? (req.query.filename || 'analysis.txt')
      : (req.body?.filename || 'analysis.txt')
    ).toString().replace(/[^\w.\-]/g, '_');

    let text = '';
    if (req.method === 'GET') {
      text = (req.query.text || '').toString();
    } else if (req.method === 'POST') {
      // Body could be JSON or form-encoded
      if (req.headers['content-type']?.includes('application/json')) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        text = (parsed.text || '').toString();
      } else {
        // x-www-form-urlencoded
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = Buffer.concat(chunks).toString('utf8');
        const params = new URLSearchParams(body);
        text = (params.get('text') || '').toString();
      }
    } else {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).end('Method Not Allowed');
    }

    // Set headers to force download
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(text ?? '');
  } catch (e) {
    res.status(500).json({ error: 'Failed to prepare download' });
  }
};
