const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {lessonContext}=require('./lesson-ai');
const model=require('./quiz-model');
const {createQuizResponder}=require('./quiz-ai');
function quizRoutes(app,repository,{own,review,signedIn,staff,localPost,isProfessor,config}){
 const respond=config.quizReply || createQuizResponder({apiKey:config.openAIKey,model:config.openAIModel});
 const studio='/api/teaching/:course/:lesson/quiz',student='/api/study/:course/:lesson/quiz';
 const available=!!(config.quizReply || config.openAIKey);
 const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.status||503).json({error:e.public?e.message:'개념 확인 문제를 처리하지 못했습니다. 입력을 유지하고 다시 시도해 주세요.'});}};
 const conflict=()=>{throw Object.assign(Error('다른 창에서 변경되었거나 처리 중입니다. 다시 불러와 주세요.'),{status:409,public:true});};
 const clean=set=>({id:set.id,sections:set.sections,target:set.target,state:set.state,version:set.version,published:set.published,title:set.title,createdAt:set.createdAt,deletedAt:set.deletedAt});
 const sectionAllowed=(set,sections)=>sections===null || (Array.isArray(set.sections) && set.sections.every(s=>sections.includes(s)));
 const body=(req,keys)=>{if(!req.body || Array.isArray(req.body) || Object.keys(req.body).some(k=>!keys.includes(k)))model.invalid('입력 형식을 확인해 주세요.');return req.body;};
 const version=value=>{if(!Number.isSafeInteger(value) || value<0)model.invalid('다시 불러와 주세요.');};
 async function edit(req,res,next){try{if(!isProfessor(req.session.user) && !await repository.quizCanEdit(req.session.user.id,req.course.id))return res.status(403).json({error:'교수자가 이 과목의 출제 권한을 부여해야 합니다.'});next();}catch{res.status(503).json({error:'출제 권한을 확인하지 못했습니다.'});}}
 async function getSet(req,includeDeleted=false){if(!model.uuid(req.params.set))model.invalid('문제 묶음 번호를 확인해 주세요.');const set=await repository.quizSet(req.params.set,req.course.id,req.params.lesson);if(!set || (!includeDeleted && set.deletedAt) || !sectionAllowed(set,req.sections))throw Object.assign(Error('담당 범위의 문제 묶음을 찾을 수 없습니다.'),{status:404,public:true});return set;}
 function page(req,res,next){if(!req.session.user)return res.redirect('/login.html');signedIn(req,res,next);}
 app.get('/concept-quiz.html',page,(req,res)=>res.sendFile(path.join(__dirname,'public/concept-quiz.html')));
 app.get('/quiz-studio.html',page,staff,(req,res)=>res.sendFile(path.join(__dirname,'public/concept-quiz.html')));
 app.get(studio,...review,wrap(async(req,res)=>{
  const sets=(await repository.quizSets(req.course.id,req.params.lesson,req.query.deleted==='1')).filter(s=>sectionAllowed(s,req.sections));
  res.json({sets:sets.map(clean),available,professor:isProfessor(req.session.user),canEdit:isProfessor(req.session.user)||await repository.quizCanEdit(req.session.user.id,req.course.id),editors:isProfessor(req.session.user)?await repository.quizEditors(req.course.id):[]});
 }));
 app.post(studio+'/permissions',localPost,...review,wrap(async(req,res)=>{
  if(!isProfessor(req.session.user))return res.sendStatus(403);const b=body(req,['studentId','enabled']);if(typeof b.studentId!=='string' || !/^[1-9][0-9]{0,18}$/.test(b.studentId) || typeof b.enabled!=='boolean')model.invalid('조교와 권한을 확인해 주세요.');
  if(!await repository.quizGrant(b.studentId,req.course.id,b.enabled))return res.status(404).json({error:'현재 조교만 출제 권한을 받을 수 있습니다.'});res.json({ok:true});
 }));
 app.post(studio+'/sets',localPost,...review,edit,wrap(async(req,res)=>{
  const b=body(req,['target','title']);if(b.title!==undefined && (typeof b.title!=='string' || !b.title.trim() || b.title.length>120))model.invalid('묶음 이름은 1~120자로 작성해 주세요.');if(!Number.isInteger(b.target) || b.target<1 || b.target>50)model.invalid('목표 문제 수는 1~50개입니다.');
  res.status(201).json({set:clean(await repository.quizCreate(randomUUID(),req.session.user.id,req.course.id,req.params.lesson,req.sections,b.target,b.title?.trim()||''))});
 }));
 app.post(studio+'/sets/:set/manage',localPost,...review,edit,wrap(async(req,res)=>{
  const b=body(req,['action','title','version']);version(b.version);if(!['rename','delete','restore'].includes(b.action) || (b.title!==undefined && typeof b.title!=='string') || (b.action==='rename' && (typeof b.title!=='string' || !b.title.trim() || b.title.length>120)))model.invalid('묶음 이름 또는 작업을 확인해 주세요.');
  const set=await getSet(req,true);const saved=await repository.quizManage(set.id,req.course.id,req.params.lesson,b.version,b.action,b.title?.trim());if(!saved)conflict();res.json({set:clean(saved)});
 }));
 app.post(studio+'/sets/:set/chat',localPost,...review,edit,wrap(async(req,res)=>{
  const b=body(req,['text','version','requestId']);version(b.version);if(typeof b.text!=='string' || !b.text.trim() || b.text.length>4000 || !model.uuid(b.requestId))model.invalid('출제 요청은 1~4,000자로 작성해 주세요.');
  if(!available)return res.status(503).json({error:'AI 출제가 아직 설정되지 않았습니다.'});
  const old=await getSet(req);if(old.requestId===b.requestId && !old.busyUntil)return res.json({set:clean(old)});
  if(old.state.messages.length>=100)model.invalid('출제 대화 한도에 도달했습니다. 새 묶음을 만들어 주세요.');
  const context=lessonContext(req.course,req.params.lesson),set=await repository.quizBegin(old.id,req.session.user.id,b.version,b.requestId);if(!set)conflict();
  try{
   const value=model.reply(await respond({context,state:set.state,target:set.target,text:b.text.trim()}),set.state,context);
   const state={...set.state,questions:value.questions,proposals:value.proposals,messages:[...set.state.messages,{role:'user',content:b.text.trim()},{role:'assistant',content:value.message}]};
   const saved=await repository.quizFinish(set.id,set.version,b.requestId,state);if(!saved)conflict();res.json({set:clean(saved)});
  }catch(e){await repository.quizCancel(set.id,b.requestId).catch(()=>{});throw e;}
 }));
 app.post(studio+'/sets/:set/apply',localPost,...review,edit,wrap(async(req,res)=>{
  const b=body(req,['action','itemId','version','target']);version(b.version);const set=await getSet(req);if(set.version!==b.version)conflict();
  const change=model.apply(set,b.action,b.itemId,lessonContext(req.course,req.params.lesson),b.target);const saved=await repository.quizApply(set.id,b.version,change);if(!saved)conflict();res.json({set:clean(saved)});
 }));
 app.get(studio+'/stats',...review,wrap(async(req,res)=>{
  const result=await repository.quizStats(req.course.id,req.params.lesson,req.course.courseId,req.sections),contextHash=model.hash(lessonContext(req.course,req.params.lesson));
  result.questions=result.questions.map(q=>({...q,needsSourceReview:q.contextHash!==contextHash}));res.json(result);
 }));
 app.post(studio+'/reviews/:answer',localPost,...review,wrap(async(req,res)=>{
  const b=body(req,['status','note','version']);version(b.version);if(!model.uuid(req.params.answer) || !['unreviewed','planned','resolved','keep'].includes(b.status) || typeof b.note!=='string' || b.note.length>2000)model.invalid('검토 상태와 메모를 확인해 주세요.');
  if(!await repository.quizReview(req.course.id,req.params.lesson,req.course.courseId,req.sections,req.params.answer,b.status,b.note,b.version))conflict();res.json({ok:true});
 }));
 app.get(student,...own,wrap(async(req,res)=>{
  const rows=await repository.quizStudentQuestions(req.course.id,req.params.lesson,req.session.user.id,req.course.courseId),answers=await repository.quizOwnAnswers(req.course.id,req.params.lesson,req.session.user.id);
  res.json({questions:rows.map(model.studentQuestion),answers});
 }));
 app.post(student+'/answer',localPost,...own,wrap(async(req,res)=>{
  const b=body(req,['questionId','choice','requestId']);if(!model.uuid(b.questionId) || !model.uuid(b.requestId) || !Number.isInteger(b.choice) || b.choice<0 || b.choice>3)model.invalid('문제와 선택한 답을 확인해 주세요.');
  const answer=await repository.quizAnswer(req.course.id,req.params.lesson,req.session.user.id,req.course.courseId,b.questionId,b.choice,b.requestId);if(!answer)return res.status(404).json({error:'공개 중인 문제를 찾을 수 없습니다. 다시 불러와 주세요.'});res.json({answer});
 }));
 app.post(student+'/answers/:answer/feedback',localPost,...own,wrap(async(req,res)=>{
  const b=body(req,['understood','comment']);if(!model.uuid(req.params.answer) || typeof b.understood!=='boolean' || typeof b.comment!=='string' || b.comment.length>2000 || (b.understood && b.comment.trim()))model.invalid('이해했어요 또는 문제 의견 중 하나를 선택해 주세요.');
  if(!await repository.quizFeedback(req.course.id,req.params.lesson,req.session.user.id,req.params.answer,b.understood,b.comment.trim()))return res.sendStatus(404);res.json({ok:true});
 }));
}
module.exports={quizRoutes};
