(()=>{
 const get=id=>document.getElementById(id),params=new URLSearchParams(location.search);
 const staffView=location.pathname==='/teaching.html';
 const url=(staffView?'/api/teaching/':'/api/study/')+encodeURIComponent(params.get('course'))+'/'+encodeURIComponent(params.get('lesson'))+'/chat';
 let chat={messages:[],version:0},loaded=false,available=false,busy=false,pending=null;
 let activityTimer,replying=false,suggestionDismissedAt=0;
 function chatActivity(){clearTimeout(activityTimer);window.setNotiChatActive(true);if(!replying)activityTimer=setTimeout(()=>window.setNotiChatActive(false),2500);}
 get('ai-chat').hidden=false;
 function status(text){get('chat-status').textContent=text;}
 function controls(){get('chat-text').disabled=!loaded || !available;get('chat-text').readOnly=busy;get('chat-send').disabled=!loaded || !available || busy;get('chat-reset').disabled=!loaded || !chat.messages.length || busy;get('chat-reload').disabled=busy;get('chat-forward').disabled=!loaded || !chat.messages.length || busy;}

 function messageBubble(message){
  const item=document.createElement('article'),label=document.createElement('span'),bubble=document.createElement('div');item.className='chat-message '+message.role;label.className='chat-speaker';label.textContent=message.role==='user'?'나':'Noti';bubble.className='chat-bubble';
  if(message.role==='user'){bubble.textContent=message.content;}else{
   window.ChatMarkdown.render(bubble,message.content,window.ChatMarkdown.highlightCode);
  }
  item.append(label,bubble);return item;
 }
 function render(waiting){
  get('chat-messages').replaceChildren();
  if(!chat.messages.length && !waiting){const empty=document.createElement('p');empty.className='chat-empty';empty.textContent='궁금한 내용을 물어보세요.\n선택한 교안을 함께 살펴볼게요.';get('chat-messages').append(empty);}
  for(const message of chat.messages)get('chat-messages').append(messageBubble(message));
  if(waiting){get('chat-messages').append(messageBubble({role:'user',content:waiting}));const reply=messageBubble({role:'assistant',content:'답변을 생각하고 있어요…'});reply.classList.add('chat-waiting');get('chat-messages').append(reply);}
  const rounds=chat.messages.filter(m=>m.role==='user').length;get('chat-suggestion').hidden=staffView || rounds<5 || rounds<suggestionDismissedAt+5;
  get('chat-messages').scrollTop=get('chat-messages').scrollHeight;
 }
 async function api(body,suffix=''){const response=await fetch(url+suffix,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(response.status===401?'로그인이 만료되었습니다. 로그인 새 창에서 다시 로그인한 뒤 시도하세요.':data.error||'AI 대화를 처리하지 못했습니다.');return data;}
 async function load(){if(busy)return;busy=true;controls();status('AI 대화를 불러오는 중…');try{const data=await api();chat=data.chat;available=data.available;loaded=true;pending=null;render();status(available?'':'AI 연결 설정이 필요합니다. 관리자에게 문의해 주세요.');}catch(e){status(e.message);}finally{busy=false;controls();}}
 get('chat-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy || !loaded || !available)return;const text=get('chat-text').value.trim();if(!text)return;
  if(!pending || pending.text!==text || pending.version!==chat.version)pending={text,version:chat.version,requestId:crypto.randomUUID()};
  busy=true;replying=true;chatActivity();controls();render(text);status('답변을 기다리는 중…');
  try{const data=await api(pending);chat=data.chat;pending=null;get('chat-text').value='';resizeInput();render();status('AI 답변을 저장했습니다. 참고한 교안 내용도 확인해 주세요.');}catch(e){render();status(e.message);}finally{busy=false;replying=false;chatActivity();controls();if(available)get('chat-text').focus();}
 });
 function resizeInput(){const input=get('chat-text');input.style.height='auto';input.style.height=Math.min(input.scrollHeight,120)+'px';}
 get('chat-text').addEventListener('input',()=>{resizeInput();chatActivity();});
 get('chat-text').addEventListener('keydown',event=>{if(event.key==='Enter' && !event.shiftKey && !event.isComposing && event.keyCode!==229){event.preventDefault();if(!busy && available)get('chat-form').requestSubmit();}});
 const selectionTools=document.createElement('div');selectionTools.id='chat-selection-actions';selectionTools.hidden=true;selectionTools.setAttribute('role','group');selectionTools.setAttribute('aria-label','선택한 채팅 내용 사용');
 const selectionLabel=document.createElement('span');selectionLabel.textContent='선택한 내용';
 const followButton=document.createElement('button');followButton.type='button';followButton.id='chat-selection-question';followButton.textContent='추가 질문';
 const noteButton=document.createElement('button');noteButton.type='button';noteButton.id='chat-selection-note';noteButton.textContent='메모에 추가';
 selectionTools.append(selectionLabel,followButton,noteButton);get('chat-messages').after(selectionTools);
 let excerpt='';
 function captureSelection(){
  const selection=document.getSelection();if(!selection || selection.isCollapsed)return false;
  const range=selection.getRangeAt(0),container=get('chat-messages');
  const element=n=>n.nodeType===Node.ELEMENT_NODE?n:n.parentElement;
  if(!container.contains(range.startContainer) || !container.contains(range.endContainer) || !element(range.startContainer)?.closest('.chat-bubble') || !element(range.endContainer)?.closest('.chat-bubble'))return false;
  const text=selection.toString().trim();if(!text)return false;excerpt=text;selectionTools.hidden=false;selectionLabel.textContent='선택한 내용 '+text.length+'자';return true;
 }
 document.addEventListener('selectionchange',()=>{if(!captureSelection() && !selectionTools.contains(document.activeElement))selectionTools.hidden=true;});
 selectionTools.addEventListener('pointerdown',event=>{if(event.target.closest('button'))event.preventDefault();});
 get('chat-messages').addEventListener('contextmenu',event=>{if(captureSelection())event.preventDefault();});
 followButton.addEventListener('click',()=>{
  const input=get('chat-text');if(input.disabled || input.readOnly){status('AI 연결 또는 답변이 끝난 뒤 다시 추가해 주세요.');return;}
  const addition='[선택한 채팅 내용]\n'+excerpt+'\n\n이 부분을 더 자세히 설명해 주세요.';
  const combined=(input.value.trim()?input.value+'\n\n':'')+addition;
  if(combined.length>input.maxLength){status('선택한 내용과 질문이 너무 깁니다. 선택 범위를 줄여 주세요.');return;}
  input.value=combined;resizeInput();input.focus();selectionTools.hidden=true;status('질문 초안에 추가했습니다. 내용을 수정한 뒤 보내기를 누르세요.');
 });
 noteButton.addEventListener('click',()=>{
  if(typeof window.appendLessonNote!=='function'){status('내 학습 메모를 불러온 뒤 다시 추가해 주세요.');return;}
  const result=window.appendLessonNote('[Noti 대화에서 선택한 내용]\n'+excerpt);
  if(!result.ok){status(result.message);return;}
  window.openLessonNotes();
  selectionTools.hidden=true;status('기존 메모 뒤에 추가했습니다. 메모 영역에서 저장 상태를 확인해 주세요.');
 });

 get('chat-reload').addEventListener('click',load);
 get('chat-reset').addEventListener('click',async()=>{if(busy || !loaded || !confirm(staffView?'이 교안의 본인 AI 대화 기록을 지우고 새 대화를 시작할까요?':'이 교안의 기존 AI 대화 기록을 지우고 새 대화를 시작할까요? 교수자에게 등록한 질문은 유지됩니다.'))return;busy=true;controls();try{chat=(await api({version:chat.version},'/reset')).chat;pending=null;suggestionDismissedAt=0;render();status('새 대화를 시작했습니다.');}catch(e){status(e.message);}finally{busy=false;controls();}});
 get('chat-keep').addEventListener('click',()=>{suggestionDismissedAt=chat.messages.filter(m=>m.role==='user').length;get('chat-suggestion').hidden=true;});
 get('chat-forward').addEventListener('click',()=>{
  const target=get('question-text');if(target.value.trim() && !confirm('작성 중인 담당자 질문을 AI 대화 일부로 바꿀까요?'))return;
  target.value='AI 답변으로 해결되지 않아 질문합니다.\n\n[질문할 내용]\n아래 내용을 확인하고 질문을 구체적으로 적어 주세요.\n\n[AI 대화 일부]\n'+chat.messages.slice(-4).map(m=>(m.role==='user'?'학생':'AI')+': '+m.content.slice(0,2000)).join('\n\n');
  window.openStaffQuestions();target.focus();target.scrollIntoView({block:'center'});get('questions-status').textContent='전달할 질문과 대화 내용을 확인·수정한 뒤 질문 등록을 누르세요. 아직 전송하지 않았습니다.';
 });
 window.addEventListener('beforeunload',event=>{if(busy || get('chat-text').value.trim()){event.preventDefault();event.returnValue='';}});
 load();
})();
