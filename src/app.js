// Application bootstrap: middleware, routes and the final error handlers live here.
// Keeping this separate from server.js makes the Express app easy to test with Supertest.
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const requestId = require('./middleware/requestId');
const authRoutes = require('./routes/auth.routes');
const workshopRoutes = require('./routes/workshop.routes');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

// Basic hardening and request parsing.
app.disable('x-powered-by');
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(requestId);

// Simple liveness endpoint used during local development/deployment checks.
app.get('/health', (_req, res) => res.json({
  status: 'ok',
  service: 'campusforge-api',
  time: new Date().toISOString()
}));

// Public authentication endpoints.
app.use('/api/auth', authRoutes);

// Workshop and registration endpoints. Authorization is enforced inside the routes.
app.use('/api/workshops', workshopRoutes);

// These two handlers intentionally come last so they catch unmatched routes and errors.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
