const path = require('path');
const express = require('express');
const {
  AccessKeyError,
  createAccessKey,
  isAdminKeyAuthorized,
  listAccessKeys,
  removeAccessKey,
  rotateAccessKey,
  updateAccessKeyStatus
} = require('./accessKeys');
const {
  listAdminActivity,
  logAdminActivity
} = require('./adminActivity');

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

function createRequireAdminKey(adminKey) {
  return function requireAdminKey(req, res, next) {
    if (!adminKey) {
      return res.status(503).json({ error: 'Admin key management is not configured.' });
    }

    const providedKey = req.get('x-scrum-poker-admin-key') || '';
    if (!isAdminKeyAuthorized(providedKey, adminKey)) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    next();
  };
}

function sendAccessKeyError(res, err) {
  if (!(err instanceof AccessKeyError)) {
    return res.status(500).json({ error: 'Unable to manage access keys.' });
  }

  const statusByCode = {
    DUPLICATE_KEY_NAME: 409,
    INVALID_ACCESS_KEY: 400,
    INVALID_KEY_STATUS: 400,
    INVALID_KEY_NAME: 400,
    KEY_NOT_FOUND: 404
  };

  return res.status(statusByCode[err.code] || 500).json({ error: err.message });
}

function recordAdminActivity(activityFile, event) {
  try {
    return logAdminActivity(activityFile, event);
  } catch (err) {
    console.error('Failed to write admin activity log:', err);
    return null;
  }
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

function createHttpApp({ publicDir, keysFile, activityFile, adminKey, getRoomCount, buildInfo = {} }) {
  const app = express();
  const requireAdminKey = createRequireAdminKey(adminKey);

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.set('etag', false);

  app.use((req, res, next) => {
    applySecurityHeaders(res);
    setNoCacheHeaders(res);
    next();
  });

  app.use(express.json({ limit: '8kb' }));

  app.use(
    '/',
    express.static(publicDir, {
      dotfiles: 'ignore',
      index: false,
      extensions: ['html'],
      redirect: false,
      etag: false,
      lastModified: false,
      cacheControl: false,
      acceptRanges: false,
      setHeaders: (res) => {
        applySecurityHeaders(res);
        setNoCacheHeaders(res);
      }
    })
  );

  app.get('/', (_req, res) => {
    sendStaticFile(res, path.join(publicDir, 'index.html'));
  });

  app.get(['/license', '/licence'], (_req, res) => {
    sendStaticFile(res, path.join(publicDir, 'license.html'));
  });

  app.get('/api/admin/keys', requireAdminKey, (_req, res) => {
    try {
      res.status(200).json({ keys: listAccessKeys(keysFile) });
    } catch (err) {
      sendAccessKeyError(res, err);
    }
  });

  app.post('/api/admin/keys', requireAdminKey, (req, res) => {
    try {
      const key = createAccessKey(keysFile, req.body?.name);
      recordAdminActivity(activityFile, {
        action: 'created',
        teamName: key.name,
        keyFingerprint: key.fingerprint
      });
      res.status(201).json({ key });
    } catch (err) {
      sendAccessKeyError(res, err);
    }
  });

  app.patch('/api/admin/keys/:name', requireAdminKey, (req, res) => {
    try {
      const key = updateAccessKeyStatus(keysFile, req.params.name, req.body?.active);
      recordAdminActivity(activityFile, {
        action: key.active ? 'restored' : 'suspended',
        teamName: key.name,
        keyFingerprint: key.fingerprint
      });
      res.status(200).json({ key });
    } catch (err) {
      sendAccessKeyError(res, err);
    }
  });

  app.post('/api/admin/keys/:name/rotate', requireAdminKey, (req, res) => {
    try {
      const rotated = rotateAccessKey(keysFile, req.params.name);
      const key = {
        name: rotated.name,
        value: rotated.value,
        active: rotated.active
      };
      recordAdminActivity(activityFile, {
        action: 'rotated',
        teamName: key.name,
        keyFingerprint: rotated.fingerprint
      });
      res.status(200).json({ key });
    } catch (err) {
      sendAccessKeyError(res, err);
    }
  });

  app.delete('/api/admin/keys/:name', requireAdminKey, (req, res) => {
    try {
      const removed = removeAccessKey(keysFile, req.params.name);
      recordAdminActivity(activityFile, {
        action: 'removed',
        teamName: removed.name,
        keyFingerprint: removed.fingerprint
      });
      res.status(200).json({ removed });
    } catch (err) {
      sendAccessKeyError(res, err);
    }
  });

  app.get('/api/admin/activity', requireAdminKey, (req, res) => {
    try {
      res.status(200).json({ activity: listAdminActivity(activityFile, req.query?.limit) });
    } catch (err) {
      res.status(500).json({ error: 'Unable to read admin activity.' });
    }
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
  sendAccessKeyError,
  setNoCacheHeaders
};
