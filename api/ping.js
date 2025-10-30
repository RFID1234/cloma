// api/ping.js
export default (req, res) => {
    res.setHeader('content-type', 'application/json');
    return res.status(200).send(JSON.stringify({ ok: true, ts: Date.now() }));
  };
  
