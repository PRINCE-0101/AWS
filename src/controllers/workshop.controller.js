const { z } = require('zod');
const service = require('../services/workshop.service');

// Zod keeps malformed input out of the service layer and gives the API
// consistent 400 responses through the global error handler.
const createSchema = z.object({
  title: z.string().min(3).max(180),
  description: z.string().max(5000).default(''),
  venue: z.string().min(2).max(180),
  startsAt: z.string().datetime(),
  capacity: z.number().int().positive().max(100000)
});

const updateSchema = createSchema.partial();

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().max(100).optional(),
  sort: z.enum(['created_at', 'starts_at', 'title', 'capacity']).default('starts_at'),
  order: z.enum(['asc', 'desc']).default('asc')
});

async function create(req, res) {
  const input = createSchema.parse(req.body);
  res.status(201).json({
    data: await service.create({ ...input, createdBy: req.user.sub })
  });
}

async function list(req, res) {
  res.json(await service.list(listSchema.parse(req.query)));
}

async function get(req, res) {
  res.json({ data: await service.getById(req.params.id) });
}

async function update(req, res) {
  res.json({
    data: await service.update(req.params.id, updateSchema.parse(req.body), req.user)
  });
}

async function remove(req, res) {
  await service.remove(req.params.id, req.user);
  res.status(204).send();
}

module.exports = { create, list, get, update, remove };
