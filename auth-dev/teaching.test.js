const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createApp}=require('./server');
function request(server,url,{cookie,body,origin='http://localhost:3000'}={}) {
 return new Promise((resolve,reject)=>{const headers={host:'localhost:3000'};if(cookie)headers.cookie=cookie;if(body!==undefined){headers.origin=origin;headers['content-type']='application/json';}
 const req=http.request({host:'127.0.0.1',port:server.address().port,path:url,method:body===undefined?'GET':'POST',headers},res=>{let raw='';res.on('data',b=>raw+=b);res.on('end',()=>{let data;try{data=JSON.parse(raw);}catch{data=raw;}resolve({status:res.statusCode,data,headers:res.headers,cookie:res.headers['set-cookie']?.[0]?.split(';')[0]});});});req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));});
}
test('students edit only their enrolled notes; staff read only authorized course/section and cannot edit student notes',async t=>{
 let who,nonce,assistant=true,scope=[{courseId:'903131',section:'01'}],fail=false;
 const notes=new Map(),roster={'1':{user:'one',section:'01'},'2':{user:'two',section:'02'}};
 const key=(id,folder,lesson)=>id+'/'+folder+'/'+lesson;
 const repository={recordLogin:async()=>({}),isTeachingAssistant:async id=>id==='assistant'&&assistant,
  assistantScopes:async()=>{if(fail)throw Error('DB secret');return scope;},getProfile:async()=>({phone:'01000000000'}),
  registration:async id=>({registered:true,courses:[{id:id==='python'?'603108':'903131',section:'01'}]}),courses:async()=>[],
  getStudentNote:async(id,folder,lesson)=>notes.get(key(id,folder,lesson))||{text:'',version:0},
  saveStudentNote:async(id,folder,lesson,value)=>{const k=key(id,folder,lesson),old=notes.get(k)||{version:0};if(old.version!==value.version)return null;const note={text:value.text,version:old.version+1,updatedAt:new Date().toISOString()};notes.set(k,note);return note;},
  studentNoteList:async(code,folder,lesson,sections,after)=>{assert.equal(code,'903131');return {rows:Object.entries(roster).filter(([id,r])=>Number(id)>Number(after)&&(sections===null||sections.includes(r.section))).map(([id])=>({id})),next:null};},
  studentNoteDetail:async(code,folder,lesson,sections,id)=>{const r=roster[id];if(!r || (sections!==null&&!sections.includes(r.section)))return null;return notes.get(key(r.user,folder,lesson))||{text:'',version:0};},
  scopeEditor:async id=>id==='9'?{student:{id:'9'},scopes:scope,courses:[]}:null,
  setAssistantScope:async(id,code,section,enabled)=>{if(id!=='9')return false;scope=enabled?[{courseId:code,section}]:[];return true;}
 };
 const server=createApp({clientId:'test',secret:'x'.repeat(64),professorEmail:'professor@gmail.com',openRegistration:true},{verifyIdToken:async()=>({getPayload:()=>({sub:who,email:who+'@gmail.com',email_verified:true,nonce,exp:Date.now()/1000+3600})})},repository).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 async function login(id){who=id;const challenge=await request(server,'/api/auth/config');nonce=challenge.data.nonce;return(await request(server,'/api/auth/google',{cookie:challenge.cookie,body:{nonce,credential:'verified'}})).cookie;}
 const one=await login('one'),two=await login('two'),python=await login('python'),helper=await login('assistant'),admin=await login('professor');
 const folder='2026-2-java_basic',lesson='week08-operators-conditions.html',own='/api/study/'+folder+'/'+lesson+'/note',review='/api/teaching/'+folder+'/'+lesson+'/student-notes';
 assert.equal((await request(server,'/study.html')).status,302);assert.equal((await request(server,own)).status,401);
 assert.equal((await request(server,'/study.html',{cookie:one})).status,200);
 assert.equal((await request(server,'/teaching.html',{cookie:one})).status,403);
 assert.deepEqual((await request(server,'/api/teaching/catalog',{cookie:one})).data.courses.map(c=>c.id),[folder]);
 assert.deepEqual((await request(server,'/api/teaching/catalog',{cookie:python})).data.courses.map(c=>c.id),['2026-2-python_adv']);
 const staff=(await request(server,'/api/teaching/catalog?view=staff',{cookie:helper})).data.courses;
 assert.equal(staff.find(c=>c.id===folder).reviewAllowed,true);assert.equal(staff.find(c=>c.id==='2026-2-python_adv').reviewAllowed,false);
 assert.equal((await request(server,'/api/teaching/catalog?view=staff',{cookie:one})).status,403);
 assert.equal((await request(server,own,{cookie:python})).status,403);
 assert.equal((await request(server,'/api/study/unknown/'+lesson+'/note',{cookie:one})).status,404);
 assert.equal((await request(server,own,{cookie:one,body:{text:'bad',version:0,google_id:'two'}})).status,400);
 assert.equal((await request(server,own,{cookie:one,body:{text:'bad',version:0},origin:'https://evil.example'})).status,403);
 assert.equal((await request(server,own,{cookie:one,body:{text:'x'.repeat(20001),version:0}})).status,400);
 assert.equal((await request(server,own,{cookie:one,body:{text:'<script>학생 메모</script>',version:0}})).status,200);
 assert.equal((await request(server,own,{cookie:one,body:{text:'stale',version:0}})).status,409);
 assert.equal((await request(server,own,{cookie:two})).data.note.text,'');
 assert.equal((await request(server,review,{cookie:one})).status,403);
 assert.deepEqual((await request(server,review,{cookie:helper})).data.rows.map(r=>r.id),['1']);
 assert.deepEqual((await request(server,review,{cookie:admin})).data.rows.map(r=>r.id),['1','2']);
 assert.equal((await request(server,review+'/1',{cookie:helper})).data.note.text,'<script>학생 메모</script>');
 assert.equal((await request(server,review+'/2',{cookie:helper})).status,404);
 assert.equal((await request(server,review+'/1',{cookie:admin,body:{text:'edit',version:1}})).status,404);
 const frame=await request(server,'/instructor/courses/'+folder+'/'+lesson,{cookie:helper});assert.equal(frame.status,200);assert.equal(frame.headers['x-frame-options'],'SAMEORIGIN');
 assert.equal((await request(server,'/instructor/courses/'+folder+'/'+lesson,{cookie:one})).status,403);
 const scopes='/api/admin/assistant-scopes/9';assert.equal((await request(server,scopes,{cookie:helper})).status,403);
 assert.equal((await request(server,scopes,{cookie:admin})).status,200);
 assert.equal((await request(server,scopes,{cookie:admin,body:{courseId:'903131',section:'01',enabled:false}})).status,200);
 assert.equal((await request(server,review,{cookie:helper})).status,403);
 await request(server,scopes,{cookie:admin,body:{courseId:'903131',section:'*',enabled:true}});
 assert.equal((await request(server,review+'/2',{cookie:helper})).status,200);
 fail=true;assert.equal((await request(server,review,{cookie:helper})).status,503);fail=false;assistant=false;
 assert.equal((await request(server,review,{cookie:helper})).status,403);
 assert.equal((await request(server,own,{cookie:one,body:{text:'',version:1}})).status,200);
});
