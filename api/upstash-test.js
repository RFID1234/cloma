export default async function handler(req, res) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    const key = "count:test123";
  
    if (!url || !token) {
      return res.status(200).json({ ok: false, reason: 'Missing env vars' });
    }
  
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cmd: ["INCR", key] }),
      });
  
      const text = await r.text();
      return res.status(r.status).json({ ok: true, text });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }
  