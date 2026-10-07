const $=id=>document.getElementById(id),studentId=new URLSearchParams(location.search).get('student');
const url='/api/admin/assistant-scopes/'+encodeURIComponent(studentId || '');let courses=[];
async function api(body){const response=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error || '요청을 처리하지 못했습니다.');return data;}
function option(value,label){const node=document.createElement('option');node.value=value;node.textContent=label;return node;}
function sections(){const course=courses.find(c=>c.id===$('scope-course').value);$('scope-section').replaceChildren(option('*','모든 분반'));for(const section of course?.sections || [])if(section!=='*')$('scope-section').append(option(section,section?section+'분반':'분반 미지정'));}
async function load(){const data=await api();courses=data.courses;$('scope-student').textContent=data.student.studentNumber+' · '+data.student.name;
 $('scope-course').replaceChildren(...courses.map(c=>option(c.id,c.title)));sections();$('scope-list').replaceChildren();
 for(const scope of data.scopes){const item=document.createElement('li'),text=document.createElement('span'),remove=document.createElement('button');text.textContent=scope.title+' · '+(scope.section==='*'?'모든 분반':scope.section?scope.section+'분반':'분반 미지정');remove.type='button';remove.textContent='담당 해제';remove.addEventListener('click',()=>run(async()=>{await api({courseId:scope.courseId,section:scope.section,enabled:false});await load();}));item.append(text,remove);$('scope-list').append(item);}
 $('scope-status').textContent=data.scopes.length?'담당 범위를 불러왔습니다.':'담당 범위가 없습니다. 과목·분반을 추가해 주세요.';
}
async function run(action){$('scope-form').inert=true;$('scope-list').inert=true;$('scope-retry').disabled=true;try{await action();}catch(error){$('scope-status').textContent=error.message;}finally{$('scope-form').inert=false;$('scope-list').inert=false;$('scope-retry').disabled=false;}}
$('scope-course').addEventListener('change',sections);$('scope-retry').addEventListener('click',()=>run(load));
$('scope-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{await api({courseId:$('scope-course').value,section:$('scope-section').value,enabled:true});await load();});});run(load);
