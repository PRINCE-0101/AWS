const express = require('express');
const controller = require('../controllers/workshop.controller');
const registration = require('../controllers/registration.controller');
const { authenticate, requireRoles } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

const router = express.Router();

// Reading the workshop catalogue is public.
router.get('/', asyncHandler(controller.list));
router.get('/:id', asyncHandler(controller.get));

// Only ADMIN and ORGANIZER can manage workshop definitions.
router.post('/', authenticate, requireRoles('ADMIN', 'ORGANIZER'), asyncHandler(controller.create));
router.patch('/:id', authenticate, requireRoles('ADMIN', 'ORGANIZER'), asyncHandler(controller.update));
router.delete('/:id', authenticate, requireRoles('ADMIN', 'ORGANIZER'), asyncHandler(controller.remove));

// All authenticated roles may register/cancel their own attendance.
router.post('/:id/register', authenticate, requireRoles('ADMIN', 'ORGANIZER', 'STUDENT'), asyncHandler(registration.register));
router.delete('/:id/register', authenticate, requireRoles('ADMIN', 'ORGANIZER', 'STUDENT'), asyncHandler(registration.cancel));

// Viewing the attendee list is restricted because it exposes user details.
router.get('/:id/registrations', authenticate, requireRoles('ADMIN', 'ORGANIZER'), asyncHandler(registration.list));

module.exports = router;
