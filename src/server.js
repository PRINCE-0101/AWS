const app = require('./app');
const { port } = require('./config/env');
const pool = require('./config/db');

// app.js only builds the Express application. This file is responsible for opening the port.
const server = app.listen(port, () => {
  console.log(`CampusForge API listening on http://localhost:${port}`);
});

// Close the HTTP server first, then release all PostgreSQL connections.
// This is useful for Docker, Ctrl+C and other graceful shutdown scenarios.
async function shutdown(signal) {
  console.log(`${signal}: shutting down...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
