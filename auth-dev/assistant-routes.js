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
}
module.exports={assistantRoutes};
