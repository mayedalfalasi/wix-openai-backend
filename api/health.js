export default async function handler(req, res) {
  // CORS & preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // Health payload
  res.setHeader("Content-Type", "application/json");
  res.status(200).send(JSON.stringify({
    ok: true,
    service: "wix-openai-backend",
    version: "2025-10-11",
    now: new Date().toISOString(),
    env: { node: process.versions.node }
  }));
}
