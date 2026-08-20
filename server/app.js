'use strict';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');

const config = require('./config');
const { getClient } = require('./repositories/db');
const UserRepository = require('./repositories/UserRepository');
const BusinessRepository = require('./repositories/BusinessRepository');
const InviteRepository = require('./repositories/InviteRepository');
const JobRepository = require('./repositories/JobRepository');
const AuthService = require('./services/AuthService');
const TeamService = require('./services/TeamService');
const TokenService = require('./services/TokenService');
const StorageService = require('./services/StorageService');
const EmailService = require('./services/EmailService');
const AuthController = require('./controllers/AuthController');
const ProfileController = require('./controllers/ProfileController');
const JobController = require('./controllers/JobController');
const TeamController = require('./controllers/TeamController');
const UploadController = require('./controllers/UploadController');
const requireAuth = require('./middleware/requireAuth');
const requireOwner = require('./middleware/requireOwner');
const errorHandler = require('./middleware/errorHandler');
const { inviteLimiter } = require('./middleware/rateLimiters');
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const jobRoutes = require('./routes/jobRoutes');
const teamRoutes = require('./routes/teamRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

function createApp() {
  const userRepository = new UserRepository(config.db);
  const businessRepository = new BusinessRepository(config.db);
  const inviteRepository = new InviteRepository(config.db);
  const jobRepository = new JobRepository(config.db);
  const tokenService = new TokenService(config.jwtSecret, config.tokenTtl);
  const storageService = new StorageService(config.r2);
  const emailService = new EmailService({
    apiKey: config.resend.apiKey,
    from: config.resend.from,
    appName: 'SiteWise',
  });
  const authService = new AuthService(userRepository, businessRepository, {
    emailService,
    appBaseUrl: config.appBaseUrl,
  });
  const teamService = new TeamService(userRepository, businessRepository, inviteRepository, {
    emailService,
    appBaseUrl: config.appBaseUrl,
  });

  const authGuard = requireAuth({
    tokenService,
    userRepository,
    cookieName: config.cookieName,
  });

  const authController = new AuthController({ authService, teamService, tokenService, config });
  const profileController = new ProfileController({
    userRepository, businessRepository, jobRepository, storageService, config,
  });
  const jobController = new JobController({ jobRepository, businessRepository, storageService });
  const teamController = new TeamController({ teamService });
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
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://browser.sentry-cdn.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        // Photos load from two R2 URL forms: the canonical public-looking
        // one (kept as the stored reference format) and the raw signed
        // S3-endpoint one getSignedUrl() actually returns for display -
        // both need to be allowed or the browser silently blocks the <img>.
        imgSrc: ["'self'", 'data:',
          ...(config.r2.publicUrl ? [config.r2.publicUrl] : []),
          ...(config.r2.accountId ? [`https://${config.r2.bucket}.${config.r2.accountId}.r2.cloudflarestorage.com`] : [])],
        // Sentry's browser SDK posts error events to this org's ingest host.
        connectSrc: ["'self'", 'https://o4511936136544256.ingest.de.sentry.io'],
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
  // external uptime monitor. Only `db` is critical (it actually gates the
  // status code/overall pass-fail) - storage/email are informational, since
  // the app degrades gracefully without them rather than going down. Each
  // check and the handler itself are isolated so one unexpected failure
  // can't take out the whole response.
  app.get('/healthz', async (_req, res) => {
    const startedAt = Date.now();
    try {
      const dbStart = Date.now();
      let db;
      try {
        await getClient(config.db).execute('SELECT 1');
        db = { status: 'pass', latencyMs: Date.now() - dbStart };
      } catch (err) {
        db = { status: 'fail', latencyMs: Date.now() - dbStart, message: err.message || 'Database unreachable' };
      }

      const storage = config.r2Configured
        ? { status: 'pass', message: 'R2 configured' }
        : { status: 'warn', message: 'R2 not configured - photo upload/display will fail' };

      const email = config.emailConfigured
        ? { status: 'pass', message: 'Resend configured' }
        : { status: 'warn', message: 'Resend not configured - password reset emails will not send' };

      const mem = process.memoryUsage();
      const memory = {
        status: 'pass',
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      };

      const ok = db.status === 'pass';
      res.status(ok ? 200 : 503).json({
        status: ok ? 'pass' : 'fail',
        ok,
        // Render injects this automatically on deploys from a connected
        // git repo - lets you confirm a deploy actually landed by hitting
        // this endpoint. Null (not a crash) anywhere else, e.g. local dev.
        version: process.env.RENDER_GIT_COMMIT || null,
        environment: config.isProduction ? 'production' : 'development',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        responseTimeMs: Date.now() - startedAt,
        checks: { db, storage, email, memory },
      });
    } catch (err) {
      // Should be unreachable given the checks above are already
      // individually guarded, but a health endpoint must never itself
      // throw an unhandled error - that would look like the whole app is down.
      res.status(500).json({ status: 'fail', ok: false, message: err.message || 'Health check failed' });
    }
  });

  app.use('/api/auth', authRoutes({ authController, authGuard }));
  app.use('/api/profile', profileRoutes({ profileController, authGuard }));
  app.use('/api/jobs', jobRoutes({ jobController, authGuard }));
  app.use('/api/team', teamRoutes({ teamController, authGuard, requireOwner, inviteLimiter }));
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