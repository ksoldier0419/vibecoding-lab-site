(()=>{
 const get=id=>document.getElementById(id),params=new URLSearchParams(location.search);
 const url='/api/study/'+encodeURIComponent(params.get('course'))+'/'+encodeURIComponent(params.get('lesson'))+'/chat';
 let chat={messages:[],version:0},loaded=false,available=false,busy=false,pending=null;
 get('ai-chat').hidden=false;
 function status(text){get('chat-status').textContent=text;}
 function controls(){get('chat-text').disabled=!loaded || !available;get('chat-text').readOnly=busy;get('chat-send').disabled=!loaded || !available || busy;get('chat-reset').disabled=!loaded || !chat.messages.length || busy;get('chat-reload').disabled=busy;get('chat-forward').disabled=!loaded || !chat.messages.length || busy;}
 function render(){get('chat-messages').replaceChildren();for(const message of chat.messages){const item=document.createElement('article'),label=document.createElement('strong'),text=document.createElement('pre');item.className='chat-message '+message.role;label.textContent=message.role==='user'?'나':'AI 답변';text.textContent=message.content;item.append(label,text);get('chat-messages').append(item);}get('chat-messages').scrollTop=get('chat-messages').scrollHeight;}
 async function api(body,suffix=''){const response=await fetch(url+suffix,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(response.status===401?'로그인이 만료되었습니다. 로그인 새 창에서 다시 로그인한 뒤 시도하세요.':data.error||'AI 대화를 처리하지 못했습니다.');return data;}
 async function load(){if(busy)return;busy=true;controls();status('AI 대화를 불러오는 중…');try{const data=await api();chat=data.chat;available=data.available;loaded=true;pending=null;render();status(available?'이 교안에 대해 질문하고 이어서 대화할 수 있습니다.':'AI 연결 설정이 필요합니다. 교수자·조교 질문은 아래에서 이용할 수 있습니다.');}catch(e){status(e.message);}finally{busy=false;controls();}}
 get('chat-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy || !loaded || !available)return;const text=get('chat-text').value.trim();if(!text)return;
  if(!pending || pending.text!==text || pending.version!==chat.version)pending={text,version:chat.version,requestId:crypto.randomUUID()};
  busy=true;controls();status('AI가 교안을 확인하며 답변하고 있습니다…');
  try{const data=await api(pending);chat=data.chat;pending=null;get('chat-text').value='';render();status('AI 답변을 저장했습니다. 참고한 교안 내용도 확인해 주세요.');}catch(e){status(e.message);}finally{busy=false;controls();}
 });
 get('chat-reload').addEventListener('click',load);
 get('chat-reset').addEventListener('click',async()=>{if(busy || !loaded || !confirm('이 교안의 기존 AI 대화 기록을 지우고 새 대화를 시작할까요? 교수자에게 등록한 질문은 유지됩니다.'))return;busy=true;controls();try{chat=(await api({version:chat.version},'/reset')).chat;pending=null;render();status('새 대화를 시작했습니다.');}catch(e){status(e.message);}finally{busy=false;controls();}});
 get('chat-forward').addEventListener('click',()=>{
  const target=get('question-text');if(target.value.trim() && !confirm('작성 중인 담당자 질문을 AI 대화 일부로 바꿀까요?'))return;
  target.value='AI 답변으로 해결되지 않아 질문합니다.\n\n[질문할 내용]\n아래 내용을 확인하고 질문을 구체적으로 적어 주세요.\n\n[AI 대화 일부]\n'+chat.messages.slice(-4).map(m=>(m.role==='user'?'학생':'AI')+': '+m.content.slice(0,2000)).join('\n\n');
  target.focus();target.scrollIntoView({block:'center'});get('questions-status').textContent='전달할 질문과 대화 내용을 확인·수정한 뒤 질문 등록을 누르세요. 아직 전송하지 않았습니다.';
 });
 window.addEventListener('beforeunload',event=>{if(busy || get('chat-text').value.trim()){event.preventDefault();event.returnValue='';}});
 load();
})();
