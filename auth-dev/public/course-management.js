const $=id=>document.getElementById(id);
async function api(url,body){const r=await fetch(url,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||'요청을 처리하지 못했습니다.');return data;}
function message(text){$('status').textContent=text;}
function cells(row,values){for(const value of values){const td=document.createElement('td');td.textContent=value;row.append(td);}}
async function action(button,fn){button.disabled=true;$('admin-content').inert=true;try{await fn();}catch(e){message(e.message);}finally{button.disabled=false;$('admin-content').inert=false;}}
let editingCourse=null;
function resetCourseEditor() {
 editingCourse=null;$('course-editor').reset();$('course-code').readOnly=false;
 $('course-editor-title').textContent='새 과목 등록';$('course-cancel').hidden=true;
}
async function loadCourses() {
 const {courses}=await api('/api/admin/courses');
 $('course-list').replaceChildren();
 for(const c of courses) {
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
    resetCourseEditor();await loadCourses();
    message('과목을 삭제했습니다.');
   });
  });
  const actions=document.createElement('div');actions.className='row-actions';actions.append(button,remove);td.append(actions);tr.append(td);$('course-list').append(tr);
 }
}
$('course-cancel').addEventListener('click',resetCourseEditor);
$('course-editor').addEventListener('submit',event=>{
 event.preventDefault();
 action($('course-editor').querySelector('button[type=submit]'),async()=>{
  const id=editingCourse || $('course-code').value;
  const renaming=!!editingCourse;
  await api('/api/admin/courses/'+(renaming?'rename':'create'),{id,title:$('course-title').value});
  resetCourseEditor();await loadCourses();
  message(renaming?'과목명을 변경했습니다. 기존 수강 명단은 유지됩니다.':'새 과목을 등록했습니다. CSV에서 이 과목코드를 사용할 수 있습니다.');
 });
});

$('course-editor').addEventListener('invalid',e=>message(e.target.validationMessage),true);
(async()=>{try{const {user}=await api('/api/auth/me');if(user?.role!=='professor'){message('교수 계정으로 먼저 로그인해 주세요.');return;}await loadCourses();$('admin-content').hidden=false;message('과목을 등록하거나 이름을 수정하세요.');}catch(e){message(e.message);}})();