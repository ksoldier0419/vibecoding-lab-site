const { neon } = require('@neondatabase/serverless');
function createRepository(url) {
  if (!url) throw new Error('DATABASE_URL is required.');
  const parsed = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname.endsWith('.neon.tech')) {
    throw new Error('A Neon PostgreSQL connection is required for this test.');
  }
  const sql = neon(url);
  function profile(row) {
    return row ? { studentNumber: row.student_number, name: row.student_name, major1: row.major1,
      major2: row.major2 || '', phone: row.phone || '' } : null;
  }
  return {
    ...require("./roster-db").createRosterRepository(sql),
    async getProfile(id) {
      const rows = await sql`SELECT student_number, student_name, major1, major2, phone FROM login_dev_student_profiles WHERE google_id = ${id}`;
      return profile(rows[0]);
    },
    async recordLogin(user) {
      const rows = await sql`
        INSERT INTO login_dev_users (google_id, display_name, email)
        VALUES (${user.id}, ${user.name}, ${user.email})
        ON CONFLICT (google_id) DO UPDATE SET
          display_name = EXCLUDED.display_name, email = EXCLUDED.email,
          last_login_at = clock_timestamp(), login_count = login_dev_users.login_count + 1
        RETURNING created_at, last_login_at, login_count`;
      return { createdAt: rows[0].created_at, lastLoginAt: rows[0].last_login_at, loginCount: rows[0].login_count };
    }
  };
}
module.exports = { createRepository };
