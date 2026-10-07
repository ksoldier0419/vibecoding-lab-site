const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const learning=require('./quiz-learning');
const row=(purpose='learning')=>({id:randomUUID(),content:{prompt:'문제',choices:['A','B','C','D'],answer:0,explanation:'해설',choiceExplanations:['A','B','C','D'],sourceTitle:'근거',measurement:{purpose}}});
function step(s,action,data={}){return learning.change(s,action,data,randomUUID()).state;}
test('first cycle precedes repetition; display positions map to immutable choice; public response hides solution',()=>{
 let s=learning.create([row(),row()]);s=step(s,'show');const first=learning.current(s),order=[...first.order];assert.equal(learning.publicSession({id:randomUUID(),state:s,version:1}).current.answer,null);
 const wrong=order.indexOf(1);const result=learning.change(s,'answer',{position:wrong},randomUUID());assert.equal(result.answer.choice,1);s=result.state;s=step(s,'understand');s=step(s,'next');assert.equal(s.cycle,1);s=step(s,'show');s=step(s,'answer',{position:learning.current(s).order.indexOf(0)});s=step(s,'next');assert.equal(s.cycle,2);assert.equal(s.order.length,1);s=step(s,'show');assert.notDeepEqual(learning.current(s).order,order);s=step(s,'answer',{position:learning.current(s).order.indexOf(0)});s=step(s,'next');assert.equal(s.finished,true);assert.equal(s.items[0].attempts,2);assert.equal(s.items[0].firstCorrect,false);
});
test('understanding and comment coexist; review excluded from repetition; pause resume and invalid actions',()=>{
 let s=step(learning.create([row()]),'show');s=step(s,'answer',{position:learning.current(s).order.indexOf(1)});s=step(s,'understand');s=step(s,'comment',{comment:'표현 확인'});assert.equal(learning.current(s).answer.understood,true);s=step(s,'understand');assert.equal(learning.current(s).answer.comment,'표현 확인');s=step(s,'pause');assert.throws(()=>step(s,'next'),/이어서/);s=step(s,'resume');s=step(s,'next');assert.equal(s.finished,true);assert.equal(s.items[0].status,'review');
});
test('assessment does not repeat; withdrawn is distinct; identical permutations are avoided on repetition',()=>{
 let s=step(learning.create([row('transfer')]),'show');s=step(s,'answer',{position:learning.current(s).order.indexOf(1)});s=step(s,'next');assert.equal(s.finished,true);assert.equal(s.items[0].status,'assessed');
 const withdrawn=step(learning.create([row()]),'withdraw');assert.equal(withdrawn.items[0].status,'withdrawn');assert.equal(withdrawn.finished,true);
 for(let i=0;i<100;i++){const order=learning.shuffle([0,1,2,3]);assert.deepEqual([...order].sort(),[0,1,2,3]);assert.notDeepEqual(order,[0,1,2,3]);}
});

test('opening explanation is recorded and understanding can be unchecked without deleting comments',()=>{let s=step(learning.create([row()]),'show');s=step(s,'answer',{position:0});assert.equal(learning.current(s).answer.explanationOpened,undefined);s=step(s,'explanation');assert.equal(learning.current(s).answer.explanationOpened,true);s=step(s,'comment',{comment:'표현 검토'});s=step(s,'understand',{understood:true});s=step(s,'understand',{understood:false});assert.equal(learning.current(s).answer.understood,false);assert.equal(learning.current(s).answer.comment,'표현 검토');});
