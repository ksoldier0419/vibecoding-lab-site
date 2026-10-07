function createAssistantRepository(sql) {
 let ready;
 function setup() {
  if(!ready)ready=sql.query(`CREATE TABLE IF NOT EXISTS teaching_assistants (
   google_id TEXT PRIMARY KEY REFERENCES login_dev_users(google_id) ON DELETE CASCADE,
   granted_by TEXT NOT NULL REFERENCES login_dev_users(google_id),
   granted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp())`).catch(error=>{ready=undefined;throw error;});
  return ready;
 }
 return {
  setupAssistantRoles:setup,
  async isTeachingAssistant(id) {
   await setup();
   const rows=await sql.query('SELECT google_id FROM teaching_assistants WHERE google_id=$1',[id]);
   return rows.length>0;
  },
  async assistantStudents(professorEmail) {
   await setup();
   return sql.query(`SELECT r.id::text AS id,(a.google_id IS NOT NULL) AS assistant
    FROM login_dev_roster r JOIN login_dev_users u ON u.google_id=r.google_id
    JOIN login_dev_student_profiles p ON p.google_id=u.google_id
    LEFT JOIN teaching_assistants a ON a.google_id=u.google_id WHERE lower(u.email)<>$1`,[professorEmail]);
  },
  async setTeachingAssistant(studentId,enabled,grantedBy,professorEmail) {
   await setup();
   // Only registered student identities may receive grants; the professor account is excluded.
   const rows=await sql.query(`WITH eligible AS (
    SELECT u.google_id FROM login_dev_roster r JOIN login_dev_users u ON u.google_id=r.google_id
    JOIN login_dev_student_profiles p ON p.google_id=u.google_id
    WHERE r.id=$1::bigint AND lower(u.email)<>$4),
    removed AS (DELETE FROM teaching_assistants WHERE google_id IN(SELECT google_id FROM eligible) AND NOT $2::boolean RETURNING google_id),
    added AS (INSERT INTO teaching_assistants(google_id,granted_by)
     SELECT google_id,$3 FROM eligible WHERE $2::boolean ON CONFLICT(google_id) DO NOTHING RETURNING google_id)
    SELECT google_id FROM eligible`,[studentId,enabled,grantedBy,professorEmail]);
   return rows.length>0;
  }
 };
}
module.exports={createAssistantRepository};
