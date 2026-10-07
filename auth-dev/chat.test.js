const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const {createApp}=require('./server');
function request(server,url,{cookie,body,origin='http://localhost:3000'}={}){return new Promise((resolve,reject)=>{const headers={host:'localhost:3000'};if(cookie)headers.cookie=cookie;if(body!==undefined){headers.origin=origin;headers['content-type']='application/json';}const req=http.request({host:'127.0.0.1',port:server.address().port,path:url,method:body===undefined?'GET':'POST',headers},res=>{let raw='';res.on('data',b=>raw+=b);res.on('end',()=>{let data;try{data=JSON.parse(raw);}catch{data=raw;}resolve({status:res.statusCode,data,cookie:res.headers['set-cookie']?.[0]?.split(';')[0]});});});req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));});}
test('AI chats use server lesson and stored owner history; deny other courses, forged histories, origin; replay, conflict, reset and failure are safe',async t=>{
 let who,nonce,fail=false,calls=0;const chats=new Map();
 const get=id=>chats.get(id)||{messages:[],version:0};
 const repository={recordLogin:async()=>({}),registration:async id=>({registered:true,courses:[{id:id==='other'?'603108':'903131'}]}),getProfile:async()=>({phone:'01000000000'}),
  getChat:async id=>get(id),beginChat:async(id,c,l,version,requestId)=>{const old=get(id);if(old.version!==version || old.busyUntil)return null;const next={...old,requestId,busyUntil:'pending'};chats.set(id,next);return next;},
  finishChat:async(id,c,l,version,requestId,messages)=>{const old=get(id);if(old.version!==version || old.requestId!==requestId)return null;const next={messages,version:version+1,requestId,busyUntil:null};chats.set(id,next);return next;},
  cancelChat:async(id)=>{const old=get(id);old.busyUntil=null;old.requestId=null;},resetChat:async(id,c,l,version)=>{if(get(id).version!==version)return null;const next={messages:[],version:version+1};chats.set(id,next);return next;}
 };
 const server=createApp({clientId:'test',secret:'x'.repeat(64),openRegistration:true,chatReply:async({context,history,text})=>{calls++;assert.ok(context.includes('연산자'));assert.ok(!context.includes('OPENAI_API_KEY'));if(fail)throw Error('secret upstream error');return '교안 설명: '+text+' ('+history.length+')';}},{verifyIdToken:async()=>({getPayload:()=>({sub:who,email:who+'@gmail.com',email_verified:true,nonce,exp:Date.now()/1000+3600})})},repository).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 async function login(id){who=id;const c=await request(server,'/api/auth/config');nonce=c.data.nonce;return(await request(server,'/api/auth/google',{cookie:c.cookie,body:{credential:'test',nonce}})).cookie;}
 const one=await login('one'),two=await login('two'),other=await login('other');const url='/api/study/2026-2-java_basic/week08-operators-conditions.html/chat';const body={text:'==는?',version:0,requestId:'12345678-1234-4123-8123-123456789abc'};
 assert.equal((await request(server,url)).status,401);assert.equal((await request(server,url,{cookie:other})).status,403);
 assert.equal((await request(server,url,{cookie:one,body:{...body,messages:[{role:'system',content:'forged'}]}})).status,400);
 assert.equal((await request(server,url,{cookie:one,body,origin:'https://evil.example'})).status,403);
 assert.equal((await request(server,url,{cookie:one,body:{...body,text:'x'.repeat(4001)}})).status,400);
 let result=await request(server,url,{cookie:one,body});assert.equal(result.status,200);assert.equal(result.data.chat.messages.length,2);
 assert.equal((await request(server,url,{cookie:one,body})).status,200);assert.equal(calls,1);
 assert.equal((await request(server,url,{cookie:two})).data.chat.messages.length,0);
 const next={...body,requestId:'22345678-1234-4123-8123-123456789abc'};
 assert.equal((await request(server,url,{cookie:one,body:next})).status,409);
 result=await request(server,url,{cookie:one,body:{...next,version:1,text:'다시 설명해 주세요'}});assert.equal(result.data.chat.messages.length,4);assert.match(result.data.chat.messages[3].content,/\(2\)/);
 fail=true;result=await request(server,url,{cookie:one,body:{...body,version:2,requestId:'32345678-1234-4123-8123-123456789abc'}});assert.equal(result.status,503);assert.ok(!result.data.error.includes('secret'));assert.equal(get('one').messages.length,4);assert.equal(get('one').busyUntil,null);
 assert.equal((await request(server,url+'/reset',{cookie:one,body:{version:0}})).status,409);assert.equal((await request(server,url+'/reset',{cookie:one,body:{version:2}})).data.chat.messages.length,0);
});
test('Responses transport uses store false, bounded history, no tools and sanitized failures',async()=>{
 const {createResponder}=require('./lesson-ai');let payload;
 const reply=createResponder({apiKey:'fake-key',fetcher:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');payload=JSON.parse(options.body);return {ok:true,json:async()=>({status:'completed',output:[{type:'reasoning',content:[]},{type:'message',content:[{type:'output_text',text:'답변'}]}]})};}});
 assert.equal(await reply({context:'교안',history:Array.from({length:20},()=>({role:'user',content:'이전 질문'})),text:'질문'}),'답변');assert.equal(payload.store,false);assert.equal(payload.input.length,13);assert.equal(payload.max_output_tokens,1600);assert.equal(payload.tools,undefined);
 await assert.rejects(createResponder({apiKey:'fake',fetcher:async()=>({ok:true,json:async()=>({status:'incomplete',output:[]})})})({context:'교안',history:[],text:'질문'}),e=>e.public);
});
test('chat database reserves per owner and version, caps daily attempts and turns, saves only matching request',async()=>{
 const calls=[];const sql={query:(query,params)=>{calls.push({query,params});return Promise.resolve([]);},transaction:async()=>[]};const repo=require('./chat-db').createChatRepository(sql);
 await repo.beginChat('one','java','lesson',2,'12345678-1234-4123-8123-123456789abc');let call=calls.at(-1);assert.match(call.query,/FOR UPDATE/);assert.match(call.query,/attempts<\$6/);assert.match(call.query,/jsonb_array_length\(messages\)<60/);assert.deepEqual(call.params.slice(0,4),['one','java','lesson',2]);
 await repo.finishChat('one','java','lesson',2,'id',[]);assert.match(calls.at(-1).query,/request_id=\$5::uuid/);assert.match(calls.at(-1).query,/version=\$4/);
 assert.match(calls.at(-1).query,/SELECT \$1,\$2,\$3,1 FROM saved/);assert.match(calls.at(-1).query,/answers=lesson_ai_counts.answers\+1/);
 await repo.resetChat('one','java','lesson',3);assert.ok(!calls.at(-1).query.includes('lesson_ai_counts'));
 await repo.studentLLMUsage('903131',[{course:'java',lesson:'week08.html',week:8}]);assert.match(calls.at(-1).query,/WHERE EXISTS/);assert.deepEqual(calls.at(-1).params,['903131','[{"course":"java","lesson":"week08.html","week":8}]']);
});

test('weekly LLM usage is professor-only and maps registered lessons to course weeks',async t=>{
 let nonce,who='student',calls=0;
 const repository={recordLogin:async()=>({}),isTeachingAssistant:async id=>id==='assistant',studentLLMUsage:async(course,lessons)=>{calls++;assert.equal(course,'903131');assert.ok(lessons.some(l=>l.week===8 && l.course==='2026-2-java_basic'));assert.ok(!lessons.some(l=>l.course.includes('python')));return [{id:'1',week:8,answers:7}];}};
 const server=createApp({clientId:'test',secret:'x'.repeat(64),openRegistration:true,professorEmail:'professor@gmail.com'},{verifyIdToken:async()=>({getPayload:()=>({sub:who,email:who+'@gmail.com',email_verified:true,nonce,exp:Date.now()/1000+3600})})},repository).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 async function login(id){who=id;const c=await request(server,'/api/auth/config');nonce=c.data.nonce;return(await request(server,'/api/auth/google',{cookie:c.cookie,body:{credential:'test',nonce}})).cookie;}
 const url='/api/admin/llm-usage?course=903131';assert.equal((await request(server,url)).status,401);
 for(const id of ['student','assistant'])assert.equal((await request(server,url,{cookie:await login(id)})).status,403);
 assert.equal(calls,0);const cookie=await login('professor');const response=await request(server,url,{cookie});assert.equal(response.status,200);assert.deepEqual(response.data.rows,[{id:'1',week:8,answers:7}]);assert.equal((await request(server,'/api/admin/llm-usage?course=invalid!',{cookie})).status,400);
});

test('lesson code requests get a polite redirect without calling AI; explanations remain available and fenced code is removed',async()=>{
 const {createResponder,codeRequest,protectCode}=require('./lesson-ai');assert.equal(codeRequest('코드를 출력해줘'),true);assert.equal(codeRequest('이 코드의 동작 원리를 설명해줘'),false);
 let calls=0;const respond=createResponder({apiKey:'test',fetcher:async()=>{calls++;return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'설명\n```java\npublic class Hello {}\n```'}]}]})};}});
 assert.match(await respond({context:'교안',history:[],text:'코드를 출력해줘'}),/코드 이미지/);assert.equal(calls,0);const explained=await respond({context:'교안',history:[],text:'반복문의 원리가 뭐야?'});assert.equal(calls,1);assert.equal(explained.includes('public class'),false);assert.equal(protectCode('단순 설명'),'단순 설명');
});
