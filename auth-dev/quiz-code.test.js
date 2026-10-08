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

test('explicit single blank uses a required code schema and overrides clarification defaults',async()=>{
 const {blankRequest,requestSchema,createQuizResponder}=require('./quiz-ai');
 const text='교안에 있는 코드중 빈칸 1개를 만들고 각 빈칸을 4지선다형으로 출제해줘';
 assert.deepEqual(blankRequest(text),{count:1});
 assert.deepEqual(blankRequest('교안 코드로 빈칸 한 개 출제해줘'),{count:1});
 assert.deepEqual(blankRequest('계속 만들어줘',{messages:[{role:'user',content:text}]}),{count:1});
 assert.equal(blankRequest('일반 객관식으로 변경해줘',{messages:[{role:'user',content:text}]}),null);
 const dynamic=requestSchema({count:1});
 assert.equal(dynamic.properties.questions.maxItems,0);
 assert.equal(dynamic.properties.proposals.minItems,1);
 assert.equal(dynamic.properties.proposals.maxItems,1);
 assert.equal(dynamic.properties.proposals.items.properties.question.properties.code.type,'object');
 assert.deepEqual(dynamic.properties.proposals.items.properties.question.properties.code.properties.blankNumber.enum,[1]);
 assert(schema.properties.proposals.items.properties.question.anyOf);
 let body;
 const responder=value=>createQuizResponder({apiKey:'fake',fetcher:async(url,options)=>{body=JSON.parse(options.body);return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]})};}});
 const valid={message:'빈칸 후보',questions:[],proposals:[{operation:'add',questionId:null,question:sample()}]};
 const result=await responder(valid)({context,state:{messages:[],items:[]},text});
 assert.equal(result.proposals.length,1);assert(body.instructions.includes('교안 안의 코드 블록에서 적절한 예시를 직접 선택'));
 await assert.rejects(()=>responder({...valid,proposals:[{...valid.proposals[0],question:{...sample(),code:null}}]})({context,state:{messages:[],items:[]},text}),/빈칸 형식/);
 await assert.rejects(()=>responder({...valid,proposals:[{...valid.proposals[0],question:{...sample(),code:{...sample().code,source:'① ②'}}}]})({context,state:{messages:[],items:[]},text}),/빈칸 수/);
});

test('response schema constrains titles and quotes to literal lesson evidence for ordinary and blank questions',()=>{
 const {requestSchema,evidenceOptions}=require('./quiz-ai');
 const lesson=['# Java 시작','## 변수 선언','int x = 1; // 값을 저장한다','변수 이름 앞에는 자료형을 쓴다.'].join(String.fromCharCode(10));
 const evidence=evidenceOptions(lesson);
 assert.deepEqual(evidence.titles,['Java 시작','변수 선언']);
 assert(evidence.quotes.includes('int x = 1; // 값을 저장한다'));
 for(const blank of [null,{count:1}]){
  const schema=requestSchema(blank,lesson);
  const p=schema.properties.proposals.items.properties.question;
  const q=blank?p:p.anyOf[0];
  assert.deepEqual(q.properties.sourceTitle.enum,evidence.titles.map((_,i)=>i));
  assert.deepEqual(q.properties.sourceQuote.enum,evidence.quotes.map((_,i)=>i));
  const candidate={...sample(),sourceTitle:evidence.titles[1],sourceQuote:evidence.quotes[0]};
  assert.doesNotThrow(()=>model.question(candidate,lesson));
 }
});
test('AI network and malformed JSON errors have safe public explanations',async()=>{
 const {createQuizResponder}=require('./quiz-ai');
 const args={context,state:{messages:[],items:[]},text:'일반 문제 생성'};
 await assert.rejects(()=>createQuizResponder({apiKey:'fake',fetcher:async()=>{throw Error('secret internal detail');}})(args),e=>e.public && e.message.includes('서버 연결') && !e.message.includes('secret'));
 await assert.rejects(()=>createQuizResponder({apiKey:'fake',fetcher:async()=>({ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'invalid JSON'}]}]})})})(args),e=>e.public && e.message.includes('JSON'));
});

test('quoted source evidence uses numeric schema values and is restored exactly',()=>{
 const {requestSchema,restoreEvidence,evidenceOptions}=require('./quiz-ai');
 const lesson=['# Java','## Hello','System.out.println("Hello, Java");'].join(String.fromCharCode(10));
 const schema=requestSchema({count:1},lesson);
 const q=schema.properties.proposals.items.properties.question;
 assert.equal(q.properties.sourceQuote.type,'integer');assert.deepEqual(q.properties.sourceQuote.enum,[0]);
 const value={proposals:[{question:{...sample(),sourceTitle:1,sourceQuote:0}}]};
 restoreEvidence(value,lesson);
 assert.equal(value.proposals[0].question.sourceQuote,'System.out.println("Hello, Java");');
 assert.equal(value.proposals[0].question.sourceTitle,'Hello');
 assert.doesNotThrow(()=>model.question(value.proposals[0].question,lesson));
 assert.throws(()=>restoreEvidence({proposals:[{question:{sourceQuote:20}}]},lesson),/근거 번호/);
});
test('upstream failures identify schema, authentication, quota and service errors without echoing raw errors',async()=>{
 const {createQuizResponder}=require('./quiz-ai');
 for(const [status,code,expected] of [[400,'invalid_json_schema','응답 형식'],[401,'invalid_api_key','키 인증'],[429,'insufficient_quota','잔액'],[429,'rate_limit_exceeded','요청 한도'],[503,'server_error','서비스 오류']]){
  const respond=createQuizResponder({apiKey:'fake',fetcher:async()=>({ok:false,status,json:async()=>({error:{code,message:'secret must not be displayed'}})})});
  await assert.rejects(()=>respond({context,state:{items:[],messages:[]},text:'일반 문제'}),e=>e.public && e.message.includes(expected) && !e.message.includes('secret'));
 }
});
