// Wrap async Express handlers so rejected promises reach the central error middleware.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Used only for URL-safe display slugs; the database still enforces uniqueness.
function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 190);
}

module.exports = { asyncHandler, slugify };
