const { z } = require('zod');
const service = require('../services/registration.service');

// Registration endpoints are intentionally thin: validation happens here,
// while transaction and concurrency logic belongs in the service layer.
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

async function register(req, res) {
  const key = req.get('idempotency-key');
  if (key && (key.length < 8 || key.length > 100)) {
    return res.status(400).json({
      error: 'INVALID_IDEMPOTENCY_KEY',
      message: 'Idempotency-Key must be 8-100 characters'
    });
  }

  const data = await service.register({
    workshopId: req.params.id,
    userId: req.user.sub,
    idempotencyKey: key
  });
  res.status(201).json({ data });
}

async function cancel(req, res) {
  res.json({
    data: await service.cancel({ workshopId: req.params.id, userId: req.user.sub })
  });
}

async function list(req, res) {
  res.json(await service.listForWorkshop(req.params.id, listSchema.parse(req.query)));
}

module.exports = { register, cancel, list };
