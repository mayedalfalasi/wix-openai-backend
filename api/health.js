// /api/health.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  res.setHeader("Content-Type", "application/json");
  res.status(200).json({
    ok: true,
    service: "wix-openai-backend",
    version: "2025-10-11",
    now: new Date().toISOString(),
    domain: "https://wix-openai-backend-chi.vercel.app",
    env: { node: process.versions.node }
  });
}
