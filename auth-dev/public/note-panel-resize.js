(()=>{
 const layout=document.querySelector('.workspace-layout'),panel=document.getElementById('workspace-tools');
 if(!layout||!panel)return;
 const handle=document.createElement('button');handle.id='notes-resize';handle.type='button';handle.setAttribute('role','separator');handle.setAttribute('aria-label','학습 메모 영역 너비 조절');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-controls','workspace-tools');handle.title='드래그 또는 좌우 방향키로 메모 너비 조절 · 두 번 클릭하면 기본 너비';panel.before(handle);
 let width=360,drag=null;
 try{const saved=Number(localStorage.getItem('lesson-note-panel-width'));if(saved>=280)width=saved;}catch{}
 function limits(){return {min:280,max:window.innerWidth<=900?900:Math.max(280,Math.min(900,layout.clientWidth-360))};}
 function apply(next,persist=false){const {min,max}=limits();width=Math.round(Math.max(min,Math.min(max,next)));layout.style.setProperty('--workspace-notes-width',width+'px');handle.setAttribute('aria-valuemin',min);handle.setAttribute('aria-valuemax',max);handle.setAttribute('aria-valuenow',width);if(persist)try{localStorage.setItem('lesson-note-panel-width',String(width));}catch{}}
 handle.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();handle.focus();drag={id:event.pointerId,x:event.clientX,width};handle.setPointerCapture(event.pointerId);layout.classList.add('notes-resizing');});
 handle.addEventListener('pointermove',event=>{if(drag?.id===event.pointerId)apply(drag.width+drag.x-event.clientX);});
 function end(event){if(drag?.id!==event.pointerId)return;drag=null;layout.classList.remove('notes-resizing');apply(width,true);}
 handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);handle.addEventListener('lostpointercapture',end);
 handle.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const {min,max}=limits();apply(event.key==='Home'?min:event.key==='End'?max:width+(event.key==='ArrowLeft'?1:-1)*(event.shiftKey?64:32),true);});
 handle.addEventListener('dblclick',()=>apply(360,true));window.addEventListener('resize',()=>apply(width));apply(width);
})();
