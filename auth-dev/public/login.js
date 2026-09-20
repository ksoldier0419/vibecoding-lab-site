const statusText = document.getElementById('status');
const profile = document.getElementById('profile');
const retry = document.getElementById('retry');
const googleButton = document.getElementById('google-button');
let loginBusy=false;
let currentUser, savedProfile;
async function request(url, body) {
  const response = await fetch(url, body === undefined ? { cache: 'no-store' } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || '요청을 처리하지 못했습니다.'), {code:data.code});
  return data;
}
function showUser(user) {
  currentUser = user;
  document.getElementById("student").hidden = !user || user.role === 'professor';
  document.getElementById('admin-link').hidden = user?.role !== 'professor';
  profile.hidden = !user;
  googleButton.hidden = !!user;
  document.getElementById('name').textContent = user?.name || '';
  document.getElementById('email').textContent = user?.email || '';
  document.getElementById('database').textContent = user?.database
    ? `DB 저장 확인 · 로그인 ${user.database.loginCount}회 · 최근 로그인 ${new Date(user.database.lastLoginAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (한국 시간)` : '';
  statusText.textContent = user ? '서버에서 Google 인증을 확인했습니다.' : 'Google 버튼을 눌러 로그인해 주세요.';
}
function failed(error) { statusText.textContent = error.message; retry.hidden = false; }
async function prepareGoogleLogin() {
  const config = await request('/api/auth/config');
  if (!window.google?.accounts?.id) throw new Error('Google 로그인 버튼을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
  googleButton.replaceChildren();
  google.accounts.id.initialize({
    client_id: config.clientId, nonce: config.nonce,
    callback: result => login(result, config.nonce), auto_select: false
  });
  google.accounts.id.renderButton(googleButton, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'ko' });
}
async function login(result, nonce) {
  if(loginBusy) return;
  loginBusy=true;retry.hidden=true;
  statusText.textContent = 'Google 인증을 확인하고 있습니다.';
  let authenticated=false;
  try {
    const data = await request('/api/auth/google', { credential: result.credential, nonce });
    authenticated=true;showUser(data.user);await loadStudent({afterLogin:true});
  } catch (error) {
    if(!authenticated) {
      try {
        await prepareGoogleLogin();
        statusText.textContent=error.code==='LOGIN_CHALLENGE_EXPIRED'
          ? '로그인 버튼을 새로 준비했습니다. Google 버튼을 한 번 더 눌러 주세요.'
          : error.message;
        retry.hidden=false;
      } catch(refreshError) {failed(refreshError);}
    } else {failed(error);}
  } finally {loginBusy=false;}
}
async function start() {
  retry.hidden=true;
  try {
    const { user } = await request('/api/auth/me');
    showUser(user);
    if (user) { await loadStudent(); return; }
    await prepareGoogleLogin();
  } catch (error) { failed(error); }
}

document.getElementById('logout').addEventListener('click', async () => {
  try { await request('/api/auth/logout', {}); window.google?.accounts?.id.disableAutoSelect(); location.replace('/login.html'); }
  catch (error) { failed(error); }
});
retry.addEventListener('click', () => location.reload());
const studentForm = document.getElementById('student-form');
const studentStatus = document.getElementById('student-status');
function fillStudent(value) {
  for (const key of ['studentNumber','name','major1','major2','phone']) studentForm.elements.namedItem(key).value = value?.[key] || (key === 'name' ? currentUser.name : '');
}
function showStudent(value) {
  savedProfile = value;
  document.getElementById('student-title').textContent = value ? '내 학생 정보' : '학생 정보 등록';
  document.getElementById('student-summary').hidden = !value;
  studentForm.hidden = !!value;
  document.getElementById('cancel-student').hidden = !value;
  fillStudent(value);
  const details = document.getElementById('student-details'); details.replaceChildren();
  if (value) for (const [key,label] of Object.entries({studentNumber:'학번',name:'이름',major1:'전공1',major2:'전공2',phone:'전화번호'})) {
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label; dd.textContent = value[key] || '미입력'; details.append(dt,dd);
  }
}
function showRegistration(data) {
  const complete = data.registered;
  document.getElementById('enrollment').hidden = !complete;
  const list = document.getElementById('enrollment-list'); list.replaceChildren();
  for (const course of data.courses || []) {
    const li=document.createElement('li');li.textContent=course.title+(course.section?' · '+course.section+'분반':'');list.append(li);
  }
  studentForm.elements.namedItem('studentNumber').readOnly=complete;
  studentForm.elements.namedItem('name').readOnly=complete;
  if (complete && !data.profile?.phone?.trim()) {
    studentForm.hidden=false;document.getElementById('student-summary').hidden=true;
    document.getElementById('student-title').textContent='전화번호 추가 등록';
  }
  if (!complete && data.profile) {
    studentForm.hidden=false;document.getElementById('student-summary').hidden=true;
    document.getElementById('student-title').textContent='수강 명단 확인 후 가입';
  }
}
async function loadStudent({afterLogin=false}={}) {
  const viewProfile=!afterLogin && new URLSearchParams(location.search).has('profile');
  if(currentUser?.role==='professor') {
    if(!viewProfile) location.replace('/courses.html');
    return;
  }
  studentForm.hidden = true;
  document.getElementById('student-summary').hidden = true;
  studentStatus.textContent = '학생 정보를 확인하고 있습니다.';
  const data = await request('/api/student/profile');
  if(data.registered && data.profile?.phone?.trim() && !viewProfile) {location.replace('/courses.html');return;}
  showStudent(data.profile); showRegistration(data); studentStatus.textContent = data.registered ? (data.profile?.phone?.trim() ? '가입 완료 · 아래 과목에 등록되어 있습니다.' : '전화번호가 필수 항목으로 변경되었습니다. 입력 후 저장해 주세요.') : '교수의 수강 명단에 있는 학번·이름으로 등록해 주세요.';
}
document.getElementById('edit-student').addEventListener('click', () => {
  document.getElementById('student-summary').hidden = true; studentForm.hidden = false; fillStudent(savedProfile);
  document.getElementById('student-title').textContent = '학생 정보 수정'; studentForm.elements.studentNumber.focus();
});
document.getElementById('cancel-student').addEventListener('click', () => { showStudent(savedProfile); studentStatus.textContent = ''; });
studentForm.addEventListener('submit', async event => {
  event.preventDefault(); const button = document.getElementById('save-student'); button.disabled = true;
  studentStatus.textContent = '저장하고 있습니다.';
  try {
    const data = await request('/api/student/profile', Object.fromEntries(new FormData(studentForm)));
    showStudent(data.profile); showRegistration(data); location.assign('/courses.html');
  } catch(error) { studentStatus.textContent = error.message; }
  finally { button.disabled = false; }
});
start();

async function loadSupportedCourses() {
 const status=document.getElementById('supported-courses-status'),list=document.getElementById('supported-courses-list');
 try {
  const data=await request('/api/public/courses');
  list.replaceChildren();
  for(const course of data.courses) {
   const item=document.createElement('li'),name=document.createElement('span'),code=document.createElement('small');
   name.textContent=course.title.replace(/^2026-2\s*/, '');
   code.textContent='과목코드 '+course.id;
   item.append(name,code);list.append(item);
  }
  status.textContent=data.courses.length?'':'등록된 지원 과목이 없습니다.';
  status.hidden=data.courses.length>0;
 } catch(error) {status.hidden=false;status.textContent=error.message;}
}
loadSupportedCourses();
