// Keep error formatting in one place so every endpoint returns a predictable shape.
function notFound(_req, res) {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found' });
}

function errorHandler(err, _req, res, _next) {
  console.error(err);

  // Our services attach status/code for expected business errors.
  if (err.status) {
    return res.status(err.status).json({
      error: err.code || 'REQUEST_FAILED',
      message: err.message
    });
  }

  // Validation failures from Zod are client errors, not server failures.
  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: err.issues });
  }

  // PostgreSQL unique/check/foreign-key conflicts can surface as SQLSTATE codes.
  if (err.code === '23505') {
    return res.status(409).json({
      error: 'CONFLICT',
      message: 'A record with that unique value already exists'
    });
  }

  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'Unexpected server error'
  });
}

module.exports = { notFound, errorHandler };
