const $=id=>document.getElementById(id),staffView=location.pathname==='/teaching.html',params=new URLSearchParams(location.search);
let courses=[],course,lesson,nextPage=null,readVersion=0,listBusy=false;
function option(value,text){const node=document.createElement('option');node.value=value;node.textContent=text;return node;}
async function api(url){const response=await fetch(url,{cache:'no-store'});const data=await response.json();if(response.status===401)throw Error('로그인이 만료되었습니다. 로그인 새 창에서 다시 로그인해 주세요.');if(!response.ok)throw Error(data.error || '불러오지 못했습니다.');return data;}
function navigate(folder,page){$('workspace-course').value=course.id;$('workspace-lesson').value=lesson.id;location.assign(location.pathname+'?'+new URLSearchParams({course:folder,lesson:page}));}
async function load(){
 try {
  const data=await api('/api/teaching/catalog'+(staffView?'?view=staff':''));courses=data.courses;
  if(!courses.length)throw Error('선택할 수 있는 교안이 없습니다.');
  course=courses.find(c=>c.id===params.get('course')) || (!params.has('course')?courses[0]:null);
  if(!course)throw Error('이 과목을 선택할 수 없습니다.');
  lesson=course.lessons.find(l=>l.id===params.get('lesson')) || (!params.has('lesson')?course.lessons[0]:null);
  if(!lesson)throw Error('등록된 교안이 없습니다.');
  if(!params.has('course') || !params.has('lesson')){location.replace(location.pathname+'?'+new URLSearchParams({course:course.id,lesson:lesson.id}));return;}
  $('workspace-course').replaceChildren(...courses.map(c=>option(c.id,c.title)));$('workspace-course').value=course.id;
  $('workspace-lesson').replaceChildren(...course.lessons.map(l=>option(l.id,l.title)));$('workspace-lesson').value=lesson.id;
  $('workspace-course').disabled=false;$('workspace-lesson').disabled=false;
  $('workspace-title').textContent=staffView?'교안과 학생 메모':'내 교안과 학습 메모';
  $('workspace-frame').src=staffView?'/instructor/courses/'+encodeURIComponent(course.id)+'/'+encodeURIComponent(lesson.id):'/'+encodeURIComponent(course.id)+'/'+encodeURIComponent(lesson.id);
  $('workspace-frame').hidden=false;$('workspace-status').textContent=course.title+' · '+lesson.title;$('workspace-retry').hidden=true;
  if(staffView){$('student-review').hidden=false;if(course.reviewAllowed)await reviewList(true);else{$('review-status').textContent='관리자가 담당 과목·분반을 지정하면 학생 메모를 열람할 수 있습니다.';$('review-refresh').disabled=true;}}
  else {
   $('student-editor').hidden=false;$('lesson-note').dataset.noteUrl='/api/study/'+encodeURIComponent(course.id)+'/'+encodeURIComponent(lesson.id)+'/note';
   const script=document.createElement('script');script.src='/auth-assets/instructor.js';script.onerror=()=>{$('note-status').textContent='메모 기능을 불러오지 못했습니다. 페이지를 다시 열어 주세요.';};document.body.append(script);
  }
 }catch(error){$('workspace-status').textContent=error.message;}
}
const reviewURL=()=>'/api/teaching/'+encodeURIComponent(course.id)+'/'+encodeURIComponent(lesson.id)+'/student-notes';
$('workspace-frame').addEventListener('load',()=>{
 try {
  const frame=$('workspace-frame');
  frame.contentDocument.addEventListener('click',event=>{
   const link=event.target.closest('a');if(!link)return;
   const target=new URL(link.href),current=new URL(frame.contentWindow.location.href);
   if(target.origin===current.origin && target.pathname===current.pathname && target.hash)return;
   for(const selected of courses){
    const prefix=staffView?'/instructor/courses/'+selected.id+'/':'/'+selected.id+'/';
    const selectedLesson=selected.lessons.find(l=>target.pathname===prefix+l.id);
    if(selectedLesson){event.preventDefault();navigate(selected.id,selectedLesson.id);return;}
    if(target.pathname===prefix || target.pathname===prefix+'index.html'){event.preventDefault();location.assign('/courses.html');return;}
   }
   link.target='_blank';link.rel='noopener';
  });
 }catch{$('workspace-status').textContent='교안 내부 탐색을 연결하지 못했습니다. 상단 선택 메뉴를 이용해 주세요.';}
});
async function reviewList(reset){
 if(listBusy)return;listBusy=true;$('review-refresh').disabled=true;$('review-more').disabled=true;
 try {
  if(reset){readVersion++;$('review-student').replaceChildren(option('','학생 선택'));$('review-text').textContent='';$('review-updated').textContent='';nextPage=null;}
  const data=await api(reviewURL()+(nextPage?'?after='+encodeURIComponent(nextPage):''));
  for(const row of data.rows)$('review-student').append(option(row.id,row.studentNumber+' · '+row.name+' · '+row.sections.map(s=>s?s+'분반':'분반 미지정').join(', ')));
  nextPage=data.next;$('review-more').hidden=!nextPage;$('review-student').disabled=$('review-student').options.length<2;
  $('review-status').textContent=$('review-student').options.length<2?'작성된 학생 메모가 없습니다.':'학생을 선택하면 메모를 읽을 수 있습니다.';
 }catch(error){$('review-status').textContent=error.message;}
 finally{listBusy=false;$('review-refresh').disabled=false;$('review-more').disabled=false;}
}
$('review-student').addEventListener('change',async()=>{
 const token=++readVersion,id=$('review-student').value;$('review-text').textContent='';$('review-updated').textContent='';if(!id)return;
 try{const {note}=await api(reviewURL()+'/'+encodeURIComponent(id));if(token!==readVersion)return;$('review-text').textContent=note.text;$('review-updated').textContent='수정일: '+new Date(note.updatedAt).toLocaleString('ko-KR');}
 catch(error){if(token===readVersion)$('review-status').textContent=error.message;}
});
$('review-refresh').addEventListener('click',()=>reviewList(true));$('review-more').addEventListener('click',()=>reviewList(false));
$('workspace-course').addEventListener('change',()=>{const selected=courses.find(c=>c.id===$('workspace-course').value);if(selected?.lessons.length)navigate(selected.id,selected.lessons[0].id);});
$('workspace-lesson').addEventListener('change',()=>navigate(course.id,$('workspace-lesson').value));$('workspace-retry').addEventListener('click',()=>location.reload());load();
