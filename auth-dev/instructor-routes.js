const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const folder='2026-2-java_basic';
function instructorRoutes(app,repository,{signedIn,localPost,canTeach}) {
 const root=path.join(__dirname,'private',folder);
 async function teachingAccess(req,res,next) {
  try {
   if(!await canTeach(req.session.user)) return res.status(403).json({error:'관리자 또는 조교만 이용할 수 있습니다.'});
   res.set('Cache-Control','private, no-store');
   next();
  }catch {res.status(503).json({error:'교안 접근 권한을 확인하지 못했습니다. 다시 시도해 주세요.'});}
 }
 function lesson(req,res,next) {
  let lessons;
  try {lessons=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));}
  catch {return res.status(503).json({error:'강사용 교안을 먼저 생성해 주세요.'});}
  if(!lessons.some(item=>item.id===req.params.lesson)) return res.status(404).json({error:'교안을 찾을 수 없습니다.'});
  next();
 }
 const guard=[signedIn,teachingAccess];
 app.use('/instructor/java',...guard,express.static(root,{dotfiles:'deny',index:'index.html',setHeaders:res=>res.setHeader('Cache-Control','private, no-store')}));
 app.get('/api/instructor/java/:lesson/note',...guard,lesson,async(req,res)=>{
  try {res.json({note:await repository.getInstructorNote(req.session.user.id,folder,req.params.lesson)});}
  catch {res.status(503).json({error:'메모를 불러오지 못했습니다. 다시 시도해 주세요.'});}
 });
 app.post('/api/instructor/java/:lesson/note',localPost,...guard,lesson,async(req,res)=>{
  const value=req.body;
  if(!value || Object.keys(value).some(k=>!['text','version'].includes(k)) || typeof value.text!=='string' || value.text.length>20000 || !Number.isSafeInteger(value.version) || value.version<0) {
   return res.status(400).json({error:'메모는 20,000자 이내로 작성해 주세요.'});
  }
  try {
   const note=await repository.saveInstructorNote(req.session.user.id,folder,req.params.lesson,value);
   if(!note) return res.status(409).json({error:'다른 창에서 메모가 변경되었습니다. 입력 내용을 복사한 뒤 다시 불러와 합쳐 주세요.'});
   res.json({note});
  } catch {res.status(503).json({error:'저장하지 못했습니다. 입력 내용은 유지됩니다. 다시 저장해 주세요.'});}
 });
}
module.exports={instructorRoutes};
