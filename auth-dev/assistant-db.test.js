const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createAssistantRepository}=require('./assistant-db');
test('assistant grants require registered roster identity and exclude professor; all values use parameters',async()=>{
 const queries=[],repo=createAssistantRepository({query:async(query,params)=>{queries.push({query,params});return [];}});
 assert.equal(await repo.setTeachingAssistant('7',true,'admin','professor@gmail.com'),false);
 const grant=queries.find(q=>q.params?.length===4);
 assert.deepEqual(grant.params,['7',true,'admin','professor@gmail.com']);
 assert.match(grant.query,/JOIN login_dev_student_profiles/);assert.match(grant.query,/lower\(u.email\)<>\$4/);assert.match(grant.query,/ON CONFLICT\(google_id\) DO NOTHING/);
 await repo.assistantStudents('professor@gmail.com');await repo.isTeachingAssistant('account');
 assert.equal(queries.filter(q=>q.query.startsWith('CREATE')).length,1);
 assert.deepEqual(queries.at(-1).params,['account']);
});
test('role schema failure is retried and role checks never default to allow',async()=>{
 let count=0;
 const repo=createAssistantRepository({query:async query=>{if(query.startsWith('CREATE') && ++count===1)throw Error('database unavailable');return [];}});
 await assert.rejects(repo.isTeachingAssistant('account'),/database unavailable/);
 assert.equal(await repo.isTeachingAssistant('account'),false);assert.equal(count,2);
});
