const express = require('express');
const router = express.Router();

// Local request guard (allows localhost or development mode)
function isLocalRequest(req) {
  if (process.env.NODE_ENV === 'development') return true;
  const ip = (req.ip || (req.connection && req.connection.remoteAddress) || '').toString();
  const localCandidates = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  if (localCandidates.includes(ip)) return true;
  if (ip.startsWith('::ffff:127.') || ip.startsWith('127.')) return true;
  return false;
}

router.get('/', (req, res) => {
  if (!isLocalRequest(req)) return res.status(403).send('Forbidden');

  const html = `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Welcome to BharatMart Backend</title>
    <link href="https://unpkg.com/tailwindcss@^2/dist/tailwind.min.css" rel="stylesheet">
    <style>
      body{font-family:Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f8fafc}
      .card{background:#fff;padding:28px;border-radius:12px;box-shadow:0 10px 30px rgba(2,6,23,0.08);max-width:820px;margin:60px auto}
      .brand{display:flex;align-items:center;gap:12px}
      .logo{width:56px;height:56px;border-radius:10px;background:linear-gradient(135deg,#34d399,#60a5fa);display:flex;align-items:center;justify-content:center;color:white;font-weight:700}
    </style>
  </head>
  <body>
    <div class="card">
      <div class="brand">
        <div class="logo">BM</div>
        <div>
          <h1 style="margin:0;font-size:20px">Welcome to BharatMart Backend</h1>
          <p style="margin:6px 0 0;color:#475569">Server is reachable. Use the API routes (under /api) from your client or Postman.</p>
        </div>
      </div>

      <div style="margin-top:18px;display:flex;gap:12px;flex-wrap:wrap">
        <a href="/api/health" class="px-4 py-2 bg-blue-600 text-white rounded">Health Check</a>
        <a href="/uploads" class="px-4 py-2 bg-gray-100 text-gray-800 rounded">Uploads</a>
      </div>

  <div style="margin-top:18px;color:#6b7280;font-size:13px"></div>
    </div>
  </body>
  </html>`;

  res.send(html);
});

module.exports = router;
