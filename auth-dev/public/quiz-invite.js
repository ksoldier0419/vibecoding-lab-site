(()=>{
 const params=new URLSearchParams(location.search),course=params.get('course'),lesson=params.get('lesson');
 const bubble=document.getElementById('quiz-invitation'),link=document.getElementById('quiz-invitation-link');
 if(!bubble||!course||!lesson)return;
 const base='/api/study/'+encodeURIComponent(course)+'/'+encodeURIComponent(lesson)+'/quiz';
 link.href='/concept-quiz.html?'+new URLSearchParams({course,lesson});
 let key;
 function dismiss(){bubble.hidden=true;try{sessionStorage.setItem(key,'dismissed');}catch{}}
 document.getElementById('quiz-invitation-dismiss').addEventListener('click',dismiss);link.addEventListener('click',dismiss);
 Promise.all([fetch(base,{cache:'no-store'}),fetch('/api/auth/me',{cache:'no-store'})]).then(async([r,me])=>{
  if(!r.ok||!me.ok)return;const [data,auth]=await Promise.all([r.json(),me.json()]);
  if(!auth.user || !data.questions.some(q=>!q.answered))return;key='noti-quiz:'+auth.user.id+':'+course+':'+lesson;
  try{if(sessionStorage.getItem(key))return;}catch{}
  setTimeout(()=>{if(document.visibilityState==='visible'){bubble.hidden=false;try{sessionStorage.setItem(key,'shown');}catch{}}},1800);
 }).catch(()=>{});
})();
