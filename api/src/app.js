const express = require('express');
const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const { notFoundHandler, errorHandler } = require('./errors');

function createApp() {
  const app = express();
  app.use(express.json());

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
