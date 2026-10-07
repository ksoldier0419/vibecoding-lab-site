const elements=new Map([...document.querySelectorAll('[id]')].map(n=>[n.id,n]));
const $=id=>elements.get(id),staffView=location.pathname==='/teaching.html',params=new URLSearchParams(location.search);
let courses=[],course,lesson,nextPage=null,readVersion=0,listBusy=false;
$('staff-questions').open=false;$('staff-questions').hidden=true;
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
  $('workspace-course').disabled=false;$('workspace-lesson').disabled=false;$('workspace-course').title=course.title;$('workspace-lesson').title=lesson.title;
  $('quiz-entry').href=(staffView?'/quiz-studio.html':'/concept-quiz.html')+'?'+new URLSearchParams({course:course.id,lesson:lesson.id});$('quiz-entry').textContent=staffView?'문제 출제·통계':'개념 확인 문제';
  if(!staffView){const invite=document.createElement('script');invite.src='/auth-assets/quiz-invite.js';document.body.append(invite);}
  $('workspace-frame').src=staffView?'/instructor/courses/'+encodeURIComponent(course.id)+'/'+encodeURIComponent(lesson.id):'/'+encodeURIComponent(course.id)+'/'+encodeURIComponent(lesson.id);
  $('workspace-frame').hidden=false;$('workspace-status').textContent='';$('workspace-retry').hidden=true;
  questionsReady=!staffView || course.reviewAllowed;
  $('question-form').hidden=staffView;$('question-text').disabled=!questionsReady;$('question-submit').disabled=!questionsReady;$('questions-refresh').disabled=!questionsReady;
  if(questionsReady)await loadQuestions(true);else $('questions-status').textContent='관리자가 담당 과목·분반을 지정하면 질문을 열람하고 답변할 수 있습니다.';
  showPanel(!staffView && params.get('panel')==='questions');
  if(staffView){$('noti-launcher').hidden=true;$('student-review').hidden=false;if(course.reviewAllowed)await reviewList(true);else{$('review-status').textContent='관리자가 담당 과목·분반을 지정하면 학생 메모를 열람할 수 있습니다.';$('review-refresh').disabled=true;}}
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
  const heading=doc.querySelector('.lesson h1,.lesson h2')||doc.querySelector('h1');if(heading)document.documentElement.style.setProperty('--noti-title-color',frame.contentWindow.getComputedStyle(heading).color);
  if(toc){toc.classList.add('workspace-toc');const style=doc.createElement('link');style.rel='stylesheet';style.href=document.querySelector('link[href*="teaching-workspace.css"]').href;doc.head.append(style);toc.prepend($('workspace-selectors'));}
  const header=doc.querySelector('.site-header');if(header){header.classList.add('workspace-lesson-header');const actions=doc.createElement('div');actions.className='workspace-title-actions';header.append(actions);actions.append($('tools-toggle'));$('tools-toggle').hidden=false;}
  const noteBox=doc.querySelector('.instructor-notes');if(noteBox)noteBox.previousElementSibling?.remove();
  if(!staffView)connectSelectionQuestion(doc);
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
function connectSelectionQuestion(doc){
 const menu=doc.createElement('button');menu.type='button';menu.textContent='Noti에게 질문하기';menu.hidden=true;menu.setAttribute('aria-label','선택한 교안 내용으로 Noti에게 질문하기');
 Object.assign(menu.style,{position:'fixed',zIndex:'1000',padding:'10px 14px',border:'1px solid #d6e0ed',borderRadius:'8px',background:'#fff',color:'#172b4d',boxShadow:'0 4px 20px #172b4d33',font:'14px sans-serif',cursor:'pointer'});doc.body.append(menu);
 let excerpt='';
 function dismiss(){menu.hidden=true;}
 doc.addEventListener('contextmenu',event=>{
  if(event.target.closest('input,textarea,select,[contenteditable],.workspace-selectors'))return;
  const selection=doc.getSelection();if(!selection || selection.isCollapsed || !selection.toString().trim()){dismiss();return;}
  excerpt=selection.toString().trim();event.preventDefault();menu.hidden=false;
  menu.style.left=Math.max(8,Math.min(event.clientX,doc.defaultView.innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(event.clientY,doc.defaultView.innerHeight-menu.offsetHeight-8))+'px';menu.focus();
 });
 menu.addEventListener('click',()=>{
  dismiss();showPanel(true);const input=$('chat-text');
  if(input.disabled || input.readOnly){$('chat-status').textContent='Noti 연결 또는 답변이 끝난 뒤 선택한 내용으로 다시 질문해 주세요.';return;}
  const addition='[교안에서 선택한 내용]\n'+excerpt+'\n\n이 부분을 설명해 주세요.';
  const draft=input.value.trim();const combined=(draft?draft+'\n\n':'')+addition;
  if(combined.length>input.maxLength){$('chat-status').textContent='선택한 내용과 작성 중인 질문이 너무 깁니다. 선택 범위를 줄여 다시 시도해 주세요.';input.focus();return;}
  input.value=combined;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();input.setSelectionRange(input.value.length,input.value.length);$('chat-status').textContent='선택한 내용을 넣었습니다. 질문을 수정한 뒤 보내기를 누르세요.';
 });
 doc.addEventListener('pointerdown',event=>{if(event.target!==menu)dismiss();});doc.addEventListener('keydown',event=>{if(event.key==='Escape')dismiss();});doc.addEventListener('scroll',dismiss,true);window.addEventListener('pointerdown',dismiss);window.addEventListener('resize',dismiss);
}
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
 if(question && notiPosition)placeNoti(notiPosition.x,notiPosition.y);
 $('noti-launcher').setAttribute('aria-expanded',String(question));
 for(const [id,active] of [['tab-notes',!question],['tab-questions',question]]){$(id).setAttribute('aria-selected',String(active));$(id).tabIndex=active?0:-1;}
}
$('noti-launcher').addEventListener('click',event=>{if(event.detail && performance.now()<notiSuppressClickUntil)return;const opening=$('questions-panel').hidden;showPanel(opening);if(opening)$('noti-close').focus();});
$('noti-close').addEventListener('click',()=>{showPanel(false);$('noti-launcher').focus();});
document.addEventListener('keydown',event=>{if(event.key==='Escape' && !$('questions-panel').hidden){event.preventDefault();$('noti-small').click();}});
// Keep the window and mascot together, including after viewport changes.
const notiHeader=$('questions-panel').querySelector('.noti-chat-header'),notiImage=$('noti-launcher').querySelector('img');
let notiPosition=null,notiDrag=null,dizzyTimer,lastNotiShake=-Infinity,notiSuppressClickUntil=0;
let notiChatActive=false,notiReaction=false;
function updateNotiActivity(){
 const src=notiChatActive?'/auth-assets/noti-chat.gif':'/auth-assets/noti.gif';

 if(!notiReaction && notiImage.getAttribute('src')!==src)notiImage.src=src;
}
window.setNotiChatActive=active=>{notiChatActive=active;updateNotiActivity();};
function placeNoti(x,y){
 const panel=$('questions-panel'),icon=$('noti-launcher'),wasHidden=panel.hidden;
 if(wasHidden)panel.hidden=false;
 const panelRect=panel.getBoundingClientRect(),width=panelRect.width,height=panelRect.height,iconRect=icon.getBoundingClientRect();
 if(wasHidden)panel.hidden=true;
 if(wasHidden){
  const iconX=Math.max(8,Math.min(x+width-iconRect.width,innerWidth-iconRect.width-8)),iconY=Math.max(8,Math.min(y+height+8,innerHeight-iconRect.height-8));
  x=iconX-width+iconRect.width;y=iconY-height-8;
 }else{x=Math.max(8,Math.min(x,innerWidth-width-8));y=Math.max(8,Math.min(y,innerHeight-height-iconRect.height-16));}
 Object.assign(panel.style,{left:x+'px',top:y+'px',right:'auto',bottom:'auto'});
 Object.assign(icon.style,{left:(x+width-iconRect.width)+'px',top:(y+height+8)+'px',right:'auto',bottom:'auto'});
 notiPosition={x,y};
}
function dizzyNoti(){
 const now=performance.now(),throwing=now-lastNotiShake<1800;lastNotiShake=throwing?-Infinity:now;
 clearTimeout(dizzyTimer);notiReaction=true;notiImage.src=throwing?'/auth-assets/noti-throw.gif':'/auth-assets/noti-dizzy.gif';$('noti-launcher').querySelector('span').textContent=throwing?'에잇!':'어질어질…';
 dizzyTimer=setTimeout(()=>{notiReaction=false;updateNotiActivity();$('noti-launcher').querySelector('span').textContent='질의응답';},2500);
}
for(const handle of [notiHeader,$('noti-launcher')]){
handle.addEventListener('pointerdown',event=>{
 if($('questions-panel').classList.contains('noti-full') && handle===notiHeader)return;
 if(event.button!==0 || (handle===notiHeader && event.target.closest('button')))return;
 if(handle===$('noti-launcher'))notiSuppressClickUntil=0;
 const wasHidden=$('questions-panel').hidden;if(wasHidden)$('questions-panel').hidden=false;
 const rect=$('questions-panel').getBoundingClientRect();
 if(wasHidden)$('questions-panel').hidden=true;
 notiDrag={id:event.pointerId,handle,moved:false,startX:event.clientX,startY:event.clientY,x:rect.left,y:rect.top,lastX:event.clientX,direction:0,turns:0,lastTurn:performance.now()};
 handle.setPointerCapture(event.pointerId);if(handle===notiHeader)event.preventDefault();
});
handle.addEventListener('pointermove',event=>{
 if(!notiDrag || notiDrag.id!==event.pointerId)return;
 if(!notiDrag.moved && Math.hypot(event.clientX-notiDrag.startX,event.clientY-notiDrag.startY)<6)return;
 notiDrag.moved=true;
 placeNoti(notiDrag.x+event.clientX-notiDrag.startX,notiDrag.y+event.clientY-notiDrag.startY);
 const dx=event.clientX-notiDrag.lastX;
 if(Math.abs(dx)>=12){
  const direction=Math.sign(dx),now=performance.now();
  if(notiDrag.direction && direction!==notiDrag.direction){notiDrag.turns=now-notiDrag.lastTurn<450?notiDrag.turns+1:1;notiDrag.lastTurn=now;if(notiDrag.turns>=3){dizzyNoti();notiDrag.turns=0;}}
  notiDrag.direction=direction;notiDrag.lastX=event.clientX;
 }
});
function endNotiDrag(event){if(notiDrag?.id===event.pointerId){if(notiDrag.moved && notiDrag.handle===$('noti-launcher'))notiSuppressClickUntil=performance.now()+400;notiDrag=null;}}
handle.addEventListener('pointerup',endNotiDrag);handle.addEventListener('pointercancel',endNotiDrag);handle.addEventListener('lostpointercapture',endNotiDrag);
}
function setTools(open){$('workspace-tools').hidden=!open;document.querySelector('.workspace-layout').classList.toggle('tools-collapsed',!open);$('tools-toggle').setAttribute('aria-expanded',String(open));$('tools-toggle').textContent=open?'학습 메모 접기':'학습 메모 열기';}
window.openStaffQuestions=function(){return false;};
$('tools-toggle').addEventListener('click',()=>setTools($('workspace-tools').hidden));
let normalNoti=null;
function exitNotiFull(){const panel=$('questions-panel');if(!panel.classList.contains('noti-full'))return;panel.classList.remove('noti-full');$('noti-full').textContent='전체보기';$('noti-full').setAttribute('aria-pressed','false');if(normalNoti){panel.style.width=normalNoti.width+'px';panel.style.height=normalNoti.height+'px';placeNoti(normalNoti.x,normalNoti.y);}}
$('noti-full').addEventListener('click',()=>{const panel=$('questions-panel');if(panel.classList.contains('noti-full')){exitNotiFull();return;}const rect=panel.getBoundingClientRect();normalNoti={x:rect.x,y:rect.y,width:rect.width,height:rect.height};panel.classList.add('noti-full');$('noti-full').textContent='이전 크기';$('noti-full').setAttribute('aria-pressed','true');});
$('noti-small').addEventListener('click',()=>{exitNotiFull();showPanel(false);$('noti-launcher').focus();});
let sizeStart=null;
function sizeNoti(width,height){exitNotiFull();const panel=$('questions-panel'),rect=panel.getBoundingClientRect();panel.style.width=Math.max(Math.min(320,innerWidth-28),Math.min(width,innerWidth-28))+'px';panel.style.height=Math.max(Math.min(300,innerHeight-145),Math.min(height,innerHeight-145))+'px';placeNoti(rect.x,rect.y);}
for(const [handleId,left,top] of [['noti-size',false,false],['noti-size-bl',true,false],['noti-size-tr',false,true]]){
 const cornerHandle=$(handleId);
 function resizeCorner(rect,dx,dy){
  sizeNoti(rect.width+(left?-dx:dx),rect.height+(top?-dy:dy));
  const resized=$('questions-panel').getBoundingClientRect();
  placeNoti(left?rect.x+rect.width-resized.width:rect.x,top?rect.y+rect.height-resized.height:rect.y);
 }
 cornerHandle.addEventListener('pointerdown',event=>{if(event.button!==0)return;sizeStart={id:event.pointerId,handle:cornerHandle,x:event.clientX,y:event.clientY,rect:$('questions-panel').getBoundingClientRect()};cornerHandle.setPointerCapture(event.pointerId);event.preventDefault();});
 cornerHandle.addEventListener('pointermove',event=>{if(sizeStart?.handle===cornerHandle && sizeStart.id===event.pointerId)resizeCorner(sizeStart.rect,event.clientX-sizeStart.x,event.clientY-sizeStart.y);});
 for(const name of ['pointerup','pointercancel','lostpointercapture'])cornerHandle.addEventListener(name,()=>{if(sizeStart?.handle===cornerHandle)sizeStart=null;});
 cornerHandle.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();resizeCorner($('questions-panel').getBoundingClientRect(),event.key==='ArrowRight'?40:event.key==='ArrowLeft'?-40:0,event.key==='ArrowDown'?40:event.key==='ArrowUp'?-40:0);}});
}
let resizeStart=null;
const resizeHandle=$('noti-resize');
function resizeNoti(width){exitNotiFull();const panel=$('questions-panel'),rect=panel.getBoundingClientRect();panel.style.width=Math.max(Math.min(320,innerWidth-28),Math.min(width,innerWidth-28))+'px';placeNoti(rect.right-panel.getBoundingClientRect().width,rect.top);}
resizeHandle.addEventListener('pointerdown',event=>{if(event.button!==0)return;resizeStart={id:event.pointerId,x:event.clientX,width:$('questions-panel').getBoundingClientRect().width};resizeHandle.setPointerCapture(event.pointerId);event.preventDefault();});
resizeHandle.addEventListener('pointermove',event=>{if(resizeStart?.id===event.pointerId)resizeNoti(resizeStart.width-event.clientX+resizeStart.x);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])resizeHandle.addEventListener(name,()=>{resizeStart=null;});
resizeHandle.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();resizeNoti($('questions-panel').getBoundingClientRect().width+(event.key==='ArrowRight'?40:-40));}});
window.addEventListener('resize',()=>{if($('questions-panel').classList.contains('noti-full'))return;if($('questions-panel').style.height)sizeNoti(parseFloat($('questions-panel').style.width)||430,parseFloat($('questions-panel').style.height));if($('questions-panel').style.width)resizeNoti(parseFloat($('questions-panel').style.width));if(notiPosition)placeNoti(notiPosition.x,notiPosition.y);});
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
