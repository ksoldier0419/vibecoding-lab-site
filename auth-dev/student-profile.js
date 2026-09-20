function validateProfile(body, { requirePhone = true } = {}) {
  const fields = ['studentNumber', 'name', 'major1', 'major2', 'phone'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !fields.includes(k))) {
    throw new Error('입력 항목을 확인해 주세요.');
  }
  const result = {};
  for (const key of fields) {
    if (body[key] !== undefined && typeof body[key] !== 'string') throw new Error('입력 형식을 확인해 주세요.');
    result[key] = (body[key] || '').trim().normalize('NFC');
    if (/[\x00-\x1f\x7f]/.test(result[key])) throw new Error('줄바꿈이나 제어문자는 사용할 수 없습니다.');
  }
  if (!/^[A-Za-z0-9-]{4,20}$/.test(result.studentNumber)) throw new Error('학번은 영문·숫자·하이픈 4~20자로 입력해 주세요.');
  if (!result.name || result.name.length > 100) throw new Error('이름은 1~100자로 입력해 주세요.');
  if (!result.major1 || result.major1.length > 100) throw new Error('전공1은 1~100자로 입력해 주세요.');
  if (result.major2.length > 100) throw new Error('전공2는 100자 이내로 입력해 주세요.');
  if (requirePhone && !result.phone) throw new Error('전화번호를 입력해 주세요.');
  if (result.phone && (!/^\+?[0-9 ()-]{7,30}$/.test(result.phone) || !/^[0-9]{7,15}$/.test(result.phone.replace(/\D/g, '')))) {
    throw new Error('전화번호 형식을 확인해 주세요. 예: 010-1234-5678');
  }
  return result;
}
module.exports = { validateProfile };
