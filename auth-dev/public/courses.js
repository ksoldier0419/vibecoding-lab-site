
const statusText=document.getElementById('status'),list=document.getElementById('courses'),retry=document.getElementById('retry');
async function loadCourses() {
 retry.hidden=true;list.replaceChildren();statusText.hidden=false;statusText.textContent='수강 과목을 불러오고 있습니다.';
 try {
  const response=await fetch('/api/my/courses',{cache:'no-store'}),data=await response.json();
  if(response.status===401){location.replace('/login.html');return;}
  if(data.profileRequired){location.replace('/login.html?profile=1');return;}
  if(!response.ok)throw new Error(data.error);
  document.getElementById('admin').hidden=data.role!=='professor';
  for(const c of data.courses){
   const li=document.createElement('li'),card=document.createElement(c.url?'a':'div'),title=document.createElement('strong'),detail=document.createElement('small');
   if(c.url)card.href=c.url;else card.className='course-pending';
   title.textContent=c.title;
   detail.textContent='과목코드 '+c.id+(c.sections.length?' · '+c.sections.map(s=>s+'분반').join(', '):'')+(c.url?' · 강의자료 열기':' · 강의자료 준비 중');
   card.append(title,detail);li.append(card);list.append(li);
  }
  statusText.hidden=data.courses.length>0;statusText.textContent='등록된 수강 과목이 없습니다.';
 }catch(error){statusText.textContent=error.message || '목록을 불러오지 못했습니다.';retry.hidden=false;}
}
retry.addEventListener('click',loadCourses);
document.getElementById('logout').addEventListener('click',async()=>{
 try {const response=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw new Error();location.replace('/login.html');}
 catch {statusText.hidden=false;statusText.textContent='로그아웃하지 못했습니다. 다시 시도해 주세요.';}
});
loadCourses();
