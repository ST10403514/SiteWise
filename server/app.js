'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');

const config = require('./config');
const UserRepository = require('./repositories/UserRepository');
const JobRepository = require('./repositories/JobRepository');
const AuthService = require('./services/AuthService');
const TokenService = require('./services/TokenService');
const AuthController = require('./controllers/AuthController');
const ProfileController = require('./controllers/ProfileController');
const JobController = require('./controllers/JobController');
const requireAuth = require('./middleware/requireAuth');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const jobRoutes = require('./routes/jobRoutes');

/**
 * Application factory - wires dependencies together (composition root)
 * and returns a configured Express app.
 */
function createApp() {
  const userRepository = new UserRepository(config.dbFile);
  const jobRepository = new JobRepository(config.dbFile);
  const tokenService = new TokenService(config.jwtSecret, config.tokenTtl);
  const authService = new AuthService(userRepository);

  const authGuard = requireAuth({
    tokenService,
    userRepository,
    cookieName: config.cookieName,
  });

  const authController = new AuthController({ authService, tokenService, config });
  const profileController = new ProfileController({ userRepository });
  const jobController = new JobController({ jobRepository });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '25mb' })); // jobs carry compressed photo data URLs
  app.use(cookieParser());

  app.use('/api/auth', authRoutes({ authController, authGuard }));
  app.use('/api/profile', profileRoutes({ profileController, authGuard }));
  app.use('/api/jobs', jobRoutes({ jobController, authGuard }));

  app.use(express.static(config.publicDir, { extensions: ['html'] }));

  app.use(errorHandler);
  return app;
}

module.exports = createApp;
