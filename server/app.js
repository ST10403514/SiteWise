'use strict';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');

const config = require('./config');
const { getClient } = require('./repositories/db');
const UserRepository = require('./repositories/UserRepository');
const JobRepository = require('./repositories/JobRepository');
const AuthService = require('./services/AuthService');
const TokenService = require('./services/TokenService');
const StorageService = require('./services/StorageService');
const EmailService = require('./services/EmailService');
const AuthController = require('./controllers/AuthController');
const ProfileController = require('./controllers/ProfileController');
const JobController = require('./controllers/JobController');
const UploadController = require('./controllers/UploadController');
const requireAuth = require('./middleware/requireAuth');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const jobRoutes = require('./routes/jobRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

function createApp() {
  const userRepository = new UserRepository(config.db);
  const jobRepository = new JobRepository(config.db);
  const tokenService = new TokenService(config.jwtSecret, config.tokenTtl);
  const storageService = new StorageService(config.r2);
  const emailService = new EmailService({
    apiKey: config.resend.apiKey,
    from: config.resend.from,
    appName: 'SiteWise',
  });
  const authService = new AuthService(userRepository, {
    emailService,
    appBaseUrl: config.appBaseUrl,
  });

  const authGuard = requireAuth({
    tokenService,
    userRepository,
    cookieName: config.cookieName,
  });

  const authController = new AuthController({ authService, tokenService, config });
  const profileController = new ProfileController({ userRepository, jobRepository, storageService, config });
  const jobController = new JobController({ jobRepository, storageService });
  const uploadController = new UploadController({ storageService });

  const app = express();
  app.disable('x-powered-by');
  // Render sits in front of the app behind a single reverse-proxy hop, so
  // without this Express (and express-rate-limit, which keys on req.ip)
  // sees the proxy's address on every request instead of the real client's -
  // collapsing every visitor into one shared rate-limit bucket.
  app.set('trust proxy', 1);

  // CSP allows the specific third parties the app actually loads (Google
  // Fonts, the jsPDF CDN script, R2 for photos) and 'unsafe-inline' for
  // script/style because every page here is static HTML with inline
  // <script>/<style> blocks rather than server-rendered templates - a
  // nonce-based CSP would need that to change first. Clickjacking and
  // MIME-sniffing protections (frame-ancestors, nosniff) are fully in
  // effect regardless.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        // Photos load from two R2 URL forms: the canonical public-looking
        // one (kept as the stored reference format) and the raw signed
        // S3-endpoint one getSignedUrl() actually returns for display -
        // both need to be allowed or the browser silently blocks the <img>.
        imgSrc: ["'self'", 'data:',
          ...(config.r2.publicUrl ? [config.r2.publicUrl] : []),
          ...(config.r2.accountId ? [`https://${config.r2.bucket}.${config.r2.accountId}.r2.cloudflarestorage.com`] : [])],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  }));

  // Text responses (HTML/CSS/JS/JSON) compress 70-80% smaller over the wire -
  // meaningful for users on weak on-site mobile signal. Skips already-compressed
  // content (images) automatically.
  app.use(compression());

  app.use(express.json({ limit: '25mb' }));
  app.use(cookieParser());

  // Unauthenticated, unrate-limited - for Render's own health checks and an
  // external uptime monitor. Actually touches the DB, unlike hitting `/`
  // (a static file), so a Turso outage shows up here instead of going
  // unnoticed until a real user hits it.
  app.get('/healthz', async (_req, res) => {
    const start = Date.now();
    let db = { ok: false };
    try {
      await getClient(config.db).execute('SELECT 1');
      db = { ok: true, latencyMs: Date.now() - start };
    } catch {
      db = { ok: false, latencyMs: Date.now() - start };
    }
    res.status(db.ok ? 200 : 503).json({
      ok: db.ok,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      checks: { db },
    });
  });

  app.use('/api/auth', authRoutes({ authController, authGuard }));
  app.use('/api/profile', profileRoutes({ profileController, authGuard }));
  app.use('/api/jobs', jobRoutes({ jobController, authGuard }));
  app.use('/api/uploads', uploadRoutes({ uploadController, authGuard }));

  // The raw R2 endpoint domain is dynamic (built from env vars), so it can't be
  // hardcoded into a static <link rel="preconnect"> the way the Google Fonts one
  // is - only the two pages that actually display real R2 photos get the hint.
  const r2Origin = config.r2.accountId
    ? `https://${config.r2.bucket}.${config.r2.accountId}.r2.cloudflarestorage.com`
    : null;
  const PHOTO_PAGES = new Set(['app.html', 'project-detail.html']);

  // JS/CSS are cached for a short while so navigating between pages doesn't
  // re-validate ~10 files with the server every time. HTML pages are left
  // out so markup/route changes still show up immediately on next load.
  app.use(express.static(config.publicDir, {
    extensions: ['html'],
    setHeaders(res, filePath) {
      if (/\.(?:css|js)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=600');
      }
      if (r2Origin && PHOTO_PAGES.has(path.basename(filePath))) {
        res.setHeader('Link', `<${r2Origin}>; rel=preconnect`);
      }
    },
  }));

  app.use(errorHandler);
  return app;
}

module.exports = createApp;