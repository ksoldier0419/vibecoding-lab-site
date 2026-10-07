const {randomInt}=require('node:crypto');
const {invalid}=require('./quiz-model');
const RULE='concept-learning-v1';
function shuffle(previous){let values;do{values=[0,1,2,3];for(let i=3;i>0;i--){const j=randomInt(i+1);[values[i],values[j]]=[values[j],values[i]];}}while(previous&&values.every((v,i)=>v===previous[i]));return values;}
function create(rows){return {rule:RULE,cycle:1,cursor:0,order:rows.map(q=>q.id),items:rows.map(q=>({id:q.id,content:q.content,contextHash:q.contextHash,status:'unseen',attempts:0,order:null,shownAt:null,answer:null})),paused:false,finished:false};}
function current(state){return state.items.find(q=>q.id===state.order[state.cursor]);}
function advance(s){s.cursor++;if(s.cursor>=s.order.length){s.order=s.items.filter(q=>q.status==='repeat').map(q=>q.id);s.cursor=0;if(!s.order.length)s.finished=true;else{s.cycle++;for(const q of s.items.filter(q=>q.status==='repeat')){q.answer=null;q.shownAt=null;}}}}
function change(original,action,data,requestId,now=new Date().toISOString()){
 const s=structuredClone(original),q=current(s);if(s.finished)invalid('종료된 학습 세션입니다. 다음 세트를 시작해 주세요.');let answer=null,feedback=null;
 const event={action,rule:s.rule,cycle:s.cycle,questionId:q?.id||null,at:now};
 if(action==='pause'){s.paused=true;}
 else if(action==='resume'){s.paused=false;}
 else{
  if(s.paused||s.finished||!q)invalid('현재 진행할 문제가 없습니다. 이어서 풀기를 선택해 주세요.');
  if(action==='show'){if(q.shownAt||q.answer)invalid('이미 제시한 문제입니다.');q.order=shuffle(q.order);q.shownAt=now;event.displayOrder=q.order;}
  else if(action==='answer'){
   if(!q.shownAt||q.answer||!Number.isInteger(data.position)||data.position<0||data.position>3)invalid('현재 문제의 보기를 선택해 주세요.');
   const choice=q.order[data.position],correct=choice===q.content.answer;q.attempts++;if(q.attempts===1)q.firstCorrect=correct;q.status=correct?'complete':q.content.measurement?.purpose&&q.content.measurement.purpose!=='learning'?'assessed':'repeat';q.answer={id:requestId,choice,correct,understood:false,comment:''};
   answer={id:requestId,questionId:q.id,choice,correct};Object.assign(event,{position:data.position,choice,correct,displayOrder:q.order,shownAt:q.shownAt,elapsedMs:Math.max(0,Date.parse(now)-Date.parse(q.shownAt)),attempt:q.attempts});
  }else if(action==='explanation'){if(!q.answer)invalid('답을 먼저 제출해 주세요.');q.answer.explanationOpened=true;}else if(action==='understand'){if(!q.answer)invalid('답을 먼저 제출해 주세요.');const understood=data.understood===undefined?true:data.understood;if(typeof understood!=='boolean')invalid('이해 확인 값을 확인해 주세요.');q.answer.understood=understood;event.understood=understood;feedback={id:q.answer.id,understood,comment:null};}
  else if(action==='comment'){if(!q.answer||typeof data.comment!=='string'||!data.comment.trim()||data.comment.length>2000)invalid('답을 제출한 뒤 의견을 작성해 주세요.');q.answer.comment=data.comment.trim();if(!q.answer.correct&&q.status!=='assessed')q.status='review';feedback={id:q.answer.id,understood:null,comment:q.answer.comment};event.comment=q.answer.comment;}
  else if(action==='next'){if(!q.answer)invalid('답을 먼저 제출해 주세요.');event.understood=q.answer.understood;advance(s);}
  else if(action==='withdraw'){q.status='withdrawn';event.reason='no_longer_visible';advance(s);}
  else invalid('학습 작업을 확인해 주세요.');
 }
 return {state:s,event,answer,feedback};
}
function publicSession(row){if(!row)return null;const s=row.state,q=current(s);return {id:row.id,version:row.version,rule:s.rule,cycle:s.cycle,paused:s.paused,finished:s.finished,items:s.items.map(q=>({id:q.id,status:q.status,attempts:q.attempts})),current:q&&!s.finished?{id:q.id,prompt:q.content.prompt,purpose:q.content.measurement?.purpose||'learning',choices:(q.order||[0,1,2,3]).map(i=>q.content.choices[i]),shown:!!q.shownAt,answer:q.answer?{...q.answer,position:q.order.indexOf(q.answer.choice),correctPosition:q.order.indexOf(q.content.answer),explanation:q.content.explanation,choiceExplanation:q.content.choiceExplanations[q.answer.choice],sourceTitle:q.content.sourceTitle}:null}:null};}
module.exports={RULE,shuffle,create,current,change,publicSession};
