const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
function render(text){
 class Element{constructor(tag,text=''){this.tag=tag;this.text=text;this.children=[];}append(...children){this.children.push(...children);}set textContent(text){this.text=text;this.children=[];}get textContent(){return this.text+this.children.map(n=>n.textContent).join('');}set innerHTML(_){assert.fail('Raw HTML must not be used');}}
 const document={createElement:tag=>new Element(tag),createTextNode:text=>new Element('#text',text)},window={};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'public/chat-markdown.js'),'utf8'),{document,window,URL});
 const root=new Element('div'),highlight=[];window.ChatMarkdown.render(root,text,(code,language)=>highlight.push({text:code.textContent,language}));
 function all(tag,n=root){return (n.tag===tag?[n]:[]).concat(n.children.flatMap(c=>all(tag,c)));}
 return {root,all,highlight};
}
test('chat Markdown renders headings, emphasis, inline/fenced code, nested lists, tables and quotes',()=>{
 const r=render('## Types\n\n**Integer** uses `int`.\n\n- One\n  - Nested\n- Two\n\n| Type | Size |\n| --- | --- |\n| int | 4 |\n\n> Note\n\n```java\nint age = 20;\n```');
 assert.equal(r.all('h2')[0].textContent,'Types');assert.equal(r.all('strong')[0].textContent,'Integer');assert.equal(r.all('ul').length,2);assert.equal(r.all('li').length,3);assert.equal(r.all('th').length,2);assert.equal(r.all('td')[1].textContent,'4');assert.equal(r.all('blockquote')[0].textContent,'Note');assert.deepEqual(r.highlight,[{text:'int age = 20;',language:'java'}]);
});
test('chat Markdown keeps HTML as text, rejects executable links and tolerates unfinished code fences',()=>{
 const r=render('<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1))\n\n[docs](https://example.com)\n\n```python\nprint("hello")');
 assert.equal(r.all('img').length,0);assert.ok(r.root.textContent.includes('<img'));assert.equal(r.all('a').length,1);assert.equal(r.all('a')[0].href,'https://example.com/');assert.equal(r.all('a')[0].rel,'noopener noreferrer');assert.equal(r.all('code')[0].textContent,'print("hello")');
});

test('combined bold and italic Markdown renders both styles',()=>{
 const r=render('***Important***');assert.equal(r.all('strong').length,1);assert.equal(r.all('em').length,1);assert.equal(r.all('strong')[0].textContent,'Important');
});

test('chat selections preserve heading, emphasis and code fences including blank code lines',()=>{
 const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'public/chat-markdown.js'),'utf8'),{window,URL});
 function text(value){return {nodeType:3,nodeValue:value,get textContent(){return this.nodeValue;}};}
 function el(tag,children=[],className=''){
  const n={nodeType:tag==='#fragment'?11:1,tagName:tag,childNodes:children,classList:{contains:c=>className.split(' ').includes(c)},get children(){return this.childNodes.filter(c=>c.nodeType===1);},get textContent(){return this.childNodes.map(c=>c.textContent).join('');},closest(selector){if(selector==='pre'&&this.tagName==='PRE'||selector.startsWith('.')&&this.classList.contains(selector.slice(1)))return this;return this.parentElement?.closest(selector)||null;},querySelector(selector){for(const c of this.children){if(selector==='pre'&&c.tagName==='PRE'||selector.startsWith('.')&&c.classList.contains(selector.slice(1)))return c;const nested=c.querySelector(selector);if(nested)return nested;}return null;}};
  for(const c of children)c.parentElement=n;return n;
 }
 const code='int x = 1;\n\nString name = "Kim";',pre=el('PRE',[el('CODE',[text(code)])]),box=el('DIV',[el('DIV',[text('java')],'chat-code-language'),pre],'chat-code-block');
 const fragment=el('#fragment',[el('H2',[text('Types')]),el('P',[el('STRONG',[text('Integer')]),text(' value')]),box]),bubble=el('DIV',[],'chat-bubble');
 const result=window.ChatMarkdown.selectionMarkdown({commonAncestorContainer:bubble,cloneContents:()=>fragment});assert.ok(result.includes('## Types'));assert.ok(result.includes('**Integer**'));assert.ok(result.includes('```java\n'+code+'\n```'));
 const partial=window.ChatMarkdown.selectionMarkdown({commonAncestorContainer:pre.children[0],toString:()=>code});assert.equal(partial,'```java\n'+code+'\n```');
 const strong=el('STRONG',[text('value')]);strong.parentElement=bubble;assert.equal(window.ChatMarkdown.selectionMarkdown({commonAncestorContainer:strong,cloneContents:()=>el('#fragment',[text('value')])}),'**value**');
});
