const {randomUUID,createHmac}=require('node:crypto');
const model=require('./quiz-model'),learning=require('./quiz-learning');
const {statsRange}=require('./quiz-quality');
function learningRoutes(app,repository,{own,review,localPost,isProfessor,config}){
 const base='/api/study/:course/:lesson/quiz/learning',staff='/api/teaching/:course/:lesson/quiz';
 const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.status||503).json({error:e.public?e.message:'학습 상태를 저장하지 못했습니다. 다시 불러와 주세요.'});}};
 const conflict=()=>{throw Object.assign(Error('다른 창에서 학습이 진행되었습니다. 다시 불러와 주세요.'),{public:true,status:409});};
 async function owned(req){if(!model.uuid(req.params.session))model.invalid('학습 세션을 확인해 주세요.');const row=await repository.learningGet(req.params.session,req.course.id,req.params.lesson,req.session.user.id);if(!row)throw Object.assign(Error('학습 세션을 찾을 수 없습니다.'),{public:true,status:404});return row;}
 app.get(base,...own,wrap(async(req,res)=>res.json({session:learning.publicSession(await repository.learningOpen(req.course.id,req.params.lesson,req.session.user.id))})));
 app.post(base+'/start',localPost,...own,wrap(async(req,res)=>{
  const open=await repository.learningOpen(req.course.id,req.params.lesson,req.session.user.id);if(open)return res.json({session:learning.publicSession(open)});
  const rows=await repository.quizStudentQuestions(req.course.id,req.params.lesson,req.session.user.id,req.course.courseId),seen=new Set((await repository.learningSeen(req.course.id,req.params.lesson,req.session.user.id)).map(q=>q.id));
  const passed=new Map((await repository.learningPassed(req.course.id,req.params.lesson,req.session.user.id)).map(q=>[q.id,new Date(q.at).getTime()]));
  const eligible=rows.filter(q=>!seen.has(q.id)&&(!q.content.measurement||q.content.measurement.purpose==='learning'||(passed.has(q.content.measurement.parentId)&&Date.now()>=passed.get(q.content.measurement.parentId)+q.content.measurement.delayDays*86400000)));const purpose=eligible[0]?.content.measurement?.purpose||'learning';
  const fresh=eligible.filter(q=>(q.content.measurement?.purpose||'learning')===purpose).slice(0,5);if(!fresh.length)return res.json({session:null,empty:true});
  const state=learning.create(fresh),registration=await repository.registration(req.session.user.id);state.enrollment={courseCode:req.course.courseId,sections:registration.courses.filter(c=>c.id===req.course.courseId).map(c=>c.section||''),term:req.course.id.split('-').slice(0,2).join('-')};
  const row=await repository.learningStart(randomUUID(),req.course.id,req.params.lesson,req.session.user.id,state);res.status(201).json({session:learning.publicSession(row)});
 }));
 app.post(base+'/:session/action',localPost,...own,wrap(async(req,res)=>{
  const b=req.body;if(!b||Object.keys(b).some(k=>!['action','version','requestId','position','comment','understood'].includes(k))||!model.uuid(b.requestId)||!Number.isSafeInteger(b.version)||b.version<0||!['show','answer','explanation','understand','comment','next','pause','resume'].includes(b.action))model.invalid('학습 요청을 확인해 주세요.');
  const row=await owned(req),old=await repository.learningEvent(row.id,b.requestId);if(old){if(old.requestAction!==b.action||old.requestPosition!==(b.position??null)||old.requestComment!==(b.comment??null)||(old.requestUnderstood??null)!==(b.understood??null))conflict();return res.json({session:learning.publicSession(row)});}if(row.version!==b.version)conflict();
  const q=learning.current(row.state);let action=b.action;
  if(q && !['pause','resume'].includes(action)){const rows=await repository.quizStudentQuestions(req.course.id,req.params.lesson,req.session.user.id,req.course.courseId);if(!rows.some(v=>v.id===q.id))action='withdraw';}
  const changed=learning.change(row.state,action,b,b.requestId);Object.assign(changed.event,{requestAction:b.action,requestPosition:b.position??null,requestComment:b.comment??null,requestUnderstood:b.understood??null,interfaceVersion:'quiz-feedback-v2'});
  const saved=await repository.learningSave(row,req.session.user.id,b.requestId,changed);if(!saved)conflict();res.json({session:learning.publicSession(saved)});
 }));
 app.get(staff+'/learning-stats',...review,wrap(async(req,res)=>{
  const range=statsRange(req.query),rows=await repository.learningStats(req.course.id,req.params.lesson,req.course.courseId,req.sections,range);
  const result={sessions:rows.length,finished:0,completed:0,paused:0,repeatAttempts:0,reached:0,remaining:0,review:0,withdrawn:0,repeatEligible:0,learningItems:0,assessmentSubmitted:0,assessmentCorrect:0};
  for(const row of rows){const s=row.state;if(s.finished)result.finished++;if(s.finished&&s.items.every(q=>q.status==='complete'))result.completed++;if(s.paused&&!s.finished)result.paused++;for(const q of s.items){if(q.content.measurement&&q.content.measurement.purpose!=='learning'){if(q.attempts){result.assessmentSubmitted++;if(q.answer?.correct)result.assessmentCorrect++;}continue;}result.learningItems++;result.repeatAttempts+=Math.max(0,q.attempts-1);if(q.firstCorrect===false)result.repeatEligible++;if(q.status==='complete'&&q.attempts>1)result.reached++;if(['unseen','repeat'].includes(q.status))result.remaining++;if(q.status==='review')result.review++;if(q.status==='withdrawn')result.withdrawn++;}}
  res.json({range,summary:result,rule:learning.RULE});
 }));
 app.get(staff+'/research-export',...review,wrap(async(req,res)=>{
  if(!isProfessor(req.session.user))return res.sendStatus(403);
  const range=statsRange(req.query),rows=await repository.learningExport(req.course.id,req.params.lesson,req.course.courseId,req.sections,range);
  const participant=id=>createHmac('sha256',config.secret).update('quiz-research-v1:'+id).digest('hex');
  const events=rows.map(({user_id,event,...row})=>{const {comment,requestComment,...clean}=event;return {...row,participant:participant(user_id),event:clean,hasComment:!!comment};});
  const [catalog,answerRows,reviewRows]=await Promise.all([repository.researchCatalog(req.course.id,req.params.lesson),repository.researchAnswers(req.course.id,req.params.lesson,req.course.courseId,req.sections,range),repository.researchReviews(req.course.id,req.params.lesson,range)]);
  const questions=catalog.map(({history,audit,...q})=>({...q,history:(history||[]).map(h=>({at:h.at,model:h.model,promptVersion:h.promptVersion,contextHash:h.contextHash,excluded:h.excluded,candidates:h.response.proposals})),audit:(audit||[]).map(({actor,...a})=>({...a,actor:participant(actor)}))}));
  const reviews=reviewRows.map(({user_id,...r})=>({...r,reviewer:participant(user_id)}));
  const answers=answerRows.map(({user_id,...a})=>({...a,participant:participant(user_id)}));
  res.set('Content-Disposition','attachment; filename="quiz-research-events.json"');res.json({schema:'quiz-research-v1',range,consent:'not_collected_by_system',notice:'가명 운영 자료입니다. 연구 동의·승인·보관 범위는 연구자가 확인해야 합니다. 세션 이전 기록은 포함하지 않습니다.',events,questions,answers,reviews});
 }));
}
module.exports={learningRoutes};
