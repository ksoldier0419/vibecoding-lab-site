const express=require('express');
const path=require('node:path');
// Explicit course-code mapping; do not derive filesystem paths from requests.
const pages={'603108':'2026-2-python_adv','903131':'2026-2-java_basic'};
function coursePages(app,repository,{isProfessor}) {
 const root=path.join(__dirname,'..');
 async function accessible(user) {
  if(isProfessor(user)) return {ready:true,courses:await repository.courses()};
  const [profile,registration]=await Promise.all([repository.getProfile(user.id),repository.registration(user.id)]);
  return {ready:!!(registration.registered && profile?.phone?.trim()),courses:registration.courses};
 }
 function loggedIn(req,res,next) {
  if(!req.session.user) return res.redirect('/login.html');
  next();
 }
 app.get('/courses.html',loggedIn,(req,res)=>res.sendFile(path.join(__dirname,'public/courses.html')));
 app.get('/api/my/courses',async(req,res)=>{
  if(!req.session.user) return res.status(401).json({error:'로그인해 주세요.'});
  try {
   const result=await accessible(req.session.user);
   if(!result.ready) return res.status(403).json({error:'학생 등록과 전화번호 입력을 완료해 주세요.',profileRequired:true});
   const grouped=new Map();
   for(const c of result.courses) {
    if(!grouped.has(c.id)) {
     const folder=pages[c.id],available=!!folder;
     grouped.set(c.id,{id:c.id,title:c.title,sections:[],url:available?'/'+folder+'/':null});
    }
    if(c.section && !grouped.get(c.id).sections.includes(c.section)) grouped.get(c.id).sections.push(c.section);
   }
   res.json({courses:[...grouped.values()],role:isProfessor(req.session.user)?'professor':'student'});
  } catch {res.status(503).json({error:'수강 과목을 불러오지 못했습니다. 다시 시도해 주세요.'});}
 });
 // Lecture materials remain public; personal lists and admin data use authenticated APIs.
 for(const folder of Object.values(pages)) {
  app.use('/'+folder,express.static(path.join(root,folder),{dotfiles:'deny',index:'index.html'}));
 }
 app.use('/materials',express.static(path.join(root,'materials'),{dotfiles:'deny',index:false}));
 app.use('/assets',express.static(path.join(root,'assets'),{dotfiles:'deny',index:false}));
}
module.exports={coursePages};
