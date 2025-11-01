// api/verify.js
// Robust Upstash INCR with fallbacks + debug logging
const THRESHOLD = 10; // >10 => counterfeit
const R2_BASE = process.env.R2_PUBLIC_BASE || 'https://pub-4b0242a2a98f47a8b66fb0db20036b90.r2.dev';
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// choose fetch (Node 18+ on Vercel provides global fetch)
let _fetch = (typeof fetch !== 'undefined') ? fetch : null;
if (!_fetch) {
  try { _fetch = require('node-fetch'); } catch (e) { /* will error later if used */ }
}

async function tryUpstashIncr(key) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN || !_fetch) {
    console.warn('Upstash not configured or fetch missing', { UPSTASH_URL: !!UPSTASH_URL, UPSTASH_TOKEN: !!UPSTASH_TOKEN, hasFetch: !!_fetch });
    return { ok: false, reason: 'not_configured' };
  }

  const payload = { cmd: ["INCR", key] };
  const candidateUrls = [
    UPSTASH_URL,
    // common fallbacks — harmless to try if original fails
    (UPSTASH_URL.endsWith('/') ? UPSTASH_URL.slice(0, -1) : UPSTASH_URL) + '/redis',
    (UPSTASH_URL.endsWith('/') ? UPSTASH_URL.slice(0, -1) : UPSTASH_URL) + '/commands'
  ];

  for (let url of candidateUrls) {
    try {
      console.log('Upstash try', url);
      const upRes = await _fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${UPSTASH_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        // allow CORS / no-cache by default — server-side call
      });

      const text = await upRes.text().catch(() => null);
      let upJson = null;
      try { upJson = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }

      console.log('Upstash response', { url, status: upRes.status, ok: upRes.ok, text: text ? (text.length>200? text.slice(0,200)+'...' : text) : null, parsed: !!upJson });

      if (!upRes.ok) {
        // try next candidate
        continue;
      }

      // Try to extract numeric result from common shapes
      if (upJson != null) {
        if (typeof upJson === 'number') return { ok: true, count: Number(upJson) };
        if (Array.isArray(upJson) && upJson.length > 0 && !isNaN(Number(upJson[0]))) return { ok: true, count: Number(upJson[0]) };
        if (typeof upJson.result !== 'undefined' && !isNaN(Number(upJson.result))) return { ok: true, count: Number(upJson.result) };
        // some Upstash responses wrap result inside other keys
        if (typeof upJson?.body !== 'undefined' && !isNaN(Number(upJson.body))) return { ok: true, count: Number(upJson.body) };
      } else if (text && !isNaN(Number(text))) {
        return { ok: true, count: Number(text) };
      }

      // If we reach here but status ok, try to coerce any numeric in the text
      const maybeNum = text && text.match && text.match(/-?\d+/);
      if (maybeNum && maybeNum.length) return { ok: true, count: Number(maybeNum[0]) };

      // If ok but couldn't parse, return failure so we fallback
      console.warn('Upstash ok but could not parse count', { url, text });
      return { ok: false, reason: 'unparseable', text };
    } catch (e) {
      console.error('Upstash fetch error for', url, e && e.message || e);
      // try next
    }
  }

  return { ok: false, reason: 'all_attempts_failed' };
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
    let upstashDebug = null;

    if (UPSTASH_URL && UPSTASH_TOKEN && _fetch) {
      try {
        const key = `count:${code}`;
        const result = await tryUpstashIncr(key);
        upstashDebug = result;
        if (result && result.ok && typeof result.count !== 'undefined') {
          count = Number(result.count);
        } else {
          upstashError = true;
        }
      } catch (e) {
        console.error('Upstash call exception', e);
        upstashError = true;
      }
    } else {
      upstashError = true;
    }

    if (upstashError) count = 0;

    const status = (count > THRESHOLD) ? 'counterfeit' : 'valid';
    const guillocheUrl = `${R2_BASE.replace(/\/$/, '')}/images/guilloche_${encodeURIComponent(code)}.png`;
    const productName = 'Cloma Product';

    // Helpful debug info appears in Vercel logs — safe to return minimal info to client
    const responsePayload = { code, count, threshold: THRESHOLD, status, productName, guillocheUrl };
    // include debug only when explicitly asked, not by default (avoid leaking tokens)
    if (req.headers['x-debug-upstash'] === '1') {
      responsePayload._debug = { upstashConfig: { UPSTASH_URL: !!UPSTASH_URL, UPSTASH_TOKEN: !!UPSTASH_TOKEN }, upstashDebug };
    }

    return res.status(200).json(responsePayload);
  } catch (err) {
    console.error('verify handler error', err && (err.stack || err.message || err));
    return res.status(500).json({ error: 'Server error' });
  }
};
