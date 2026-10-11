const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
for(const role of ['professor','assistant','student'])test(`${role} course selection opens course index instead of lesson workspace`,async()=>{
 const elements=new Map();
 function element(){return {children:[],hidden:false,append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},addEventListener(){}};}
 const courses=[{id:'903131',title:'Java',sections:[],url:'/2026-2-java_basic/index.html',studyUrl:(role==='student'?'/study.html':'/teaching.html')+'?course=2026-2-java_basic'},{id:'603108',title:'Python',sections:['01'],url:'/2026-2-python_adv/index.html',studyUrl:(role==='student'?'/study.html':'/teaching.html')+'?course=2026-2-python_adv'},{id:'pending',title:'Pending',sections:[],url:null}];
 const context={document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element},fetch:async()=>({ok:true,status:200,json:async()=>({role,courses})}),location:{replace(){assert.fail('Unexpected redirect');}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'public/courses.js'),'utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));
 const cards=elements.get('courses').children.map(li=>li.children[0]);
 assert.equal(cards[0].href,courses[0].url);assert.equal(cards[1].href,courses[1].url);assert.equal(cards[2].className,'course-pending');assert.equal(cards[2].href,undefined);
 assert.equal(elements.get('admin').hidden,role!=='professor');
 assert.equal(elements.get('java-instructor').hidden,role==='student');
});
