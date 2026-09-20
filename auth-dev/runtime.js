const {createApp}=require('./server');
const {createRepository}=require('./db');
const {NeonSessionStore,sessionSql}=require('./session-store');
function resolveOrigin(env) {
 if(env.APP_ORIGIN) return env.APP_ORIGIN;
 if(env.VERCEL && env.VERCEL_ENV==='preview' && env.VERCEL_BRANCH_URL) {
  const host=env.VERCEL_BRANCH_URL;
  if(!/^[a-z0-9][a-z0-9-]*\.vercel\.app$/.test(host)) throw new Error('Invalid Vercel branch hostname.');
  return 'https://'+host;
 }
 if(env.VERCEL || env.NODE_ENV==='production') throw new Error('APP_ORIGIN must be configured for deployment.');
 return 'http://localhost:3000';
}
function createRuntimeApp(env=process.env) {
 const deployed=!!env.VERCEL || env.NODE_ENV==='production';
 const origin=resolveOrigin(env);
 if(!origin) throw new Error('APP_ORIGIN must be configured for deployment.');
 if(deployed && !origin.startsWith('https://')) throw new Error('Deployment requires HTTPS.');
 const repository=createRepository(env.DATABASE_URL);
 return createApp({
  origin,clientId:env.GOOGLE_CLIENT_ID,secret:env.SESSION_SECRET,
  professorEmail:env.PROFESSOR_EMAIL,
  openRegistration:env.VERCEL_ENV==='production',
  allowedEmails:(env.LOGIN_ALLOWED_EMAILS || '').split(',').filter(Boolean),
  sessionStore:new NeonSessionStore(sessionSql(env.DATABASE_URL),origin),
  trustProxy:deployed
 },undefined,repository);
}
module.exports={createRuntimeApp,resolveOrigin};
