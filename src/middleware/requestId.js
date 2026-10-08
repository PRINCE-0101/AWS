const crypto = require('crypto');

// A request ID makes logs and reviewer debugging easier: every response can be traced
// back to the same request, even when the client sends its own ID.
module.exports = function requestId(req, res, next) {
  const id = req.get('x-request-id') || crypto.randomUUID();
  req.requestId = id;
  res.set('x-request-id', id);
  next();
};
