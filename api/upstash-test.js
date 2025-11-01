// api/upstash-test.js
export default async function handler(req, res) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    const key = "count:test:" + (Date.now() % 100000);
  
    if (!url || !token) {
      return res.status(200).json({ ok: false, reason: 'Missing UPSTASH env vars' });
    }
  
    // candidate endpoint variations to try
    const candidates = [url.replace(/\/$/, ''), url.replace(/\/$/, '') + '/redis', url.replace(/\/$/, '') + '/commands'];
  
    const results = [];
    for (const candidate of candidates) {
      try {
        const r = await fetch(candidate, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ cmd: ["INCR", key] }),
        });
        const text = await r.text();
        results.push({ candidate, status: r.status, ok: r.ok, text });
        // if Upstash returned JSON with result, stop early
        try {
          const j = JSON.parse(text);
          if (j && (j.result !== undefined || Array.isArray(j) || typeof j === 'number')) {
            return res.status(200).json({ ok: true, candidate, parsed: j, raw: text });
          }
        } catch (e) {
          // not JSON — continue trying other endpoints
        }
      } catch (err) {
        results.push({ candidate, error: err.message });
      }
    }
  
    // none matched — return verbose diagnostics
    return res.status(200).json({ ok: false, tried: results });
  }
  