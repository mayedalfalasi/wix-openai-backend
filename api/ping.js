// api/ping.js
export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({ ok: true, route: "ping", time: new Date().toISOString() });
}
