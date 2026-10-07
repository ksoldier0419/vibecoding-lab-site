const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function ui() {
 const elements=Object.fromEntries(['lesson-note','note-status','save-note','reload-note'].map(id=>[id,{value:'',disabled:false,events:{},addEventListener(type,fn){this.events[type]=fn;}}]));
 const requests=[],timers=new Map(),events={};let next=0;
 const context={document:{querySelectorAll:()=>[],getElementById:id=>elements[id]},location:{pathname:'/instructor/java/week11-operators-conditions.html'},window:{addEventListener:(name,fn)=>events[name]=fn},confirm:()=>true,
  fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})),setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id),Date,JSON,encodeURIComponent};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'public/instructor.js'),'utf8'),context);
 return {elements,requests,timers,events};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function respond(request,note,status=200) {request.resolve({ok:status===200,status,json:async()=>status===200?{note}:{error:note}});await flush();}
test('autosave serializes edits during an in-flight save and warns before leaving',async()=>{
 const u=ui(),input=u.elements['lesson-note'];await respond(u.requests.shift(),{text:'',version:0});
 input.value='수업 전';input.events.input();[...u.timers.values()].pop()();
 const first=u.requests.shift();assert.equal(JSON.parse(first.options.body).text,'수업 전');
 input.value='수업 중';input.events.input();
 let warned=false;u.events.beforeunload({preventDefault(){warned=true;}});assert.equal(warned,true);
 await respond(first,{text:'수업 전',version:1,updatedAt:new Date().toISOString()});
 [...u.timers.values()].pop()();const second=u.requests.shift();assert.equal(JSON.parse(second.options.body).version,1);
 await respond(second,{text:'수업 중',version:2,updatedAt:new Date().toISOString()});
 warned=false;u.events.beforeunload({preventDefault(){warned=true;}});assert.equal(warned,false);
});
test('failed save retains input and permits manual retry; conflict blocks overwrite',async()=>{
 const u=ui(),input=u.elements['lesson-note'];await respond(u.requests.shift(),{text:'',version:0});
 input.value='<script>메모</script>';input.events.input();u.elements['save-note'].events.click();
 await respond(u.requests.shift(),'다시 로그인해 주세요.',401);assert.equal(input.value,'<script>메모</script>');assert.equal(u.elements['save-note'].disabled,false);
 u.elements['save-note'].events.click();await respond(u.requests.shift(),'다른 창에서 변경',409);
 assert.equal(input.value,'<script>메모</script>');assert.equal(u.elements['save-note'].disabled,true);
 u.elements['save-note'].events.click();assert.equal(u.requests.length,0);
});
test('initial read failure prevents blank input from replacing existing notes',async()=>{
 const u=ui();await respond(u.requests.shift(),'DB 연결 실패',503);
 assert.equal(u.elements['lesson-note'].disabled,true);assert.equal(u.elements['save-note'].disabled,true);
 u.elements['reload-note'].events.click();await respond(u.requests.shift(),{text:'기존 메모',version:4});
 assert.equal(u.elements['lesson-note'].value,'기존 메모');assert.equal(u.elements['lesson-note'].disabled,false);
});
