(()=>{
 function attach(input){
  const doc=input.ownerDocument,view=doc.defaultView;
  if(input.dataset.markdownEditor)return input.markdownEditor;
  input.dataset.markdownEditor='true';
  const node=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const wrap=node('section');wrap.className='note-markdown-editor';
  const toolbar=node('div');toolbar.className='note-editor-toolbar';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','메모 편집 도구');
  const toggle=node('button','편집'),bold=node('button','굵게'),italic=node('button','기울임');
  toggle.type=bold.type=italic.type='button';toggle.className='note-edit-toggle';bold.className='note-bold';italic.className='note-italic';bold.title='Ctrl+B';italic.title='Ctrl+I';
  toolbar.append(toggle,bold,italic);
  const viewer=node('div');viewer.className='note-markdown-view';viewer.tabIndex=0;viewer.setAttribute('role','button');viewer.setAttribute('aria-label','내 메모 편집하기');
  const toc=node('details');toc.className='note-markdown-toc';toc.open=true;toc.hidden=true;
  const tocTitle=node('summary','목차'),nav=node('nav');nav.setAttribute('aria-label','메모 목차');toc.append(tocTitle,nav);
  const hint=node('p','Ctrl+B 굵게 · Ctrl+I 기울임 · Enter 목록 계속 · Tab 들여쓰기 · Esc 보기');hint.className='note-editor-hint';
  const message=node('p');message.className='note-editor-message';message.setAttribute('role','status');
  input.before(wrap);wrap.append(toolbar,toc,viewer,input,hint,message);
  const label=doc.querySelector('label[for="'+input.id+'"]');let editing=false;
  const markdown=()=>view.ChatMarkdown || window.ChatMarkdown;
  function updateTOC(){
   const headings=[...viewer.querySelectorAll('h1,h2,h3,h4,h5,h6')];nav.replaceChildren();toc.hidden=editing || !headings.length;tocTitle.textContent='목차 ('+headings.length+')';
   if(!headings.length)return;
   const base=Math.min(...headings.map(h=>Number(h.tagName[1]))),list=node('ol');
   headings.forEach((heading,index)=>{
    heading.id='note-'+input.id+'-heading-'+(index+1);heading.tabIndex=-1;
    const item=node('li'),link=node('a',heading.textContent.trim()||'제목 '+(index+1));item.style.marginInlineStart=(Number(heading.tagName[1])-base)*.8+'rem';link.href='#'+heading.id;
    const next=heading.nextElementSibling;if(next?.tagName==='P' && /^등록일:/.test(next.textContent.trim()))link.append(node('small',' · '+next.textContent.trim()));
    link.addEventListener('click',event=>{event.preventDefault();heading.scrollIntoView({behavior:'smooth',block:'start'});heading.focus({preventScroll:true});});item.append(link);list.append(item);
   });nav.append(list);
  }
  function render(){
   viewer.replaceChildren();
   if(input.disabled){viewer.textContent='메모를 불러온 뒤 편집할 수 있습니다.';}
   else if(!input.value.trim()){viewer.textContent='클릭하여 Markdown 메모를 작성하세요.';viewer.classList.add('note-empty');}
   else{viewer.classList.remove('note-empty');markdown().render(viewer,input.value,markdown().highlightCode);}
   updateTOC();
  }
  function refresh(){toggle.disabled=bold.disabled=italic.disabled=input.disabled;viewer.setAttribute('aria-disabled',String(input.disabled));if(!editing)render();}
  function mode(next){
   if(next && input.disabled)return;
   editing=next;if(editing)toc.hidden=true;input.hidden=!editing;viewer.hidden=editing;bold.hidden=italic.hidden=hint.hidden=!editing;if(label)label.hidden=!editing;toggle.textContent=editing?'보기':'편집';message.textContent='';
   if(editing)input.focus();else{render();viewer.focus();}
  }
  function replace(start,end,text,selectStart,selectEnd=selectStart){
   if(input.value.length-(end-start)+text.length>input.maxLength){message.textContent='메모의 최대 길이를 초과합니다.';return false;}
   input.setRangeText(text,start,end,'end');input.focus();input.setSelectionRange(selectStart,selectEnd);input.dispatchEvent(new view.Event('input',{bubbles:true}));message.textContent='';return true;
  }
  function format(mark){
   if(input.disabled)return;
   const start=input.selectionStart,end=input.selectionEnd,value=input.value,text=value.slice(start,end);
   if(start>=mark.length && value.slice(start-mark.length,start)===mark && value.slice(end,end+mark.length)===mark && (mark!=='*' || (value[start-2]!=='*' && value[end+1]!=='*'))){replace(start-mark.length,end+mark.length,text,start-mark.length,end-mark.length);}
   else{replace(start,end,mark+text+mark,start+mark.length,end+mark.length);}
  }
  function inFence(offset){let fence=null;for(const line of input.value.slice(0,offset).split('\n')){const m=line.match(/^\s{0,3}(`{3,}|~{3,})/);if(m){if(!fence)fence=m[1];else if(m[1][0]===fence[0]&&m[1].length>=fence.length)fence=null;}}return !!fence;}
  function indent(outdent){
   const start=input.selectionStart,end=input.selectionEnd,from=input.value.lastIndexOf('\n',start-1)+1;
   const until=end>start && input.value[end-1]==='\n'?end-1:end,block=input.value.slice(from,until),lines=block.split('\n');
   const changed=lines.map(line=>outdent?line.replace(/^(?: {1,2}|\t)/,''):'  '+line).join('\n');
   const firstDelta=changed.split('\n')[0].length-lines[0].length,totalDelta=changed.length-block.length;
   replace(from,until,changed,Math.max(from,start+firstDelta),Math.max(from,end+totalDelta));
  }
  toggle.addEventListener('click',()=>mode(!editing));
  viewer.addEventListener('click',event=>{if(event.target.closest('a') || !doc.getSelection().isCollapsed)return;mode(true);});
  viewer.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();mode(true);}});
  for(const [button,mark] of [[bold,'**'],[italic,'*']]){button.addEventListener('pointerdown',event=>event.preventDefault());button.addEventListener('click',()=>format(mark));}
  input.addEventListener('input',()=>{if(!editing)render();});
  input.addEventListener('keydown',event=>{
   if(event.isComposing || event.keyCode===229)return;
   if((event.ctrlKey||event.metaKey)&&!event.altKey&&['b','i'].includes(event.key.toLowerCase())){event.preventDefault();format(event.key.toLowerCase()==='b'?'**':'*');return;}
   if(event.key==='Escape'){event.preventDefault();mode(false);return;}
   if(event.key==='Tab'){event.preventDefault();indent(event.shiftKey);return;}
   if(event.key!=='Enter'||event.shiftKey||event.ctrlKey||event.metaKey||input.selectionStart!==input.selectionEnd||inFence(input.selectionStart))return;
   const start=input.selectionStart,from=input.value.lastIndexOf('\n',start-1)+1,line=input.value.slice(from,start),m=line.match(/^(\s*)([-+*]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/);
   if(!m)return;
   event.preventDefault();const nextBreak=input.value.indexOf('\n',start),rest=input.value.slice(start,nextBreak<0?input.value.length:nextBreak);
   if(!m[4].trim()&&!rest.trim()){replace(from,start,'',from);return;}
   const marker=/^\d/.test(m[2])?String(parseInt(m[2],10)+1)+m[2].slice(-1):m[2],text='\n'+m[1]+marker+' '+(m[3]?'[ ] ':'');
   replace(start,start,text,start+text.length);
  });
  input.hidden=true;bold.hidden=italic.hidden=hint.hidden=true;if(label)label.hidden=true;refresh();
  const api={refresh,edit:()=>mode(true)};input.markdownEditor=api;return api;
 }
 window.NoteEditor={attach};
})();
