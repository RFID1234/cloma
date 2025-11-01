// api/verify.js
// Robust Upstash increment + helpful debug/logging
const THRESHOLD = 10; // >10 => counterfeit
const R2_BASE = process.env.R2_PUBLIC_BASE || 'https://pub-4b0242a2a98f47a8b66fb0db20036b90.r2.dev';
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// Use global fetch if available otherwise try require
let _fetch = (typeof fetch !== 'undefined') ? fetch : null;
if (!_fetch) {
  try { _fetch = require('node-fetch'); } catch (e) { /* will error if used */ }
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

module.exports = async (req, res) => {
  // ensure no caching
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}');
    const code = (body.code || body.c || '').toString().trim();
    if (!code) return res.status(400).json({ error: 'Missing code' });

    const key = `count:${code}`;
    let count = 0;
    let upstashOk = false;
    let upstashDebug = { tried: [], ok: false, response: null };

    if (UPSTASH_URL && UPSTASH_TOKEN && _fetch) {
      // 1) First try canonical Upstash REST: POST to UPSTASH_URL with { cmd: ["INCR", key] }
      try {
        const cmdBody = { cmd: ["INCR", key] };
        upstashDebug.tried.push({ method: 'POST-cmd', url: UPSTASH_URL, body: cmdBody });
        const r = await _fetch(UPSTASH_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${UPSTASH_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(cmdBody),
        });

        const text = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (e) { parsed = text; }
        upstashDebug.response = { status: r.status, ok: r.ok, text: text, parsed };

        if (r.ok) {
          // typical shapes: { result: 3 } or [3] or 3
          const maybe = parsed && (parsed.result || parsed[0] || parsed);
          count = safeNum(maybe);
          upstashOk = true;
        }
      } catch (e) {
        upstashDebug.response = { error: String(e) };
      }

      // 2) Fallback: if first attempt failed, try PUT/POST to an /incr/<key> style endpoint (some users have urls ending with /redis or base)
      if (!upstashOk) {
        try {
          const raw = UPSTASH_URL.replace(/\/+$/, '');
          const tryUrl = `${raw}/incr/${encodeURIComponent(key)}`;
          upstashDebug.tried.push({ method: 'POST-incr', url: tryUrl });
          const r2 = await _fetch(tryUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${UPSTASH_TOKEN}`,
              'Content-Type': 'application/json'
            },
            // some Upstash implementations accept empty body for incr
            body: JSON.stringify({})
          });
          const text2 = await r2.text();
          let parsed2 = null;
          try { parsed2 = JSON.parse(text2); } catch(e){ parsed2 = text2; }
          upstashDebug.response2 = { status: r2.status, ok: r2.ok, text: text2, parsed: parsed2 };

          if (r2.ok) {
            const maybe = parsed2 && (parsed2.result || parsed2[0] || parsed2);
            count = safeNum(maybe);
            upstashOk = true;
          }
        } catch (e) {
          upstashDebug.response2 = { error: String(e) };
        }
      }
    } else {
      upstashDebug = { error: 'UPSTASH env missing', UPSTASH_URL: !!UPSTASH_URL, UPSTASH_TOKEN: !!UPSTASH_TOKEN };
    }

    // If still not ok, count stays 0 but we surface debug to logs (do NOT leak token)
    if (!upstashOk) {
      console.warn('Upstash not incremented', Object.assign({}, upstashDebug, { UPSTASH_URL_BAD: !!UPSTASH_URL }));
      // Do not return token in response. Return info that helps debug at deploy logs.
    }

    const status = (count > THRESHOLD) ? 'counterfeit' : 'valid';
    const guillocheUrl = `${R2_BASE.replace(/\/$/, '')}/images/guilloche_${encodeURIComponent(code)}.png`;
    const productName = 'Cloma Product';

    // return helpful payload (keep it simple)
    return res.status(200).json({
      code,
      count,
      threshold: THRESHOLD,
      status,
      productName,
      guillocheUrl,
      _debug_upstash: upstashOk ? 'ok' : 'failed' // tiny hint – no secrets
    });
  } catch (err) {
    console.error('verify handler error', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
