const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {createApp}=require('./server');
function request(server,route,{cookie,body,origin='http://localhost:3000'}={}) {
 return new Promise((resolve,reject)=>{
  const headers={host:'localhost:3000'};
  if(cookie)headers.cookie=cookie;
  if(body!==undefined){headers.origin=origin;headers['content-type']='application/json';}
  const req=http.request({host:'127.0.0.1',port:server.address().port,path:route,method:body===undefined?'GET':'POST',headers},res=>{
   let raw='';res.on('data',b=>raw+=b);res.on('end',()=>{let data;try{data=JSON.parse(raw);}catch{data=raw;}resolve({status:res.statusCode,data,headers:res.headers,cookie:res.headers['set-cookie']?.[0].split(';')[0]});});
  });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
 });
}
test('Java instructor pages and notes require professor; saves reject CSRF, invalid keys and stale versions',async t=>{
 let identity='professor',nonce,note={text:'',version:0,updatedAt:null},fail=false;
 const repository={recordLogin:async()=>({}),getInstructorNote:async()=>{if(fail)throw Error('private DB string');return note;},saveInstructorNote:async(id,course,lesson,value)=>{
  assert.equal(id,'professor-id');assert.equal(course,'2026-2-java_basic');
  if(value.version!==note.version)return null;
  note={text:value.text,version:note.version+1,updatedAt:new Date().toISOString()};return note;
 }};
 const app=createApp({clientId:'test',secret:'x'.repeat(64),allowedEmails:['professor@gmail.com','student@gmail.com'],professorEmail:'professor@gmail.com'},
  {verifyIdToken:async()=>({getPayload:()=>({sub:identity+'-id',email:identity+'@gmail.com',email_verified:true,nonce,exp:Date.now()/1000+3600})})},repository);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'private/2026-2-java_basic/manifest.json'),'utf8'));
 const lesson=manifest[0].id,url='/api/instructor/java/'+lesson+'/note';
 assert.equal((await request(server,'/instructor/java/'+lesson)).status,401);
 assert.equal((await request(server,url)).status,401);
 async function login(who) {identity=who;const challenge=await request(server,'/api/auth/config');nonce=challenge.data.nonce;return (await request(server,'/api/auth/google',{cookie:challenge.cookie,body:{credential:'test',nonce}})).cookie;}
 const student=await login('student');
 for(const route of ['/instructor/java/'+lesson,'/instructor/java/manifest.json',url])assert.equal((await request(server,route,{cookie:student})).status,403);
 assert.equal((await request(server,url,{cookie:student,body:{text:'bad',version:0}})).status,403);
 const professor=await login('professor');
 const page=await request(server,'/instructor/java/'+lesson,{cookie:professor});
 assert.equal(page.status,200);assert.match(page.headers['cache-control'],/no-store/);assert.match(page.data,/instructor-notes/);assert.match(page.data,/<pre><code>/);assert.doesNotMatch(page.data,/class="code-image"/);
 assert.equal((await request(server,'/auth-assets/../private/2026-2-java_basic/'+lesson,{cookie:student})).status,404);
 assert.equal((await request(server,url,{cookie:professor})).data.note.version,0);
 assert.equal((await request(server,url,{cookie:professor,body:{text:'note',version:0},origin:'https://other.example'})).status,403);
 assert.equal((await request(server,url,{cookie:professor,body:{text:'x'.repeat(20001),version:0}})).status,400);
 assert.equal((await request(server,'/api/instructor/java/unknown.html/note',{cookie:professor})).status,404);
 const saved=await request(server,url,{cookie:professor,body:{text:'☐ 복습\n<script>alert(1)</script>',version:0}});
 assert.equal(saved.status,200);assert.equal(saved.data.note.version,1);
 assert.equal((await request(server,url,{cookie:professor,body:{text:'stale',version:0}})).status,409);
 assert.equal((await request(server,url,{cookie:professor,body:{text:'next',version:1}})).data.note.version,2);
 fail=true;const broken=await request(server,url,{cookie:professor});assert.equal(broken.status,503);assert.doesNotMatch(JSON.stringify(broken.data),/private DB/);
 await request(server,'/api/auth/logout',{cookie:professor,body:{}});assert.equal((await request(server,url,{cookie:professor})).status,401);
});
test('deployment bundles instructor pages only in function, never in static public output',()=>{
 const root=path.join(__dirname,'..'),config=require('../vercel.json');
 assert.ok(config.builds.find(b=>b.use==='@vercel/node').config.includeFiles.includes('auth-dev/private/**'));
 assert.ok(config.routes.findIndex(r=>r.src==='/instructor/(.*)')<config.routes.findIndex(r=>r.handle==='filesystem'));
 assert.equal(fs.existsSync(path.join(root,'public/instructor')),false);
 assert.equal(fs.existsSync(path.join(root,'public/auth-dev/private')),false);
 assert.equal(fs.existsSync(path.join(root,'public/auth-assets/private')),false);
});
