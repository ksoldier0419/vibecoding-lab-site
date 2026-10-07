const {createInstructorRepository}=require('./instructor-db');
function createStudentNoteRepository(sql) {
 const notes=createInstructorRepository(sql,'student_lesson_notes');
 return {
  getStudentNote:notes.getInstructorNote,saveStudentNote:notes.saveInstructorNote,
  async studentNoteList(courseId,folder,lesson,sections,after='0') {
   await notes.setupInstructorNotes();
   const rows=await sql.query(`SELECT r.id::text AS id,r.student_number AS "studentNumber",r.student_name AS name,
    array_agg(DISTINCT e.section ORDER BY e.section) AS sections,n.updated_at AS "updatedAt"
    FROM student_lesson_notes n JOIN login_dev_roster r ON r.google_id=n.google_id
    JOIN login_dev_enrollments e ON e.roster_id=r.id AND e.course_id=$1
    WHERE n.course=$2 AND n.lesson=$3 AND n.text<>'' AND ($4::jsonb IS NULL OR $4::jsonb ? e.section)
     AND r.id>$5::bigint GROUP BY r.id,r.student_number,r.student_name,n.updated_at ORDER BY r.id LIMIT 101`,
    [courseId,folder,lesson,sections===null?null:JSON.stringify(sections),after]);
   return {rows:rows.slice(0,100),next:rows.length>100?rows[99].id:null};
  },
  async studentNoteDetail(courseId,folder,lesson,sections,studentId) {
   await notes.setupInstructorNotes();
   const rows=await sql.query(`SELECT n.text,n.version,n.updated_at AS "updatedAt"
    FROM student_lesson_notes n JOIN login_dev_roster r ON r.google_id=n.google_id
    WHERE r.id=$5::bigint AND n.course=$2 AND n.lesson=$3 AND EXISTS(
     SELECT 1 FROM login_dev_enrollments e WHERE e.roster_id=r.id AND e.course_id=$1
     AND ($4::jsonb IS NULL OR $4::jsonb ? e.section))`,[courseId,folder,lesson,sections===null?null:JSON.stringify(sections),studentId]);
   return rows[0] || null;
  }
 };
}
module.exports={createStudentNoteRepository};
