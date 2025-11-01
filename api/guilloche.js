// api/guilloche.js
// Proxy guilloche images from R2 and add CORS headers so client can fetch/HEAD safely.

const FETCH = (typeof fetch === 'function') ? fetch : require('node-fetch');
const R2_BASE = process.env.R2_PUBLIC_BASE || 'https://pub-4b0242a2a98f47a8b66fb0db20036b90.r2.dev';

module.exports = async (req, res) => {
  try {
    const code = (req.query.code || (req.body && req.body.code) || '').toString().trim();
    if (!code) return res.status(400).json({ error: 'missing code' });

    const url = `${R2_BASE.replace(/\/$/, '')}/images/guilloche_${encodeURIComponent(code)}.png`;

    // Fetch the image from R2
    const r = await FETCH(url);
    if (!r.ok) {
      // not found -> propagate 404
      return res.status(404).json({ error: 'not found' });
    }

    const contentType = r.headers.get('content-type') || 'application/octet-stream';
    const buffer = await r.arrayBuffer();

    // Return binary with CORS header
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');

    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    console.error('api/guilloche error', err);
    return res.status(500).json({ error: 'server error' });
  }
};
