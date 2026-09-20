const { validateProfile } = require('./student-profile');
function identity(value) {
 const v = validateProfile({ studentNumber: value.studentNumber, name: value.name, major1: 'validation' }, { requirePhone: false });
 return { studentNumber: v.studentNumber, name: v.name.normalize('NFC') };
}
function section(value = '') {
 if (typeof value !== 'string' || value.trim().length > 30 || /[\x00-\x1f\x7f]/.test(value)) throw new Error('분반은 30자 이내로 입력해 주세요.');
 return value.trim();
}
function courseId(value) {
 if (typeof value !== 'string' || !/^[a-z0-9_-]{1,80}$/.test(value)) throw new Error('과목을 선택해 주세요.');
 return value;
}
function parseCsv(text) {
 if (typeof text !== 'string' || Buffer.byteLength(text,'utf8') > 150000) throw new Error('CSV는 UTF-8 형식, 150KB 이하로 올려 주세요.');
 text = text.replace(/^\uFEFF/, '');
 const rows = []; let row = [], field = '', quoted = false, closed = false;
 function cell() { row.push(field); field = ''; closed = false; }
 function line() { cell(); if (row.some(v => v.trim())) rows.push(row); row = []; }
 for (let i=0;i<text.length;i++) {
  const ch = text[i];
  if (quoted) {
   if (ch === '"') { if (text[i+1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
   else field += ch;
  } else if (ch === ',') cell();
  else if (ch === '\n' || ch === '\r') { if(ch === '\r' && text[i+1] === '\n') i++; line(); }
  else if (ch === '"' && !field && !closed) quoted = true;
  else { if (closed || ch === '"') throw new Error('CSV 따옴표 형식을 확인해 주세요.'); field += ch; }
 }
 if (quoted) throw new Error('CSV에 닫히지 않은 따옴표가 있습니다.');
 line();
 const headers = rows.shift()?.map(v=>v.trim());
 if (!headers || !['학번,이름','학번,이름,분반','과목코드,학번,이름','과목코드,학번,이름,분반'].includes(headers.join(','))) throw new Error('CSV 첫 행은 과목코드,학번,이름,분반이어야 합니다. 기존 학번,이름,분반 양식도 지원합니다.');
 if (!rows.length || rows.length > 1000) throw new Error('한 번에 1~1,000명을 등록해 주세요.');
 const seen = new Set(), names = new Map();
 const multi = headers[0] === '과목코드';
 return rows.map((r,i) => {
  if (r.length !== headers.length) throw new Error((i+2)+'행: 열 개수가 다릅니다.');
  try {
   const offset = multi ? 1 : 0;
   const result = { ...identity({studentNumber:r[offset],name:r[offset+1]}), section:section(r[offset+2]) };
   if(multi) result.course = courseId(r[0].trim());
   const key = JSON.stringify([result.course || '', result.studentNumber, result.section]);
   if (seen.has(key)) throw new Error('같은 과목·분반에 중복 학번이 있습니다.');
   if(names.has(result.studentNumber) && names.get(result.studentNumber)!==result.name) throw new Error('동일 학번의 이름이 과목별로 다릅니다.');
   names.set(result.studentNumber,result.name); seen.add(key); return result;
  } catch(e) { throw new Error((i+2)+'행: '+e.message); }
 });
}
function courseTitle(value) {
 if(typeof value !== 'string') throw new Error('과목명을 입력해 주세요.');
 const title=value.trim().normalize('NFC');
 if(!title || title.length>150 || /[\x00-\x1f\x7f]/.test(title)) throw new Error('과목명은 줄바꿈 없이 1~150자로 입력해 주세요.');
 return title;
}
module.exports = { identity, section, courseId, courseTitle, parseCsv };
