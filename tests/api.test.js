require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { Pool } = require('pg');
const app = require('../src/app');
const appPool = require('../src/config/db');
const { createAccessToken } = require('../src/utils/tokens');

// Database-backed API tests can be slower on a local Windows installation than unit tests.
jest.setTimeout(30000);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let organizer;
let students = [];

async function makeUser(i) {
  const passwordHash = await bcrypt.hash(`TestPass${i}!`, 4);
  const { rows } = await pool.query(`
    INSERT INTO users (name,email,password_hash,role)
    VALUES ($1,$2,$3,'STUDENT') RETURNING id,name,email,role`,
    [`Test Student ${i}`, `test-${Date.now()}-${i}@example.com`, passwordHash]);
  return rows[0];
}

describe('CampusForge API', () => {
  beforeAll(async () => {
    await pool.query(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
    const hash = await bcrypt.hash('OrgPass123!', 4);
    const { rows } = await pool.query(`INSERT INTO users(name,email,password_hash,role) VALUES('Test Organizer',$1,$2,'ORGANIZER') RETURNING *`, [`org-${Date.now()}@example.com`, hash]);
    organizer = rows[0];
    students = await Promise.all(Array.from({ length: 8 }, (_, i) => makeUser(i)));
  });

  afterAll(async () => {
    // Cleanup is best-effort: a test should not be reported as failed only because
    // an old local PostgreSQL session is briefly holding a lock.
    try {
      await pool.query(`SET statement_timeout TO '3000ms'`);

      // Workshops reference their organizer, so delete dependent workshops first.
      // ON DELETE CASCADE then removes their registrations.
      await pool.query(`
        DELETE FROM workshops
        WHERE created_by IN (
          SELECT id FROM users
          WHERE email LIKE $1
        )
      `, ['org-%@example.com']);

      await pool.query(
        'DELETE FROM users WHERE email LIKE $1 OR email LIKE $2',
        ['test-%@example.com', 'org-%@example.com']
      );
    } catch (err) {
      console.warn('Test cleanup warning:', err.message);
    } finally {
      // app.js imports its own shared pool. Closing both pools prevents Jest from
      // hanging after all assertions have completed.
      await pool.end();
      await appPool.end();
    }
  }, 30000);

  test('health endpoint works', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('RBAC blocks a student from creating a workshop', async () => {
    const token = createAccessToken(students[0]);
    const res = await request(app).post('/api/workshops').set('Authorization', `Bearer ${token}`).send({
      title: 'Should Fail', description: 'x', venue: 'Lab', startsAt: new Date(Date.now()+86400000).toISOString(), capacity: 5
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  test('organizer can create a workshop and list it with pagination/filtering', async () => {
    const token = createAccessToken(organizer);
    const res = await request(app).post('/api/workshops').set('Authorization', `Bearer ${token}`).send({
      title: 'Concurrency Systems Lab', description: 'Locks and transactions', venue: 'Cloud Lab', startsAt: new Date(Date.now()+86400000).toISOString(), capacity: 5
    });
    expect(res.status).toBe(201);
    const list = await request(app).get('/api/workshops?page=1&limit=5&search=Concurrency&sort=title&order=asc');
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(1);
    expect(list.body.pagination.page).toBe(1);
  });

  test('duplicate registration is rejected', async () => {
    const token = createAccessToken(organizer);
    const created = await request(app).post('/api/workshops').set('Authorization', `Bearer ${token}`).send({
      title: `Duplicate Guard ${Date.now()}`, description: 'x', venue: 'Room 1', startsAt: new Date(Date.now()+86400000).toISOString(), capacity: 5
    });
    const id = created.body.data.id;
    const studentToken = createAccessToken(students[0]);
    const first = await request(app).post(`/api/workshops/${id}/register`).set('Authorization', `Bearer ${studentToken}`).set('Idempotency-Key', 'duplicate-test-001');
    const second = await request(app).post(`/api/workshops/${id}/register`).set('Authorization', `Bearer ${studentToken}`).set('Idempotency-Key', 'duplicate-test-002');
    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('ALREADY_REGISTERED');
  });

  test('concurrent registrations never exceed workshop capacity', async () => {
    const token = createAccessToken(organizer);
    const created = await request(app).post('/api/workshops').set('Authorization', `Bearer ${token}`).send({
      title: `Concurrency Proof ${Date.now()}`, description: 'capacity race test', venue: 'Room 2', startsAt: new Date(Date.now()+86400000).toISOString(), capacity: 3
    });
    const id = created.body.data.id;
    const responses = await Promise.all(students.slice(0, 8).map((user, i) =>
      request(app).post(`/api/workshops/${id}/register`)
        .set('Authorization', `Bearer ${createAccessToken(user)}`)
        .set('Idempotency-Key', `race-${i}-${Date.now()}`)
    ));
    const successes = responses.filter(r => r.status === 201);
    const full = responses.filter(r => r.status === 409 && r.body.error === 'WORKSHOP_FULL');
    expect(successes).toHaveLength(3);
    expect(full).toHaveLength(5);
    const workshop = await pool.query('SELECT capacity,seats_held FROM workshops WHERE id=$1', [id]);
    expect(workshop.rows[0].seats_held).toBe(3);
    expect(workshop.rows[0].seats_held).toBeLessThanOrEqual(workshop.rows[0].capacity);
  });
});
