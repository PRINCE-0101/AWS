const pool = require('../config/db');

/**
 * Register one user for one workshop.
 *
 * The important rule in this project is that capacity must never be exceeded
 * when several requests arrive at the same time. The workshop row is therefore
 * locked before reading seats_held. Every request for the same workshop queues
 * behind that lock and re-checks the latest seat count.
 */
async function register({ workshopId, userId, idempotencyKey }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Critical concurrency boundary: serialize registrations for the same workshop.
    const workshopResult = await client.query(`
      SELECT id, title, capacity, seats_held, starts_at
      FROM workshops
      WHERE id=$1
      FOR UPDATE`, [workshopId]);
    const workshop = workshopResult.rows[0];

    if (!workshop) {
      throw httpError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found');
    }

    // Lock the user's existing registration too. This prevents two concurrent
    // requests from changing the same registration at the same time.
    const existingResult = await client.query(`
      SELECT *
      FROM registrations
      WHERE workshop_id=$1 AND user_id=$2
      FOR UPDATE`, [workshopId, userId]);
    const existing = existingResult.rows[0];

    // Repeating the same idempotency key returns the original registration.
    // A different key means the user is genuinely trying to register again.
    if (existing?.status === 'CONFIRMED') {
      if (idempotencyKey && existing.idempotency_key === idempotencyKey) {
        await client.query('COMMIT');
        return getRegistration(existing.id);
      }
      throw httpError(409, 'ALREADY_REGISTERED', 'User is already registered for this workshop');
    }

    // Because the workshop row is locked, this value cannot become stale while
    // another registration transaction is updating the same workshop.
    if (workshop.seats_held >= workshop.capacity) {
      throw httpError(409, 'WORKSHOP_FULL', 'Workshop has reached its capacity');
    }

    let registration;

    if (existing) {
      // Re-activate a previously cancelled registration without creating a duplicate row.
      const result = await client.query(`
        UPDATE registrations
        SET status='CONFIRMED', cancelled_at=NULL, idempotency_key=$1
        WHERE id=$2
        RETURNING *`, [idempotencyKey || null, existing.id]);
      registration = result.rows[0];
    } else {
      const result = await client.query(`
        INSERT INTO registrations (workshop_id,user_id,status,idempotency_key)
        VALUES ($1,$2,'CONFIRMED',$3)
        RETURNING *`, [workshopId, userId, idempotencyKey || null]);
      registration = result.rows[0];
    }

    // Keep the denormalized seats_held counter inside the same transaction.
    await client.query(
      'UPDATE workshops SET seats_held=seats_held+1, updated_at=NOW() WHERE id=$1',
      [workshopId]
    );

    await client.query('COMMIT');
    return getRegistration(registration.id);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cancellation uses the same locking strategy as registration so the seat counter
 * cannot become inconsistent during a register/cancel race.
 */
async function cancel({ workshopId, userId }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const workshopResult = await client.query(
      'SELECT id FROM workshops WHERE id=$1 FOR UPDATE',
      [workshopId]
    );
    if (!workshopResult.rows[0]) {
      throw httpError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found');
    }

    const result = await client.query(
      'SELECT * FROM registrations WHERE workshop_id=$1 AND user_id=$2 FOR UPDATE',
      [workshopId, userId]
    );
    const registration = result.rows[0];

    if (!registration || registration.status === 'CANCELLED') {
      throw httpError(404, 'REGISTRATION_NOT_FOUND', 'Active registration not found');
    }

    await client.query(
      "UPDATE registrations SET status='CANCELLED', cancelled_at=NOW() WHERE id=$1",
      [registration.id]
    );
    await client.query(
      'UPDATE workshops SET seats_held=GREATEST(seats_held-1,0), updated_at=NOW() WHERE id=$1',
      [workshopId]
    );

    await client.query('COMMIT');
    return { id: registration.id, status: 'CANCELLED' };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

// Paginate only confirmed registrations; cancelled records remain in the DB for history.
async function listForWorkshop(workshopId, { page, limit }) {
  const offset = (page - 1) * limit;
  const count = await pool.query(
    "SELECT COUNT(*)::int AS total FROM registrations WHERE workshop_id=$1 AND status='CONFIRMED'",
    [workshopId]
  );
  const total = count.rows[0].total;

  const { rows } = await pool.query(`
    SELECT r.id, r.status, r.created_at,
           u.id AS user_id, u.name, u.email
    FROM registrations r
    JOIN users u ON u.id=r.user_id
    WHERE r.workshop_id=$1 AND r.status='CONFIRMED'
    ORDER BY r.created_at ASC
    LIMIT $2 OFFSET $3`, [workshopId, limit, offset]);

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

async function getRegistration(id) {
  const { rows } = await pool.query(`
    SELECT r.*,
           w.title AS workshop_title,
           u.name AS user_name,
           u.email AS user_email
    FROM registrations r
    JOIN workshops w ON w.id=r.workshop_id
    JOIN users u ON u.id=r.user_id
    WHERE r.id=$1`, [id]);
  return rows[0];
}

// Small helper for business-rule errors. The global error middleware formats these consistently.
function httpError(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

module.exports = { register, cancel, listForWorkshop, getRegistration };
