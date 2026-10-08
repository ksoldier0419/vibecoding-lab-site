(()=>{
 if(window.self!==window.top||!document.querySelector('.course-table'))return;
 const original=new Map();
 async function update(){
  for(const [link,href] of original)link.href=href;
  try{
   const accountResponse=await fetch('/api/auth/me',{cache:'no-store'});if(!accountResponse.ok)return;
   const {user}=await accountResponse.json();if(!user)return;
   const staff=['professor','assistant'].includes(user.role);
   const response=await fetch('/api/teaching/catalog'+(staff?'?view=staff':''),{cache:'no-store'});if(!response.ok)return;
   const data=await response.json(),folder=location.pathname.split('/')[1],course=data.courses.find(c=>c.id===folder);if(!course)return;
   const lessons=new Set(course.lessons.map(l=>l.id));
   document.querySelectorAll('a[href]').forEach(link=>{const url=new URL(link.href,location.href),parts=url.pathname.split('/');if(url.origin!==location.origin||parts.length!==3||parts[1]!==folder||!lessons.has(parts[2]))return;
    if(!original.has(link))original.set(link,link.href);
    link.href=(staff?'/teaching.html?':'/study.html?')+new URLSearchParams({course:folder,lesson:parts[2]});
   });
  }catch{}
 }
 window.addEventListener('pageshow',update);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
 update();
})();
