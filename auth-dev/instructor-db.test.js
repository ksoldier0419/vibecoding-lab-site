const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createInstructorRepository}=require('./instructor-db');
test('first professor note access prepares table once; concurrent reads share setup',async()=>{
 let ddl=0;
 const calls=[],repo=createInstructorRepository({query:async(query,params)=>{
  calls.push({query,params});if(query.startsWith('CREATE')){ddl++;return [];}
  return [];
 }});
 const notes=await Promise.all([repo.getInstructorNote('owner-a','java','one'),repo.getInstructorNote('owner-b','java','one')]);
 assert.equal(ddl,1);assert.deepEqual(notes,[{text:'',version:0,updatedAt:null},{text:'',version:0,updatedAt:null}]);
 assert.deepEqual(calls.filter(c=>c.params).map(c=>c.params[0]),['owner-a','owner-b']);
 await repo.setupInstructorNotes();assert.equal(ddl,1);
});
test('failed schema preparation propagates and next request retries without reading notes',async()=>{
 let ddl=0,reads=0;
 const repo=createInstructorRepository({query:async query=>{
  if(query.startsWith('CREATE')){if(++ddl===1)throw Error('DB unavailable');return [];}
  reads++;return [];
 }});
 await assert.rejects(repo.getInstructorNote('owner','java','one'),/DB unavailable/);assert.equal(reads,0);
 await repo.getInstructorNote('owner','java','one');assert.equal(ddl,2);assert.equal(reads,1);
});
test('updates use owner and expected version; stale writes return conflict',async()=>{
 const calls=[],repo=createInstructorRepository({query:async(query,params)=>{calls.push({query,params});return [];} });
 assert.equal(await repo.saveInstructorNote('owner','java','one',{text:'메모',version:3}),null);
 const update=calls.find(c=>c.query.startsWith('UPDATE'));
 assert.deepEqual(update.params,['owner','java','one','메모',3]);
 assert.match(update.query,/google_id=\$1 AND course=\$2 AND lesson=\$3 AND version=\$5/);
});

test('staff learning notes use their own table and keep owner/version parameter checks',async()=>{
 const calls=[],repo=createInstructorRepository({query:async(query,params)=>{calls.push({query,params});return [];}},'staff_learning_notes');
 await repo.getInstructorNote('professor','course','lesson');await repo.saveInstructorNote('professor','course','lesson',{text:'Personal learning',version:2});
 assert.match(calls[0].query,/CREATE TABLE IF NOT EXISTS staff_learning_notes/);
 assert.match(calls[1].query,/FROM staff_learning_notes WHERE google_id=\$1/);assert.deepEqual(calls[1].params,['professor','course','lesson']);
 assert.match(calls.at(-1).query,/UPDATE staff_learning_notes/);assert.match(calls.at(-1).query,/version=\$5/);assert.deepEqual(calls.at(-1).params,['professor','course','lesson','Personal learning',2]);
 assert.ok(calls.every(c=>!c.query.includes('student_lesson_notes')&&!c.query.includes('instructor_lesson_notes')));
 assert.throws(()=>createInstructorRepository({},'untrusted_table'),/Invalid note table/);
});
