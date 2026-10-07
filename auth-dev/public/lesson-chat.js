(()=>{
 const get=id=>document.getElementById(id),params=new URLSearchParams(location.search);
 const url='/api/study/'+encodeURIComponent(params.get('course'))+'/'+encodeURIComponent(params.get('lesson'))+'/chat';
 let chat={messages:[],version:0},loaded=false,available=false,busy=false,pending=null;
 let activityTimer,replying=false;
 function chatActivity(){clearTimeout(activityTimer);window.setNotiChatActive(true);if(!replying)activityTimer=setTimeout(()=>window.setNotiChatActive(false),2500);}
 get('ai-chat').hidden=false;
 function status(text){get('chat-status').textContent=text;}
 function controls(){get('chat-text').disabled=!loaded || !available;get('chat-text').readOnly=busy;get('chat-send').disabled=!loaded || !available || busy;get('chat-reset').disabled=!loaded || !chat.messages.length || busy;get('chat-reload').disabled=busy;get('chat-forward').disabled=!loaded || !chat.messages.length || busy;}
 function plainLine(line){return line.replace(/^\s{0,3}#{1,6}\s+/,'').replace(/^\s*[-*+]\s+/,'• ').replace(/^>\s?/,'').replace(/\*\*([^*\n]+)\*\*/g,'$1').replace(/__([^_\n]+)__/g,'$1').replace(/`([^`\n]+)`/g,'$1').replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,'$1 ($2)');}
 function highlightCode(block,language){
  if(!['','java','python','py','javascript','js','typescript','ts','c','cpp','c++','csharp','cs','json'].includes(language))return;
  const python=['python','py'].includes(language),source=block.textContent;
  const tokens=python?/(#[^\n]*|"""[\s\S]*?"""|\x27{3}[\s\S]*?\x27{3}|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b)/g:/(\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b)/g;
  const keywords=new Set(('public private protected static final class interface extends implements import package new return if else for while do switch case break continue try catch finally throw throws void int long double float boolean char byte short String var let const function async await true false null def from as in is not and or None True False print self pass with lambda yield except raise').split(' '));
  const nodes=[];let offset=0;
  for(const match of source.matchAll(tokens)){nodes.push(document.createTextNode(source.slice(offset,match.index)));const value=match[0];let kind=/^(\/\/|\/\*|#)/.test(value)?'comment':/^["'`]/.test(value)?'string':/^\d/.test(value)?'number':keywords.has(value)?'keyword':'';if(kind){const span=document.createElement('span');span.className='chat-token-'+kind;span.textContent=value;nodes.push(span);}else nodes.push(document.createTextNode(value));offset=match.index+value.length;}
  nodes.push(document.createTextNode(source.slice(offset)));block.replaceChildren(...nodes);
 }
 function messageBubble(message){
  const item=document.createElement('article'),label=document.createElement('span'),bubble=document.createElement('div');item.className='chat-message '+message.role;label.className='chat-speaker';label.textContent=message.role==='user'?'나':'Noti';if(message.role!=='user'){const icon=document.createElement('img');icon.src='/auth-assets/noti.gif';icon.alt='';icon.width=22;icon.height=22;label.prepend(icon);}bubble.className='chat-bubble';
  if(message.role==='user'){bubble.textContent=message.content;}else{
   let code=false,lines=[],language='';
   function flush(){if(!lines.length)return;const block=document.createElement(code?'pre':'div');block.className=code?'chat-code':'chat-prose';block.textContent=lines.join('\n');if(code)highlightCode(block,language);bubble.append(block);lines=[];}
   for(const line of message.content.split('\n')){if(/^\s*```/.test(line)){flush();code=!code;language=code?line.trim().slice(3).trim().toLowerCase():'';}else lines.push(code?line:plainLine(line));}flush();
  }
  item.append(label,bubble);return item;
 }
 function render(waiting){
  get('chat-messages').replaceChildren();
  if(!chat.messages.length && !waiting){const empty=document.createElement('p');empty.className='chat-empty';empty.textContent='궁금한 내용을 물어보세요.\n선택한 교안을 함께 살펴볼게요.';get('chat-messages').append(empty);}
  for(const message of chat.messages)get('chat-messages').append(messageBubble(message));
  if(waiting){get('chat-messages').append(messageBubble({role:'user',content:waiting}));const reply=messageBubble({role:'assistant',content:'답변을 생각하고 있어요…'});reply.classList.add('chat-waiting');get('chat-messages').append(reply);}
  get('chat-messages').scrollTop=get('chat-messages').scrollHeight;
 }
 async function api(body,suffix=''){const response=await fetch(url+suffix,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(response.status===401?'로그인이 만료되었습니다. 로그인 새 창에서 다시 로그인한 뒤 시도하세요.':data.error||'AI 대화를 처리하지 못했습니다.');return data;}
 async function load(){if(busy)return;busy=true;controls();status('AI 대화를 불러오는 중…');try{const data=await api();chat=data.chat;available=data.available;loaded=true;pending=null;render();status(available?'':'AI 연결 설정이 필요합니다. 교수자·조교 질문은 메모·질의응답 영역에서 이용할 수 있습니다.');}catch(e){status(e.message);}finally{busy=false;controls();}}
 get('chat-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy || !loaded || !available)return;const text=get('chat-text').value.trim();if(!text)return;
  if(!pending || pending.text!==text || pending.version!==chat.version)pending={text,version:chat.version,requestId:crypto.randomUUID()};
  busy=true;replying=true;chatActivity();controls();render(text);status('답변을 기다리는 중…');
  try{const data=await api(pending);chat=data.chat;pending=null;get('chat-text').value='';resizeInput();render();status('AI 답변을 저장했습니다. 참고한 교안 내용도 확인해 주세요.');}catch(e){render();status(e.message);}finally{busy=false;replying=false;chatActivity();controls();if(available)get('chat-text').focus();}
 });
 function resizeInput(){const input=get('chat-text');input.style.height='auto';input.style.height=Math.min(input.scrollHeight,120)+'px';}
 get('chat-text').addEventListener('input',()=>{resizeInput();chatActivity();});
 get('chat-text').addEventListener('keydown',event=>{if(event.key==='Enter' && !event.shiftKey && !event.isComposing && event.keyCode!==229){event.preventDefault();if(!busy && available)get('chat-form').requestSubmit();}});
 get('chat-reload').addEventListener('click',load);
 get('chat-reset').addEventListener('click',async()=>{if(busy || !loaded || !confirm('이 교안의 기존 AI 대화 기록을 지우고 새 대화를 시작할까요? 교수자에게 등록한 질문은 유지됩니다.'))return;busy=true;controls();try{chat=(await api({version:chat.version},'/reset')).chat;pending=null;render();status('새 대화를 시작했습니다.');}catch(e){status(e.message);}finally{busy=false;controls();}});
 get('chat-forward').addEventListener('click',()=>{
  const target=get('question-text');if(target.value.trim() && !confirm('작성 중인 담당자 질문을 AI 대화 일부로 바꿀까요?'))return;
  target.value='AI 답변으로 해결되지 않아 질문합니다.\n\n[질문할 내용]\n아래 내용을 확인하고 질문을 구체적으로 적어 주세요.\n\n[AI 대화 일부]\n'+chat.messages.slice(-4).map(m=>(m.role==='user'?'학생':'AI')+': '+m.content.slice(0,2000)).join('\n\n');
  window.openStaffQuestions();target.focus();target.scrollIntoView({block:'center'});get('questions-status').textContent='전달할 질문과 대화 내용을 확인·수정한 뒤 질문 등록을 누르세요. 아직 전송하지 않았습니다.';
 });
 window.addEventListener('beforeunload',event=>{if(busy || get('chat-text').value.trim()){event.preventDefault();event.returnValue='';}});
 load();
})();
