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
