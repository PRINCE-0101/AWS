require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const passwordHash = await bcrypt.hash('Builder@123', 12);

  try {
    // Demo accounts make the project immediately usable for an AWS reviewer.
    const admin = await pool.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ('CampusForge Admin', 'admin@campusforge.local', $1, 'ADMIN')
      ON CONFLICT (email) DO UPDATE SET role='ADMIN'
      RETURNING id`, [passwordHash]);

    const organizer = await pool.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ('Workshop Organizer', 'organizer@campusforge.local', $1, 'ORGANIZER')
      ON CONFLICT (email) DO UPDATE SET role='ORGANIZER'
      RETURNING id`, [passwordHash]);

    await pool.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ('Demo Student', 'student@campusforge.local', $1, 'STUDENT')
      ON CONFLICT (email) DO NOTHING`, [passwordHash]);

    // Seed one realistic workshop so the first API request has something to inspect.
    await pool.query(`
      INSERT INTO workshops (title, slug, description, venue, starts_at, capacity, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (slug) DO NOTHING`, [
        'Serverless Sprint Lab',
        'serverless-sprint-lab',
        'Hands-on build session for event-driven AWS applications.',
        'VIT Innovation Lab',
        new Date(Date.now() + 7 * 86400000).toISOString(),
        30,
        organizer.rows[0].id
      ]);

    console.log('Seed complete. Password for demo accounts: Builder@123');
    console.log('Admin: admin@campusforge.local');
    console.log('Organizer: organizer@campusforge.local');
    console.log('Student: student@campusforge.local');
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
