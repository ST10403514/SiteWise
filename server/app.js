'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');

const config = require('./config');
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
  const profileController = new ProfileController({ userRepository });
  const jobController = new JobController({ jobRepository });
  const uploadController = new UploadController({ storageService });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '25mb' }));
  app.use(cookieParser());

  app.use('/api/auth', authRoutes({ authController, authGuard }));
  app.use('/api/profile', profileRoutes({ profileController, authGuard }));
  app.use('/api/jobs', jobRoutes({ jobController, authGuard }));
  app.use('/api/uploads', uploadRoutes({ uploadController, authGuard }));

  // JS/CSS are cached for a short while so navigating between pages doesn't
  // re-validate ~10 files with the server every time. HTML pages are left
  // out so markup/route changes still show up immediately on next load.
  app.use(express.static(config.publicDir, {
    extensions: ['html'],
    setHeaders(res, filePath) {
      if (/\.(?:css|js)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=600');
      }
    },
  }));

  app.use(errorHandler);
  return app;
}

module.exports = createApp;