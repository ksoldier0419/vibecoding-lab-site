const { randomBytes } = require('node:crypto');
const v = require('./roster-validation');
function adminRoutes(app, repository, {signedIn,localPost,isProfessor}) {
 function professor(req,res,next) {
  if(!isProfessor(req.session.user)) return res.status(403).json({error:'교수 계정만 이용할 수 있습니다.'});
  next();
 }
 function fail(res,e) {
  if(e.code==='23505' && e.constraint==='login_dev_enrollments_pkey') return res.status(409).json({error:'이미 해당 과목·분반에 등록된 학번입니다.'});
  if(e.code==='23505') return res.status(409).json({error:'이미 사용 중인 학번입니다. 기존 명단을 확인해 주세요.'});
  if(['ROSTER_CONFLICT','COURSE_MISSING','NOT_FOUND','COURSE_IN_USE','DUPLICATE_ENROLLMENT'].includes(e.code)) return res.status(409).json({error:e.message});
  return res.status(503).json({error:'명단을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'});
 }
 const guard=[signedIn,professor];
 app.get('/api/admin/students',...guard,async(req,res)=>{
  try {res.json({rows:await repository.students()});}catch(e){fail(res,e);}
 });
 app.post('/api/admin/students/save',localPost,...guard,async(req,res)=>{
  let value,id;
  try {
   if(!req.body || Object.keys(req.body).some(k=>!['id','studentNumber','name'].includes(k))) throw new Error('학번과 이름을 확인해 주세요.');
   id=req.body.id;
   if(id!==undefined && (typeof id!=='string'||!/^[1-9][0-9]{0,18}$/.test(id))) throw new Error('수정할 학생을 선택해 주세요.');
   value=v.identity(req.body);
  }catch(e){return res.status(400).json({error:e.message});}
  try {res.json(await repository.saveStudent(id,value));}catch(e){fail(res,e);}
 });
 app.get('/students.html',...guard,(req,res)=>res.sendFile(require('node:path').join(__dirname,'public/students.html')));
 app.get('/admin.html',...guard,(req,res)=>res.sendFile(require('node:path').join(__dirname,'public/admin.html')));
 app.get('/api/admin/courses',...guard,async(req,res)=>{
  try { res.json({courses:await repository.courses()}); } catch(e) { fail(res,e); }
 });
 app.post('/api/admin/courses/delete',localPost,...guard,async(req,res)=>{
  let id;
  try {
   if(!req.body || Object.keys(req.body).some(key=>key!=='id')) throw new Error('삭제할 과목코드를 확인해 주세요.');
   id=v.courseId(req.body.id);
  } catch(e) {return res.status(400).json({error:e.message});}
  try {
   const course=await repository.deleteCourse(id);
   delete req.session.rosterPreview;
   res.json({course});
  } catch(e) {fail(res,e);}
 });
 for(const operation of ['create','rename']) {
  app.post('/api/admin/courses/'+operation,localPost,...guard,async(req,res)=>{
   let id,title;
   try {
    if(!req.body || Object.keys(req.body).some(key=>!['id','title'].includes(key))) throw new Error('과목코드와 과목명만 입력해 주세요.');
    id=v.courseId(req.body.id);title=v.courseTitle(req.body.title);
   } catch(e) {return res.status(400).json({error:e.message});}
   try {
    const course=operation==='create'?await repository.createCourse(id,title):await repository.renameCourse(id,title);
    res.status(operation==='create'?201:200).json({course});
   } catch(e) {
    if(e.code==='23505') return res.status(409).json({error:'이미 등록된 과목코드입니다. 과목명 수정 기능을 사용해 주세요.'});
    fail(res,e);
   }
  });
 }
 app.get('/api/admin/roster',...guard,async(req,res)=>{
  let course;
  try { course=v.courseId(req.query.course); } catch(e) { return res.status(400).json({error:e.message}); }
  try { res.json({rows:await repository.roster(course)}); } catch(e) { fail(res,e); }
 });
 app.post('/api/admin/roster/save',localPost,...guard,async(req,res)=>{
  let course,value,id,originalSection;
  try {
   course=v.courseId(req.body?.course); id=req.body?.id;
   if(id!==undefined && (typeof id!=='string'|| !/^[1-9][0-9]{0,18}$/.test(id))) throw new Error('수정할 학생을 선택해 주세요.');
   if(id!==undefined) {if(typeof req.body.originalSection!=='string') throw new Error('수정 전 분반을 확인해 주세요.');originalSection=v.section(req.body.originalSection);}
   value={...v.identity(req.body||{}),section:v.section(req.body?.section)};
  } catch(e) { return res.status(400).json({error:e.message}); }
  try {
   res.json(id ? await repository.editRoster(id,course,value,originalSection) : await repository.addRoster(course,value));
  } catch(e) { fail(res,e); }
 });
 app.post('/api/admin/roster/delete',localPost,...guard,async(req,res)=>{
  let course,id,section;
  try {
   course=v.courseId(req.body?.course);id=req.body?.id;
   if(typeof id!=='string'||!/^[1-9][0-9]{0,18}$/.test(id)) throw new Error('삭제할 학생을 선택해 주세요.');
   if(typeof req.body?.section!=='string') throw new Error('삭제할 분반을 확인해 주세요.');
   section=v.section(req.body.section);
  } catch(e) {return res.status(400).json({error:e.message});}
  try {res.json(await repository.deleteEnrollment(id,course,section));}
  catch(e) {fail(res,e);}
 });
 app.post('/api/admin/import/preview',localPost,...guard,async(req,res)=>{
  delete req.session.rosterPreview;
  let course,rows;
  try { rows=v.parseCsv(req.body?.csv); course=rows[0].course ? null : v.courseId(req.body?.course); }
  catch(e) { return res.status(400).json({error:e.message}); }
  try {
   const report=await repository.previewRoster(course,rows);
   if(report.conflicts.length) return res.status(409).json({error:'기존 이름과 다른 학번: '+report.conflicts.slice(0,20).join(', ')+'. 명단의 수정 버튼으로 먼저 확인해 주세요.'});
   const token=randomBytes(24).toString('hex');
   req.session.rosterPreview={course,rows,token,expires:Date.now()+10*60*1000};
   res.json({token,added:report.added,existing:report.existing,total:rows.length,rows});
  } catch(e) { fail(res,e); }
 });
 app.post('/api/admin/import/confirm',localPost,...guard,async(req,res)=>{
  const pending=req.session.rosterPreview;
  if(!pending || pending.expires<Date.now() || pending.token!==req.body?.token)
   return res.status(400).json({error:'CSV 미리보기를 다시 실행해 주세요.'});
  delete req.session.rosterPreview;
  req.session.save(async error=>{
   if(error) return res.status(503).json({error:'다시 미리보기를 실행해 주세요.'});
   try { res.json(await repository.importRoster(pending.course,pending.rows)); } catch(e) { fail(res,e); }
  });
 });
}
module.exports={adminRoutes};
