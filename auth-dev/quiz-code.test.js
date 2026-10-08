const {test}=require('node:test');
const assert=require('node:assert/strict');
const model=require('./quiz-model');
const learning=require('./quiz-learning');
const {schema}=require('./quiz-ai');
const context='클래스 선언';
const sample=()=>({prompt:'①에 들어갈 내용은 무엇인가요?',choices:['return','void','static','class'],answer:3,choiceExplanations:['반환','반환형','정적','클래스 선언'],concept:'클래스',intent:'클래스 선언 확인',explanation:'class로 선언합니다.',sourceTitle:context,sourceQuote:context,code:{language:'java',source:'public ① Hello {\n    public static void main(String[] args) {}\n}',snippet:'public ① Hello {',blankNumber:1}});
test('code metadata survives validation and student session without leaking solutions',()=>{
 const q=model.question(sample(),context);assert.deepEqual(q,sample());
 const publicQ=model.studentQuestion({id:'q',content:q});assert.deepEqual(publicQ.code,q.code);assert.equal(publicQ.answer,undefined);
 const row={id:'session',version:0,state:learning.create([{id:'q',content:q}])};
 const visible=learning.publicSession(row).current;assert.deepEqual(visible.code,q.code);assert.equal(visible.answer,null);assert.equal(visible.choiceExplanations,undefined);
 assert.equal(schema.properties.proposals.items.properties.question.anyOf[0].properties.code.anyOf[1].type,'null');
});
test('blank number, literal focus line, language and lengths are validated; legacy questions work',()=>{
 const q=sample();for(const change of [{blankNumber:2},{snippet:'① other'},{language:'html'},{source:'x'.repeat(12001)}])assert.throws(()=>model.question({...q,code:{...q.code,...change}},context));
 const {code,...legacy}=q;assert.deepEqual(model.question(legacy,context),legacy);assert.deepEqual(model.question({...legacy,code:null},context),legacy);
});
test('up to five candidates require unique blanks in the same shared code',()=>{
 const source='① ② ③ ④ ⑤';
 const proposals=Array.from({length:5},(_,i)=>({operation:'add',question:{...sample(),prompt:String(i),code:{language:'java',source,snippet:source,blankNumber:i+1}}}));
 assert.equal(model.reply({message:'빈칸 문제',proposals},{items:[]},context).proposals.length,5);
 assert.throws(()=>model.reply({message:'문제',proposals:proposals.map(p=>({...p,question:{...p.question,code:null}}))},{items:[]},context));
 assert.throws(()=>model.reply({message:'문제',proposals:proposals.map(p=>({...p,question:{...p.question,code:{...p.question.code,blankNumber:1}}}))},{items:[]},context));
});

test('distinct blanks in a shared code are retained despite similar prompts and choices',()=>{
 const {compareCandidates}=require('./quiz-quality');
 const first={...sample(),code:{...sample().code,source:'public ? Hello { ? }',snippet:'public ? Hello { ? }'}};
 const second={...first,code:{...first.code,blankNumber:2}};
 assert.equal(compareCandidates([{id:'one',question:first},{id:'two',question:second}],[]).length,2);
 assert.equal(compareCandidates([{id:'one',question:first},{id:'two',question:first}],[]).length,1);
});
