// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
// === serve static assets explicitly so image/favicon requests return files ===
app.use('/assets', express.static(path.join(ROOT, 'assets')));
app.use('/content', express.static(path.join(ROOT, 'content')));
app.use('/scripts', express.static(path.join(ROOT, 'scripts')));

// optional: explicit favicon route (safe)
app.get('/favicon.ico', (req, res) => {
  const ico = path.join(ROOT, 'assets', 'img', 'favicon.ico');
  if (fs.existsSync(ico)) return res.sendFile(ico);
  res.status(404).end();
});


const ROOT = path.join(__dirname);
const DATA_DIR = path.join(ROOT, 'data');
const COUNTS_FILE = path.join(DATA_DIR, 'counts.json');
const CODES_FILE = path.join(DATA_DIR, 'codes.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// helper read/write JSON
function readJson(filePath, defaultVal) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(text || 'null') || defaultVal;
  } catch (e) {
    return defaultVal;
  }
}
function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

// ensure counts file exists
if (!fs.existsSync(COUNTS_FILE)) writeJson(COUNTS_FILE, {});

app.use(express.static(ROOT));

// POST /api/verify - increments local counter and returns metadata
app.post('/api/verify', (req, res) => {
  const body = req.body || {};
  const code = String(body.code || body.c || '').trim();
  if (!code) return res.status(400).json({ error: 'missing code' });

  const codes = readJson(CODES_FILE, {});
  const counts = readJson(COUNTS_FILE, {});

  const prev = parseInt(counts[code] || 0, 10);
  const next = prev + 1;
  counts[code] = next;
  writeJson(COUNTS_FILE, counts);

  const threshold = 10; // local threshold: counterfeit from 11th verification
  const status = next > threshold ? 'counterfeit' : 'authentic';

  const meta = codes[code] || {};
  const productName = meta.name || 'Unknown product';
  const guillocheUrl = meta.guilloche || (`/assets/guilloche/placeholder.png`);

  return res.json({
    code,
    count: next,
    threshold,
    status,
    productName,
    guillocheUrl
  });
});

// GET /api/product/:code - return product metadata (optional)
app.get('/api/product/:code', (req, res) => {
  const codes = readJson(CODES_FILE, {});
  const code = String(req.params.code || '');
  if (!codes[code]) return res.status(404).json({ error: 'not found' });
  res.json(codes[code]);
});

// For SPA pretty routing, deliver index.html for unknown static paths
// For SPA pretty routing, deliver index.html for unknown static paths
app.get('*', (req, res) => {
    // map requested path *within* project root (prevent absolute path override)
    const rel = req.path.replace(/^\/+/, ''); // remove leading '/'
    const requested = path.join(ROOT, rel);
  
    // if the file physically exists under project root, serve it directly
    if (fs.existsSync(requested) && fs.statSync(requested).isFile()) {
      return res.sendFile(requested);
    }
  
    // otherwise send index (SPA fallback)
    res.sendFile(path.join(ROOT, 'index.html'));
  });
  

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Local clone server listening at http://localhost:${port}`));
