(()=>{
 function node(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
 function highlightCode(block,language){
  if(!['','java','python','py','javascript','js','typescript','ts','c','cpp','c++','csharp','cs','json'].includes(language))return;
  const python=['python','py'].includes(language),source=block.textContent;
  const tokens=python?/(#[^\n]*|"""[\s\S]*?"""|\x27{3}[\s\S]*?\x27{3}|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b)/g:/(\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b)/g;
  const keywords=new Set(('public private protected static final class interface extends implements import package new return if else for while do switch case break continue try catch finally throw throws void int long double float boolean char byte short String var let const function async await true false null def from as in is not and or None True False print self pass with lambda yield except raise').split(' '));
  const nodes=[];let offset=0;
  for(const match of source.matchAll(tokens)){nodes.push(document.createTextNode(source.slice(offset,match.index)));const value=match[0];let kind=/^(\/\/|\/\*|#)/.test(value)?'comment':/^["'`]/.test(value)?'string':/^\d/.test(value)?'number':keywords.has(value)?'keyword':'';if(kind){const span=document.createElement('span');span.className='quiz-token-'+kind;span.textContent=value;nodes.push(span);}else nodes.push(document.createTextNode(value));offset=match.index+value.length;}
  nodes.push(document.createTextNode(source.slice(offset)));block.replaceChildren(...nodes);
 }

 function block(source,language,compact=false){
  const box=node('section',undefined,'quiz-code'+(compact?' quiz-code-focus':''));
  if(!compact)box.append(node('div',language==='java'?'Java':language,'quiz-code-language'));
  const pre=node('pre',source);highlightCode(pre,language);box.append(pre);return box;
 }
 window.quizCode={
  render(container,q){if(!q.code)return;
   const marks=[...new Set(q.code.source.match(/[①-⑳]/g)||[])];
   container.append(node('p','다음 코드의 '+marks.join('·')+'에 들어갈 알맞은 내용을 고르세요. 각 문항의 정답은 하나입니다.','quiz-code-instruction'),block(q.code.source,q.code.language),node('h2',q.prompt,'question-prompt'),block(q.code.snippet,q.code.language,true));
  },
  choice(text,index){const label=node('span',undefined,'quiz-code-choice');label.append(node('span',String.fromCharCode(65+index),'quiz-choice-letter'),node('code',text));return label;},
  block
 };
})();
