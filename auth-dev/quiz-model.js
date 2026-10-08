const {randomUUID,createHash}=require('node:crypto');
const uuid=value=>typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const hash=text=>createHash('sha256').update(text).digest('hex');
function invalid(message){throw Object.assign(Error(message),{status:400,public:true});}
function question(value,context){
 if(!value || !['prompt','concept','intent','explanation','sourceTitle','sourceQuote'].every(k=>typeof value[k]==='string' && value[k].trim() && value[k].length<=4000))invalid('문제·출제 의도·해설·교안 근거를 확인해 주세요.');
 if(!Array.isArray(value.choices) || value.choices.length!==4 || value.choices.some(c=>typeof c!=='string' || !c.trim() || c.length>2000) || new Set(value.choices.map(c=>c.trim())).size!==4)invalid('서로 다른 보기 4개가 필요합니다.');
 if(!Array.isArray(value.choiceExplanations) || value.choiceExplanations.length!==4 || value.choiceExplanations.some(c=>typeof c!=='string' || !c.trim() || c.length>2000) || !Number.isInteger(value.answer) || value.answer<0 || value.answer>3)invalid('정답과 보기별 해설을 확인해 주세요.');
 if(value.choices.some(c=>/(?:[①②③④]|[1-4]번).*(?:보기|모두|둘|함께)|위의 모든|이상의 모든/.test(c)))invalid('보기 순서에 의존하는 표현을 바꿔 주세요.');
 const normalize=s=>s.replace(/\s+/g,' ').trim();
 if(!normalize(context).includes(normalize(value.sourceQuote)) || !context.includes(value.sourceTitle))invalid('문제 근거가 현재 교안에 없습니다. 다시 생성해 주세요.');
 let code;
 if(value.code!==undefined && value.code!==null){
  const c=value.code;
  if(!c || typeof c.language!=='string' || !['java','python','javascript','typescript','c','cpp','csharp','json','text'].includes(c.language) || typeof c.source!=='string' || !c.source.trim() || c.source.length>12000 || typeof c.snippet!=='string' || !c.snippet.trim() || c.snippet.length>2000 || !Number.isInteger(c.blankNumber) || c.blankNumber<1 || c.blankNumber>20)invalid('빈칸 코드의 언어·원문·번호·해당 줄을 확인해 주세요.');
  const marker=String.fromCodePoint(0x2460+c.blankNumber-1);
  if(!c.source.includes(marker) || !c.snippet.includes(marker) || !c.source.includes(c.snippet))invalid('전체 코드와 해당 줄에 같은 빈칸 번호가 필요합니다.');
  code={language:c.language,source:c.source,snippet:c.snippet,blankNumber:c.blankNumber};
 }
 return {...(code?{code}:{}),...Object.fromEntries(['prompt','choices','answer','choiceExplanations','concept','intent','explanation','sourceTitle','sourceQuote'].map(k=>[k,value[k]]))};
}
function reply(value,state,context){
 if(!value || typeof value.message!=='string' || !value.message.trim() || value.message.length>6000 || !Array.isArray(value.proposals) || value.proposals.length>5)invalid('출제 응답 형식을 확인할 수 없습니다. 다시 요청해 주세요.');
 if(value.proposals.length>2){
  const codes=value.proposals.map(p=>p.question?.code);
  if(codes.some(c=>!c) || codes.some(c=>c.source!==codes[0].source || c.language!==codes[0].language) || new Set(codes.map(c=>c.blankNumber)).size!==codes.length)invalid('후보 3~5개는 같은 코드의 서로 다른 빈칸 문제로 구성해 주세요.');
 }
 const questions=value.questions===undefined?[]:value.questions;
 if(!Array.isArray(questions) || questions.length>3 || (questions.length && value.proposals.length))invalid('세부 질문과 문제 후보는 나누어 제시해야 합니다.');
 const clarifications=questions.map(q=>{
  if(!q || typeof q.prompt!=='string' || !q.prompt.trim() || q.prompt.length>500 || !Array.isArray(q.options) || q.options.length<2 || q.options.length>5 || q.options.some(o=>typeof o!=='string' || !o.trim() || o.length>200) || new Set(q.options.map(o=>o.trim())).size!==q.options.length)invalid('세부 질문의 선택지를 확인할 수 없습니다. 다시 요청해 주세요.');
  return {id:randomUUID(),prompt:q.prompt,options:q.options};
 });
 return {message:value.message,questions:clarifications,proposals:value.proposals.map(p=>{
  if(!['add','replace','retire'].includes(p.operation))invalid('지원하지 않는 문제 변경입니다.');
  const target=p.operation==='add'?null:state.items.find(q=>q.id===p.questionId && ['accepted','published'].includes(q.status));
  if(p.operation!=='add' && !target)invalid('변경 대상 문제의 고유번호를 확인해 주세요.');
  return {id:randomUUID(),operation:p.operation,questionId:target?.id||null,question:p.operation==='retire'?null:question(p.question,context),contextHash:hash(context)};
 })};
}
function apply(set,action,itemId,context,targetCount){
 const state=structuredClone(set.state),publications=[],retired=[];
 if(action==='accept'){
  const candidate=state.proposals.find(p=>p.id===itemId);if(!candidate)invalid('후보가 변경되었습니다. 다시 확인해 주세요.');
  const target=candidate.questionId?state.items.find(q=>q.id===candidate.questionId):null;
  if(candidate.questionId && !target)invalid('대상 문제를 찾을 수 없습니다.');
  if(target && !['accepted','published'].includes(target.status))invalid('이미 변경된 문제입니다.');
  if(candidate.operation==='retire'){
   if(state.items.some(q=>q.status==='accepted' && q.replaces===target.id))invalid('수정 후보의 채택을 취소한 뒤 비공개로 변경해 주세요.');
   if(target.status==='published')retired.push(target.id);target.status='retired';
  }else{
   question(candidate.question,context);
   if(candidate.contextHash!==hash(context))invalid('교안이 변경되었습니다. 문제를 다시 생성해 주세요.');
   const pending=state.items.filter(q=>q.status==='accepted');
   if(target && pending.some(q=>q.replaces===target.id))invalid('이미 수정 후보를 채택한 문제입니다. 기존 채택을 취소한 뒤 다시 선택해 주세요.');
   if(target?.status==='accepted')target.status='retired';
   state.items.push({id:randomUUID(),...candidate.question,sourceParentId:candidate.sourceParentId||target?.id||null,status:'accepted',replaces:target?.status==='published'?target.id:null,contextHash:candidate.contextHash});
  }
  state.proposals=state.proposals.filter(p=>p.id!==itemId);
 }else if(action==='publish'){
  const pending=state.items.filter(q=>q.status==='accepted');if(!pending.length)invalid('공개할 채택 문제가 없습니다.');
  const active=state.items.filter(q=>['accepted','published'].includes(q.status) && !pending.some(p=>p.replaces===q.id));
  for(const q of pending){question(q,context);if(q.contextHash!==hash(context))invalid('교안이 변경되었습니다. 채택 문제를 다시 검토해 주세요.');q.status='published';publications.push(q);if(q.replaces){const old=state.items.find(p=>p.id===q.replaces);if(!old || old.status!=='published')invalid('이전 문제 상태가 변경되었습니다.');old.status='retired';retired.push(old.id);}}
 }else if(action==='retire'){
  const q=state.items.find(q=>q.id===itemId && ['accepted','published'].includes(q.status));if(!q)invalid('삭제할 문제를 찾을 수 없습니다.');
  if(state.items.some(p=>p.status==='accepted' && p.replaces===q.id))invalid('변형 후보의 채택을 취소한 뒤 삭제해 주세요.');
  if(q.status==='published')retired.push(q.id);q.status='retired';
 }else if(action==='target'){
  const pending=state.items.filter(q=>q.status==='accepted'),active=state.items.filter(q=>['accepted','published'].includes(q.status) && !pending.some(p=>p.replaces===q.id));
  if(!Number.isInteger(targetCount) || targetCount<1 || targetCount>50 || targetCount<active.length)invalid('목표 수는 현재 문제 수 이상이며 1~50개여야 합니다.');
 }else if(action==='discard'){
  const target=state.items.find(q=>q.id===itemId && q.status==='accepted');if(!target)invalid('미공개 채택 문제만 취소할 수 있습니다.');target.status='retired';
 }else invalid('적용할 작업을 확인해 주세요.');
 if(state.items.length>150)invalid('문제 묶음의 변경 한도에 도달했습니다. 새 묶음을 만들어 주세요.');
 return {state,publications,retired,target:action==='target'?targetCount:set.target};
}
function studentQuestion(row){return {id:row.id,prompt:row.content.prompt,choices:row.content.choices,concept:row.content.concept,...(row.content.code?{code:row.content.code}:{}),answered:!!row.answered};}
module.exports={uuid,hash,question,reply,apply,studentQuestion,invalid};
