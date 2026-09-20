const fs = require('node:fs');
const path = require('node:path');
function createRosterRepository(sql) {
 async function locked(query, params) {
  const result = await sql.transaction([sql.query('SELECT pg_advisory_xact_lock(20260920, 1)'),sql.query(query, params)]);
  return result[1];
 }
 async function summary(course, rows) {
  const result = await sql.query(`
   WITH incoming AS (SELECT COALESCE(course,$1::text) AS course,"studentNumber",name,section FROM jsonb_to_recordset($2::jsonb) AS x(course text,"studentNumber" text, name text, section text))
   SELECT NOT EXISTS(SELECT 1 FROM incoming i WHERE NOT EXISTS(SELECT 1 FROM login_dev_courses c WHERE c.id=i.course)) AS exists,
    COALESCE(jsonb_agg(i."studentNumber") FILTER (WHERE r.id IS NOT NULL AND r.student_name <> i.name),'[]') AS conflicts,
    count(*) FILTER (WHERE e.roster_id IS NULL)::int AS added,
    count(*) FILTER (WHERE e.roster_id IS NOT NULL)::int AS existing
   FROM incoming i LEFT JOIN login_dev_roster r ON r.student_number=i."studentNumber"
   LEFT JOIN login_dev_enrollments e ON e.roster_id=r.id AND e.course_id=i.course AND e.section=i.section
  `,[course,JSON.stringify(rows)]);
  if (!result[0].exists) throw Object.assign(new Error('CSV에 등록되지 않은 과목코드가 있습니다. 관리자 화면의 과목코드를 확인해 주세요.'),{code:'COURSE_MISSING'});
  return result[0];
 }
 return {
  async students() {
   return sql.query(`SELECT r.id::text AS id,r.student_number AS "studentNumber",r.student_name AS name,
    (r.google_id IS NOT NULL) AS registered,p.created_at AS "registeredAt",
    COALESCE((SELECT jsonb_agg(jsonb_build_object('title',c.title,'section',e.section) ORDER BY c.title,e.section)
     FROM login_dev_enrollments e JOIN login_dev_courses c ON c.id=e.course_id WHERE e.roster_id=r.id),'[]'::jsonb) AS courses
    FROM login_dev_roster r LEFT JOIN login_dev_student_profiles p ON p.google_id=r.google_id ORDER BY r.student_name,r.student_number`);
  },
  async saveStudent(id,value) {
   if(!id) {
    const rows=await locked('INSERT INTO login_dev_roster(student_number,student_name) VALUES ($1,$2) RETURNING id::text',[value.studentNumber,value.name]);
    return rows[0];
   }
   const rows=await locked(`WITH changed AS (
    UPDATE login_dev_roster SET student_number=$2,student_name=$3,updated_at=clock_timestamp() WHERE id=$1::bigint RETURNING id,google_id,student_number,student_name),
    profile AS (UPDATE login_dev_student_profiles p SET student_number=c.student_number,student_name=c.student_name,updated_at=clock_timestamp()
     FROM changed c WHERE p.google_id=c.google_id RETURNING p.google_id)
    SELECT id::text FROM changed`,[id,value.studentNumber,value.name]);
   if(!rows.length) throw Object.assign(new Error('학생 정보를 찾을 수 없습니다.'),{code:'NOT_FOUND'});
   return rows[0];
  },
  async migrateEnrollmentSections() {
   await sql.query("DO $$ BEGIN IF (SELECT array_length(conkey,1) FROM pg_constraint WHERE conrelid='login_dev_enrollments'::regclass AND contype='p')=2 THEN ALTER TABLE login_dev_enrollments DROP CONSTRAINT login_dev_enrollments_pkey; ALTER TABLE login_dev_enrollments ADD PRIMARY KEY (roster_id,course_id,section); END IF; END $$");
  },
  async setupRoster() {
   const statements = fs.readFileSync(path.join(__dirname,'roster-schema.sql'),'utf8').split(';').filter(x=>x.trim());
   await sql.transaction(statements.map(q=>sql.query(q)));
   await this.migrateEnrollmentSections();
   await sql.query(`INSERT INTO login_dev_courses(id,title) VALUES
    ('2026-2-python_adv','2026-2 파이썬고급프로그래밍'),
    ('2026-2-java_basic','2026-2 창의코딩-모두의자바') ON CONFLICT(id) DO NOTHING`);
  },
  async createCourse(id,title) {
   const rows=await sql.query('INSERT INTO login_dev_courses(id,title) VALUES ($1,$2) RETURNING id,title',[id,title]);
   return rows[0];
  },
  async renameCourse(id,title) {
   const rows=await sql.query('UPDATE login_dev_courses SET title=$2 WHERE id=$1 RETURNING id,title',[id,title]);
   if(!rows.length) throw Object.assign(new Error('과목을 찾을 수 없습니다.'),{code:'NOT_FOUND'});
   return rows[0];
  },
  async deleteCourse(id) {
   try {
    const rows=await locked('DELETE FROM login_dev_courses WHERE id=$1 RETURNING id',[id]);
    if(!rows.length) throw Object.assign(new Error('이미 삭제되었거나 없는 과목입니다.'),{code:'NOT_FOUND'});
    return rows[0];
   } catch(e) {
    if(e.code==='23503') throw Object.assign(new Error('수강생이 등록된 과목은 삭제할 수 없습니다.'),{code:'COURSE_IN_USE'});
    throw e;
   }
  },
  async courses() { return sql.query('SELECT id,title FROM login_dev_courses ORDER BY title'); },
  async roster(course) {
   return sql.query(`SELECT r.id::text AS id, r.student_number AS "studentNumber",r.student_name AS name,
    e.section,(r.google_id IS NOT NULL) AS registered,p.created_at AS "registeredAt"
    FROM login_dev_enrollments e JOIN login_dev_roster r ON r.id=e.roster_id
    LEFT JOIN login_dev_student_profiles p ON p.google_id=r.google_id
    WHERE e.course_id=$1 ORDER BY r.student_number,e.section`,[course]);
  },
  previewRoster: summary,
  async importRoster(course, rows, rejectExisting=false) {
   const result = await locked(`
    WITH incoming AS (SELECT COALESCE(course,$1::text) AS course,"studentNumber",name,section FROM jsonb_to_recordset($2::jsonb) AS x(course text,"studentNumber" text,name text,section text)),
    duplicate AS (SELECT EXISTS(SELECT 1 FROM incoming i JOIN login_dev_roster r ON r.student_number=i."studentNumber"
     JOIN login_dev_enrollments e ON e.roster_id=r.id AND e.course_id=i.course AND e.section=i.section) AS found),
    valid AS (SELECT NOT ($3::boolean AND (SELECT found FROM duplicate)) AND NOT EXISTS(SELECT 1 FROM incoming i WHERE NOT EXISTS(SELECT 1 FROM login_dev_courses c WHERE c.id=i.course))
      AND NOT EXISTS(SELECT 1 FROM incoming i JOIN login_dev_roster r ON r.student_number=i."studentNumber" WHERE r.student_name<>i.name) AS ok),
    people AS (
     INSERT INTO login_dev_roster(student_number,student_name)
     SELECT DISTINCT "studentNumber",name FROM incoming WHERE (SELECT ok FROM valid)
     ON CONFLICT(student_number) DO UPDATE SET student_name=EXCLUDED.student_name
     RETURNING id,student_number),
    enrolled AS (
     INSERT INTO login_dev_enrollments(roster_id,course_id,section)
     SELECT p.id,i.course,i.section FROM people p JOIN incoming i ON i."studentNumber"=p.student_number
     ON CONFLICT(roster_id,course_id,section) DO NOTHING
     RETURNING roster_id)
    SELECT (SELECT ok FROM valid) AS ok, (SELECT found FROM duplicate) AS duplicate, (SELECT count(*)::int FROM enrolled) AS count
   `,[course,JSON.stringify(rows),rejectExisting]);
   if(rejectExisting && result[0].duplicate) throw Object.assign(new Error('이미 해당 과목·분반에 등록된 학번입니다. 수정 버튼을 사용해 주세요.'),{code:'DUPLICATE_ENROLLMENT'});
   if (!result[0].ok) throw Object.assign(new Error('명단이 변경되었거나 이름이 충돌합니다. 미리보기를 다시 확인해 주세요.'),{code:'ROSTER_CONFLICT'});
   return result[0];
  },
  async addRoster(course,value) {
   const report=await summary(course,[value]);
   if(report.conflicts.length) throw Object.assign(new Error('이 학번은 기존 명단에 다른 이름으로 등록되어 있습니다. 기존 학생의 이름을 확인해 주세요. 이름 정정은 기존 명단의 수정 버튼을 사용해 주세요.'),{code:'ROSTER_CONFLICT'});
   return this.importRoster(course,[value],true);
  },
  async deleteEnrollment(id,course,section) {
   const rows=await locked('DELETE FROM login_dev_enrollments WHERE roster_id=$1::bigint AND course_id=$2 AND section=$3 RETURNING roster_id',[id,course,section]);
   if(!rows.length) throw Object.assign(new Error('이미 삭제되었거나 변경된 수강 정보입니다. 새로고침해 주세요.'),{code:'NOT_FOUND'});
   return {ok:true};
  },
  async editRoster(id, course, value, originalSection) {
   const result = await locked(`
    WITH changed AS (
     UPDATE login_dev_roster r SET student_number=$3,student_name=$4,updated_at=clock_timestamp()
     WHERE r.id=$1::bigint AND EXISTS(SELECT 1 FROM login_dev_enrollments WHERE roster_id=r.id AND course_id=$2 AND section=$6)
     RETURNING r.id,r.google_id,r.student_number,r.student_name),
    profile AS (
     UPDATE login_dev_student_profiles p SET student_number=c.student_number,student_name=c.student_name,updated_at=clock_timestamp()
     FROM changed c WHERE p.google_id=c.google_id RETURNING p.google_id),
    enrollment AS (
     UPDATE login_dev_enrollments e SET section=$5 FROM changed c WHERE e.roster_id=c.id AND e.course_id=$2 AND e.section=$6 RETURNING e.roster_id)
    SELECT id::text FROM changed
   `,[id,course,value.studentNumber,value.name,value.section,originalSection]);
   if (!result.length) throw Object.assign(new Error('수강 정보를 찾을 수 없습니다.'),{code:'NOT_FOUND'});
   return {ok:true};
  },
  async registration(id) {
   const rows = await sql.query(`SELECT c.id,c.title,e.section FROM login_dev_roster r
    JOIN login_dev_enrollments e ON e.roster_id=r.id JOIN login_dev_courses c ON c.id=e.course_id
    WHERE r.google_id=$1 ORDER BY c.title`,[id]);
   return { registered: rows.length>0, courses:rows };
  },
  async registerProfile(id,value) {
   const result = await locked(`
    WITH matched AS (
     SELECT r.id FROM login_dev_roster r WHERE r.student_number=$2 AND r.student_name=$3
     AND (r.google_id IS NULL OR r.google_id=$1)
     AND NOT EXISTS(SELECT 1 FROM login_dev_roster other WHERE other.google_id=$1 AND other.id<>r.id)
     AND EXISTS(SELECT 1 FROM login_dev_enrollments WHERE roster_id=r.id)),
    bound AS (
     UPDATE login_dev_roster SET google_id=$1,updated_at=clock_timestamp()
     WHERE id IN (SELECT id FROM matched) RETURNING id),
    saved AS (
     INSERT INTO login_dev_student_profiles(google_id,student_number,student_name,major1,major2,phone)
     SELECT $1,$2,$3,$4,NULLIF($5,''),NULLIF($6,'') WHERE EXISTS(SELECT 1 FROM bound)
     ON CONFLICT(google_id) DO UPDATE SET student_number=EXCLUDED.student_number,student_name=EXCLUDED.student_name,
     major1=EXCLUDED.major1,major2=EXCLUDED.major2,phone=EXCLUDED.phone,updated_at=clock_timestamp()
     RETURNING google_id)
    SELECT google_id FROM saved
   `,[id,value.studentNumber,value.name,value.major1,value.major2,value.phone]);
   if (!result.length) throw Object.assign(new Error('수강 명단과 학번·이름을 확인할 수 없습니다. 담당 교수에게 문의해 주세요.'),{code:'ROSTER_MISMATCH'});
   return value;
  }
 };
}
module.exports={createRosterRepository};
