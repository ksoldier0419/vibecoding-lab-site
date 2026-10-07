const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createApp}=require('./server');
function request(server,url,{cookie,body,origin='http://localhost:3000'}={}) {
 return new Promise((resolve,reject)=>{const headers={host:'localhost:3000'};if(cookie)headers.cookie=cookie;if(body!==undefined){headers.origin=origin;headers['content-type']='application/json';}
  const req=http.request({host:'127.0.0.1',port:server.address().port,path:url,method:body===undefined?'GET':'POST',headers},res=>{let raw='';res.on('data',b=>raw+=b);res.on('end',()=>{let data;try{data=JSON.parse(raw);}catch{data=raw;}resolve({status:res.statusCode,data,cookie:res.headers['set-cookie']?.[0]?.split(';')[0]});});});req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));});
}
test('private questions enforce owner, enrollment, staff scope, live revocation, origin and answer version; professor course links use staff page',async t=>{
 let who,nonce,active=true,scopes=[{courseId:'903131',section:'01'}],added;
 const rows=[],sections={one:'01',two:'02'};
 const repo={recordLogin:async()=>({}),isTeachingAssistant:async id=>id==='helper'&&active,assistantScopes:async()=>scopes,
  registration:async id=>({registered:id!=='professor',courses:[{id:id==='python'?'603108':'903131',section:'01'}]}),getProfile:async()=>({phone:'01000000000'}),courses:async()=>[{id:'903131',title:'Java'}],
  createQuestion:async(user,course,lesson,question)=>{const row={id:String(rows.length+1),user,course,lesson,question,answer:'',version:0};rows.push(row);return {id:row.id};},
  questionList:async(code,course,lesson,user,scope,after)=>({rows:rows.filter(r=>r.course===course && r.lesson===lesson && (!user || r.user===user) && (scope===null || scope.includes(sections[r.user])) && Number(r.id)>Number(after)),next:null}),
  answerQuestion:async(code,course,lesson,scope,id,actor,answer,version)=>{const row=rows.find(r=>r.id===id && r.course===course && r.lesson===lesson && r.version===version && (scope===null || scope.includes(sections[r.user])));if(!row)return null;row.answer=answer;row.version++;return row;},
  addRoster:async(code,value)=>{added=value;return {count:value.sections?.length||1};},editRoster:async()=>({ok:true})
 };
 const server=createApp({clientId:'test',secret:'x'.repeat(64),professorEmail:'professor@gmail.com',openRegistration:true},{verifyIdToken:async()=>({getPayload:()=>({sub:who,email:who+'@gmail.com',email_verified:true,nonce,exp:Date.now()/1000+3600})})},repo).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 async function login(id){who=id;const c=await request(server,'/api/auth/config');nonce=c.data.nonce;return(await request(server,'/api/auth/google',{cookie:c.cookie,body:{nonce,credential:'test'}})).cookie;}
 const one=await login('one'),two=await login('two'),python=await login('python'),helper=await login('helper'),admin=await login('professor');
 const suffix='/2026-2-java_basic/week08-operators-conditions.html/questions',own='/api/study'+suffix,staff='/api/teaching'+suffix;
 assert.equal((await request(server,own)).status,401);
 assert.equal((await request(server,own,{cookie:python})).status,403);
 assert.equal((await request(server,own,{cookie:one,body:{question:'',owner:'two'}})).status,400);
 assert.equal((await request(server,own,{cookie:one,body:{question:'x'.repeat(20001)}})).status,400);
 assert.equal((await request(server,own,{cookie:one,body:{question:'<script>질문</script>'},origin:'https://evil.example'})).status,403);
 assert.equal((await request(server,own,{cookie:one,body:{question:'<script>질문</script>'}})).status,201);
 assert.equal((await request(server,own,{cookie:two,body:{question:'다른 분반 질문'}})).status,201);
 assert.deepEqual((await request(server,own,{cookie:one})).data.rows.map(r=>r.id),['1']);
 assert.deepEqual((await request(server,own,{cookie:two})).data.rows.map(r=>r.id),['2']);
 assert.equal((await request(server,staff,{cookie:one})).status,403);
 assert.deepEqual((await request(server,staff,{cookie:helper})).data.rows.map(r=>r.id),['1']);
 assert.deepEqual((await request(server,staff,{cookie:admin})).data.rows.map(r=>r.id),['1','2']);
 const answer=staff+'/1/answer';
 assert.equal((await request(server,answer,{cookie:one,body:{answer:'forged',version:0}})).status,403);
 assert.equal((await request(server,staff+'/2/answer',{cookie:helper,body:{answer:'wrong scope',version:0}})).status,409);
 assert.equal((await request(server,answer,{cookie:helper,body:{answer:'답변',version:0,owner:'two'}})).status,400);
 assert.equal((await request(server,answer,{cookie:helper,body:{answer:'답변',version:0}})).status,200);
 assert.equal((await request(server,answer,{cookie:admin,body:{answer:'stale',version:0}})).status,409);
 assert.equal((await request(server,own,{cookie:one})).data.rows[0].answer,'답변');
 scopes=[];assert.equal((await request(server,staff,{cookie:helper})).status,403);
 scopes=[{courseId:'903131',section:'*'}];assert.equal((await request(server,staff+'/2/answer',{cookie:helper,body:{answer:'all sections',version:0}})).status,200);
 active=false;assert.equal((await request(server,answer,{cookie:helper,body:{answer:'revoked',version:1}})).status,403);
 assert.match((await request(server,'/api/my/courses',{cookie:admin})).data.courses[0].studyUrl,/^\/teaching.html/);
 const roster='/api/admin/roster/save',base={course:'903131',studentNumber:'0001',name:'학생',section:'1, 2,1'};
 assert.equal((await request(server,roster,{cookie:one,body:base})).status,403);
 assert.equal((await request(server,roster,{cookie:admin,body:base})).status,200);assert.deepEqual(added.sections,['1','2']);
 for(const section of ['1,,2','1,','1,2,3,4,5,6,7,8,9,10,11'])assert.equal((await request(server,roster,{cookie:admin,body:{...base,section}})).status,400);
 assert.equal((await request(server,roster,{cookie:admin,body:{...base,id:'1',originalSection:'1'}})).status,400);
});
test('question SQL includes current enrollment, exact owner and scope, and compare-and-swap answer',async()=>{
 const calls=[];const sql={query:async(query,params)=>{calls.push({query,params});return [];}};
 const repo=require('./questions-db').createQuestionRepository(sql);
 await repo.questionList('903131','java','lesson','student',null,'0');
 const own=calls.at(-1);assert.match(own.query,/q.google_id=\$4/);assert.match(own.query,/e.course_id=\$1/);assert.equal(own.params[3],'student');
 await repo.questionList('903131','java','lesson',null,['01'],'2');assert.equal(calls.at(-1).params[4],'["01"]');
 await repo.answerQuestion('903131','java','lesson',['01'],'2','helper','<script>safe</script>',3);
 const answer=calls.at(-1);assert.match(answer.query,/q.version=\$9/);assert.match(answer.query,/\$5::jsonb \? e.section/);assert.equal(answer.params[6],'<script>safe</script>');assert.equal(answer.params[8],3);
 assert.equal(calls.filter(c=>c.query.includes('CREATE TABLE')).length,1);
});
test('multiple direct sections use one locked import and duplicate check covering the entire request',async()=>{
 let incoming;const calls=[];
 const sql={query:(query,params)=>{calls.push({query,params});if(query.includes('count(*) FILTER'))return Promise.resolve([{exists:true,conflicts:[]}]);return {query,params};},transaction:async items=>{incoming=JSON.parse(items[1].params[1]);return [[],[{ok:true,duplicate:false,count:2}]];}};
 const repo=require('./roster-db').createRosterRepository(sql);
 assert.equal((await repo.addRoster('903131',{studentNumber:'0001',name:'학생',sections:['1','2']})).count,2);
 assert.deepEqual(incoming.map(r=>r.section),['1','2']);assert.equal(calls.at(-1).params[2],true);assert.match(calls.at(-1).query,/SELECT ok FROM valid/);
});
