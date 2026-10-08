const pool = require('../config/db');
const { slugify } = require('../utils/http');

// Create a human-readable slug while keeping the database responsible for uniqueness.
async function create({ title, description, venue, startsAt, capacity, createdBy }) {
  const base = slugify(title) || 'workshop';
  const slug = `${base}-${Date.now().toString(36)}`;

  const { rows } = await pool.query(`
    INSERT INTO workshops (title,slug,description,venue,starts_at,capacity,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *`, [title, slug, description, venue, startsAt, capacity, createdBy]);

  return rows[0];
}

async function list({ page, limit, search, sort, order }) {
  // Never interpolate a raw client value into ORDER BY. This allow-list prevents SQL injection.
  const allowedSort = {
    created_at: 'w.created_at',
    starts_at: 'w.starts_at',
    title: 'w.title',
    capacity: 'w.capacity'
  };
  const sortColumn = allowedSort[sort] || allowedSort.starts_at;
  const direction = order === 'asc' ? 'ASC' : 'DESC';

  const params = [];
  const where = [];

  if (search) {
    params.push(`%${search}%`);
    where.push(`(
      w.title ILIKE $${params.length}
      OR w.description ILIKE $${params.length}
      OR w.venue ILIKE $${params.length}
    )`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await pool.query(
    `SELECT COUNT(*)::int AS total FROM workshops w ${whereSql}`,
    params
  );
  const total = count.rows[0].total;
  const offset = (page - 1) * limit;

  params.push(limit, offset);

  const { rows } = await pool.query(`
    SELECT w.*,
           u.name AS creator_name,
           GREATEST(w.capacity - w.seats_held, 0) AS seats_available
    FROM workshops w
    JOIN users u ON u.id=w.created_by
    ${whereSql}
    ORDER BY ${sortColumn} ${direction}, w.id
    LIMIT $${params.length - 1} OFFSET $${params.length}`, params);

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

async function getById(id) {
  const { rows } = await pool.query(`
    SELECT w.*,
           u.name AS creator_name,
           GREATEST(w.capacity - w.seats_held, 0) AS seats_available
    FROM workshops w
    JOIN users u ON u.id=w.created_by
    WHERE w.id=$1`, [id]);

  if (!rows[0]) {
    const e = new Error('Workshop not found');
    e.status = 404;
    throw e;
  }

  return rows[0];
}

async function update(id, input, actor) {
  const existing = await getById(id);

  // ADMIN can modify any workshop; ORGANIZER can modify only their own.
  if (actor.role !== 'ADMIN' && existing.created_by !== actor.sub) {
    const e = new Error('You can only modify workshops you created');
    e.status = 403;
    throw e;
  }

  // Reducing capacity below already-confirmed seats would violate the business rule.
  if (input.capacity !== undefined && input.capacity < existing.seats_held) {
    const e = new Error(`Capacity cannot be below ${existing.seats_held} confirmed seats`);
    e.status = 400;
    throw e;
  }

  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const dbKey = key === 'startsAt' ? 'starts_at' : key;
    fields.push(`${dbKey}=$${values.length + 1}`);
    values.push(value);
  }

  if (!fields.length) return existing;

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE workshops
     SET ${fields.join(', ')}, updated_at=NOW()
     WHERE id=$${values.length}
     RETURNING *`,
    values
  );

  return rows[0];
}

async function remove(id, actor) {
  const existing = await getById(id);

  if (actor.role !== 'ADMIN' && existing.created_by !== actor.sub) {
    const e = new Error('You can only delete workshops you created');
    e.status = 403;
    throw e;
  }

  await pool.query('DELETE FROM workshops WHERE id=$1', [id]);
}

module.exports = { create, list, getById, update, remove };
