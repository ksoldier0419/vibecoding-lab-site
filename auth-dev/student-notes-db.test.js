const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createStudentNoteRepository}=require('./student-notes-db');
const {createScopeRepository}=require('./assistant-scopes-db');
test('student notes use a separate table; reviews filter current enrollment and authorized sections with parameters',async()=>{
 const calls=[],repo=createStudentNoteRepository({query:async(query,params)=>{calls.push({query,params});return [];}});
 await repo.getStudentNote('owner','course','lesson');await repo.studentNoteList('code','folder','lesson',['01']);await repo.studentNoteDetail('code','folder','lesson',['01'],'7');
 assert.match(calls[0].query,/CREATE TABLE IF NOT EXISTS student_lesson_notes/);
 assert.deepEqual(calls[1].params,['owner','course','lesson']);
 assert.match(calls[2].query,/e.course_id=\$1/);assert.match(calls[2].query,/\$4::jsonb \? e.section/);
 assert.deepEqual(calls[2].params,['code','folder','lesson','["01"]','0']);
 assert.match(calls[3].query,/r.id=\$5::bigint/);assert.match(calls[3].query,/EXISTS/);
});
test('scope assignments require an active assistant and a real course/section; role deletion cascades to scopes',async()=>{
 const calls=[];let prepares=0;
 const repo=createScopeRepository({query:async(query,params)=>{calls.push({query,params});return [];}},async()=>{prepares++;});
 await repo.setAssistantScope('7','code','01',true);await repo.assistantScopes('owner');
 assert.match(calls[0].query,/REFERENCES teaching_assistants\(google_id\) ON DELETE CASCADE/);
 assert.match(calls[1].query,/JOIN login_dev_courses/);assert.match(calls[1].query,/EXISTS\(SELECT 1 FROM login_dev_enrollments/);
 assert.deepEqual(calls[1].params,['7','code','01',true]);assert.deepEqual(calls.at(-1).params,['owner']);assert.ok(prepares>=1);
});
