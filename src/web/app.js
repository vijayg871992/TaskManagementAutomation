'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const ConnectSessionKnexStore = require('connect-session-knex').ConnectSessionKnexStore;

const config = require('../config');
const { getKnex } = require('../db/knex');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Caddy

  app.use(express.json());

  // Allow the PWA to be embedded as a Microsoft Teams tab (and in our own frames).
  app.use((req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com " +
        'https://*.skype.com https://teams.cloud.microsoft https://*.teams.cloud.microsoft'
    );
    next();
  });

  const store = new ConnectSessionKnexStore({
    knex: getKnex(),
    tableName: 'sessions',
    createTable: true,
  });

  app.use(
    session({
      store,
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.appBaseUrl.startsWith('https'),
        maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
      },
    })
  );

  app.use('/api/auth', authRoutes);
  app.use('/api', apiRoutes);

  // PWA static files (served at root)
  app.use(express.static(path.join(__dirname, '..', '..', 'public')));

  // SPA fallback to index.html for client-side routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
  });

  return app;
}

module.exports = { createApp };
