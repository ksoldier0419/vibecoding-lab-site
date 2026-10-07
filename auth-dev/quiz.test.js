const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const model=require('./quiz-model');
const {createApp}=require('./server');
const {createQuizResponder}=require('./quiz-ai');
const folder='2026-2-java_basic',lesson='week05-variables-constants.html';
const context=JSON.parse(fs.readFileSync(path.join(__dirname,'private',folder,lesson+'.context.json'),'utf8')).text;
const heading=context.split('\n').find(s=>/^## /.test(s)).replace(/^## /,'').trim();
const sample=()=>({prompt:'변수와 상수에 관한 설명 중 옳은 것은?',choices:['변수는 값을 바꿀 수 있다.','모든 변수는 상수이다.','상수는 매번 바뀐다.','변수는 값을 저장하지 않는다.'],answer:0,choiceExplanations:['값을 바꿀 수 있다.','변수와 상수는 다르다.','상수는 고정된 값이다.','변수는 값을 저장한다.'],concept:'변수와 상수',intent:'값 변경 여부 확인',explanation:'변수는 값을 저장하고 변경할 수 있다.',sourceTitle:heading,sourceQuote:heading});
test('only grounded four-choice questions are accepted; proposals cannot target unrelated IDs',()=>{
 assert.deepEqual(model.question(sample(),context),sample());
 assert.throws(()=>model.question({...sample(),choices:['a','a','b','c']},context),/서로 다른/);
 assert.throws(()=>model.question({...sample(),answer:4},context),/정답/);
 assert.throws(()=>model.question({...sample(),sourceQuote:'교안에 없는 내용'},context),/근거/);
 assert.throws(()=>model.reply({message:'수정',proposals:[{operation:'replace',questionId:randomUUID(),question:sample()}]},{items:[]},context),/고유번호/);
});
test('clarification questions are bounded, use unique choices, and cannot accompany proposals',()=>{
 const value={message:'세부 방향을 골라 주세요.',questions:[{prompt:'난이도는?',options:['기초 개념','코드 적용']}],proposals:[]};
 const result=model.reply(value,{items:[]},context);assert.ok(model.uuid(result.questions[0].id));assert.deepEqual(result.questions[0].options,value.questions[0].options);
 assert.throws(()=>model.reply({...value,questions:[{prompt:'난이도는?',options:['기초','기초']}]},{items:[]},context),/선택지/);
 assert.throws(()=>model.reply({...value,questions:[{prompt:'난이도는?',options:['기초']}]},{items:[]},context),/선택지/);
 assert.throws(()=>model.reply({...value,proposals:[{operation:'add',questionId:null,question:sample()}]},{items:[]},context),/나누어/);
 assert.deepEqual(model.reply({message:'기존 응답',proposals:[]},{items:[]},context).questions,[]);
});
test('publishing ignores legacy target count; replacing creates a new ID and preserves old content',()=>{
 const state={items:[],messages:[],proposals:model.reply({message:'추천',proposals:[{operation:'add',questionId:null,question:sample()}]},{items:[]},context).proposals};
 let set={target:1,published:false,state};
 set.state=model.apply(set,'accept',state.proposals[0].id,context).state;
 const original=structuredClone(set.state.items[0]);
 const published=model.apply(set,'publish',null,context);assert.equal(published.publications.length,1);
 set={...set,published:true,state:published.state};
 set.state.proposals=model.reply({message:'수정',proposals:[{operation:'replace',questionId:original.id,question:{...sample(),prompt:'수정한 문제'}}]},set.state,context).proposals;
 set.state=model.apply(set,'accept',set.state.proposals[0].id,context).state;
 const next=model.apply(set,'publish',null,context);assert.notEqual(next.publications[0].id,original.id);assert.equal(next.publications[0].replaces,original.id);assert.deepEqual(next.retired,[original.id]);assert.equal(next.state.items[0].prompt,original.prompt);assert.equal(model.apply(set,'target',null,context,2).target,2);
 assert.equal(model.apply({...set,target:2,published:false,state:{...state,items:[original]}},'publish',null,context).publications.length,1);
 assert.throws(()=>model.apply({...set,state:{...set.state,items:[{...original,contextHash:'stale'}]}},'publish',null,context),/교안이 변경/);
});
test('structured output request never stores responses and rejects incomplete or refused responses',async()=>{
 let captured;const response={message:'개념과 난이도를 알려 주세요.',proposals:[]};
 const respond=createQuizResponder({apiKey:'synthetic',fetcher:async(url,options)=>{captured=JSON.parse(options.body);return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(response)}]}]})};}});
 assert.deepEqual(await respond({context,state:{items:[],messages:[]},target:2,text:'출제'}),response);assert.equal(captured.store,false);assert.equal(captured.text.format.strict,true);assert.equal(captured.text.format.schema.additionalProperties,false);
 const refused=createQuizResponder({apiKey:'synthetic',fetcher:async()=>({ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]})})});
 await assert.rejects(refused({context,state:{items:[],messages:[]},target:2,text:'출제'}),/완료되지/);
});
function request(server,url,{cookie,body,origin='http://localhost:3000'}={}){return new Promise((resolve,reject)=>{
 const headers={host:'localhost:3000'};if(cookie)headers.cookie=cookie;if(body!==undefined){headers.origin=origin;headers['content-type']='application/json';}
 const req=http.request({host:'127.0.0.1',port:server.address().port,path:url,method:body===undefined?'GET':'POST',headers},res=>{let raw='';res.on('data',b=>raw+=b);res.on('end',()=>{let data;try{data=JSON.parse(raw);}catch{data=raw;}resolve({status:res.statusCode,data,cookie:res.headers['set-cookie']?.[0]?.split(';')[0]});});});req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
});}
test('routes enforce enrollment, explicit assistant grants, section ownership, no answer leak and idempotent retries',async t=>{
 let who,nonce,allowed=false,grant=false,aiCalls=0;const sets=new Map(),responses=new Map();
 const repo={recordLogin:async()=>({}),getProfile:async()=>({phone:'01000000000'}),registration:async id=>({registered:true,courses:[{id:id==='other'?'603108':'903131',section:'01'}]}),isTeachingAssistant:async id=>id==='assistant',assistantScopes:async()=>allowed?[{courseId:'903131',section:'01'}]:[],quizCanEdit:async()=>grant,quizEditors:async()=>[],quizGrant:async(id,course,enabled)=>{grant=enabled;return true;},
  quizSets:async(course,lesson,includeDeleted)=>[...sets.values()].filter(s=>includeDeleted||!s.deletedAt),quizCreate:async(id,user,course,lesson,sections,target)=>{const set={id,course,lesson,sections,target,version:0,published:false,state:{items:[],messages:[],proposals:[]}};sets.set(id,set);return set;},quizSet:async id=>sets.get(id),quizManage:async(id,course,lesson,version,action,title)=>{const s=sets.get(id);if(s.version!==version||s.busyUntil)return null;s.version++;if(action==='rename')s.title=title;if(action==='delete')s.deletedAt=new Date().toISOString();if(action==='restore')s.deletedAt=null;return s;},
  quizBegin:async(id,user,version,requestId)=>{const s=sets.get(id);if(s.version!==version||s.busyUntil)return null;s.busyUntil=true;s.requestId=requestId;return structuredClone(s);},quizFinish:async(id,version,requestId,state)=>{const s=sets.get(id);if(s.version!==version)return null;s.version++;s.state=state;s.busyUntil=null;return s;},quizCancel:async id=>{sets.get(id).busyUntil=null;},quizApply:async(id,version,change)=>{const s=sets.get(id);if(s.version!==version)return null;s.version++;s.state=change.state;s.published=s.published||!!change.publications.length;s.requestId=null;return s;},
  quizStudentQuestions:async()=>[...sets.values()].flatMap(s=>s.state.items.filter(q=>q.status==='published').map(q=>({id:q.id,content:q}))),quizOwnAnswers:async(course,lesson,user)=>[...responses.values()].filter(a=>a.user===user),
  quizAnswer:async(course,lesson,user,code,id,choice,requestId)=>{const old=responses.get(requestId);if(old)return old.user===user&&old.questionId===id&&old.choice===choice?old:null;const q=[...sets.values()].flatMap(s=>s.state.items).find(q=>q.id===id&&q.status==='published');if(!q)return null;const a={id:requestId,user,questionId:id,choice,correct:choice===q.answer,content:q};responses.set(requestId,a);return a;},quizFeedback:async(course,lesson,user,id,understood,comment)=>{const a=responses.get(id);if(a?.user!==user)return null;Object.assign(a,{understood,comment});return a;},quizStats:async()=>({questions:[],answers:[],eligible:0,limit:500}),quizReview:async()=>({})};
 const learningRows=new Map(),learningEvents=new Map();
 Object.assign(repo,{researchReviews:async()=>[],researchCatalog:async()=>[],researchAnswers:async()=>[],learningOpen:async(c,l,u)=>[...learningRows.values()].find(r=>r.user===u&&!r.state.finished)||null,learningSeen:async(c,l,u)=>[...learningRows.values()].filter(r=>r.user===u).flatMap(r=>r.state.items.map(q=>({id:q.id}))),learningPassed:async()=>[],learningStart:async(id,c,l,user,state)=>{const r={id,user,state,version:0};learningRows.set(id,r);return r;},learningGet:async(id,c,l,user)=>{const r=learningRows.get(id);return r?.user===user?r:null;},learningEvent:async(id,rid)=>learningEvents.get(rid)||null,learningSave:async(row,user,rid,change)=>{const r=learningRows.get(row.id);if(r.version!==row.version||learningEvents.has(rid))return null;r.state=change.state;r.version++;learningEvents.set(rid,change.event);return r;},learningStats:async()=>[...learningRows.values()],learningExport:async()=>[...learningEvents].map(([id,event])=>({id,user_id:'student',event}))});
 Object.assign(repo,{learningInitialCompleted:async(c,l,u)=>[...learningRows.values()].some(r=>r.user===u&&r.state.mode!=='review'&&r.state.finished&&r.state.items.some(q=>q.attempts>0)),learningReviewCandidates:async()=>[...sets.values()].flatMap(s=>s.state.items.filter(q=>q.status==='published').map(q=>({id:q.id,firstCorrect:false,firstAt:'2026-09-01T00:00:00Z',lastAt:'2026-09-01T00:00:00Z',reviews:0}))),learningReviewHistory:async(c,l,u)=>[...learningRows.values()].filter(r=>r.user===u&&r.state.mode==='review'),learningReviewRound:async(c,l,u,o)=>[...learningRows.values()].filter(r=>r.user===u&&r.state.mode==='review'&&r.state.review.occasion===o).length+1});
 const app=createApp({clientId:'test',secret:'x'.repeat(64),openRegistration:true,professorEmail:'professor@gmail.com',quizReply:async({state})=>{aiCalls++;return state.messages.length?{message:'후보를 확인해 주세요.',proposals:[{operation:'add',questionId:null,question:sample()}]}:{message:'세부 방향을 선택해 주세요.',questions:[{prompt:'난이도는?',options:['기초','응용']}],proposals:[]};}},{verifyIdToken:async()=>({getPayload:()=>({sub:who,email:who+'@gmail.com',email_verified:true,nonce,exp:Date.now()/1000+3600})})},repo);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 async function login(user){who=user;const c=await request(server,'/api/auth/config');nonce=c.data.nonce;return(await request(server,'/api/auth/google',{cookie:c.cookie,body:{nonce,credential:'fake'}})).cookie;}
 const professor=await login('professor'),student=await login('student'),other=await login('other'),assistant=await login('assistant');const base='/api/teaching/'+folder+'/'+lesson+'/quiz',own='/api/study/'+folder+'/'+lesson+'/quiz';
 assert.equal((await request(server,own)).status,401);assert.equal((await request(server,own,{cookie:other})).status,403);assert.equal((await request(server,base,{cookie:student})).status,403);assert.equal((await request(server,base,{cookie:assistant})).status,403);allowed=true;
 assert.equal((await request(server,base+'/sets',{cookie:assistant,body:{target:1}})).status,403);assert.equal((await request(server,base+'/permissions',{cookie:assistant,body:{studentId:'1',enabled:true}})).status,403);assert.equal((await request(server,base+'/permissions',{cookie:professor,body:{studentId:'1',enabled:true}})).status,200);
 let result=await request(server,base+'/sets',{cookie:professor,body:{target:1}});assert.equal(result.status,201);let set=result.data.set;
 assert.equal((await request(server,base+'/sets/'+set.id+'/chat',{cookie:assistant,body:{text:'출제',version:0,requestId:randomUUID()}})).status,404);
 const chatUrl=base+'/sets/'+set.id+'/chat';const payload={text:'변수 개념 확인',version:0,requestId:randomUUID()};result=await request(server,chatUrl,{cookie:professor,body:payload});assert.equal(result.status,200);assert.equal(result.data.set.state.proposals.length,0);assert.equal(result.data.set.state.questions.length,1);assert.deepEqual(result.data.set.state.questions[0].options,['기초','응용']);
 assert.equal((await request(server,chatUrl,{cookie:professor,body:payload})).status,200);assert.equal(aiCalls,1);
 assert.equal((await request(server,chatUrl,{cookie:professor,body:{...payload,requestId:randomUUID()}})).status,409);
 assert.equal((await request(server,chatUrl,{cookie:professor,body:{...payload,version:1},origin:'https://evil.example'})).status,403);
 result=await request(server,chatUrl,{cookie:professor,body:{text:'초급, 차이 확인',version:1,requestId:randomUUID()}});set=result.data.set;
 const apply=base+'/sets/'+set.id+'/apply';result=await request(server,apply,{cookie:professor,body:{action:'accept',itemId:set.state.proposals[0].id,version:set.version}});set=result.data.set;assert.equal(set.state.items.length,1);
 result=await request(server,apply,{cookie:professor,body:{action:'publish',version:set.version}});assert.equal(result.status,200);
 const list=await request(server,own,{cookie:student});assert.equal(list.data.questions.length,1);assert.equal('answer' in list.data.questions[0],false);assert.equal('explanation' in list.data.questions[0],false);
 const answer={questionId:list.data.questions[0].id,choice:2,requestId:randomUUID()};result=await request(server,own+'/answer',{cookie:student,body:answer});assert.equal(result.data.answer.correct,false);assert.equal(result.data.answer.content.answer,0);
 assert.equal((await request(server,own+'/answer',{cookie:student,body:answer})).status,200);assert.equal(responses.size,1);
 assert.equal((await request(server,own+'/answers/'+answer.requestId+'/feedback',{cookie:professor,body:{understood:true,comment:''}})).status,404);
 assert.equal((await request(server,own+'/answers/'+answer.requestId+'/feedback',{cookie:student,body:{understood:true,comment:'모호해요'}})).status,200);
 assert.equal((await request(server,own+'/answers/'+answer.requestId+'/feedback',{cookie:student,body:{understood:true,comment:''}})).status,200);assert.equal(responses.get(answer.requestId).correct,false);
 const publicSet=(await request(server,base,{cookie:professor})).data.sets[0],manage=base+'/sets/'+publicSet.id+'/manage';
 assert.equal((await request(server,manage,{cookie:student,body:{action:'delete',version:publicSet.version}})).status,403);
 assert.equal((await request(server,manage,{cookie:assistant,body:{action:'delete',version:publicSet.version}})).status,404);
 result=await request(server,manage,{cookie:professor,body:{action:'rename',title:'java와 javac',version:publicSet.version}});assert.equal(result.data.set.title,'java와 javac');
 assert.equal((await request(server,manage,{cookie:professor,body:{action:'delete',version:publicSet.version}})).status,409);
 result=await request(server,manage,{cookie:professor,body:{action:'delete',version:result.data.set.version}});assert.ok(result.data.set.deletedAt);
 assert.equal((await request(server,base,{cookie:professor})).data.sets.length,0);assert.equal((await request(server,base+'?deleted=1',{cookie:professor})).data.sets.length,1);
 assert.equal((await request(server,chatUrl,{cookie:professor,body:{text:'출제',version:result.data.set.version,requestId:randomUUID()}})).status,404);
 assert.equal(responses.size,1);result=await request(server,manage,{cookie:professor,body:{action:'restore',version:result.data.set.version}});assert.equal(result.data.set.deletedAt,null);assert.equal(result.data.set.state.items.length,1);
 const untargeted=(await request(server,base+'/sets',{cookie:professor,body:{}})).data.set;assert.ok(untargeted.id);
 assert.equal((await request(server,base+'/sets/'+untargeted.id+'/chat',{cookie:professor,body:{text:'',version:0,requestId:randomUUID()}})).status,200);
 assert.equal((await request(server,base+'/stats?period=invalid',{cookie:professor})).status,400);
 const available=(await request(server,own+'/learning',{cookie:student})).data;assert.deepEqual(available.availability,{registered:1,newCount:1,remaining:0});
 const start=await request(server,own+'/learning/start',{cookie:student,body:{}});assert.equal(start.status,201);let session=start.data.session;const actionUrl=own+'/learning/'+session.id+'/action';
 assert.deepEqual((await request(server,own+'/learning',{cookie:student})).data.availability,{registered:1,newCount:0,remaining:1});
 const show={action:'show',version:session.version,requestId:randomUUID()};assert.equal((await request(server,actionUrl,{body:show})).status,401);assert.equal((await request(server,actionUrl,{cookie:professor,body:show})).status,404);
 result=await request(server,actionUrl,{cookie:student,body:show});session=result.data.session;assert.equal(session.current.answer,null);assert.equal((await request(server,actionUrl,{cookie:student,body:show})).data.session.version,session.version);
 const canonical=learningRows.get(session.id).state.items[0].order.indexOf(1);result=await request(server,actionUrl,{cookie:student,body:{action:'answer',position:canonical,version:session.version,requestId:randomUUID()}});session=result.data.session;assert.equal(session.current.answer.correct,false);
 for(const [action,fields] of [['understand',{}],['comment',{comment:'표현이 이상해요'}]]){session=(await request(server,actionUrl,{cookie:student,body:{action,...fields,version:session.version,requestId:randomUUID()}})).data.session;}assert.equal(session.current.answer.understood,true);assert.equal(session.current.answer.comment,'표현이 이상해요');
 assert.equal((await request(server,own+'/learning',{cookie:student})).data.availability.remaining,0);
 const realQuestions=repo.quizStudentQuestions;repo.quizStudentQuestions=async()=>[];assert.deepEqual((await request(server,own+'/learning',{cookie:student})).data.availability,{registered:0,newCount:0,remaining:0});repo.quizStudentQuestions=realQuestions;
 assert.equal((await request(server,base+'/research-export',{cookie:student})).status,403);const exported=await request(server,base+'/research-export',{cookie:professor});assert.equal(exported.status,200);assert.equal(JSON.stringify(exported.data).includes('표현이 이상해요'),false);assert.equal('user_id' in exported.data.events[0],false);
 assert.equal((await request(server,own+'/learning/review/start',{cookie:student,body:{occasion:'forged',selection:'all'}})).status,400);
 assert.equal((await request(server,own+'/learning/review/start',{body:{occasion:'midterm',selection:'all'}})).status,401);
 const locked=await request(server,own+'/learning/review',{cookie:student});assert.equal(locked.data.unlocked,false);assert.equal((await request(server,own+'/learning/review/start',{cookie:student,body:{occasion:'midterm',selection:'all'}})).status,403);
 await request(server,actionUrl,{cookie:student,body:{action:'next',version:session.version,requestId:randomUUID()}});
 for(const [occasion,round] of [['midterm',1],['midterm',2],['final',1]]){
  const r=await request(server,own+'/learning/review/start',{cookie:student,body:{occasion,selection:'wrong'}});assert.equal(r.status,201);let rs=r.data.session;assert.equal(rs.mode,'review');assert.equal(rs.review.round,round);assert.equal(rs.review.occasion,occasion);const url=own+'/learning/'+rs.id+'/action';
  rs=(await request(server,url,{cookie:student,body:{action:'show',version:rs.version,requestId:randomUUID()}})).data.session;
  assert.equal(rs.current.answer,null);const position=learningRows.get(rs.id).state.items[0].order.indexOf(0);
  rs=(await request(server,url,{cookie:student,body:{action:'answer',position,version:rs.version,requestId:randomUUID()}})).data.session;
  rs=(await request(server,url,{cookie:student,body:{action:'next',version:rs.version,requestId:randomUUID()}})).data.session;assert.equal(rs.finished,true);
 }
 const overview=(await request(server,own+'/learning/review',{cookie:student})).data;assert.equal(overview.unlocked,true);assert.equal(overview.history.length,3);
 const split=(await request(server,base+'/learning-stats',{cookie:professor})).data;assert.equal(split.summary.sessions,1);assert.equal(split.reviewSummary.sessions,3);assert.equal(split.reviewSummary.firstCorrect,3);assert.equal(split.reviewSummary.occasions.midterm,2);
 const owned=(await request(server,base+'/sets',{cookie:assistant,body:{target:1}})).data.set;assert.deepEqual(owned.sections,['01']);grant=false;assert.equal((await request(server,base+'/sets/'+owned.id+'/chat',{cookie:assistant,body:{text:'출제',version:0,requestId:randomUUID()}})).status,403);
});

test('similar candidates are excluded and semester boundaries use Korea time',()=>{
 const {compareCandidates,statsRange}=require('./quiz-quality');
 const q={...sample(),id:randomUUID()},p={id:randomUUID(),operation:'add',question:q};
 assert.deepEqual(compareCandidates([p],[q]),[]);
 assert.equal(compareCandidates([{...p,operation:'replace',questionId:q.id}],[q]).length,1);
 assert.deepEqual(statsRange({period:'semester',year:'2026',semester:'2'}),{period:'semester',from:'2026-08-31T15:00:00.000Z',to:'2027-02-28T15:00:00.000Z'});
 assert.throws(()=>statsRange({period:'invalid'}),/기간/);
 const set={target:1,state:{items:[{...q,status:'published'}],proposals:[]}};
 const retired=model.apply(set,'retire',q.id,context);assert.deepEqual(retired.retired,[q.id]);assert.equal(retired.state.items[0].status,'retired');assert.equal(set.state.items[0].status,'published');
});
