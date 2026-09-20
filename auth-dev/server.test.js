const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('./server');
const config = { clientId: 'test.apps.googleusercontent.com', secret: 'x'.repeat(64), allowedEmails: ['tester@gmail.com', 'professor@gmail.com'], professorEmail: 'professor@gmail.com' };
function request(server, route, { method = 'GET', body, cookie, origin = 'http://localhost:3000', host = 'localhost:3000' } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { Host: host };
    if (cookie) headers.Cookie = cookie;
    if (method === 'POST') { headers.Origin = origin; headers['Content-Type'] = 'application/json'; }
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: route, method, headers }, res => {
      let raw = ''; res.on('data', x => raw += x); res.on('end', () => {
        let data; try { data = JSON.parse(raw); } catch { data = raw; }
        resolve({ status: res.statusCode, data, headers: res.headers, cookie: res.headers['set-cookie']?.[0]?.split(';')[0] });
      });
    });
    req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
async function setup(t, verifier, repository = null) {
  if(repository) repository = { registration: async () => ({registered:true,courses:[]}), registerProfile: repository.saveProfile, ...repository };
  const server = createApp(config, verifier, repository).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return server;
}
function payload(nonce) { return { sub: 'google-user-1', name: 'Tester', email: 'tester@gmail.com', email_verified: true, nonce, exp: Math.floor(Date.now()/1000)+3600 }; }
test('verified login rotates session, persists through refresh, logout revokes it', async t => {
  let nonce;
  const server = await setup(t, { verifyIdToken: async options => {
    assert.equal(options.audience, config.clientId); assert.equal(options.idToken, 'verified-test-token');
    return { getPayload: () => payload(nonce) };
  } });
  const initial = await request(server, '/api/auth/config'); nonce = initial.data.nonce;
  assert.match(initial.headers['set-cookie'][0], /HttpOnly/); assert.match(initial.headers['set-cookie'][0], /SameSite=Lax/);
  const signed = await request(server, '/api/auth/google', { method: 'POST', cookie: initial.cookie, body: { credential: 'verified-test-token', nonce } });
  assert.equal(signed.status, 200); assert.notEqual(signed.cookie, initial.cookie);
  assert.equal((await request(server, '/api/auth/me', { cookie: signed.cookie })).data.user.id, 'google-user-1');
  assert.equal((await request(server, '/api/auth/me', { cookie: initial.cookie })).data.user, null);
  await request(server, '/api/auth/logout', { method: 'POST', cookie: signed.cookie, body: {} });
  assert.equal((await request(server, '/api/auth/me', { cookie: signed.cookie })).data.user, null);
});
test('cross-origin request and incorrect challenge are rejected before Google verification', async t => {
  const server = await setup(t, { verifyIdToken: () => { throw new Error('Must not be called'); } });
  const initial = await request(server, '/api/auth/config');
  for (const options of [{ origin: 'https://other.example', nonce: initial.data.nonce }, { origin: 'http://localhost:3000', nonce: 'wrong' }]) {
    const res = await request(server, '/api/auth/google', { method: 'POST', cookie: initial.cookie, origin: options.origin, body: { credential: 'token', nonce: options.nonce } });
    assert.equal(res.status, 403);
  }
});
test('Google rejects forged tokens and unauthenticated session remains empty', async t => {
  const server = await setup(t, { verifyIdToken: async () => { throw new Error('Invalid signature'); } });
  const initial = await request(server, '/api/auth/config');
  const result = await request(server, '/api/auth/google', { method: 'POST', cookie: initial.cookie, body: { credential: 'forged', nonce: initial.data.nonce } });
  assert.equal(result.status, 401);
  assert.equal((await request(server, '/api/auth/me', { cookie: initial.cookie })).data.user, null);
});
test('wrong token nonce, expired claims, unverified email and unlisted accounts fail', async t => {
  for (const change of [{ nonce: 'other' }, { exp: 1 }, { email_verified: false }, { email: 'other@gmail.com' }]) {
    let nonce;
    const server = await setup(t, { verifyIdToken: async () => ({ getPayload: () => ({ ...payload(nonce), ...change }) }) });
    const initial = await request(server, '/api/auth/config'); nonce = initial.data.nonce;
    const result = await request(server, '/api/auth/google', { method: 'POST', cookie: initial.cookie, body: { credential: 'token', nonce } });
    assert.ok([401,403].includes(result.status));
  }
});
test('private files and unexpected hosts are not served', async t => {
  const server = await setup(t, {});
  for (const route of ['/.env.local','/.git/config','/auth-dev/server.js','/package.json']) assert.equal((await request(server, route)).status, 404);
  assert.equal((await request(server, '/login.html', { host: 'attacker.example' })).status, 403);
  assert.equal((await request(server, '/login.html')).status, 200);
});
test('missing environment configuration fails closed', () => {
  assert.throws(() => createApp({ ...config, secret: '' }));
  assert.throws(() => createApp({ ...config, allowedEmails: [] }));
});

test('only verified logins reach database; refresh does not increment count', async t => {
  let nonce, writes = 0;
  const server = await setup(t, { verifyIdToken: async () => ({ getPayload: () => payload(nonce) }) }, {
    recordLogin: async user => { writes++; assert.equal(user.id, 'google-user-1'); assert.equal(user.credential, undefined); return { loginCount: writes, lastLoginAt: new Date().toISOString() }; }
  });
  const initial = await request(server, '/api/auth/config'); nonce = initial.data.nonce;
  const rejected = await request(server, '/api/auth/google', { method: 'POST', cookie: initial.cookie, body: { credential: 'token', nonce: 'wrong' } });
  assert.equal(rejected.status, 403); assert.equal(writes, 0);
  const result = await request(server, '/api/auth/google', { method: 'POST', cookie: initial.cookie, body: { credential: 'token', nonce } });
  assert.equal(result.status, 200); assert.equal(result.data.user.database.loginCount, 1);
  await request(server, '/api/auth/me', { cookie: result.cookie });
  assert.equal(writes, 1);
});
test('database failure returns a safe error and does not create authenticated session', async t => {
  let nonce;
  const server = await setup(t, { verifyIdToken: async () => ({ getPayload: () => payload(nonce) }) }, {
    recordLogin: async () => { throw new Error('secret-connection-details'); }
  });
  const initial = await request(server, '/api/auth/config'); nonce = initial.data.nonce;
  const result = await request(server, '/api/auth/google', { method: 'POST', cookie: initial.cookie, body: { credential: 'token', nonce } });
  assert.equal(result.status, 503); assert.ok(!JSON.stringify(result.data).includes('secret-connection-details'));
  assert.equal((await request(server, '/api/auth/me', { cookie: initial.cookie })).data.user, null);
});

const { validateProfile } = require('./student-profile');
const student = { studentNumber: 'TEST0001', name: '테스트', major1: '컴퓨터', major2: '', phone: '010-0000-0000' };
test('profile validation handles required fields, optional fields and untrusted keys', () => {
  assert.deepEqual(validateProfile({ ...student, name: ' 테스트 ' }), student);
  for (const change of [{ name: '' }, { major1: '' }, { studentNumber: '!' }, { phone: 'abc' }, { phone: '' }, { phone: '   ' }, { phone: undefined }, { role: 'admin' }, { id: 'other' }, { major2: 'x'.repeat(101) }]) {
    assert.throws(() => validateProfile({ ...student, ...change }));
  }
});
async function profileSession(t, repository, email='tester@gmail.com') {
  let nonce;
  const server = await setup(t, { verifyIdToken: async () => ({ getPayload: () => ({...payload(nonce), email}) }) },
    { recordLogin: async () => ({ loginCount: 1 }), ...repository });
  const initial = await request(server, '/api/auth/config'); nonce = initial.data.nonce;
  const result = await request(server, '/api/auth/google', { method: 'POST', cookie: initial.cookie, body: { credential: 'token', nonce } });
  assert.equal(result.status, 200);
  return { server, cookie: result.cookie };
}
test('profile requires authentication and only reads or writes session owner', async t => {
  let saved = null, writes = 0;
  const { server, cookie } = await profileSession(t, {
    getProfile: async id => { assert.equal(id, 'google-user-1'); return saved; },
    saveProfile: async (id, value) => { assert.equal(id, 'google-user-1'); writes++; return saved = value; }
  });
  const route = '/api/student/profile';
  assert.equal((await request(server, route)).status, 401);
  assert.equal((await request(server, route, { method: 'POST', body: student })).status, 401);
  assert.equal((await request(server, route, { cookie })).data.profile, null);
  assert.equal((await request(server, route, { method: 'POST', cookie, origin: 'https://other.example', body: student })).status, 403);
  assert.equal((await request(server, route, { method: 'POST', cookie, body: { ...student, id: 'other-user' } })).status, 400);
  assert.equal(writes, 0);
  const updated = { ...student, major2: '수학', phone: '010-0000-0000' };
  assert.deepEqual((await request(server, route, { method: 'POST', cookie, body: updated })).data.profile, updated);
  assert.deepEqual((await request(server, route + '?id=other-user', { cookie })).data.profile, updated);
  await request(server, route, { method: 'POST', cookie, body: student });
  assert.deepEqual((await request(server, route, { cookie })).data.profile, student);
  await request(server, '/api/auth/logout', { method: 'POST', cookie, body: {} });
  assert.equal((await request(server, route, { cookie })).status, 401);
});
test('duplicate student number and storage errors do not expose database details', async t => {
  let duplicate = true;
  const { server, cookie } = await profileSession(t, {
    getProfile: async () => { throw new Error('secret-db-details'); },
    saveProfile: async () => { throw Object.assign(new Error('secret-db-details'), { code: duplicate ? '23505' : 'other' }); }
  });
  const route = '/api/student/profile';
  for (const expected of [409, 503]) {
    const result = await request(server, route, { method: 'POST', cookie, body: student });
    assert.equal(result.status, expected);
    assert.ok(!JSON.stringify(result.data).includes('secret-db-details'));
    duplicate = false;
  }
  const result = await request(server, route, { cookie });
  assert.equal(result.status, 503);
  assert.ok(!JSON.stringify(result.data).includes('secret-db-details'));
});

const { parseCsv } = require('./roster-validation');
test('CSV handles BOM, leading zeros, quotes and rejects ambiguous rows', () => {
 assert.deepEqual(parseCsv('\uFEFF학번,이름,분반\r\n001234,"테스트,학생",01\r\n'),[{studentNumber:'001234',name:'테스트,학생',section:'01'}]);
 for(const text of ['학번,이름\n0001,A\n0001,A','학번,이름\n0001,"A','학번,이름\n0001,A,01','id,name\n0001,A','학번,이름\n0001,"A"x','학번,이름\n']) assert.throws(()=>parseCsv(text));
});
test('admin APIs reject students and anonymous users, regardless of supplied role', async t => {
 const {server,cookie}=await profileSession(t,{});
 for(const route of ['/admin.html','/api/admin/courses','/api/admin/roster?course=test']) {
  assert.equal((await request(server,route)).status,401);
  assert.equal((await request(server,route,{cookie})).status,403);
 }
 assert.equal((await request(server,'/api/auth/me',{cookie})).data.user.role,'student');
 assert.equal((await request(server,'/api/admin/roster/save',{method:'POST',cookie,body:{...student,course:'test',role:'professor'}})).status,403);
 for(const route of ['/api/admin/import/preview','/api/admin/import/confirm']) assert.equal((await request(server,route,{method:'POST',cookie,body:{}})).status,403);
});
test('professor CSV import requires preview token; changed body cannot alter approved rows', async t => {
 let imports=0;
 const {server,cookie}=await profileSession(t,{
  previewRoster:async(course,rows)=>{assert.equal(course,'test');assert.equal(rows[0].studentNumber,'0001');return {conflicts:[],added:1,existing:0};},
  importRoster:async(course,rows)=>{imports++;assert.equal(course,'test');assert.equal(rows[0].name,'테스트');return {ok:true,count:1};}
 },'professor@gmail.com');
 assert.equal((await request(server,'/api/auth/me',{cookie})).data.user.role,'professor');
 assert.equal((await request(server,'/admin.html',{cookie})).status,200);
 assert.equal((await request(server,'/api/admin/import/preview',{method:'POST',cookie,origin:'https://evil.example',body:{}})).status,403);
 const preview=await request(server,'/api/admin/import/preview',{method:'POST',cookie,body:{course:'test',csv:'학번,이름\n0001,테스트'}});
 assert.equal(preview.status,200);
 assert.equal((await request(server,'/api/admin/import/confirm',{method:'POST',cookie,body:{token:'bad'}})).status,400);
 const result=await request(server,'/api/admin/import/confirm',{method:'POST',cookie,body:{token:preview.data.token,course:'other',rows:[]}});
 assert.equal(result.status,200);assert.equal(imports,1);
 assert.equal((await request(server,'/api/admin/import/confirm',{method:'POST',cookie,body:{token:preview.data.token}})).status,400);
});
test('student registration requires roster match; successful response includes all courses',async t=>{
 let match=false;
 const {server,cookie}=await profileSession(t,{
  registerProfile:async(id,value)=>{
   assert.equal(id,'google-user-1');
   if(!match) throw Object.assign(new Error('수강 명단을 확인해 주세요.'),{code:'ROSTER_MISMATCH'});
   return value;
  },
  registration:async()=>({registered:true,courses:[{id:'python',title:'Python',section:'01'},{id:'java',title:'Java',section:'02'}]})
 });
 const route='/api/student/profile',options={method:'POST',cookie,body:student};
 assert.equal((await request(server,route,options)).status,403);
 match=true;const result=await request(server,route,options);
 assert.equal(result.status,200);assert.equal(result.data.courses.length,2);assert.equal(result.data.registered,true);
});

test('multi-course CSV accepts shared student and rejects duplicate enrollment or conflicting names',()=>{
 const rows=parseCsv('과목코드,학번,이름,분반\npython,001234,학생,01\njava,001234,학생,02');
 assert.equal(rows.length,2);assert.equal(rows[0].course,'python');assert.equal(rows[1].course,'java');assert.equal(rows[0].studentNumber,'001234');
 for(const text of [
  '과목코드,학번,이름,분반\npython,0001,A,01\npython,0001,A,01',
  '과목코드,학번,이름\npython,0001,A\njava,0001,B',
  '과목코드,학번,이름\n,0001,A'
 ]) assert.throws(()=>parseCsv(text));
});
test('multi-course preview and confirmation use CSV courses rather than screen selection',async t=>{
 const {server,cookie}=await profileSession(t,{
  previewRoster:async(course,rows)=>{assert.equal(course,null);assert.deepEqual(rows.map(r=>r.course),['python','java']);return {conflicts:[],added:2,existing:0};},
  importRoster:async(course,rows)=>{assert.equal(course,null);assert.deepEqual(rows.map(r=>r.course),['python','java']);return {ok:true,count:2};}
 },'professor@gmail.com');
 const result=await request(server,'/api/admin/import/preview',{method:'POST',cookie,body:{course:'ignored',csv:'과목코드,학번,이름\npython,0001,A\njava,0001,A'}});
 assert.equal(result.status,200);
 const confirmed=await request(server,'/api/admin/import/confirm',{method:'POST',cookie,body:{token:result.data.token}});
 assert.equal(confirmed.status,200);assert.equal(confirmed.data.count,2);
});

test('course management requires professor and validates names and duplicate codes',async t=>{
 const studentSession=await profileSession(t,{});
 for(const operation of ['create','rename']) {
  const route='/api/admin/courses/'+operation;
  assert.equal((await request(studentSession.server,route,{method:'POST',body:{id:'test',title:'Test'}})).status,401);
  assert.equal((await request(studentSession.server,route,{method:'POST',cookie:studentSession.cookie,body:{id:'test',title:'Test'}})).status,403);
 }
 let created=0,renamed=0;
 const {server,cookie}=await profileSession(t,{
  createCourse:async(id,title)=>{created++;if(created>1)throw Object.assign(new Error('db details'),{code:'23505'});return {id,title};},
  renameCourse:async(id,title)=>{renamed++;assert.equal(id,'test');return {id,title};}
 },'professor@gmail.com');
 const post=(operation,body,origin)=>request(server,'/api/admin/courses/'+operation,{method:'POST',cookie,body,...(origin?{origin}:{})});
 assert.equal((await post('create',{id:'test',title:'Test'},'https://evil.example')).status,403);
 for(const body of [{id:'test',title:''},{id:'test',title:'a\nb'},{id:'test',title:'x'.repeat(151)},{id:'BAD CODE',title:'Valid'},{id:'test',title:'Valid',newId:'other'}])
  assert.equal((await post('create',body)).status,400);
 assert.equal(created,0);
 assert.equal((await post('create',{id:'test',title:' Test '})).status,201);
 assert.equal((await post('create',{id:'test',title:'Other'})).status,409);
 const changed=await post('rename',{id:'test',title:' New name '});
 assert.equal(changed.status,200);assert.deepEqual(changed.data.course,{id:'test',title:'New name'});assert.equal(renamed,1);
});

test('course deletion is professor-only, checks origin and handles in-use courses',async t=>{
 const route='/api/admin/courses/delete';
 const student=await profileSession(t,{});
 assert.equal((await request(student.server,route,{method:'POST',body:{id:'test'}})).status,401);
 assert.equal((await request(student.server,route,{method:'POST',cookie:student.cookie,body:{id:'test'}})).status,403);
 let calls=0;
 const {server,cookie}=await profileSession(t,{deleteCourse:async id=>{
  calls++;if(id==='used')throw Object.assign(new Error('수강생이 등록된 과목은 삭제할 수 없습니다.'),{code:'COURSE_IN_USE'});
  return {id};
 }},'professor@gmail.com');
 const post=(body,origin='http://localhost:3000')=>request(server,route,{method:'POST',cookie,body,origin});
 assert.equal((await post({id:'test'},'https://other.example')).status,403);
 assert.equal((await post({id:'bad code'})).status,400);assert.equal(calls,0);
 assert.equal((await post({id:'used'})).status,409);
 const result=await post({id:'empty'});assert.equal(result.status,200);assert.equal(result.data.course.id,'empty');
});

test('same student may appear in distinct sections but exact duplicate rows are rejected',()=>{
 assert.equal(parseCsv('과목코드,학번,이름,분반\npython,0001,A,01\npython,0001,A,02').length,2);
 assert.throws(()=>parseCsv('학번,이름,분반\n0001,A,01\n0001,A,01'));
});
test('enrollment deletion and duplicate registration require professor and exact section',async t=>{
 const route='/api/admin/roster/delete',body={id:'1',course:'python',section:'01'};
 const student=await profileSession(t,{});
 assert.equal((await request(student.server,route,{method:'POST',body})).status,401);
 assert.equal((await request(student.server,route,{method:'POST',cookie:student.cookie,body})).status,403);
 let removed=0;
 const {server,cookie}=await profileSession(t,{
  deleteEnrollment:async(id,course,section)=>{assert.equal(id,'1');assert.equal(course,'python');assert.equal(section,'01');removed++;return {ok:true};},
  addRoster:async()=>{throw Object.assign(new Error('이미 해당 과목·분반에 등록된 학번입니다.'),{code:'DUPLICATE_ENROLLMENT'});}
 },'professor@gmail.com');
 assert.equal((await request(server,route,{method:'POST',cookie,origin:'https://other.example',body})).status,403);
 assert.equal((await request(server,route,{method:'POST',cookie,body:{id:'1',course:'python'}})).status,400);
 assert.equal(removed,0);
 assert.equal((await request(server,route,{method:'POST',cookie,body})).status,200);
 assert.equal(removed,1);
 const duplicate=await request(server,'/api/admin/roster/save',{method:'POST',cookie,body:{course:'python',studentNumber:'0001',name:'A',section:'01'}});
 assert.equal(duplicate.status,409);assert.match(duplicate.data.error,/이미/);
});

test('public course catalog exposes only current semester course names and codes without login',async t=>{
 const server=await setup(t,{}, {courses:async()=>[
  {id:'1',title:'2026-2 과목 A',students:['private']},
  {id:'2',title:'2026-1 이전 과목'},
  {id:'3',title:'2026-20 다른 기간'}
 ]});
 const result=await request(server,'/api/public/courses');
 assert.equal(result.status,200);
 assert.deepEqual(result.data,{semester:'2026-2',courses:[{id:'1',title:'2026-2 과목 A'}]});
});

test('lost login session returns refresh code and newly issued challenge can authenticate',async t=>{
 let nonce,verifications=0;
 const server=await setup(t,{verifyIdToken:async()=>{verifications++;return {getPayload:()=>payload(nonce)};}});
 const old=await request(server,'/api/auth/config');
 const rejected=await request(server,'/api/auth/google',{method:'POST',body:{credential:'token',nonce:old.data.nonce}});
 assert.equal(rejected.status,403);assert.equal(rejected.data.code,'LOGIN_CHALLENGE_EXPIRED');assert.equal(verifications,0);
 const fresh=await request(server,'/api/auth/config');nonce=fresh.data.nonce;
 const result=await request(server,'/api/auth/google',{method:'POST',cookie:fresh.cookie,body:{credential:'token',nonce}});
 assert.equal(result.status,200);assert.equal(verifications,1);
 assert.equal((await request(server,'/api/auth/me',{cookie:result.cookie})).data.user.role,'student');
});

test('student profile API rejects missing phone before repository write',async t=>{
 let writes=0;
 const {server,cookie}=await profileSession(t,{registerProfile:async()=>{writes++;return student;}});
 for(const phone of ['', '   ', undefined]) {
  const result=await request(server,'/api/student/profile',{method:'POST',cookie,body:{...student,phone}});
  assert.equal(result.status,400);assert.match(result.data.error,/전화번호/);
 }
 assert.equal(writes,0);
});

test('student catalog stays private while lecture documents remain public',async t=>{
 let enrollment=true;
 const {server,cookie}=await profileSession(t,{
  getProfile:async()=>student,
  registration:async()=>({registered:true,courses:enrollment?[
   {id:'603108',title:'Python',section:'1'},{id:'603108',title:'Python',section:'2'},
   {id:'603138',title:'AI',section:'1'}
  ]:[]})
 });
 assert.equal((await request(server,'/api/my/courses')).status,401);
 assert.equal((await request(server,'/courses.html')).status,302);
 assert.equal((await request(server,'/2026-2-python_adv/week01-colab.html')).status,200);
 const catalog=await request(server,'/api/my/courses',{cookie});
 assert.equal(catalog.status,200);assert.equal(catalog.data.courses.length,2);
 assert.deepEqual(catalog.data.courses[0].sections,['1','2']);
 assert.equal(catalog.data.courses[0].url,'/2026-2-python_adv/index.html');
 assert.equal(catalog.data.courses[1].url,null);
 assert.equal((await request(server,'/2026-2-python_adv/index.html',{cookie})).status,200);
 assert.equal((await request(server,'/2026-2-java_basic/index.html',{cookie})).status,200);
 assert.equal((await request(server,'/2026-2-java_basic/week02-1-java.html',{cookie})).status,200);
 enrollment=false;
 assert.equal((await request(server,'/2026-2-python_adv/index.html',{cookie})).status,200);
 assert.notEqual((await request(server,'/2026-2-python_adv/../.env.local',{cookie})).status,200);
});
test('incomplete profile cannot access personal catalog but can read public materials',async t=>{
 const {server,cookie}=await profileSession(t,{
  getProfile:async()=>({...student,phone:''}),
  registration:async()=>({registered:true,courses:[{id:'603108',title:'Python'}]})
 });
 assert.equal((await request(server,'/api/my/courses',{cookie})).status,403);
 const page=await request(server,'/2026-2-python_adv/index.html',{cookie});
 assert.equal(page.status,200);
});
test('professor can view supported courses and material without student profile',async t=>{
 const {server,cookie}=await profileSession(t,{
  courses:async()=>[{id:'603108',title:'Python'},{id:'903131',title:'Java'}]
 },'professor@gmail.com');
 assert.equal((await request(server,'/api/my/courses',{cookie})).data.courses.length,2);
 assert.equal((await request(server,'/2026-2-java_basic/index.html',{cookie})).status,200);
 assert.equal((await request(server,'/',{cookie})).status,200);
});


test('public course directory links redirect to real static index files without login',async t=>{
 const server=await setup(t,{});
 for(const folder of ['2026-2-java_basic','2026-2-python_adv']) {
  for(const suffix of ['', '/']) {
   const response=await request(server,'/'+folder+suffix);
   assert.equal(response.status,307);
   assert.equal(response.headers.location,'/'+folder+'/index.html');
   const page=await request(server,response.headers.location);
   assert.equal(page.status,200);
   assert.match(page.headers['content-type'],/text\/html/);
   assert.match(page.data,/<h1>/);
  }
 }
 assert.equal((await request(server,'/unknown-course/')).status,404);
});
