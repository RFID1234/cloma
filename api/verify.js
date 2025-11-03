// api/verify.js
//
// Updated 2025-11-03
// - Uses Upstash REST path endpoints (`/incr/{key}`, `/get/{key}`, `/set/{key}/{value}`)
// - Increments only when guilloche image exists (successful verification)
// - Fallbacks gracefully if Upstash fails
// - Threshold logic unchanged
//

const THRESHOLD = 10;
const R2_BASE =
  process.env.R2_PUBLIC_BASE ||
  "https://pub-4b0242a2a98f47a8b66fb0db20036b90.r2.dev";
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

let _fetch = typeof fetch !== "undefined" ? fetch : null;
if (!_fetch) {
  try {
    _fetch = require("node-fetch");
  } catch (_) {}
}

// --- Helper to test if an R2 image exists (successful fetch means verified) ---
async function guillocheExists(url) {
  try {
    const r = await _fetch(url, { method: "HEAD" });
    return r.ok;
  } catch (e) {
    return false;
  }
}

// --- Upstash helpers for REST path endpoints ---
async function restIncr(baseUrl, token, key) {
  const url = baseUrl.replace(/\/$/, "") + "/incr/" + encodeURIComponent(key);
  try {
    const resp = await _fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
    });
    const text = await resp.text();
    try {
      return { ok: resp.ok, body: JSON.parse(text), raw: text, status: resp.status };
    } catch {
      return { ok: resp.ok, body: text, raw: text, status: resp.status };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function restGet(baseUrl, token, key) {
  const url = baseUrl.replace(/\/$/, "") + "/get/" + encodeURIComponent(key);
  try {
    const resp = await _fetch(url, {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
    });
    const text = await resp.text();
    try {
      return { ok: resp.ok, body: JSON.parse(text), raw: text, status: resp.status };
    } catch {
      return { ok: resp.ok, body: text, raw: text, status: resp.status };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function restSet(baseUrl, token, key, value) {
  const url =
    baseUrl.replace(/\/$/, "") +
    "/set/" +
    encodeURIComponent(key) +
    "/" +
    encodeURIComponent(value);
  try {
    const resp = await _fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
    });
    const text = await resp.text();
    try {
      return { ok: resp.ok, body: JSON.parse(text), raw: text, status: resp.status };
    } catch {
      return { ok: resp.ok, body: text, raw: text, status: resp.status };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// --- Main handler ---
module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body =
      req.body && typeof req.body === "object"
        ? req.body
        : JSON.parse(req.body || "{}");
    const code = (body.code || body.c || "").toString().trim();
    if (!code) return res.status(400).json({ error: "Missing code" });

    let count = 0;
    let upstashError = false;
    const key = `count:${code}`;
    const base = (UPSTASH_URL || "").replace(/\/$/, "");

    // Construct image URL and check if it exists
    const guillocheUrl = `${R2_BASE.replace(/\/$/, "")}/images/guilloche_${encodeURIComponent(code)}.png`;
    const imageExists = await guillocheExists(guillocheUrl);

    if (UPSTASH_URL && UPSTASH_TOKEN && _fetch && imageExists) {
      // only increment when guilloche image exists
      let incrRes = await restIncr(base, UPSTASH_TOKEN, key);
      if (incrRes && incrRes.ok) {
        // try to parse the result number
        if (typeof incrRes.body === "object" && incrRes.body.result !== undefined) {
          count = Number(incrRes.body.result) || 0;
        } else if (!isNaN(Number(incrRes.body))) {
          count = Number(incrRes.body);
        } else if (!isNaN(Number(incrRes.raw))) {
          count = Number(incrRes.raw);
        } else {
          upstashError = true;
        }
      } else {
        // fallback: try get+set
        const getRes = await restGet(base, UPSTASH_TOKEN, key);
        if (getRes && getRes.ok) {
          let cur = 0;
          const gb = getRes.body;
          if (gb && typeof gb === "object" && gb.result !== undefined) {
            cur = Number(gb.result) || 0;
          } else if (!isNaN(Number(getRes.body))) {
            cur = Number(getRes.body);
          }
          const next = cur + 1;
          const setRes = await restSet(base, UPSTASH_TOKEN, key, String(next));
          if (setRes && setRes.ok) count = next;
          else upstashError = true;
        } else {
          // if key doesn't exist, initialize it to 1
          const setRes = await restSet(base, UPSTASH_TOKEN, key, "1");
          if (setRes && setRes.ok) count = 1;
          else upstashError = true;
        }
      }
    } else {
      upstashError = true;
    }

    if (upstashError) count = 0;

    const status = imageExists
      ? count > THRESHOLD
        ? "counterfeit"
        : "valid"
      : "not_found";
    const productName = "Cloma Product";

    // --- Defensive fallback tweaks ---
    if (!imageExists) status = "not_found";        // force not_found if image actually isn't there
    if (isNaN(count) || count === null) count = 0; // guarantee numeric count


    return res
      .status(200)
      .json({ code, count, threshold: THRESHOLD, status, productName, guillocheUrl });
  } catch (err) {
    console.error("verify handler error", err);
    return res.status(500).json({ error: "Server error" });
  }
};
