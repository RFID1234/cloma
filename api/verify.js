// api/verify.js
// CommonJS-compatible for Vercel serverless
// Keeps your R2 base and THRESHOLD behaviour, but adds robustness and clear errors.

const THRESHOLD = Number(process.env.THRESHOLD || 10);
const R2_BASE = (process.env.R2_PUBLIC_BASE || 'https://pub-4b0242a2a98f47a8b66fb0db20036b90.r2.dev').replace(/\/$/, '');
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function safeJson(resp) {
  try { return await resp.json(); } catch(e){ return null; }
}

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // body parsing: Vercel usually gives parsed body, but handle string too
    let body = req.body;
    if (!body || typeof body !== 'object') {
      try { body = JSON.parse(req.body || '{}'); } catch(e) { body = {}; }
    }

    const code = (body.code || body.c || '').toString().trim();
    if (!code) return res.status(400).json({ error: 'Missing code' });

    // Build guilloche URL (public R2)
    const guillocheUrl = `${R2_BASE}/images/guilloche_${encodeURIComponent(code)}.png`;

    // 1) Check whether guilloche image exists (HEAD)
    let guillocheExists = false;
    try {
      const headResp = await fetch(guillocheUrl, { method: 'HEAD' });
      if (headResp && headResp.ok && headResp.status !== 404) guillocheExists = true;
    } catch (e) {
      // network error -> treat as missing image
      guillocheExists = false;
    }

    // 2) Upstash increment (optional)
    let count = 0;
    let upstashError = null;
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      try {
        // Many Upstash REST setups accept a JSON command array: { "cmd": ["INCR", key] }
        // We'll POST that to the configured UPSTASH_URL.
        // If your UPSTASH_REDIS_REST_URL expects a path, keep it as is in env.
        const key = `count:${code}`;
        const cmdBody = { cmd: ['INCR', key] };

        const uresp = await fetch(UPSTASH_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${UPSTASH_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(cmdBody)
        });

        if (!uresp.ok) {
          // collect a helpful message, but do not crash the whole request
          const txt = await uresp.text().catch(()=>'<no-text>');
          upstashError = `Upstash responded ${uresp.status}: ${txt.substring(0,200)}`;
        } else {
          const uj = await safeJson(uresp);
          // handle several shapes: { result: <n> }, [<n>], <n>
          if (uj && typeof uj.result !== 'undefined') {
            count = Number(uj.result) || 0;
          } else if (Array.isArray(uj) && typeof uj[0] !== 'undefined') {
            count = Number(uj[0]) || 0;
          } else if (typeof uj === 'number') {
            count = Number(uj) || 0;
          } else if (uj && typeof uj === 'object' && Object.keys(uj).length === 0) {
            // some Upstash setups return {} for commands; fallback to 0
            count = 0;
          } else {
            // last resort, try parse text
            const txt = await uresp.text().catch(()=>null);
            if (txt && !Number.isNaN(Number(txt))) count = Number(txt);
          }
        }
      } catch (e) {
        upstashError = (e && e.message) ? e.message : String(e);
      }
    } else {
      upstashError = 'UPSTASH env not set';
    }

    // 3) Decide status
    const status = (count > THRESHOLD) ? 'counterfeit' : 'valid';

    // 4) Product name (same as original)
    const productName = 'Cloma Product';

    // 5) Return response (guilloche fallback to placeholder)
    return res.status(200).json({
      code,
      count,
      threshold: THRESHOLD,
      status,
      productName,
      guillocheUrl: guillocheExists ? guillocheUrl : '/assets/guilloche/placeholder.png',
      upstashError
    });

  } catch (err) {
    console.error('verify handler error', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
