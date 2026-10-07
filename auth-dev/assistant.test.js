const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createApp}=require('./server');
function request(server,route,{cookie,body,origin='http://localhost:3000'}={}) {
 return new Promise((resolve,reject)=>{
  const headers={host:'localhost:3000'};if(cookie)headers.cookie=cookie;
  if(body!==undefined){headers.origin=origin;headers['content-type']='application/json';}
  const req=http.request({host:'127.0.0.1',port:server.address().port,path:route,method:body===undefined?'GET':'POST',headers},res=>{
   let raw='';res.on('data',b=>raw+=b);res.on('end',()=>{let data;try{data=JSON.parse(raw);}catch{data=raw;}resolve({status:res.statusCode,data,cookie:res.headers['set-cookie']?.[0]?.split(';')[0]});});
  });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
 });
}
test('admin grants multiple registered assistants; notes stay personal and revocation applies to existing session',async t=>{
 const granted=new Set(),notes=new Map();let identity,nonce,roleFailure=false,grants=0;
 const repository={recordLogin:async()=>({}),isTeachingAssistant:async id=>{if(roleFailure)throw Error('private credential');return granted.has(id);},
  getProfile:async()=>({phone:'010-0000-0000'}),registration:async()=>({registered:true,courses:[]}),courses:async()=>[],
  assistantStudents:async()=>['1','2'].map(id=>({id,assistant:granted.has('student'+id)})),
  setTeachingAssistant:async(id,enabled,actor)=>{assert.equal(actor,'professor');if(!['1','2'].includes(id))return false;grants++;if(enabled)granted.add('student'+id);else granted.delete('student'+id);return true;},
  getInstructorNote:async id=>notes.get(id)||{text:'',version:0},saveInstructorNote:async(id,course,lesson,value)=>{const note={text:value.text,version:1};notes.set(id,note);return note;}};
 const server=createApp({clientId:'test',secret:'x'.repeat(64),professorEmail:'professor@gmail.com',openRegistration:true},
  {verifyIdToken:async()=>({getPayload:()=>({sub:identity,email:identity+'@gmail.com',email_verified:true,nonce,exp:Date.now()/1000+3600})})},repository).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 async function login(who){identity=who;const challenge=await request(server,'/api/auth/config');nonce=challenge.data.nonce;return(await request(server,'/api/auth/google',{cookie:challenge.cookie,body:{nonce,credential:'verified'}})).cookie;}
 const professor=await login('professor'),one=await login('student1'),two=await login('student2');
 const roleUrl='/api/admin/assistants',noteUrl='/api/instructor/java/week08-operators-conditions.html/note';
 assert.equal((await request(server,roleUrl)).status,401);
 assert.equal((await request(server,roleUrl,{cookie:one})).status,403);
 assert.equal((await request(server,noteUrl,{cookie:one})).status,403);
 assert.equal((await request(server,roleUrl,{cookie:one,body:{studentId:'1',enabled:true}})).status,403);
 assert.equal((await request(server,roleUrl,{cookie:professor,origin:'https://evil.example',body:{studentId:'1',enabled:true}})).status,403);
 assert.equal(grants,0);
 assert.equal((await request(server,roleUrl,{cookie:professor,body:{studentId:'3',enabled:true}})).status,404);
 assert.equal((await request(server,roleUrl,{cookie:professor,body:{studentId:'1',enabled:'true'}})).status,400);
 assert.equal((await request(server,roleUrl,{cookie:professor,body:{studentId:'1',enabled:true,role:'professor'}})).status,400);
 for(const studentId of ['1','2'])assert.equal((await request(server,roleUrl,{cookie:professor,body:{studentId,enabled:true}})).status,200);
 assert.equal((await request(server,'/api/auth/me',{cookie:one})).data.user.role,'assistant');
 assert.equal((await request(server,'/api/my/courses',{cookie:one})).data.role,'assistant');
 assert.equal((await request(server,'/instructor/java/index.html',{cookie:one})).status,200);
 assert.equal((await request(server,'/instructor/java/week08-operators-conditions.html',{cookie:two})).status,200);
 for(const url of ['/admin.html','/students.html','/api/admin/students',roleUrl])assert.equal((await request(server,url,{cookie:one})).status,403);
 assert.equal((await request(server,noteUrl,{cookie:one,body:{text:'개인 메모',version:0}})).status,200);
 assert.equal((await request(server,noteUrl,{cookie:one})).data.note.text,'개인 메모');
 assert.equal((await request(server,noteUrl,{cookie:two})).data.note.text,'');
 await request(server,roleUrl,{cookie:professor,body:{studentId:'1',enabled:false}});
 assert.equal((await request(server,noteUrl,{cookie:one})).status,403);
 assert.equal((await request(server,noteUrl,{cookie:one,body:{text:'blocked',version:1}})).status,403);
 assert.equal((await request(server,'/instructor/java/index.html',{cookie:one})).status,403);
 assert.equal((await request(server,'/api/auth/me',{cookie:one})).data.user.role,'student');
 assert.equal((await request(server,noteUrl,{cookie:two})).status,200);
 roleFailure=true;
 const failed=await request(server,noteUrl,{cookie:two});assert.equal(failed.status,503);assert.doesNotMatch(JSON.stringify(failed.data),/private credential/);
 assert.equal((await request(server,'/api/auth/me',{cookie:two})).status,503);
 assert.equal((await request(server,noteUrl,{cookie:professor})).status,200);
});
