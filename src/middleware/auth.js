const { verifyAccessToken } = require('../utils/tokens');

// Reads the short-lived access token from the Authorization header.
function authenticate(req, res, next) {
  const header = req.get('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'AUTH_REQUIRED',
      message: 'Bearer access token required'
    });
  }

  try {
    req.user = verifyAccessToken(header.slice(7));
    next();
  } catch {
    return res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Access token is invalid or expired'
    });
  }
}

// Used on public endpoints where an invalid optional token should not block access.
function optionalAuthenticate(req, _res, next) {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = verifyAccessToken(header.slice(7));
    } catch {
      // Deliberately ignore invalid optional credentials for public routes.
    }
  }
  next();
}

// Authorization is a separate step from authentication:
// first we establish who the user is, then we check what that role may do.
function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'AUTH_REQUIRED',
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Allowed roles: ${roles.join(', ')}`
      });
    }

    next();
  };
}

module.exports = { authenticate, optionalAuthenticate, requireRoles };
