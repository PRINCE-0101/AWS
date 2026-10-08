const { z } = require('zod');
const auth = require('../services/auth.service');

// Controllers validate HTTP input, call the service layer and shape the response.
// Business rules stay in auth.service.js so they are reusable and easier to test.
const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(72)
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const refreshSchema = z.object({ refreshToken: z.string().min(20) });

async function register(req, res) {
  const input = registerSchema.parse(req.body);
  const user = await auth.register(input);
  res.status(201).json({ user: auth.publicUser(user) });
}

async function login(req, res) {
  const input = loginSchema.parse(req.body);
  res.json(await auth.login(input));
}

async function refresh(req, res) {
  const { refreshToken } = refreshSchema.parse(req.body);
  res.json(await auth.refresh(refreshToken));
}

async function logout(req, res) {
  const { refreshToken } = refreshSchema.parse(req.body);
  await auth.logout(refreshToken);
  res.status(204).send();
}

module.exports = { register, login, refresh, logout };
