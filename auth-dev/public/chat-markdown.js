// Render the Markdown subset used in chat with DOM nodes, never raw HTML.
(()=>{
 function node(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
 function inline(parent,text){
  const pattern=/`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_|\[([^\]\n]+)\]\(([^\s)]+)\)/g;
  let offset=0;
  for(const m of text.matchAll(pattern)){
   parent.append(document.createTextNode(text.slice(offset,m.index)));let part;
   if(m[1]!==undefined)part=node('code',m[1]);
   else if(m[2]!==undefined || m[3]!==undefined){part=node('strong');inline(part,m[2]??m[3]);}
   else if(m[4]!==undefined || m[5]!==undefined){part=node('em');inline(part,m[4]??m[5]);}
   else {
    try{const url=new URL(m[7]);if(!['https:','http:'].includes(url.protocol))throw Error();part=node('a',m[6]);part.href=url.href;part.target='_blank';part.rel='noopener noreferrer';}
    catch{part=document.createTextNode(m[0]);}
   }
   parent.append(part);offset=m.index+m[0].length;
  }
  parent.append(document.createTextNode(text.slice(offset)));
 }
 const listMatch=line=>line.match(/^(\s*)([-+*•]|\d+[.)])\s+(.*)$/);
 const cells=line=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split(/(?<!\\)\|/).map(s=>s.trim().replace(/\\\|/g,'|'));
 const divider=line=>line.includes('|')&&cells(line).every(s=>/^:?-{3,}:?$/.test(s));
 function blocks(parent,lines,highlight,depth=0){
  for(let i=0;i<lines.length;){
   const line=lines[i];if(!line.trim()){i++;continue;}
   const fence=line.match(/^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)[^\n]*$/);
   if(fence){
    const code=[];i++;const close=new RegExp('^\\s{0,3}'+fence[1][0]+'{'+fence[1].length+',}\\s*$');
    while(i<lines.length&&!close.test(lines[i]))code.push(lines[i++]);if(i<lines.length)i++;
    const box=node('section');box.className='chat-code-block';const label=node('div',fence[2]||'코드');label.className='chat-code-language';
    const pre=node('pre'),content=node('code',code.join('\n'));pre.className='chat-code';pre.append(content);highlight?.(content,fence[2].toLowerCase());box.append(label,pre);parent.append(box);continue;
   }
   const heading=line.match(/^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+)?$/);
   if(heading){const h=node('h'+heading[1].length);inline(h,heading[2]);parent.append(h);i++;continue;}
   if(/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)){parent.append(node('hr'));i++;continue;}
   if(depth<8 && /^\s*>/.test(line)){
    const quoted=[];while(i<lines.length&&/^\s*>/.test(lines[i]))quoted.push(lines[i++].replace(/^\s*> ?/,''));
    const quote=node('blockquote');blocks(quote,quoted,highlight,depth+1);parent.append(quote);continue;
   }
   if(i+1<lines.length&&line.includes('|')&&divider(lines[i+1])){
    const scroll=node('div');scroll.className='chat-table-scroll';const table=node('table'),thead=node('thead'),tr=node('tr');
    const headers=cells(line);for(const text of headers){const th=node('th');th.scope='col';inline(th,text);tr.append(th);}thead.append(tr);table.append(thead);i+=2;
    const tbody=node('tbody');while(i<lines.length&&lines[i].includes('|')&&lines[i].trim()){
     const row=node('tr'),values=cells(lines[i++]);for(let c=0;c<headers.length;c++){const td=node('td');inline(td,values[c]||'');row.append(td);}tbody.append(row);
    }
    table.append(tbody);scroll.append(table);parent.append(scroll);continue;
   }
   const first=listMatch(line);
   if(first&&depth<8){
    const ordered=/\d/.test(first[2]),indent=first[1].length,list=node(ordered?'ol':'ul');if(ordered)list.start=parseInt(first[2],10);
    while(i<lines.length){
     const m=listMatch(lines[i]);if(!m||m[1].length!==indent||/\d/.test(m[2])!==ordered)break;
     const item=node('li'),body=[m[3]];i++;
     while(i<lines.length&&lines[i].trim()&&/^\s+/.test(lines[i])&&lines[i].match(/^\s*/)[0].length>indent){body.push(lines[i++].slice(Math.min(indent+2,lines[i-1].match(/^\s*/)[0].length)));}
     blocks(item,body,highlight,depth+1);list.append(item);
    }
    parent.append(list);continue;
   }
   const paragraph=node('p');inline(paragraph,line.trim());i++;
   while(i<lines.length&&lines[i].trim()&&!/^\s*(?:#{1,6}\s|>|`{3,}|~{3,})/.test(lines[i])&&!listMatch(lines[i])&&!(i+1<lines.length&&divider(lines[i+1]))){paragraph.append(node('br'));inline(paragraph,lines[i++].trim());}
   parent.append(paragraph);
  }
 }
 window.ChatMarkdown={render(parent,text,highlight){blocks(parent,text.replace(/\r\n?/g,'\n').split('\n'),highlight);}};
})();
