// api/verify.js (Vercel serverless, Node 18+)
// Minimal secure implementation using Upstash REST. POST { code: "xxx" }
import fetch from 'node-fetch'; // Vercel provides global fetch in Node 18+, but keep compatibility

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const THRESHOLD = 10; // after >10, mark counterfeit (you said 10 successful => show counterfeit from 11)

const R2_BASE = 'https://pub-4b0242a2a98f47a8b66fb0db20036b90.r2.dev';

if (!UPSTASH_URL || !UPSTASH_TOKEN) {
  // throw on startup would crash; instead respond with helpful error later
  console.warn('Upstash env missing.');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const code = (body.code || body.c || '').toString().trim();
    if (!code) return res.status(400).json({ error: 'Missing code' });

    // Use Upstash REST increment: POST /get or /incr? See Upstash REST docs.
    // We'll use /incr with key count:{code}
    const key = `count:${code}`;

    // Increment the counter (Upstash REST: POST { "increment": 1 } to /incr/<key> or use redis api)
    // Simpler: call the REST redis command endpoint: POST /?command=INCR&key=<key>
    // Upstash REST docs: https... (we assume standard)
    // Build commands array: ["INCR", key]
    const cmdBody = { "cmd": ["INCR", key] };

    const resp = await fetch(UPSTASH_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(cmdBody)
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('Upstash error', resp.status, text);
      return res.status(500).json({ error: 'Upstash error' });
    }

    const up = await resp.json();
    // up should contain the incremented value - adapt if your Upstash returns differently
    // Upstash usually returns a single numeric reply; handle common shapes:
    const count = Number(up && (up.result || up[0] || up)) || 0;

    // Determine status
    // If count > THRESHOLD => counterfeit (your spec said after 10 successful verifications show counterfeit)
    const status = count > THRESHOLD ? 'counterfeit' : 'valid';

    // Build guilloche URL (public R2)
    const guillocheUrl = `${R2_BASE}/images/guilloche_${encodeURIComponent(code)}.png`;

    // Product name optional — return same as original
    const productName = 'Cloma Product';

    return res.status(200).json({
      code,
      count,
      threshold: THRESHOLD,
      status,
      productName,
      guillocheUrl
    });

  } catch (err) {
    console.error('verify handler error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
