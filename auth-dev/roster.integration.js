const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {neon}=require('@neondatabase/serverless');
const {createRepository}=require('./db');
async function main() {
 if(process.env.VERCEL||process.env.NODE_ENV==='production') throw new Error('Local test only');
 const repo=createRepository(process.env.DATABASE_URL),sql=neon(process.env.DATABASE_URL);
 const suffix=randomUUID().replaceAll('-','').slice(0,14);
 const course1='test-'+suffix+'-1',course2='test-'+suffix+'-2';
 const id1='roster-test-'+suffix+'-1',id2='roster-test-'+suffix+'-2';
 const num1='T'+suffix+'1',num2='T'+suffix+'2',num3='T'+suffix+'3';
 const row={studentNumber:num1,name:'Synthetic student',section:'01'};
 const value={studentNumber:num1,name:row.name,major1:'Test',major2:'',phone:'010-0000-0000'};
 try {
  const basic=await repo.saveStudent(undefined,row);
  assert.equal((await repo.students()).find(p=>p.id===basic.id).courses.length,0);
  await repo.saveStudent(basic.id,{...row,name:'Renamed synthetic'});
  assert.equal((await repo.students()).find(p=>p.id===basic.id).name,'Renamed synthetic');
  await repo.saveStudent(basic.id,row);
  await assert.rejects(repo.registerProfile(id1,value),e=>e.code==='ROSTER_MISMATCH' && e.message.includes('수강 과목이 없습니다'));
  await assert.rejects(repo.saveStudent(undefined,row),e=>e.code==='23505');
  await repo.createCourse(course1,course1);
  await repo.createCourse(course2,course2);
  await repo.deleteCourse(course2);
  assert.ok(!(await repo.courses()).some(c=>c.id===course2));
  await assert.rejects(repo.deleteCourse(course2),e=>e.code==='NOT_FOUND');
  await repo.createCourse(course2,course2);
  await assert.rejects(repo.createCourse(course1,'Duplicate'),e=>e.code==='23505');
  await assert.rejects(repo.renameCourse('missing-'+suffix,'Missing'),e=>e.code==='NOT_FOUND');
  for(const id of [id1,id2]) await repo.recordLogin({id,name:'Synthetic',email:'test@example.com'});
  await assert.rejects(repo.registerProfile(id1,value),e=>e.code==='ROSTER_MISMATCH');
  assert.equal((await repo.previewRoster(course1,[row])).added,1);
  await assert.rejects(repo.previewRoster(null,[{...row,course:'missing-'+suffix}]),e=>e.code==='COURSE_MISSING');
  await assert.rejects(repo.importRoster(null,[{...row,course:course1},{...row,course:'missing-'+suffix}]),e=>e.code==='ROSTER_CONFLICT');
  assert.equal((await repo.roster(course1)).length,0);
  const multi=[{...row,course:course1},{...row,studentNumber:num2,name:'Other student',course:course1},{...row,section:'02',course:course2}];
  assert.equal((await repo.previewRoster(null,multi)).added,3);
  assert.equal((await repo.importRoster(null,multi)).count,3);
  await assert.rejects(repo.deleteCourse(course1),e=>e.code==='COURSE_IN_USE');
  assert.equal((await repo.roster(course1)).length,2);
  await assert.rejects(repo.addRoster(course1,{...row,name:'Wrong name'}),e=>e.code==='ROSTER_CONFLICT' && e.message.includes('다른 이름'));
  assert.equal((await repo.previewRoster(null,multi)).existing,3);
  assert.equal((await repo.previewRoster(course1,[row])).existing,1);
  await repo.importRoster(course1,[row]);
  assert.equal((await repo.roster(course1)).length,2);
  await assert.rejects(repo.importRoster(course1,[{...row,name:'Wrong'},{...row,studentNumber:num3}]),e=>e.code==='ROSTER_CONFLICT');
  assert.equal((await repo.roster(course1)).length,2);
  await assert.rejects(repo.registerProfile(id1,{...value,name:'Wrong'}),e=>e.code==='ROSTER_MISMATCH');
  const race=await Promise.allSettled([repo.registerProfile(id1,value),repo.registerProfile(id2,value)]);
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
  const winner=race[0].status==='fulfilled'?id1:id2,loser=winner===id1?id2:id1;
  assert.equal((await repo.registration(winner)).courses.length,2);
  const beforeRename=await repo.roster(course1);
  await repo.renameCourse(course1,'Changed course name');
  assert.deepEqual(await repo.roster(course1),beforeRename);
  const renamed=(await repo.registration(winner)).courses.find(c=>c.id===course1);
  assert.equal(renamed.title,'Changed course name');
  assert.equal((await repo.previewRoster(course1,[row])).existing,1);
  assert.equal((await repo.registration(loser)).registered,false);
  await assert.rejects(repo.registerProfile(loser,value),e=>e.code==='ROSTER_MISMATCH' && e.message.includes('다른 Google 계정'));
  await assert.rejects(repo.registerProfile(winner,{...value,studentNumber:num2,name:'Other student'}),e=>e.code==='ROSTER_MISMATCH');
  const roster=(await repo.roster(course1)).find(r=>r.studentNumber===num1);
  await repo.editRoster(roster.id,course1,{...row,studentNumber:num3,name:'Corrected name',section:'03'},'01');
  assert.equal((await repo.getProfile(winner)).studentNumber,num3);
  assert.equal((await repo.roster(course2))[0].name,'Corrected name');
  assert.equal((await repo.roster(course2))[0].section,'02');
  await assert.rejects(repo.editRoster(roster.id,course1,{...row,studentNumber:num2},'03'),e=>e.code==='23505');
  assert.equal((await repo.getProfile(winner)).studentNumber,num3);
  assert.deepEqual(await repo.registerProfile(winner,{...value,studentNumber:num3,name:'Corrected name'}),{...value,studentNumber:num3,name:'Corrected name'});
  const updated={studentNumber:num3,name:'Corrected name',section:'03'};
  await assert.rejects(repo.addRoster(course1,updated),e=>e.code==='DUPLICATE_ENROLLMENT');
  assert.equal((await repo.importRoster(course1,[updated])).count,0);
  await repo.addRoster(course1,{...updated,section:'04'});
  assert.equal((await repo.registration(winner)).courses.length,3);
  await assert.rejects(repo.editRoster(roster.id,course1,{...updated,section:'04'},'03'),e=>e.code==='23505');
  await repo.deleteEnrollment(roster.id,course1,'04');
  await assert.rejects(repo.deleteEnrollment(roster.id,course1,'04'),e=>e.code==='NOT_FOUND');
  assert.equal((await repo.registration(winner)).courses.length,2);
  assert.equal((await repo.getProfile(winner)).name,'Corrected name');
  assert.equal((await repo.roster(course1)).find(r=>r.id===roster.id).section,'03');
  console.log('PASS: roster import, atomic conflict rejection, registration race, multi-course match, identity lock, professor edit synchronization.');
 } finally {
  await sql.transaction([
   sql.query('DELETE FROM login_dev_enrollments WHERE course_id IN ($1,$2)',[course1,course2]),
   sql.query('DELETE FROM login_dev_roster WHERE student_number IN ($1,$2,$3)',[num1,num2,num3]),
   sql.query('DELETE FROM login_dev_users WHERE google_id IN ($1,$2)',[id1,id2]),
   sql.query('DELETE FROM login_dev_courses WHERE id IN ($1,$2)',[course1,course2])
  ]);
  console.log('Synthetic integration data removed.');
 }
}
main().catch(e=>{console.error('Roster integration failed:',e.code||e.name, e instanceof assert.AssertionError ? e.message : '(database details omitted)');process.exitCode=1;});
