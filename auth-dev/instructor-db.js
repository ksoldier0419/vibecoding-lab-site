function createInstructorRepository(sql,table='instructor_lesson_notes') {
 if(!['instructor_lesson_notes','student_lesson_notes'].includes(table))throw new Error('Invalid note table.');
 let ready;
 function setupInstructorNotes() {
  if(!ready) ready=sql.query(`CREATE TABLE IF NOT EXISTS ${table} (
    google_id TEXT NOT NULL REFERENCES login_dev_users(google_id) ON DELETE CASCADE,
    course TEXT NOT NULL, lesson TEXT NOT NULL, text TEXT NOT NULL CHECK(length(text)<=20000),
    version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(google_id,course,lesson))`).catch(error=>{ready=undefined;throw error;});
  return ready;
 }
 return {
  setupInstructorNotes,
  async getInstructorNote(id,course,lesson) {
   await setupInstructorNotes();
   const rows=await sql.query(`SELECT text,version,updated_at AS "updatedAt" FROM ${table} WHERE google_id=$1 AND course=$2 AND lesson=$3`,[id,course,lesson]);
   return rows[0] || {text:'',version:0,updatedAt:null};
  },
  async saveInstructorNote(id,course,lesson,value) {
   await setupInstructorNotes();
   const rows=await sql.query(`INSERT INTO ${table}(google_id,course,lesson,text)
    SELECT $1,$2,$3,$4 WHERE $5::integer=0
    ON CONFLICT(google_id,course,lesson) DO NOTHING RETURNING text,version,updated_at AS "updatedAt"`,[id,course,lesson,value.text,value.version]);
   if(rows.length) return rows[0];
   if(value.version===0) return null;
   const updated=await sql.query(`UPDATE ${table} SET text=$4,version=version+1,updated_at=clock_timestamp()
    WHERE google_id=$1 AND course=$2 AND lesson=$3 AND version=$5 RETURNING text,version,updated_at AS "updatedAt"`,[id,course,lesson,value.text,value.version]);
   return updated[0] || null;
  }
 };
}
module.exports={createInstructorRepository};
