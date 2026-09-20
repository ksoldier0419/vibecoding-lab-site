const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function page({existing=false,registered=true,phone='test-phone',role='student'}={}) {
 const elements=new Map(),moves=[];
 function element() {return {hidden:false,textContent:'',value:'',handlers:{},
  addEventListener(name,fn){this.handlers[name]=fn;},replaceChildren(){},append(){},focus(){},
  elements:{namedItem(){return {value:'',readOnly:false};}}};}
 const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element};
 const user={id:'synthetic',role,name:'Test'};
 const google={accounts:{id:{initialize(){},renderButton(){},disableAutoSelect(){}}}};
 const context=vm.createContext({document,google,window:{google},URLSearchParams,
  location:{search:'?profile=1',replace:url=>moves.push(url),assign:url=>moves.push(url),reload:()=>moves.push('reload')},
  fetch:async url=>({ok:true,json:async()=> {
   if(url==='/api/auth/me')return {user:existing?user:null};
   if(url==='/api/auth/config')return {clientId:'test',nonce:'test'};
   if(url==='/api/auth/google')return {user};
   if(url==='/api/student/profile')return {registered,profile:{name:'Test',phone},courses:[]};
   if(url==='/api/public/courses')return {courses:[]};
   return {ok:true};
  }})
 });
 vm.runInContext(fs.readFileSync(require.resolve('./public/login.js'),'utf8'),context);
 return {context,moves,elements};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('fresh Google login ignores stale profile query for registered students and professors',async()=>{
 for(const role of ['student','professor']) {
  const p=page({role});await settle();
  await vm.runInContext("login({credential:'test'},'test')",p.context);
  assert.deepEqual(p.moves,['/courses.html']);
 }
});
test('existing session can deliberately open My information',async()=>{
 const p=page({existing:true});await settle();
 assert.deepEqual(p.moves,[]);
 assert.equal(p.elements.get('student-status').textContent.includes('가입 완료'),true);
});
test('fresh login still requires registration and mandatory phone',async()=>{
 for(const settings of [{registered:false},{phone:''}]) {
  const p=page(settings);await settle();
  await vm.runInContext("login({credential:'test'},'test')",p.context);
  assert.deepEqual(p.moves,[]);
 }
});
test('logout clears profile URL rather than reloading it',async()=>{
 const p=page({existing:true});await settle();
 await p.elements.get('logout').handlers.click();
 assert.deepEqual(p.moves,['/login.html']);
});
