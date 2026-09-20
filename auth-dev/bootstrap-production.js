// One-time local migration. Student data stays in memory and is never logged.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {neon}=require('@neondatabase/serverless');
function endpoints(source,target) {
 const urls=[source,target].map(value=>{
  const u=new URL(value);
  if(!['postgres:','postgresql:'].includes(u.protocol)||!u.hostname.endsWith('.neon.tech'))throw new Error('Neon connection required.');
  return u;
 });
 if(urls[0].hostname.replace('-pooler.','.')===urls[1].hostname.replace('-pooler.','.'))throw new Error('Source and destination must be different endpoints.');
 return urls;
}
function selectData(courses,students,enrollments,excluded=[]) {
 const omit=new Set(excluded);
 const people=students.filter(s=>!omit.has(s.studentNumber)).map(s=>({studentNumber:s.studentNumber,name:s.name}));
 const courseRows=courses.map(c=>({id:c.id,title:c.title}));
 const ids=new Set(courseRows.map(c=>c.id)),numbers=new Set(people.map(s=>s.studentNumber));
 const rows=enrollments.filter(e=>!omit.has(e.studentNumber)).map(e=>({studentNumber:e.studentNumber,course:e.course,section:e.section}));
 if(ids.size!==courseRows.length||numbers.size!==people.length)throw new Error('Duplicate source identity.');
 const unique=new Set();
 for(const e of rows) {
  if(!numbers.has(e.studentNumber)||!ids.has(e.course))throw new Error('Broken source enrollment.');
  const key=JSON.stringify([e.studentNumber,e.course,e.section]);
  if(unique.has(key))throw new Error('Duplicate source enrollment.');
  unique.add(key);
 }
 return {courses:courseRows,students:people,enrollments:rows};
}
const reads=[
 'SELECT id,title FROM login_dev_courses ORDER BY id',
 'SELECT student_number AS "studentNumber",student_name AS name FROM login_dev_roster ORDER BY student_number',
 'SELECT r.student_number AS "studentNumber",e.course_id AS course,e.section FROM login_dev_enrollments e JOIN login_dev_roster r ON r.id=e.roster_id ORDER BY r.student_number,e.course_id,e.section'
];
const accountSchema=[
 'CREATE TABLE login_dev_users (google_id TEXT PRIMARY KEY,display_name TEXT NOT NULL,email TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),last_login_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),login_count INTEGER NOT NULL DEFAULT 1 CHECK (login_count > 0))',
 'CREATE TABLE login_dev_student_profiles (google_id TEXT PRIMARY KEY REFERENCES login_dev_users(google_id) ON DELETE CASCADE,student_number VARCHAR(20) NOT NULL UNIQUE,student_name VARCHAR(100) NOT NULL,major1 VARCHAR(100) NOT NULL,major2 VARCHAR(100),phone VARCHAR(30),created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp())'
];
async function migrate({sourceUrl,targetUrl,excluded=[],apply=false}) {
 const urls=endpoints(sourceUrl,targetUrl);
 const source=neon(urls[0].toString()),target=neon(urls[1].toString());
 const tables=await target.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
 if(tables.length)throw new Error('Destination must have no public tables; no writes performed.');
 const snapshot=await source.transaction(reads.map(q=>source.query(q)),{isolationLevel:'RepeatableRead',readOnly:true});
 const data=selectData(...snapshot,excluded);
 const counts={courses:data.courses.length,students:data.students.length,enrollments:data.enrollments.length,excludedStudents:snapshot[1].length-data.students.length};
 if(!apply)return {mode:'dry-run',...counts};
 const rosterSchema=fs.readFileSync(path.join(__dirname,'roster-schema.sql'),'utf8').split(';').filter(q=>q.trim()).map(q=>q.replace('IF NOT EXISTS ',''));
 const schema=[...accountSchema,...rosterSchema,
  'CREATE TABLE login_dev_sessions (id text PRIMARY KEY,data jsonb NOT NULL,expires_at timestamptz NOT NULL)',
  'CREATE INDEX login_dev_sessions_expiry ON login_dev_sessions(expires_at)'
 ];
 const operations=schema.map(q=>target.query(q));
 operations.push(target.query('INSERT INTO login_dev_courses(id,title) SELECT id,title FROM jsonb_to_recordset($1::jsonb) AS x(id text,title text)',[JSON.stringify(data.courses)]));
 operations.push(target.query('INSERT INTO login_dev_roster(student_number,student_name) SELECT "studentNumber",name FROM jsonb_to_recordset($1::jsonb) AS x("studentNumber" text,name text)',[JSON.stringify(data.students)]));
 operations.push(target.query('INSERT INTO login_dev_enrollments(roster_id,course_id,section) SELECT r.id,x.course,x.section FROM jsonb_to_recordset($1::jsonb) AS x("studentNumber" text,course text,section text) JOIN login_dev_roster r ON r.student_number=x."studentNumber"',[JSON.stringify(data.enrollments)]));
 // A mismatch raises inside the transaction, rolling back schema and rows together.
 operations.push(target.query('DO $$ BEGIN IF (SELECT count(*) FROM login_dev_courses) <> '+counts.courses+' OR (SELECT count(*) FROM login_dev_roster) <> '+counts.students+' OR (SELECT count(*) FROM login_dev_enrollments) <> '+counts.enrollments+" THEN RAISE EXCEPTION 'Migration count mismatch'; END IF; END $$"));
 await target.transaction(operations);
 const copied=await target.transaction(reads.map(q=>target.query(q)),{isolationLevel:'RepeatableRead',readOnly:true});
 assert.deepEqual(copied,[data.courses,data.students,data.enrollments]);
 const privateCounts=await target.query('SELECT (SELECT count(*)::int FROM login_dev_users) AS users,(SELECT count(*)::int FROM login_dev_student_profiles) AS profiles,(SELECT count(*)::int FROM login_dev_sessions) AS sessions,(SELECT count(*)::int FROM login_dev_roster WHERE google_id IS NOT NULL) AS linked');
 assert.deepEqual(privateCounts[0],{users:0,profiles:0,sessions:0,linked:0});
 return {mode:'applied-and-verified',...counts,...privateCounts[0]};
}
module.exports={endpoints,selectData,migrate};
if(require.main===module) {
 const args=process.argv.slice(2),excluded=[];let apply=false;
 for(let i=0;i<args.length;i++) {
  if(args[i]==='--apply')apply=true;
  else if(args[i]==='--exclude-student' && args[i+1])excluded.push(args[++i]);
  else {console.error('Unknown migration argument.');process.exit(1);}
 }
 if(process.env.VERCEL){console.error('Run this migration locally only.');process.exit(1);}
 migrate({sourceUrl:process.env.DATABASE_URL,targetUrl:process.env.PRODUCTION_DATABASE_URL,excluded,apply})
 .then(result=>console.log(JSON.stringify(result)))
 .catch(()=>{console.error('Migration failed. Check distinct endpoints and an empty target. Connection and student details omitted.');process.exitCode=1;});
}
