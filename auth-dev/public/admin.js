const $=id=>document.getElementById(id);
const rosterCollator=new Intl.Collator('ko',{numeric:true});
let rosterSort='name-asc';
let allRows=[],editing=null,previewToken=null,editingCourse=null,loadedCourse=null;
async function api(url,body) {
 const response=await fetch(url,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();
 if(!response.ok) throw new Error(data.error||'요청을 처리하지 못했습니다.');
 return data;
}
function message(text) {$('status').textContent=text;}
function invalidatePreview() {previewToken=null;$('preview-area').hidden=true;}
function selectedSection() {return $('section-filter').value === '' ? null : JSON.parse($('section-filter').value);}
function resetEditor() {editing=null;$('editor').reset();$('section').value=selectedSection() || '';$('editor-title').textContent='학생 직접 등록';$('cancel').hidden=true;}
function cells(row,values) {for(const value of values) {const td=document.createElement('td');td.textContent=value;row.append(td);}}
function formatRegisteredAt(value) {
 if(!value) return '—';
 const date=new Date(value);
 if(Number.isNaN(date.getTime())) return '—';
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date);
}
function render() {
 const query=$('search').value.trim().toLowerCase(),target=$('rows');target.replaceChildren();
 const section=selectedSection();
 const sectionRows=allRows.filter(r=>section===null || (r.section || '')===section);
 const filtered=sectionRows.filter(r=>(r.studentNumber+' '+r.name).toLowerCase().includes(query));
 const order=rosterSort;
 for(const field of ['name','number']) {
  const active=order.startsWith(field),descending=order.endsWith('desc');
  $('sort-'+field+'-heading').setAttribute('aria-sort',active?(descending?'descending':'ascending'):'none');
  $('sort-'+field).querySelector('span').textContent=active?(descending?'↓':'↑'):'↕';
 }
 const key=order.startsWith('name')?'name':'studentNumber',direction=order.endsWith('desc')?-1:1;
 filtered.sort((a,b)=>direction*rosterCollator.compare(a[key],b[key])
  || rosterCollator.compare(a.studentNumber,b.studentNumber)
  || rosterCollator.compare(a.section||'',b.section||'')
  || rosterCollator.compare(a.id,b.id));
 $('count').textContent='('+(section===null?'전체':section ? section+'분반':'분반 미지정')+' '+new Set(sectionRows.map(r=>r.id)).size+'명 · '+sectionRows.length+'건'+(query?' · 검색 '+filtered.length+'명':'')+')';$('empty').hidden=filtered.length>0;
 $('empty').textContent=query?'검색 결과가 없습니다.':'등록된 수강생이 없습니다.';
 for(const value of filtered) {
  const tr=document.createElement('tr');cells(tr,[value.studentNumber,value.name,value.section||'—',value.registered?'가입 완료':'미가입',value.registered?formatRegisteredAt(value.registeredAt):'—']);
  tr.lastElementChild.className='registered-at';
  const td=document.createElement('td'),button=document.createElement('button');button.type='button';button.textContent='수정';
  button.addEventListener('click',()=>{
   editing={id:value.id,section:value.section};for(const key of ['studentNumber','name','section']) $('editor').elements.namedItem(key).value=value[key];
   $('editor-title').textContent='학생 정보 수정';$('cancel').hidden=false;$('number').focus();message('학번·이름 변경은 이 학생의 모든 수강 과목에 반영됩니다.');
  });
  const remove=document.createElement('button');remove.type='button';remove.textContent='수강 삭제';remove.className='danger';
  remove.addEventListener('click',()=>{
   const course=$('course').value;
   if(!window.confirm(value.name+' ('+value.studentNumber+')의 '+course+' / '+(value.section?value.section+'분반':'분반 미지정')+' 수강 등록을 삭제할까요?\n다른 과목·분반과 회원 계정은 유지됩니다.')) return;
   action(remove,async()=>{
    await api('/api/admin/roster/delete',{id:value.id,course,section:value.section});
    resetEditor();invalidatePreview();await loadRoster();message('선택한 과목·분반의 수강 등록을 삭제했습니다.');
   });
  });
  const actions=document.createElement('div');actions.className='row-actions';actions.append(button,remove);td.append(actions);tr.append(td);target.append(tr);
 }
}
function resetCourseEditor() {
 editingCourse=null;$('course-editor').reset();$('course-code').readOnly=false;
 $('course-editor-title').textContent='새 과목 등록';$('course-cancel').hidden=true;
}
async function loadCourses(selected=$('course').value) {
 const {courses}=await api('/api/admin/courses');
 $('course').replaceChildren();$('course-codes').replaceChildren();$('course-list').replaceChildren();
 for(const c of courses) {
  const item=document.createElement('li');item.textContent=c.id+' : '+c.title;$('course-codes').append(item);
  const option=document.createElement('option');option.value=c.id;option.textContent=c.title+' ('+c.id+')';$('course').append(option);
  const tr=document.createElement('tr');cells(tr,[c.id,c.title]);
  const td=document.createElement('td'),button=document.createElement('button');button.type='button';button.textContent='수정';button.setAttribute('aria-label',c.title+' 과목명 수정');
  button.addEventListener('click',()=>{
   editingCourse=c.id;$('course-code').value=c.id;$('course-code').readOnly=true;$('course-title').value=c.title;
   $('course-editor-title').textContent='과목명 수정';$('course-cancel').hidden=false;$('course-title').focus();
  });
  const remove=document.createElement('button');remove.type='button';remove.textContent='삭제';remove.className='danger';
  remove.addEventListener('click',()=>{
   if(!window.confirm(c.title+' ('+c.id+') 과목을 삭제하시겠습니까?\n수강생이 등록된 과목은 삭제할 수 없습니다.')) return;
   action(remove,async()=>{
    await api('/api/admin/courses/delete',{id:c.id});
    resetCourseEditor();resetEditor();invalidatePreview();await loadCourses();await loadRoster();
    message('과목을 삭제했습니다.');
   });
  });
  const actions=document.createElement('div');actions.className='row-actions';actions.append(button,remove);td.append(actions);tr.append(td);$('course-list').append(tr);
 }
 if(courses.some(c=>c.id===selected)) $('course').value=selected;
}
$('course-cancel').addEventListener('click',resetCourseEditor);
$('course-editor').addEventListener('submit',event=>{
 event.preventDefault();
 action($('course-editor').querySelector('button[type=submit]'),async()=>{
  const id=editingCourse || $('course-code').value;
  const renaming=!!editingCourse;
  await api('/api/admin/courses/'+(renaming?'rename':'create'),{id,title:$('course-title').value});
  resetCourseEditor();resetEditor();invalidatePreview();await loadCourses(id);await loadRoster();
  message(renaming?'과목명을 변경했습니다. 기존 수강 명단은 유지됩니다.':'새 과목을 등록했습니다. CSV에서 이 과목코드를 사용할 수 있습니다.');
 });
});
function updateSections(previous='') {
 const select=$('section-filter');select.replaceChildren();
 const total=document.createElement('option');total.value='';total.textContent='전체 분반 ('+new Set(allRows.map(r=>r.id)).size+'명 · '+allRows.length+'건)';select.append(total);
 const counts=new Map();
 for(const row of allRows){const key=row.section || '';counts.set(key,(counts.get(key)||0)+1);}
 for(const [section,count] of [...counts].sort((a,b)=>a[0].localeCompare(b[0],'ko',{numeric:true}))){
  const option=document.createElement('option');option.value=JSON.stringify(section);
  option.textContent=(section?section+'분반':'분반 미지정')+' ('+count+'명)';select.append(option);
 }
 if([...select.options].some(option=>option.value===previous)) select.value=previous;
 select.disabled=!allRows.length;
}
async function loadRoster() {
 const course=$('course').value,previous=loadedCourse===course?$('section-filter').value:'';
 if(!course){allRows=[];loadedCourse=null;updateSections();render();$('empty').textContent='과목을 먼저 등록해 주세요.';return;}
 const data=await api('/api/admin/roster?course='+encodeURIComponent(course));
 allRows=data.rows;loadedCourse=course;updateSections(previous);render();
 if(!editing) $('section').value=selectedSection() || '';
}
async function action(button,fn) {
 button.disabled=true;$('admin-content').inert=true;
 try {await fn();} catch(error){message(error.message);} finally {button.disabled=false;$('admin-content').inert=false;}
}
$('search').addEventListener('input',render);
for(const field of ['name','number']) $('sort-'+field).addEventListener('click',()=>{
 rosterSort=rosterSort===field+'-asc'?field+'-desc':field+'-asc';render();
});
$('section-filter').addEventListener('change',()=>{
 resetEditor();render();
 message(selectedSection()===null?'전체 분반의 명단입니다.':(selectedSection()?selectedSection()+'분반':'분반 미지정')+' 명단입니다.');
});
$('cancel').addEventListener('click',resetEditor);
$('course').addEventListener('change',async()=>{
 invalidatePreview();allRows=[];updateSections();resetEditor();render();$('admin-content').inert=true;
 try {await loadRoster();message('선택한 과목의 명단입니다.');} catch(e){message(e.message);} finally {$('admin-content').inert=false;}
});
$('editor').addEventListener('submit',event=>{
 event.preventDefault();action($('editor').querySelector('button[type=submit]'),async()=>{
  const body={course:$('course').value,...Object.fromEntries(new FormData($('editor')))};
  if(editing) {body.id=editing.id;body.originalSection=editing.section;}
  await api('/api/admin/roster/save',body);resetEditor();invalidatePreview();await loadRoster();message('수강 명단을 저장했습니다.');
 });
});
$('csv').addEventListener('change',invalidatePreview);
$('preview').addEventListener('click',()=>action($('preview'),async()=>{
 invalidatePreview();
 const file=$('csv').files[0];if(!file) throw new Error('CSV 파일을 선택해 주세요.');
 if(file.size>150000) throw new Error('150KB 이하의 CSV를 선택해 주세요.');
 let text;try {text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}catch{throw new Error('CSV UTF-8 형식으로 다시 저장해 주세요.');}
 const data=await api('/api/admin/import/preview',{course:$('course').value,csv:text});previewToken=data.token;
 $('preview-count').textContent='총 '+data.total+'건 · 신규 수강 '+data.added+'건 · 기등록 '+data.existing+'건 (중복 건너뜀)';
 const target=$('preview-rows');target.replaceChildren();
 for(const value of data.rows){const tr=document.createElement('tr');cells(tr,[value.course || $('course').value,value.studentNumber,value.name,value.section||'—']);target.append(tr);}
 $('preview-area').hidden=false;message('과목과 명단을 확인한 뒤 등록 버튼을 눌러 주세요.');
}));
$('confirm').addEventListener('click',()=>action($('confirm'),async()=>{
 const token=previewToken;invalidatePreview();
 const result=await api('/api/admin/import/confirm',{token});await loadRoster();message('CSV 신규 수강 '+result.count+'건을 등록했습니다. 기존 중복은 건너뛰었습니다.');
}));
(async()=>{
 try{
  const {user}=await api('/api/auth/me');
  if(user?.role!=='professor') {message('교수 계정으로 먼저 로그인해 주세요.');return;}
  await loadCourses();
  $('admin-content').hidden=false;await loadRoster();message('과목을 선택하여 명단을 등록하거나 수정하세요.');
 }catch(e){message(e.message);}
})();
