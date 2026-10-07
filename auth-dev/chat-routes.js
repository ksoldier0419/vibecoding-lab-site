const {lessonContext,createResponder}=require('./lesson-ai');
function chatRoutes(app,repository,{own,localPost,config}) {
 const respond=config.chatReply || createResponder({apiKey:config.openAIKey,model:config.openAIModel});
 const available=!!(config.chatReply || config.openAIKey);
 const publicChat=chat=>({messages:chat.messages,version:chat.version});
 function fail(res,error){res.status(503).json({error:error?.public?error.message:'AI 채팅을 처리하지 못했습니다. 입력은 유지됩니다. 잠시 후 다시 시도해 주세요.'});}
 const url='/api/study/:course/:lesson/chat';
 app.get(url,...own,async(req,res)=>{try{res.json({available,chat:publicChat(await repository.getChat(req.session.user.id,req.course.id,req.params.lesson))});}catch(e){fail(res,e);}});
 app.post(url,localPost,...own,async(req,res)=>{
  const body=req.body,user=req.session.user.id,course=req.course.id,lesson=req.params.lesson;
  if(!body || Object.keys(body).some(k=>!['text','version','requestId'].includes(k)) || typeof body.text!=='string' || !body.text.trim() || body.text.length>4000 || !Number.isSafeInteger(body.version) || body.version<0 || typeof body.requestId!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId))return res.status(400).json({error:'질문은 1~4,000자로 입력해 주세요.'});
  if(!available)return res.status(503).json({error:'AI 채팅이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.'});
  let reserved=false;
  try {
   const old=await repository.getChat(user,course,lesson);
   if(old.requestId===body.requestId && !old.busyUntil)return res.json({chat:publicChat(old)});
   const context=lessonContext(req.course,lesson);
   const chat=await repository.beginChat(user,course,lesson,body.version,body.requestId);
   if(!chat)return res.status(409).json({error:'다른 창에서 대화 중이거나 대화·일일 한도에 도달했습니다. 대화를 다시 불러오거나 나중에 다시 시도해 주세요.'});
   reserved=true;
   const reply=await respond({context,history:chat.messages,text:body.text.trim()});
   const messages=[...chat.messages,{role:'user',content:body.text.trim()},{role:'assistant',content:reply}];
   const saved=await repository.finishChat(user,course,lesson,chat.version,body.requestId,messages);
   if(!saved)return res.status(409).json({error:'대화 상태가 변경되었습니다. 대화를 다시 불러와 주세요.'});
   res.json({chat:publicChat(saved)});
  }catch(e){if(reserved)await repository.cancelChat(user,course,lesson,body.requestId).catch(()=>{});fail(res,e);}
 });
 app.post(url+'/reset',localPost,...own,async(req,res)=>{
  const value=req.body;if(!value || Object.keys(value).some(k=>k!=='version') || !Number.isSafeInteger(value.version) || value.version<0)return res.status(400).json({error:'대화를 다시 불러와 주세요.'});
  try{const chat=await repository.resetChat(req.session.user.id,req.course.id,req.params.lesson,value.version);if(!chat)return res.status(409).json({error:'다른 창에서 대화 중이거나 변경되었습니다. 다시 불러와 주세요.'});res.json({chat:publicChat(chat)});}catch(e){fail(res,e);}
 });
}
module.exports={chatRoutes};
