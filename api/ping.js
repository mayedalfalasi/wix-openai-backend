// api/ping.js
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  res.status(200).json({ ok: true, time: new Date().toISOString() });
}
