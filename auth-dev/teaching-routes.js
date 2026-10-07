const path=require('node:path');
const {catalog,findLesson}=require('./teaching-catalog');
function teachingRoutes(app,repository,{signedIn,localPost,isProfessor,canTeach}) {
 const idPattern=/^(0|[1-9][0-9]{0,18})$/;
 function fail(res){res.status(503).json({error:'교안·메모 정보를 처리하지 못했습니다. 다시 시도해 주세요.'});}
 async function staff(req,res,next) {
  try {if(!await canTeach(req.session.user))return res.status(403).json({error:'관리자·조교만 이용할 수 있습니다.'});next();}catch{fail(res);}
 }
 function pageSession(req,res,next){if(!req.session.user)return res.redirect('/login.html');signedIn(req,res,next);}
 for(const url of ['/study.html','/teaching.html'])app.get(url,pageSession,...(url==='/teaching.html'?[staff]:[]),(req,res)=>res.sendFile(path.join(__dirname,'public/teaching-workspace.html')));
 app.get('/api/teaching/catalog',signedIn,async(req,res)=>{
  try {
   let courses=catalog();
   if(req.query.view==='staff') {
    if(!await canTeach(req.session.user))return res.status(403).json({error:'관리자·조교만 이용할 수 있습니다.'});
    const scopes=isProfessor(req.session.user)?null:await repository.assistantScopes(req.session.user.id);
    courses=courses.map(c=>({...c,reviewAllowed:scopes===null || scopes.some(s=>s.courseId===c.courseId)}));
   }else{
    const [registration,profile]=await Promise.all([repository.registration(req.session.user.id),repository.getProfile(req.session.user.id)]);
    if(!registration.registered || !profile?.phone?.trim())return res.status(403).json({error:'학생 가입과 전화번호 입력을 완료해 주세요.'});
    courses=courses.filter(c=>registration.courses.some(r=>r.id===c.courseId));
   }
   res.json({courses});
  }catch{fail(res);}
 });
 async function lesson(req,res,next) {
  try {req.course=findLesson(req.params.course,req.params.lesson);if(!req.course)return res.status(404).json({error:'교안을 찾을 수 없습니다.'});next();}catch{fail(res);}
 }
 async function enrolled(req,res,next) {
  try {
   const [registration,profile]=await Promise.all([repository.registration(req.session.user.id),repository.getProfile(req.session.user.id)]);
   if(!registration.registered || !profile?.phone?.trim() || !registration.courses.some(c=>c.id===req.course.courseId))return res.status(403).json({error:'본인의 수강 과목에서만 메모를 사용할 수 있습니다.'});
   next();
  }catch{fail(res);}
 }
 const own=[signedIn,lesson,enrolled];
 app.get('/api/study/:course/:lesson/note',...own,async(req,res)=>{
  try {res.json({note:await repository.getStudentNote(req.session.user.id,req.course.id,req.params.lesson)});}catch{fail(res);}
 });
 app.post('/api/study/:course/:lesson/note',localPost,...own,async(req,res)=>{
  const value=req.body;
  if(!value || Object.keys(value).some(k=>!['text','version'].includes(k)) || typeof value.text!=='string' || value.text.length>20000 || !Number.isSafeInteger(value.version) || value.version<0)return res.status(400).json({error:'메모는 20,000자 이내로 작성해 주세요.'});
  try {
   const note=await repository.saveStudentNote(req.session.user.id,req.course.id,req.params.lesson,value);
   if(!note)return res.status(409).json({error:'다른 창에서 메모가 변경되었습니다. 입력 내용을 복사하고 다시 불러와 합쳐 주세요.'});
   res.json({note});
  }catch{fail(res);}
 });
 async function reviewScope(req,res,next) {
  try {
   if(isProfessor(req.session.user)){req.sections=null;return next();}
   const assigned=(await repository.assistantScopes(req.session.user.id)).filter(s=>s.courseId===req.course.courseId);
   if(!assigned.length)return res.status(403).json({error:'담당 과목·분반으로 지정된 학생 메모만 열람할 수 있습니다.'});
   req.sections=assigned.some(s=>s.section==='*')?null:assigned.map(s=>s.section);next();
  }catch{fail(res);}
 }
 const review=[signedIn,staff,lesson,reviewScope];
 for(const [prefix,guards,student] of [['/api/study',own,true],['/api/teaching',review,false]]) {
  app.get(prefix+'/:course/:lesson/questions',...guards,async(req,res)=>{
   const after=req.query.after || '0';if(typeof after!=='string' || !idPattern.test(after))return res.status(400).json({error:'목록 위치를 확인해 주세요.'});
   try {res.json(await repository.questionList(req.course.courseId,req.course.id,req.params.lesson,student?req.session.user.id:null,student?null:req.sections,after));}catch{fail(res);}
  });
 }
 app.post('/api/study/:course/:lesson/questions',localPost,...own,async(req,res)=>{
  const value=req.body;
  if(!value || Object.keys(value).some(k=>k!=='question') || typeof value.question!=='string' || !value.question.trim() || value.question.length>20000)return res.status(400).json({error:'질문은 1~20,000자로 작성해 주세요.'});
  try {res.status(201).json({question:await repository.createQuestion(req.session.user.id,req.course.id,req.params.lesson,value.question.trim())});}catch{fail(res);}
 });
 app.post('/api/teaching/:course/:lesson/questions/:questionId/answer',localPost,...review,async(req,res)=>{
  const value=req.body;
  if(!idPattern.test(req.params.questionId) || req.params.questionId==='0' || !value || Object.keys(value).some(k=>!['answer','version'].includes(k)) || typeof value.answer!=='string' || value.answer.length>20000 || !Number.isSafeInteger(value.version) || value.version<0)return res.status(400).json({error:'답변은 20,000자 이내로 작성해 주세요.'});
  try {
   const question=await repository.answerQuestion(req.course.courseId,req.course.id,req.params.lesson,req.sections,req.params.questionId,req.session.user.id,value.answer,value.version);
   if(!question)return res.status(409).json({error:'답변이 변경되었거나 열람 권한이 없습니다. 작성한 내용을 복사하고 목록을 다시 불러와 주세요.'});
   res.json({question});
  }catch{fail(res);}
 });
 app.get('/api/teaching/:course/:lesson/student-notes',...review,async(req,res)=>{
  const after=req.query.after || '0';if(typeof after!=='string' || !idPattern.test(after))return res.sendStatus(400);
  try {res.json(await repository.studentNoteList(req.course.courseId,req.course.id,req.params.lesson,req.sections,after));}catch{fail(res);}
 });
 app.get('/api/teaching/:course/:lesson/student-notes/:studentId',...review,async(req,res)=>{
  if(!idPattern.test(req.params.studentId) || req.params.studentId==='0')return res.sendStatus(400);
  try {
   const note=await repository.studentNoteDetail(req.course.courseId,req.course.id,req.params.lesson,req.sections,req.params.studentId);
   if(!note)return res.status(404).json({error:'열람할 메모를 찾을 수 없습니다.'});res.json({note});
  }catch{fail(res);}
 });
}
module.exports={teachingRoutes};
