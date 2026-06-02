const path = require('path');
const express = require('express');

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self' data:",
  "img-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests"
].join('; ');

const permissionsPolicy = [
  'accelerometer=()',
  'camera=()',
  'geolocation=()',
  'gyroscope=()',
  'microphone=()',
  'payment=()',
  'usb=()'
].join(', ');

function setNoCacheHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
}

function applySecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', permissionsPolicy);
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
}

function sendStaticFile(res, filePath) {
  applySecurityHeaders(res);
  setNoCacheHeaders(res);
  res.sendFile(filePath, {
    lastModified: false,
    cacheControl: false,
    acceptRanges: false
  });
}

function createHttpApp({ publicDir, auth, getRoomCount, buildInfo = {} }) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.set('etag', false);

  app.use((req, res, next) => {
    applySecurityHeaders(res);
    setNoCacheHeaders(res);
    next();
  });

  app.use(express.json({ limit: '8kb' }));

  // Auth hub integration (launch / logout / heartbeat + browser heartbeat asset)
  app.use('/auth-client', auth.staticAssets);
  app.get('/auth/launch', auth.handleLaunch);
  app.get('/auth/logout', auth.handleLogout);
  app.post('/api/heartbeat', auth.handleHeartbeat);

  const requireEntitled = (req, res, next) => {
    if (req.user && req.user.entitled) return next();
    return res.redirect(302, `${auth._ctx.hubBaseUrl}/dashboard`);
  };

  app.use(
    '/',
    express.static(publicDir, {
      dotfiles: 'ignore', index: false, extensions: ['html'], redirect: false,
      etag: false, lastModified: false, cacheControl: false, acceptRanges: false,
      setHeaders: (res) => { applySecurityHeaders(res); setNoCacheHeaders(res); }
    })
  );

  app.get('/', auth.requireAuth, requireEntitled, (_req, res) => {
    sendStaticFile(res, path.join(publicDir, 'index.html'));
  });

  app.get(['/license', '/licence'], (_req, res) => {
    sendStaticFile(res, path.join(publicDir, 'license.html'));
  });

  app.get('/api/me', auth.requireAuth, (req, res) => {
    res.json({ userId: req.user.id, company: req.user.company || null });
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      version: buildInfo.version || 'unknown',
      commit: buildInfo.commit || 'unknown',
      uptime: process.uptime(),
      rooms: getRoomCount()
    });
  });

  return app;
}

module.exports = {
  applySecurityHeaders,
  createHttpApp,
  setNoCacheHeaders
};
