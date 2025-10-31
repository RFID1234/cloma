// api/verify.js
// Vercel serverless function (CommonJS style) - expects POST { code: "..." }
// Uses Upstash REST (if configured). Returns JSON { code, count, threshold, status, productName, guillocheUrl }

const THRESHOLD = 10; // >10 => counterfeit
const R2_BASE = process.env.R2_PUBLIC_BASE || 'https://pub-4b0242a2a98f47a8b66fb0db20036b90.r2.dev';
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// Use global fetch if available; otherwise try node-fetch (if installed)
let _fetch = (typeof fetch !== 'undefined') ? fetch : null;
if (!_fetch) {
  try { _fetch = require('node-fetch'); } catch (e) { /* fallback will error later if used */ }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}');
    const code = (body.code || body.c || '').toString().trim();
    if (!code) return res.status(400).json({ error: 'Missing code' });

    let count = 0;
    let upstashError = false;

    if (UPSTASH_URL && UPSTASH_TOKEN && _fetch) {
      try {
        // Upstash REST: send Redis command INCR key
        // Upstash command API often expects JSON like: { "cmd": ["INCR", "key"] }
        const key = `count:${code}`;
        const cmdBody = { cmd: ["INCR", key] };
        const upRes = await _fetch(UPSTASH_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${UPSTASH_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(cmdBody),
          // Upstash sometimes expects POST to /redis or root depending on your URL;
          // you supplied an Upstash base URL — if your Upstash returns different shape,
          // this is robust: try to parse the returned json and pick reasonable field.
        });

        if (!upRes.ok) {
          upstashError = true;
        } else {
          const upJson = await upRes.json();
          // Try common shapes: { result: 3 } or [3] or 3
          count = Number((upJson && (upJson.result || upJson[0] || upJson)) || 0);
        }
      } catch (e) {
        console.error('Upstash call error', e);
        upstashError = true;
      }
    } else {
      // Upstash not configured — don't crash, act as count=0
      upstashError = true;
    }

    // If Upstash failed, fallback to count = 0 (safe)
    if (upstashError) count = 0;

    const status = (count > THRESHOLD) ? 'counterfeit' : 'valid';
    const guillocheUrl = `${R2_BASE.replace(/\/$/, '')}/images/guilloche_${encodeURIComponent(code)}.png`;
    const productName = 'Cloma Product';

    return res.status(200).json({ code, count, threshold: THRESHOLD, status, productName, guillocheUrl });
  } catch (err) {
    console.error('verify handler error', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
