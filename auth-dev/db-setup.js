const { neon } = require('@neondatabase/serverless');
async function main() {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new Error('Local test database setup only.');
  const { createRepository } = require('./db');
  createRepository(process.env.DATABASE_URL);
  const sql = neon(process.env.DATABASE_URL);
  await sql`CREATE TABLE IF NOT EXISTS login_dev_users (
    google_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    login_count INTEGER NOT NULL DEFAULT 1 CHECK (login_count > 0)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS login_dev_student_profiles (
    google_id TEXT PRIMARY KEY REFERENCES login_dev_users(google_id) ON DELETE CASCADE,
    student_number VARCHAR(20) NOT NULL UNIQUE,
    student_name VARCHAR(100) NOT NULL,
    major1 VARCHAR(100) NOT NULL,
    major2 VARCHAR(100),
    phone VARCHAR(30),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
  )`;
  await createRepository(process.env.DATABASE_URL).setupRoster();
  console.log('PASS: login and student profile tables are ready.');
}
main().catch(() => { console.error('Database setup failed; connection details omitted.'); process.exitCode = 1; });
