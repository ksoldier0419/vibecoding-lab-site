const express = require('express');
const session = require('express-session');
const { OAuth2Client } = require('google-auth-library');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const path = require('node:path');

const ORIGIN = 'http://localhost:3000';
const COOKIE = 'vcl_dev_session';
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function createApp(config, verifier = new OAuth2Client(), repository = null) {
  if (!config.clientId || !config.secret || config.secret.length < 32 || (!config.openRegistration && !config.allowedEmails?.length)) {
    throw new Error('Google client ID, session secret and test account configuration are required.');
  }
  const origin = config.origin || ORIGIN;
  const parsedOrigin = new URL(origin);
  const secure = parsedOrigin.protocol === 'https:';
  if(parsedOrigin.origin !== origin || (!secure && origin !== ORIGIN)) throw new Error('Invalid application origin.');
  if(secure && !config.sessionStore) throw new Error('HTTPS deployment requires persistent sessions.');
  const hosts = secure ? [parsedOrigin.host] : ['localhost:3000','127.0.0.1:3000'];
  const allowed = new Set((config.allowedEmails || []).map(x => x.trim().toLowerCase()));
  const professorEmail = (config.professorEmail || '').trim().toLowerCase();
  if(professorEmail) allowed.add(professorEmail);
  const isProfessor = user => !!professorEmail && user?.email?.toLowerCase() === professorEmail;
  const publicUser = user => user ? {...user, role:isProfessor(user)?'professor':'student'} : null;
  const app = express();
  app.disable('x-powered-by');
  if(config.trustProxy) app.set('trust proxy', 1);
  app.use((req, res, next) => {
    if (!hosts.includes(req.headers.host)) return res.sendStatus(403);
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.set('X-Frame-Options', 'DENY');
    next();
  });
  app.use(session({
    store: config.sessionStore,
    name: COOKIE, secret: config.secret, resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure, maxAge: 60 * 60 * 1000 }
  }));
  app.use(express.json({ limit: '256kb', type: 'application/json' }));
  app.get('/api/public/courses', async (req,res)=>{
    try {
      if(!repository) return res.status(503).json({error:'과목 목록을 불러오지 못했습니다.'});
      const courses=(await repository.courses())
        .filter(course=>/^2026-2(?:\s|$)/.test(course.title))
        .map(course=>({id:course.id,title:course.title}));
      res.json({semester:'2026-2',courses});
    } catch {res.status(503).json({error:'과목 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.'});}
  });
  app.get('/api/auth/config', (req, res) => {
    req.session.nonce = randomBytes(32).toString('hex');
    req.session.nonceExpires = Date.now() + 5 * 60 * 1000;
    res.json({ clientId: config.clientId, nonce: req.session.nonce });
  });
  function localPost(req, res, next) {
    if (req.headers.origin !== origin || !req.is('application/json')) return res.sendStatus(403);
    next();
  }
  app.post('/api/auth/google', localPost, async (req, res) => {
    const nonce = req.session.nonce;
    if (!nonce || Date.now() > req.session.nonceExpires || !same(req.body?.nonce, nonce)) {
      return res.status(403).json({ code: 'LOGIN_CHALLENGE_EXPIRED', error: '로그인 준비 시간이 만료되었습니다. Google 로그인 버튼을 다시 눌러 주세요.' });
    }
    delete req.session.nonce;
    delete req.session.nonceExpires;
    if (typeof req.body.credential !== 'string' || req.body.credential.length > 12000) {
      return res.status(400).json({ error: '인증 정보가 올바르지 않습니다.' });
    }
    try {
      const ticket = await verifier.verifyIdToken({ idToken: req.body.credential, audience: config.clientId });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email_verified || !same(p.nonce, nonce) || !Number.isFinite(p.exp) || p.exp * 1000 <= Date.now()) throw new Error('Invalid claims');
      // Production admits verified Google identities; roster matching remains required for registration.
      if (typeof p.email !== 'string' || !p.email || (!config.openRegistration && (!(p.email.endsWith('@gmail.com') || p.hd) || !allowed.has(p.email.toLowerCase())))) {
        return res.status(403).json({ error: '등록된 테스트 계정으로 로그인해 주세요.' });
      }
      const user = { id: p.sub, name: p.name || '', email: p.email };
      if (repository) {
        try {
          user.database = await repository.recordLogin(user);
        } catch {
          return res.status(503).json({ error: '사용자 정보를 DB에 저장하지 못했습니다. 잠시 후 새로고침하여 다시 로그인해 주세요.' });
        }
      }
      req.session.regenerate(err => {
        if (err) return res.status(500).json({ error: '로그인 상태를 만들지 못했습니다.' });
        req.session.user = user;
        req.session.cookie.maxAge = Math.min(60 * 60 * 1000, p.exp * 1000 - Date.now());
        req.session.save(err => {
          if (err) return res.status(500).json({ error: '로그인 상태를 저장하지 못했습니다.' });
          res.json({ user: publicUser(user) });
        });
      });
    } catch {
      res.status(401).json({ error: 'Google 인증을 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.' });
    }
  });
  app.get('/api/auth/me', (req, res) => res.json({ user: publicUser(req.session.user) }));
  app.post('/api/auth/logout', localPost, (req, res) => {
    req.session.destroy(err => {
      if (err) return res.sendStatus(500);
      res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
      res.json({ ok: true });
    });
  });
  function signedIn(req, res, next) {
    if (!req.session.user) return res.status(401).json({ error: '다시 로그인해 주세요.' });
    if (!repository) return res.status(503).json({ error: 'DB 연결을 확인해 주세요.' });
    next();
  }
  app.get('/api/student/profile', signedIn, async (req, res) => {
    try { res.json({ profile: await repository.getProfile(req.session.user.id), ...await repository.registration(req.session.user.id) }); }
    catch { res.status(503).json({ error: '학생 정보를 불러오지 못했습니다. 다시 시도해 주세요.' }); }
  });
  app.post('/api/student/profile', localPost, signedIn, async (req, res) => {
    let value;
    try { value = require('./student-profile').validateProfile(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    try {
      const profile = await repository.registerProfile(req.session.user.id, value);
      res.json({ profile, ...await repository.registration(req.session.user.id) });
    }
    catch (error) {
      if (error.code === 'ROSTER_MISMATCH') return res.status(403).json({error:error.message});
      if (error.code === '23505') return res.status(409).json({ error: '해당 학번으로 등록할 수 없습니다. 입력 내용을 확인하거나 담당자에게 문의해 주세요.' });
      res.status(503).json({ error: '학생 정보를 저장하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요.' });
    }
  });
  require('./admin-routes').adminRoutes(app,repository,{signedIn,localPost,isProfessor});
  require('./course-pages').coursePages(app,repository,{isProfessor});
  app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, '../index.html')));
  app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
  app.use('/auth-assets', express.static(path.join(__dirname, 'public'), { dotfiles: 'deny', index: false }));
  // Only explicitly mapped public resources are served. Never expose the repository root.
  app.use((req, res) => res.sendStatus(404));
  app.use((err, req, res, next) => res.status(err.status === 413 ? 413 : 400).json({ error: '요청을 처리할 수 없습니다.' }));
  return app;
}
module.exports = { createApp };
if (require.main === module) {
 const app=require('./runtime').createRuntimeApp();
 app.listen(3000,'127.0.0.1',()=>console.log('Login: http://localhost:3000/login.html'));
}
