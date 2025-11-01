// api/verify.js
const THRESHOLD = 10;
const R2_BASE = process.env.R2_PUBLIC_BASE || 'https://pub-4b0242a2a98f47a8b66fb0db20036b90.r2.dev';
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

let _fetch = (typeof fetch !== 'undefined') ? fetch : null;
if (!_fetch) {
  try { _fetch = require('node-fetch'); } catch (e) { /* will error if missing */ }
}

// Try a candidate Upstash endpoint with the standard Redis REST command body
async function tryUpstashEndpoint(candidateUrl, token, key) {
  try {
    const resp = await _fetch(candidateUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ cmd: ['INCR', key] }),
    });
    const text = await resp.text();
    // try parse JSON
    try {
      const j = JSON.parse(text);
      return { ok: resp.ok, body: j, raw: text, status: resp.status };
    } catch (e) {
      return { ok: resp.ok, body: text, raw: text, status: resp.status };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
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
      const key = `count:${code}`;
      const base = UPSTASH_URL.replace(/\/$/, '');
      const candidates = [base, base + '/redis', base + '/commands'];

      let lastResult = null;
      for (const candidate of candidates) {
        lastResult = await tryUpstashEndpoint(candidate, UPSTASH_TOKEN, key);
        if (lastResult && lastResult.ok) break;
      }

      if (!lastResult || !lastResult.ok) {
        upstashError = true;
      } else {
        // Parse `lastResult.body` for common shapes
        const body = lastResult.body;
        if (typeof body === 'object') {
          // Upstash commonly returns {result: 3} or [3]
          if (body.result !== undefined) {
            count = Number(body.result) || 0;
          } else if (Array.isArray(body) && body[0] !== undefined) {
            count = Number(body[0]) || 0;
          } else {
            // fallback: find first numeric property
            const vals = Object.values(body).filter(v => typeof v === 'number' || (!isNaN(Number(v))));
            if (vals.length) count = Number(vals[0]);
            else upstashError = true;
          }
        } else if (!isNaN(Number(body))) {
          count = Number(body);
        } else {
          upstashError = true;
        }
      }
    } else {
      upstashError = true;
    }

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
