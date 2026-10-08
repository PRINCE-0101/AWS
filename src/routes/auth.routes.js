const express = require('express');
const controller = require('../controllers/auth.controller');
const { asyncHandler } = require('../utils/http');

const router = express.Router();

// Authentication lifecycle: create account → login → refresh → logout.
router.post('/register', asyncHandler(controller.register));
router.post('/login', asyncHandler(controller.login));
router.post('/refresh', asyncHandler(controller.refresh));
router.post('/logout', asyncHandler(controller.logout));

module.exports = router;
