const {invalid}=require('./quiz-model');
function grams(text){const s=text.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');return new Set(Array.from({length:Math.max(0,s.length-2)},(_,i)=>s.slice(i,i+3)));}
function similarity(a,b){if(a.code && b.code && a.code.source===b.code.source && a.code.language===b.code.language && a.code.blankNumber!==b.code.blankNumber)return 0;const x=grams(a.prompt+' '+a.choices.join(' ')),y=grams(b.prompt+' '+b.choices.join(' '));return x.size+y.size?2*[...x].filter(v=>y.has(v)).length/(x.size+y.size):0;}
function compareCandidates(proposals,existing){const kept=[];for(const p of proposals){if(!p.question){kept.push(p);continue;}const matches=[...existing,...kept.filter(v=>v.question).map(v=>({...v.question,id:v.id}))].filter(q=>q.id!==p.questionId).map(q=>({id:q.id,prompt:q.prompt,score:Math.round(similarity(p.question,q)*100)})).sort((a,b)=>b.score-a.score);if(matches[0]?.score>=90)continue;kept.push({...p,similarity:matches.slice(0,2)});}return kept;}
function statsRange(query,now=new Date()){
 const period=query.period||'all';let from=null,to=null;
 if(['6m','1y'].includes(period)){const d=new Date(now);d.setUTCMonth(d.getUTCMonth()-(period==='6m'?6:12));from=d.toISOString();to=now.toISOString();}
 else if(period==='semester'){const year=Number(query.year),semester=Number(query.semester);if(!Number.isInteger(year)||year<2020||year>2100||![1,2].includes(semester))invalid('학기와 연도를 확인해 주세요.');from=new Date(Date.UTC(year,semester===1?2:8,1,-9)).toISOString();to=new Date(Date.UTC(semester===1?year:year+1,semester===1?8:2,1,-9)).toISOString();}
 else if(period!=='all')invalid('통계 기간을 확인해 주세요.');return {period,from,to};
}
module.exports={similarity,compareCandidates,statsRange};
