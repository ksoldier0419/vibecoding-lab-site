function createScopeRepository(sql,prepareRoles) {
 let ready;
 async function setup() {
  await prepareRoles();
  if(!ready)ready=sql.query(`CREATE TABLE IF NOT EXISTS teaching_assistant_scopes (
   google_id TEXT NOT NULL REFERENCES teaching_assistants(google_id) ON DELETE CASCADE,
   course_id VARCHAR(80) NOT NULL REFERENCES login_dev_courses(id), section TEXT NOT NULL,
   PRIMARY KEY(google_id,course_id,section))`).catch(error=>{ready=undefined;throw error;});
  await ready;
 }
 return {
  async assistantScopes(id) {
   await setup();return sql.query('SELECT course_id AS "courseId",section FROM teaching_assistant_scopes WHERE google_id=$1',[id]);
  },
  async scopeEditor(studentId) {
   await setup();
   const target=await sql.query(`SELECT r.id::text AS id,r.student_name AS name,r.student_number AS "studentNumber"
    FROM login_dev_roster r JOIN teaching_assistants a ON a.google_id=r.google_id WHERE r.id=$1::bigint`,[studentId]);
   if(!target.length)return null;
   const [scopes,courses]=await Promise.all([
    sql.query(`SELECT s.course_id AS "courseId",c.title,s.section FROM teaching_assistant_scopes s
     JOIN login_dev_roster r ON r.google_id=s.google_id JOIN login_dev_courses c ON c.id=s.course_id WHERE r.id=$1::bigint ORDER BY c.title,s.section`,[studentId]),
    sql.query(`SELECT c.id,c.title,COALESCE(jsonb_agg(DISTINCT e.section) FILTER(WHERE e.section IS NOT NULL),'[]'::jsonb) AS sections
     FROM login_dev_courses c LEFT JOIN login_dev_enrollments e ON e.course_id=c.id GROUP BY c.id,c.title ORDER BY c.title`)]);
   return {student:target[0],scopes,courses};
  },
  async setAssistantScope(studentId,courseId,section,enabled) {
   await setup();
   const rows=await sql.query(`WITH eligible AS (
    SELECT a.google_id FROM teaching_assistants a JOIN login_dev_roster r ON r.google_id=a.google_id
    JOIN login_dev_courses c ON c.id=$2 WHERE r.id=$1::bigint AND
     (NOT $4::boolean OR $3='*' OR EXISTS(SELECT 1 FROM login_dev_enrollments e WHERE e.course_id=$2 AND e.section=$3))),
    removed AS (DELETE FROM teaching_assistant_scopes WHERE google_id IN(SELECT google_id FROM eligible)
     AND course_id=$2 AND section=$3 AND NOT $4::boolean RETURNING google_id),
    added AS (INSERT INTO teaching_assistant_scopes(google_id,course_id,section) SELECT google_id,$2,$3 FROM eligible
     WHERE $4::boolean ON CONFLICT DO NOTHING RETURNING google_id) SELECT google_id FROM eligible`,[studentId,courseId,section,enabled]);
   return rows.length>0;
  }
 };
}
module.exports={createScopeRepository};
