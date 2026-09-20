const {test}=require('node:test');
const assert=require('node:assert/strict');
const {endpoints,selectData}=require('./bootstrap-production');
test('migration refuses same endpoint including pooler alias and non-Neon destinations',()=>{
 assert.throws(()=>endpoints('postgresql://u:p@ep-a.neon.tech/db','postgresql://u:p@ep-a-pooler.neon.tech/other'));
 assert.throws(()=>endpoints('postgresql://u:p@ep-a.neon.tech/db','postgresql://u:p@example.com/db'));
 assert.equal(endpoints('postgresql://u:p@ep-a.neon.tech/db','postgresql://u:p@ep-b.neon.tech/db').length,2);
});
test('migration projects only roster fields and excludes all enrollments for an omitted student',()=>{
 const result=selectData([{id:'a',title:'Course',secret:'omit'}],
 [{studentNumber:'0001',name:'Example',google_id:'private',phone:'private'},{studentNumber:'TEST',name:'Synthetic'}],
 [{studentNumber:'0001',course:'a',section:'01'},{studentNumber:'0001',course:'a',section:'02'},{studentNumber:'TEST',course:'a',section:'1'}],['TEST']);
 assert.deepEqual(result,{courses:[{id:'a',title:'Course'}],students:[{studentNumber:'0001',name:'Example'}],enrollments:[{studentNumber:'0001',course:'a',section:'01'},{studentNumber:'0001',course:'a',section:'02'}]});
});
test('migration rejects broken and duplicate source enrollment before writing',()=>{
 const c=[{id:'a',title:'A'}],s=[{studentNumber:'1',name:'A'}],e={studentNumber:'1',course:'a',section:'1'};
 assert.throws(()=>selectData(c,s,[{...e,course:'missing'}]));
 assert.throws(()=>selectData(c,s,[e,e]));
});
