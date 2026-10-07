const elements=new Map([...document.querySelectorAll('[id]')].map(n=>[n.id,n]));
const $=id=>elements.get(id),staffView=location.pathname==='/teaching.html',params=new URLSearchParams(location.search);
let courses=[],course,lesson,nextPage=null,readVersion=0,listBusy=false;
function option(value,text){const node=document.createElement('option');node.value=value;node.textContent=text;return node;}
async function api(url){const response=await fetch(url,{cache:'no-store'});const data=await response.json();if(response.status===401)throw Error('로그인이 만료되었습니다. 로그인 새 창에서 다시 로그인해 주세요.');if(!response.ok)throw Error(data.error || '불러오지 못했습니다.');return data;}
function navigate(folder,page){$('workspace-course').value=course.id;$('workspace-lesson').value=lesson.id;location.assign(location.pathname+'?'+new URLSearchParams({course:folder,lesson:page,panel:$('questions-panel').hidden?'notes':'questions'}));}
async function load(){
 try {
  const data=await api('/api/teaching/catalog'+(staffView?'?view=staff':''));courses=data.courses;
  if(!courses.length)throw Error('선택할 수 있는 교안이 없습니다.');
  course=courses.find(c=>c.id===params.get('course')) || (!params.has('course')?courses[0]:null);
  if(!course)throw Error('이 과목을 선택할 수 없습니다.');
  lesson=course.lessons.find(l=>l.id===params.get('lesson')) || (!params.has('lesson')?course.lessons[0]:null);
  if(!lesson)throw Error('등록된 교안이 없습니다.');
  if(!params.has('course') || !params.has('lesson')){location.replace(location.pathname+'?'+new URLSearchParams({course:course.id,lesson:lesson.id,panel:params.get('panel')==='questions'?'questions':'notes'}));return;}
  $('workspace-course').replaceChildren(...courses.map(c=>option(c.id,c.title)));$('workspace-course').value=course.id;
  $('workspace-lesson').replaceChildren(...course.lessons.map(l=>option(l.id,l.title)));$('workspace-lesson').value=lesson.id;
  $('workspace-course').disabled=false;$('workspace-lesson').disabled=false;
  $('workspace-frame').src=staffView?'/instructor/courses/'+encodeURIComponent(course.id)+'/'+encodeURIComponent(lesson.id):'/'+encodeURIComponent(course.id)+'/'+encodeURIComponent(lesson.id);
  $('workspace-frame').hidden=false;$('workspace-status').textContent='';$('workspace-retry').hidden=true;
  questionsReady=!staffView || course.reviewAllowed;
  $('question-form').hidden=staffView;$('question-text').disabled=!questionsReady;$('question-submit').disabled=!questionsReady;$('questions-refresh').disabled=!questionsReady;
  if(questionsReady)await loadQuestions(true);else $('questions-status').textContent='관리자가 담당 과목·분반을 지정하면 질문을 열람하고 답변할 수 있습니다.';
  showPanel(params.get('panel')==='questions');
  if(staffView){$('student-review').hidden=false;if(course.reviewAllowed)await reviewList(true);else{$('review-status').textContent='관리자가 담당 과목·분반을 지정하면 학생 메모를 열람할 수 있습니다.';$('review-refresh').disabled=true;}}
  else {
   const chatScript=document.createElement('script');chatScript.src='/auth-assets/lesson-chat.js';chatScript.onerror=()=>{$('chat-status').textContent='AI 채팅을 불러오지 못했습니다. 페이지를 다시 열어 주세요.';};document.body.append(chatScript);
   $('student-editor').hidden=false;$('lesson-note').dataset.noteUrl='/api/study/'+encodeURIComponent(course.id)+'/'+encodeURIComponent(lesson.id)+'/note';
   const script=document.createElement('script');script.src='/auth-assets/instructor.js';script.onerror=()=>{$('note-status').textContent='메모 기능을 불러오지 못했습니다. 페이지를 다시 열어 주세요.';};document.body.append(script);
  }
 }catch(error){$('workspace-status').textContent=error.message;}
}
const reviewURL=()=>'/api/teaching/'+encodeURIComponent(course.id)+'/'+encodeURIComponent(lesson.id)+'/student-notes';
$('workspace-frame').addEventListener('load',()=>{
 try {
  const frame=$('workspace-frame');
  const doc=frame.contentDocument,toc=doc.querySelector('.toc');
  if(toc){const style=doc.createElement('link');style.rel='stylesheet';style.href='/auth-assets/teaching-workspace.css';doc.head.append(style);toc.prepend($('workspace-selectors'));}
  const noteBox=doc.querySelector('.instructor-notes');if(noteBox)noteBox.previousElementSibling?.remove();
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
 }catch{$('workspace-status').textContent='교안 내부 탐색을 연결하지 못했습니다. 과목·교안 선택 메뉴를 이용해 주세요.';}
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
$('workspace-lesson').addEventListener('change',()=>navigate(course.id,$('workspace-lesson').value));$('workspace-retry').addEventListener('click',()=>location.reload());
let questionsReady=false,questions=[],questionNext=null,questionBusy=false,selectedQuestion=null,answerBaseline='';
const questionURL=()=>'/api/'+(staffView?'teaching':'study')+'/'+encodeURIComponent(course.id)+'/'+encodeURIComponent(lesson.id)+'/questions';
function hasQuestionDraft(){return Boolean($('question-text').value.trim() || (selectedQuestion && $('answer-text').value!==answerBaseline));}
window.addEventListener('beforeunload',event=>{if(hasQuestionDraft()){event.preventDefault();event.returnValue='';}});
function showPanel(question){
 $('notes-panel').hidden=false;$('questions-panel').hidden=!question;
 $('noti-launcher').setAttribute('aria-expanded',String(question));
 for(const [id,active] of [['tab-notes',!question],['tab-questions',question]]){$(id).setAttribute('aria-selected',String(active));$(id).tabIndex=active?0:-1;}
}
$('noti-launcher').addEventListener('click',()=>{const opening=$('questions-panel').hidden;showPanel(opening);if(opening)$('noti-close').focus();});
$('noti-close').addEventListener('click',()=>{showPanel(false);$('noti-launcher').focus();});
document.addEventListener('keydown',event=>{if(event.key==='Escape' && !$('questions-panel').hidden){showPanel(false);$('noti-launcher').focus();}});
// Keep the window and mascot together, including after viewport changes.
const notiHeader=$('questions-panel').querySelector('.noti-chat-header'),notiImage=$('noti-launcher').querySelector('img');
let notiPosition=null,notiDrag=null,dizzyTimer;
function placeNoti(x,y){
 const panel=$('questions-panel'),icon=$('noti-launcher'),wasHidden=panel.hidden;
 if(wasHidden)panel.hidden=false;
 const panelRect=panel.getBoundingClientRect(),width=panelRect.width,height=panelRect.height,iconRect=icon.getBoundingClientRect();
 if(wasHidden)panel.hidden=true;
 x=Math.max(8,Math.min(x,innerWidth-width-8));y=Math.max(8,Math.min(y,innerHeight-height-iconRect.height-16));
 Object.assign(panel.style,{left:x+'px',top:y+'px',right:'auto',bottom:'auto'});
 Object.assign(icon.style,{left:(x+width-iconRect.width)+'px',top:(y+height+8)+'px',right:'auto',bottom:'auto'});
 notiPosition={x,y};
}
function dizzyNoti(){
 clearTimeout(dizzyTimer);notiImage.src='/auth-assets/noti-dizzy.gif';$('noti-launcher').querySelector('span').textContent='어질어질…';
 dizzyTimer=setTimeout(()=>{notiImage.src='/auth-assets/noti.gif';$('noti-launcher').querySelector('span').textContent='질의응답';},2500);
}
notiHeader.addEventListener('pointerdown',event=>{
 if(event.button!==0 || event.target.closest('button'))return;
 const rect=$('questions-panel').getBoundingClientRect();
 notiDrag={id:event.pointerId,startX:event.clientX,startY:event.clientY,x:rect.left,y:rect.top,lastX:event.clientX,direction:0,turns:0,lastTurn:performance.now()};
 notiHeader.setPointerCapture(event.pointerId);event.preventDefault();
});
notiHeader.addEventListener('pointermove',event=>{
 if(!notiDrag || notiDrag.id!==event.pointerId)return;
 placeNoti(notiDrag.x+event.clientX-notiDrag.startX,notiDrag.y+event.clientY-notiDrag.startY);
 const dx=event.clientX-notiDrag.lastX;
 if(Math.abs(dx)>=12){
  const direction=Math.sign(dx),now=performance.now();
  if(notiDrag.direction && direction!==notiDrag.direction){notiDrag.turns=now-notiDrag.lastTurn<450?notiDrag.turns+1:1;notiDrag.lastTurn=now;if(notiDrag.turns>=3){dizzyNoti();notiDrag.turns=0;}}
  notiDrag.direction=direction;notiDrag.lastX=event.clientX;
 }
});
function endNotiDrag(event){if(notiDrag?.id===event.pointerId)notiDrag=null;}
notiHeader.addEventListener('pointerup',endNotiDrag);notiHeader.addEventListener('pointercancel',endNotiDrag);notiHeader.addEventListener('lostpointercapture',endNotiDrag);
window.addEventListener('resize',()=>{if(notiPosition)placeNoti(notiPosition.x,notiPosition.y);});
$('tab-notes').addEventListener('click',()=>showPanel(false));$('tab-questions').addEventListener('click',()=>showPanel(true));
for(const id of ['tab-notes','tab-questions'])$(id).addEventListener('keydown',event=>{
 if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const question=event.key==='End' || (event.key!=='Home' && $('questions-panel').hidden);showPanel(question);$(question?'tab-questions':'tab-notes').focus();}
});
function questionDetail(row){
 selectedQuestion=row;$('question-detail').hidden=!row;$('answer-form').hidden=!staffView || !row;
 if(!row){$('answer-text').value='';answerBaseline='';return;}
 $('question-author').textContent=staffView?row.studentNumber+' · '+row.name:'내 질문';
 $('question-date').textContent='등록: '+new Date(row.createdAt).toLocaleString('ko-KR');
 $('question-body').textContent=row.question;$('question-answer').textContent=row.answer || '아직 답변이 없습니다.';
 $('answer-text').value=row.answer;answerBaseline=row.answer;
}
async function loadQuestions(reset){
 if(!questionsReady || questionBusy)return;questionBusy=true;$('questions-refresh').disabled=true;$('questions-more').disabled=true;
 $('questions-select').disabled=true;$('answer-text').readOnly=true;$('answer-submit').disabled=true;
 try{
  if(reset && selectedQuestion && $('answer-text').value!==answerBaseline && !window.confirm('저장하지 않은 답변을 버리고 목록을 다시 불러올까요?'))return;
  const data=await api(questionURL()+(!reset && questionNext?'?after='+encodeURIComponent(questionNext):''));
  if(reset){questions=[];questionDetail(null);$('questions-select').replaceChildren(option('','질문 선택'));}
  questions.push(...data.rows);for(const row of data.rows)$('questions-select').append(option(row.id,(row.answer?'답변 완료 · ':'답변 대기 · ')+(staffView?row.name+' · ':'')+row.question.slice(0,50)));
  questionNext=data.next;$('questions-more').hidden=!questionNext;$('questions-select').disabled=!questions.length;
  $('questions-status').textContent=questions.length?'질문을 선택하면 질문과 답변을 볼 수 있습니다.':'등록된 질문이 없습니다.';
 }catch(e){$('questions-status').textContent=e.message;}
 finally{questionBusy=false;$('questions-refresh').disabled=false;$('questions-more').disabled=false;$('questions-select').disabled=!questions.length;$('answer-text').readOnly=false;$('answer-submit').disabled=false;}
}
$('questions-select').addEventListener('change',()=>{
 if(selectedQuestion && $('answer-text').value!==answerBaseline && !window.confirm('저장하지 않은 답변을 버리고 다른 질문을 열까요?')){$('questions-select').value=selectedQuestion.id;return;}
 questionDetail(questions.find(q=>q.id===$('questions-select').value)||null);
});
$('questions-refresh').addEventListener('click',()=>loadQuestions(true));$('questions-more').addEventListener('click',()=>loadQuestions(false));
async function postQuestion(url,body){const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json();if(!res.ok)throw Error(res.status===401?'로그인이 만료되었습니다. 로그인 새 창에서 다시 로그인해 주세요.':data.error || '저장하지 못했습니다.');return data;}
$('question-form').addEventListener('submit',async event=>{
 event.preventDefault();if($('question-submit').disabled)return;$('question-submit').disabled=true;$('question-text').readOnly=true;
 try{await postQuestion(questionURL(),{question:$('question-text').value});$('question-text').value='';await loadQuestions(true);$('questions-status').textContent='질문을 등록했습니다.';}
 catch(e){$('questions-status').textContent=e.message;}
 finally{$('question-submit').disabled=false;$('question-text').readOnly=false;}
});
$('answer-form').addEventListener('submit',async event=>{
 event.preventDefault();if(!selectedQuestion || $('answer-submit').disabled)return;
 const current=selectedQuestion;const value=$('answer-text').value;$('answer-submit').disabled=true;$('answer-text').readOnly=true;$('questions-select').disabled=true;$('questions-refresh').disabled=true;$('questions-more').disabled=true;
 try{const data=await postQuestion(questionURL()+'/'+encodeURIComponent(current.id)+'/answer',{answer:value,version:current.version});Object.assign(current,data.question);questionDetail(current);const item=[...$('questions-select').options].find(o=>o.value===current.id);if(item)item.textContent=(current.answer?'답변 완료 · ':'답변 대기 · ')+current.name+' · '+current.question.slice(0,50);$('questions-status').textContent='답변을 저장했습니다.';}
 catch(e){$('questions-status').textContent=e.message;}
 finally{$('answer-submit').disabled=false;$('answer-text').readOnly=false;$('questions-select').disabled=false;$('questions-refresh').disabled=false;$('questions-more').disabled=false;}
});
load();
