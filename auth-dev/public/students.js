const $=id=>document.getElementById(id);
async function api(url,body){const r=await fetch(url,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||'요청을 처리하지 못했습니다.');return data;}
function message(text){$('status').textContent=text;$('person-status').textContent=text;}
function cells(row,values){for(const value of values){const td=document.createElement('td');td.textContent=value;row.append(td);}}
async function action(button,fn){button.disabled=true;$('admin-content').inert=true;try{await fn();}catch(e){message(e.message);}finally{button.disabled=false;$('admin-content').inert=false;}}
let people=[],personId=null;
function resetPerson(){personId=null;$('person-editor').reset();$('person-title').textContent='학생 기본 정보 등록';$('person-cancel').hidden=true;}
function renderPeople(){
 const q=$('person-search').value.trim().toLowerCase();
 const rows=people.filter(p=>(p.studentNumber+' '+p.name).toLowerCase().includes(q) && (!$('person-unenrolled').checked || !p.courses.length));
 $('person-rows').replaceChildren();$('person-count').textContent=rows.length+'명';
 for(const p of rows){const tr=document.createElement('tr');cells(tr,[p.studentNumber,p.name,p.courses.map(c=>c.title+' · '+(c.section?c.section+'분반':'분반 미지정')).join(', ')||'수강 과목 없음',p.registered?'가입 완료':'미가입']);
 const td=document.createElement('td'),edit=document.createElement('button');edit.type='button';edit.textContent='수정';edit.addEventListener('click',()=>{personId=p.id;$('person-number').value=p.studentNumber;$('person-name').value=p.name;$('person-title').textContent='학생 기본 정보 수정';$('person-cancel').hidden=false;$('person-number').focus();});
 const enroll=document.createElement('button');enroll.type='button';enroll.textContent='수강 등록';enroll.addEventListener('click',()=>{location.href='/admin.html?student='+encodeURIComponent(p.id);});
 const actions=document.createElement('div');actions.className='row-actions';actions.append(edit,enroll);td.append(actions);tr.append(td);$('person-rows').append(tr);}
}
async function loadPeople(){const data=await api('/api/admin/students');people=data.rows;renderPeople();}
$('person-search').addEventListener('input',renderPeople);
$('person-unenrolled').addEventListener('change',renderPeople);
$('person-cancel').addEventListener('click',resetPerson);
$('person-refresh').addEventListener('click',()=>action($('person-refresh'),loadPeople));
$('person-editor').addEventListener('invalid',e=>message(e.target.validationMessage),true);
$('person-editor').addEventListener('submit',e=>{e.preventDefault();action($('person-editor').querySelector('button[type=submit]'),async()=>{
 const body={...Object.fromEntries(new FormData($('person-editor')))};if(personId)body.id=personId;
 await api('/api/admin/students/save',body);resetPerson();await loadPeople();message('학생 기본 정보를 저장했습니다.');
});});

(async()=>{try{const {user}=await api('/api/auth/me');if(user?.role!=='professor'){message('교수 계정으로 먼저 로그인해 주세요.');return;}await loadPeople();$('admin-content').hidden=false;message('학생 기본 정보를 검색하거나 수정하세요.');}catch(e){message(e.message);}})();
