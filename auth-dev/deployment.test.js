const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {NeonSessionStore}=require('./session-store');
const {createApp}=require('./server');
const config={clientId:'test.apps.googleusercontent.com',secret:'x'.repeat(64),allowedEmails:['tester@gmail.com'],origin:'https://preview.example',trustProxy:true};
function fakeSql(){
 const rows=new Map();
 return {rows,query:async(text,args)=>{
  if(text.startsWith('SELECT')) {const row=rows.get(args[0]);return row && Date.parse(row.expires)>Date.now()?[{data:JSON.parse(row.data)}]:[];}
  if(text.startsWith('WITH')) {const old=rows.get(args[0]);rows.set(args[0],{data:args[1],expires:old && old.expires<args[2]?old.expires:args[2]});return [];}
  if(text.startsWith('DELETE')) {rows.delete(args[0]);return [];}
  throw new Error('Unexpected query');
 }};
}
const invoke=(store,method,...args)=>new Promise((resolve,reject)=>store[method](...args,(e,result)=>e?reject(e):resolve(result)));
function request(server,route,{cookie,body,origin=config.origin,host='preview.example'}={}) {
 return new Promise((resolve,reject)=>{
  const headers={host,'x-forwarded-proto':'https'};
  if(cookie)headers.cookie=cookie;
  if(body){headers.origin=origin;headers['content-type']='application/json';}
  const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:route,method:body?'POST':'GET',headers},res=>{
   let raw='';res.on('data',b=>raw+=b);res.on('end',()=>{let data;try{data=JSON.parse(raw);}catch{data=raw;}resolve({status:res.statusCode,data,headers:res.headers,cookie:res.headers['set-cookie']?.[0]?.split(';')[0]});});
  });
  req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
 });
}
async function start(t,app){const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));return server;}
test('shared sessions authenticate across server instances; logout revokes everywhere',async t=>{
 const sql=fakeSql();let nonce;
 const verifier={verifyIdToken:async()=>({getPayload:()=>({sub:'synthetic-id',name:'Test',email:'tester@gmail.com',email_verified:true,nonce,exp:Math.floor(Date.now()/1000)+3600})})};
 const apps=await Promise.all([1,2].map(()=>start(t,createApp({...config,sessionStore:new NeonSessionStore(sql,config.origin)},verifier))));
 const initial=await request(apps[0],'/api/auth/config');nonce=initial.data.nonce;
 assert.match(initial.headers['set-cookie'][0],/Secure/);
 assert.match(initial.headers['set-cookie'][0],/HttpOnly/);
 assert.equal((await request(apps[1],'/api/auth/google',{cookie:initial.cookie,body:{nonce,credential:'fake'},origin:'https://evil.example'})).status,403);
 const signed=await request(apps[1],'/api/auth/google',{cookie:initial.cookie,body:{nonce,credential:'fake'}});
 assert.equal(signed.status,200);assert.notEqual(signed.cookie,initial.cookie);
 assert.equal((await request(apps[0],'/api/auth/me',{cookie:signed.cookie})).data.user.id,'synthetic-id');
 assert.equal((await request(apps[0],'/api/auth/me',{cookie:initial.cookie})).data.user,null);
 assert.equal((await request(apps[1],'/api/auth/me',{host:'other.example'})).status,403);
 await request(apps[0],'/api/auth/logout',{cookie:signed.cookie,body:{}});
 assert.equal((await request(apps[1],'/api/auth/me',{cookie:signed.cookie})).data.user,null);
});
test('session expiry, origin isolation and storage failures fail closed',async()=>{
 const sql=fakeSql(),a=new NeonSessionStore(sql,'a'),b=new NeonSessionStore(sql,'b');
 const value={cookie:{expires:new Date(Date.now()+60000)},user:{id:'test'}};
 await invoke(a,'set','raw-secret-id',value);
 assert.equal(sql.rows.has('raw-secret-id'),false);
 assert.equal(await invoke(b,'get','raw-secret-id'),null);
 const original=sql.rows.get(a.key('raw-secret-id')).expires;
 await invoke(a,'set','raw-secret-id',{...value,cookie:{expires:new Date(Date.now()+3600000)}});
 assert.equal(sql.rows.get(a.key('raw-secret-id')).expires,original);
 sql.rows.get(a.key('raw-secret-id')).expires=new Date(0).toISOString();
 assert.equal(await invoke(a,'get','raw-secret-id'),null);
 const broken=new NeonSessionStore({query:async()=>{throw new Error('secret connection string');}},'a');
 await assert.rejects(invoke(broken,'get','id'),{message:'Session storage unavailable.'});
 assert.throws(()=>createApp(config),/persistent sessions/);
 assert.throws(()=>createApp({...config,origin:'https://preview.example/path'}),/origin/);
});
test('session database failure never exposes an authenticated profile',async t=>{
 const store=new NeonSessionStore({query:async()=>{throw new Error('secret');}},config.origin);
 const healthy=fakeSql();
 const first=await start(t,createApp({...config,sessionStore:new NeonSessionStore(healthy,config.origin)}));
 const cookie=(await request(first,'/api/auth/config')).cookie;
 const failing=await start(t,createApp({...config,sessionStore:store}));
 const response=await request(failing,'/api/student/profile',{cookie});
 assert.notEqual(response.status,200);
 assert.equal(JSON.stringify(response.data).includes('secret'),false);
});

test('Preview origin uses trusted platform branch URL; production still requires explicit origin',()=>{
 const {resolveOrigin}=require('./runtime');
 assert.equal(resolveOrigin({}),'http://localhost:3000');
 const preview={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_BRANCH_URL:'test-git-login-team.vercel.app'};
 assert.equal(resolveOrigin(preview),'https://test-git-login-team.vercel.app');
 assert.equal(resolveOrigin({...preview,APP_ORIGIN:'https://chosen.example'}),'https://chosen.example');
 assert.throws(()=>resolveOrigin({...preview,VERCEL_BRANCH_URL:'evil.example/path'}));
 assert.throws(()=>resolveOrigin({...preview,VERCEL_ENV:'production'}));
 assert.throws(()=>resolveOrigin({VERCEL:'1',VERCEL_ENV:'preview'}));
});
