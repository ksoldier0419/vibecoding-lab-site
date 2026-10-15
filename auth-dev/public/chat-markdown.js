// Render the Markdown subset used in chat with DOM nodes, never raw HTML.
(()=>{
 function node(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
 function inline(parent,text){
  const pattern=/`(?<code>[^`\n]+)`|\*\*\*(?<both>[^*\n]+)\*\*\*|\*\*(?<bold>[^*\n]+)\*\*|__(?<boldAlt>[^_\n]+)__|\*(?<italic>[^*\n]+)\*|_(?<italicAlt>[^_\n]+)_|\[(?<label>[^\]\n]+)\]\((?<url>[^\s)]+)\)/g;
  let offset=0;
  for(const m of text.matchAll(pattern)){
   parent.append(document.createTextNode(text.slice(offset,m.index)));let part;const g=m.groups;
   if(g.code!==undefined)part=node('code',g.code);
   else if(g.both!==undefined){part=node('strong');const em=node('em',g.both);part.append(em);}
   else if(g.bold!==undefined || g.boldAlt!==undefined){part=node('strong');inline(part,g.bold??g.boldAlt);}
   else if(g.italic!==undefined || g.italicAlt!==undefined){part=node('em');inline(part,g.italic??g.italicAlt);}
   else {
    try{const url=new URL(g.url);if(!['https:','http:'].includes(url.protocol))throw Error();part=node('a',g.label);part.href=url.href;part.target='_blank';part.rel='noopener noreferrer';}
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
 function highlightCode(block,language){
  if(!['','java','python','py','javascript','js','typescript','ts','c','cpp','c++','csharp','cs','json'].includes(language))return;
  const python=['python','py'].includes(language),source=block.textContent;
  const tokens=python?/(#[^\n]*|"""[\s\S]*?"""|\x27{3}[\s\S]*?\x27{3}|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b)/g:/(\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b)/g;
  const keywords=new Set(('public private protected static final class interface extends implements import package new return if else for while do switch case break continue try catch finally throw throws void int long double float boolean char byte short String var let const function async await true false null def from as in is not and or None True False print self pass with lambda yield except raise').split(' '));
  const nodes=[];let offset=0;
  for(const match of source.matchAll(tokens)){nodes.push(document.createTextNode(source.slice(offset,match.index)));const value=match[0];let kind=/^(\/\/|\/\*|#)/.test(value)?'comment':/^["'`]/.test(value)?'string':/^\d/.test(value)?'number':keywords.has(value)?'keyword':'';if(kind){const span=document.createElement('span');span.className='chat-token-'+kind;span.textContent=value;nodes.push(span);}else nodes.push(document.createTextNode(value));offset=match.index+value.length;}
  nodes.push(document.createTextNode(source.slice(offset)));block.replaceChildren(...nodes);
 }
 function selectionMarkdown(range){
  const element=n=>n.nodeType===1?n:n.parentElement,common=element(range.commonAncestorContainer);
  function fence(text,language=''){
   const runs=text.match(/`+/g)||[],ticks='`'.repeat(Math.max(3,...runs.map(s=>s.length+1)));
   return ticks+language+'\n'+text.replace(/\n$/,'')+'\n'+ticks;
  }
  function language(pre){const value=pre.closest('.chat-code-block')?.querySelector('.chat-code-language')?.textContent.trim()||'';return /^[\w+#.-]+$/.test(value)?value:'';}
  const pre=common?.closest('pre');if(pre)return fence(range.toString(),language(pre));
  const children=n=>[...n.childNodes].map(serialize).join('');
  function serialize(n){
   if(n.nodeType===3)return n.nodeValue;
   if(n.nodeType!==1)return children(n);
   const tag=n.tagName,text=children(n);
   if(tag==='PRE')return '\n\n'+fence(n.textContent,language(n))+'\n\n';
   if(n.classList.contains('chat-code-language'))return '';
   if(tag==='CODE')return n.textContent.includes('`')||n.textContent.includes('\n')?'\n\n'+fence(n.textContent)+'\n\n':'`'+n.textContent+'`';
   if(tag==='STRONG'||tag==='B')return '**'+text+'**';
   if(tag==='EM'||tag==='I')return '*'+text+'*';
   if(tag==='BR')return '\n';
   if(/^H[1-6]$/.test(tag))return '\n\n'+'#'.repeat(Number(tag[1]))+' '+text.trim()+'\n\n';
   if(tag==='A'){try{const url=new URL(n.href);if(['http:','https:'].includes(url.protocol))return '['+text+']('+url.href+')';}catch{}return text;}
   if(tag==='BLOCKQUOTE')return '\n\n'+text.trim().split('\n').map(line=>'> '+line).join('\n')+'\n\n';
   if(tag==='UL'||tag==='OL'){
    let number=Number(n.getAttribute('start'))||1;
    return '\n\n'+[...n.children].filter(c=>c.tagName==='LI').map(li=>{
     const content=children(li).trim(),lines=(li.querySelector('pre')?content:content.replace(/\n{2,}/g,'\n')).split('\n'),prefix=tag==='OL'?(number++)+'. ':'- ';
     return prefix+lines[0]+lines.slice(1).map(line=>'\n  '+line).join('');
    }).join('\n')+'\n\n';
   }
   if(tag==='TABLE'){
    const rows=[...n.querySelectorAll('tr')].map(tr=>[...tr.children].filter(c=>['TH','TD'].includes(c.tagName)).map(c=>children(c).trim().replace(/\|/g,'\\|').replace(/\n/g,' ')));
    if(!rows.length)return text;
    const line=row=>'| '+row.join(' | ')+' |';return '\n\n'+[line(rows[0]),line(rows[0].map(()=>'---')),...rows.slice(1).map(line)].join('\n')+'\n\n';
   }
   if(['P','DIV','SECTION','ARTICLE'].includes(tag))return '\n\n'+text.trim()+'\n\n';
   return text;
  }
  let text=serialize(range.cloneContents()).trim();
  for(let n=common;n&&!n.classList?.contains('chat-bubble');n=n.parentElement){
   if(n.tagName==='CODE')text=text.includes('`')?fence(text):'`'+text+'`';
   else if(['STRONG','B'].includes(n.tagName))text='**'+text+'**';
   else if(['EM','I'].includes(n.tagName))text='*'+text+'*';
   else if(/^H[1-6]$/.test(n.tagName))text='#'.repeat(Number(n.tagName[1]))+' '+text;
   else if(n.tagName==='LI')text='- '+text.split('\n').join('\n  ');
  }
  return text.trim();
 }
 window.ChatMarkdown={selectionMarkdown,highlightCode,render(parent,text,highlight){blocks(parent,text.replace(/\r\n?/g,'\n').split('\n'),highlight);}};
})();
