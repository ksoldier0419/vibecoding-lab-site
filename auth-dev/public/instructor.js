document.querySelectorAll('.copy-code').forEach(button=>button.addEventListener('click',async()=>{
 try {await navigator.clipboard.writeText(button.parentElement.querySelector('code').textContent);button.textContent='복사 완료';}
 catch {button.textContent='코드를 선택해 복사해 주세요';}
 setTimeout(()=>button.textContent='코드 복사',2000);
}));
const input=document.getElementById('lesson-note');
if(input) {
 const status=document.getElementById('note-status'),saveButton=document.getElementById('save-note'),reload=document.getElementById('reload-note');
 const lesson=location.pathname.split('/').pop();
 const url='/api/instructor/java/'+encodeURIComponent(lesson)+'/note';
 let version=0,saved='',busy=false,timer,conflict=false,loaded=false;
 const dirty=()=>loaded && input.value!==saved;
 async function result(response) {
  const data=await response.json();
  if(!response.ok) throw Object.assign(new Error(data.error || '요청을 처리하지 못했습니다.'),{status:response.status});
  return data.note;
 }
 async function load() {
  if(busy) return;
  if(dirty() && !confirm('저장하지 않은 내용이 있습니다. 다시 불러오면 현재 입력이 바뀝니다. 계속할까요?')) return;
  clearTimeout(timer);busy=true;input.disabled=true;saveButton.disabled=true;reload.disabled=true;
  status.textContent='메모를 불러오고 있습니다.';
  try {
   const note=await result(await fetch(url,{cache:'no-store'}));
   version=note.version;saved=note.text;input.value=saved;loaded=true;conflict=false;
   status.textContent='입력 후 1초 뒤 자동 저장됩니다. 체크 항목은 ☐ / ☑로 적을 수 있습니다.';
  } catch(error) {status.textContent=error.message;}
  finally {busy=false;input.disabled=!loaded;saveButton.disabled=!loaded || conflict;reload.disabled=false;}
 }
 async function save() {
  clearTimeout(timer);
  if(busy || !dirty() || conflict) return;
  busy=true;saveButton.disabled=true;reload.disabled=true;const text=input.value;
  status.textContent='저장 중…';
  let succeeded=false;
  try {
   const note=await result(await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,version})}));
   version=note.version;saved=text;succeeded=true;
   status.textContent='저장됨 · '+new Date(note.updatedAt).toLocaleTimeString('ko-KR');
  } catch(error) {conflict=error.status===409;status.textContent=error.message;}
  finally {
   busy=false;saveButton.disabled=conflict;reload.disabled=false;
   if(succeeded && dirty()) timer=setTimeout(save,1000);
  }
 }
 input.addEventListener('input',()=>{clearTimeout(timer);status.textContent=conflict?'다른 창과 충돌했습니다. 내용을 복사한 뒤 다시 불러와 주세요.':'저장하지 않은 변경 사항이 있습니다.';if(!conflict)timer=setTimeout(save,1000);});
 saveButton.addEventListener('click',save);reload.addEventListener('click',load);
 window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
 load();
}
