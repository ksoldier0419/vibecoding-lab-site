const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
class Element {
 constructor(){this.children=[];this.events={};this.value='';this.checked=false;this.hidden=true;this.textContent='';}
 addEventListener(name,fn){this.events[name]=fn;}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;}
 setAttribute(){}
 querySelector(){return this.span ||=new Element();}
}
function studentUI(role='professor') {
 const elements=new Map(),granted=new Set(['2']),calls=[];
 const people=['1','2','3'].map(id=>({id,studentNumber:'000'+id,name:'학생'+id,registered:id!=='3',courses:[]}));
 const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 const context={document:{getElementById:get,createElement:()=>new Element()},Intl,Map,Set,location:{},
  fetch:async(url,options)=>{
   calls.push({url,options});let data;
   if(url==='/api/auth/me')data={user:{role}};
   else if(url==='/api/admin/students')data={rows:people};
   else if(options?.method==='POST'){const value=JSON.parse(options.body);if(value.enabled)granted.add(value.studentId);else granted.delete(value.studentId);data={ok:true};}
   else data={rows:['1','2'].map(id=>({id,assistant:granted.has(id)}))};
   return {ok:true,json:async()=>data};
  }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'public/students.js'),'utf8'),context);
 return {get,calls,granted};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function texts(node){return [node.textContent,...node.children.flatMap(texts)];}
function find(node,text){if(node.textContent===text)return node;for(const child of node.children){const found=find(child,text);if(found)return found;}return null;}
test('student management shows grant/revoke only for registered candidates and updates role after click',async()=>{
 const u=studentUI();await flush();const rows=u.get('person-rows').children;
 assert.ok(texts(rows[0]).includes('조교 지정'));assert.ok(texts(rows[1]).includes('조교 해제'));assert.ok(texts(rows[1]).includes('조교'));
 assert.equal(texts(rows[2]).includes('조교 지정'),false);
 await find(rows[0],'조교 지정').events.click();await flush();assert.equal(u.granted.has('1'),true);
 assert.ok(texts(u.get('person-rows').children[0]).includes('조교 해제'));
 await find(u.get('person-rows').children[1],'조교 해제').events.click();await flush();assert.equal(u.granted.has('2'),false);
 assert.equal(u.get('admin-content').inert,false);
});
test('assistant cannot display student management tools',async()=>{
 const u=studentUI('assistant');await flush();assert.equal(u.get('admin-content').hidden,true);assert.equal(u.calls.length,1);
});
