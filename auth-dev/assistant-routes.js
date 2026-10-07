function assistantRoutes(app,repository,{signedIn,localPost,isProfessor,professorEmail}) {
 function admin(req,res,next) {
  if(!isProfessor(req.session.user))return res.status(403).json({error:'관리자만 조교 권한을 변경할 수 있습니다.'});
  next();
 }
 app.get('/api/admin/assistants',signedIn,admin,async(req,res)=>{
  try {res.json({rows:await repository.assistantStudents(professorEmail)});}
  catch {res.status(503).json({error:'조교 권한을 불러오지 못했습니다. 다시 시도해 주세요.'});}
 });
 app.post('/api/admin/assistants',localPost,signedIn,admin,async(req,res)=>{
  const value=req.body;
  if(!value || Object.keys(value).some(k=>!['studentId','enabled'].includes(k)) || typeof value.studentId!=='string' || !/^[1-9][0-9]{0,18}$/.test(value.studentId) || typeof value.enabled!=='boolean') {
   return res.status(400).json({error:'학생과 조교 권한을 확인해 주세요.'});
  }
  try {
   if(!await repository.setTeachingAssistant(value.studentId,value.enabled,req.session.user.id,professorEmail))return res.status(404).json({error:'가입을 완료한 학생만 선택할 수 있습니다.'});
   res.json({ok:true});
  }catch{res.status(503).json({error:'조교 권한을 변경하지 못했습니다. 다시 시도해 주세요.'});}
 });
 const path=require('node:path');
 app.get('/assistant-scopes.html',signedIn,admin,(req,res)=>res.sendFile(path.join(__dirname,'public/assistant-scopes.html')));
 function studentId(req,res,next){if(!/^[1-9][0-9]{0,18}$/.test(req.params.studentId))return res.sendStatus(400);next();}
 app.get('/api/admin/assistant-scopes/:studentId',signedIn,admin,studentId,async(req,res)=>{
  try{const data=await repository.scopeEditor(req.params.studentId);if(!data)return res.status(404).json({error:'지정된 조교를 찾을 수 없습니다.'});res.json(data);}catch{res.status(503).json({error:'담당 범위를 불러오지 못했습니다.'});}
 });
 app.post('/api/admin/assistant-scopes/:studentId',localPost,signedIn,admin,studentId,async(req,res)=>{
  const value=req.body;
  if(!value || Object.keys(value).some(k=>!['courseId','section','enabled'].includes(k)) || typeof value.courseId!=='string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value.courseId) || typeof value.section!=='string' || value.section.length>30 || typeof value.enabled!=='boolean')return res.status(400).json({error:'과목과 분반을 확인해 주세요.'});
  try{if(!await repository.setAssistantScope(req.params.studentId,value.courseId,value.section,value.enabled))return res.status(404).json({error:'지정된 조교와 실제 과목·분반을 선택해 주세요.'});res.json({ok:true});}catch{res.status(503).json({error:'담당 범위를 저장하지 못했습니다.'});}
 });
}
module.exports={assistantRoutes};
