// Example snippet for api/upstash-test or api/verify (Node / Vercel Serverless)
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export default async function handler(req, res) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return res.status(500).json({ ok:false, error: 'UPSTASH env missing' });
  }

  const cmdBody = { cmd: ["INCR", "cloma:verifications"] };

  try {
    const uRes = await fetch(UPSTASH_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(cmdBody)
    });

    const text = await uRes.text();
    let json = null;
    try { json = JSON.parse(text); } catch(e){ json = text; }

    // return debug for now (remove before production)
    return res.status(200).json({ ok: true, status: uRes.status, text: json });
  } catch (err) {
    console.error('upstash error', err);
    return res.status(500).json({ ok:false, error: err.message });
  }
}
