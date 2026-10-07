function createQuestionRepository(sql) {
 let ready;
 function setup() {
  if(!ready)ready=sql.query(`CREATE TABLE IF NOT EXISTS lesson_questions (
   id BIGSERIAL PRIMARY KEY,google_id TEXT NOT NULL REFERENCES login_dev_users(google_id) ON DELETE CASCADE,
   course VARCHAR(100) NOT NULL,lesson VARCHAR(150) NOT NULL,question TEXT NOT NULL CHECK(length(question) BETWEEN 1 AND 20000),
   answer TEXT NOT NULL DEFAULT '' CHECK(length(answer)<=20000),version INTEGER NOT NULL DEFAULT 0,
   answered_by TEXT REFERENCES login_dev_users(google_id),created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp())`).catch(e=>{ready=undefined;throw e;});
  return ready;
 }
 const fields=`q.id::text AS id,q.question,q.answer,q.version,q.created_at AS "createdAt",q.updated_at AS "updatedAt",
  r.student_number AS "studentNumber",r.student_name AS name`;
 const access=`q.course=$2 AND q.lesson=$3 AND ($4::text IS NULL OR q.google_id=$4) AND EXISTS(
  SELECT 1 FROM login_dev_enrollments e WHERE e.roster_id=r.id AND e.course_id=$1
   AND ($5::jsonb IS NULL OR $5::jsonb ? e.section))`;
 return {
  async createQuestion(user,folder,lesson,question) {
   await setup();const rows=await sql.query(`INSERT INTO lesson_questions(google_id,course,lesson,question)
    VALUES($1,$2,$3,$4) RETURNING id::text AS id`,[user,folder,lesson,question]);return rows[0];
  },
  async questionList(code,folder,lesson,user,sections,after='0') {
   await setup();const rows=await sql.query(`SELECT ${fields} FROM lesson_questions q
    JOIN login_dev_roster r ON r.google_id=q.google_id WHERE ${access} AND q.id>$6::bigint ORDER BY q.id LIMIT 101`,
    [code,folder,lesson,user,sections===null?null:JSON.stringify(sections),after]);
   return {rows:rows.slice(0,100),next:rows.length>100?rows[99].id:null};
  },
  async answerQuestion(code,folder,lesson,sections,id,actor,answer,version) {
   await setup();const rows=await sql.query(`UPDATE lesson_questions q SET answer=$7,version=q.version+1,
    answered_by=$6,updated_at=clock_timestamp() FROM login_dev_roster r WHERE r.google_id=q.google_id
    AND ${access} AND q.id=$8::bigint AND q.version=$9 RETURNING ${fields}`,
    [code,folder,lesson,null,sections===null?null:JSON.stringify(sections),actor,answer,id,version]);return rows[0]||null;
  }
 };
}
module.exports={createQuestionRepository};
