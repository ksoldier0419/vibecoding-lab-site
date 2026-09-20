const session = require('express-session');
const { createHash } = require('node:crypto');
const { neon } = require('@neondatabase/serverless');
function sessionSql(url) {
 const parsed=new URL(url);
 if(!['postgres:','postgresql:'].includes(parsed.protocol) || !parsed.hostname.endsWith('.neon.tech')) throw new Error('Neon DATABASE_URL is required.');
 return neon(url);
}
async function setupSessions(sql) {
 await sql.query('CREATE TABLE IF NOT EXISTS login_dev_sessions (id text PRIMARY KEY, data jsonb NOT NULL, expires_at timestamptz NOT NULL)');
 await sql.query('CREATE INDEX IF NOT EXISTS login_dev_sessions_expiry ON login_dev_sessions (expires_at)');
}
class NeonSessionStore extends session.Store {
 constructor(sql,namespace) {super();this.sql=sql;this.namespace=namespace;}
 key(sid) {return createHash('sha256').update(this.namespace+'\\n'+sid).digest('hex');}
 get(sid,callback) {
  this.sql.query('SELECT data FROM login_dev_sessions WHERE id=$1 AND expires_at > now()',[this.key(sid)])
   .then(rows=>callback(null,rows[0]?.data || null),()=>callback(new Error('Session storage unavailable.')));
 }
 set(sid,value,callback=()=>{}) {
  const expires=new Date(value.cookie.expires);
  if(!Number.isFinite(expires.getTime())) return callback(new Error('Session expiry is required.'));
  this.sql.query('WITH expired AS (DELETE FROM login_dev_sessions WHERE id IN (SELECT id FROM login_dev_sessions WHERE expires_at <= now() LIMIT 100)) INSERT INTO login_dev_sessions (id,data,expires_at) VALUES ($1,$2::jsonb,$3) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, expires_at=LEAST(login_dev_sessions.expires_at,EXCLUDED.expires_at)',
   [this.key(sid),JSON.stringify(value),expires.toISOString()])
   .then(()=>callback(),()=>callback(new Error('Session storage unavailable.')));
 }
 destroy(sid,callback=()=>{}) {
  this.sql.query('DELETE FROM login_dev_sessions WHERE id=$1',[this.key(sid)])
   .then(()=>callback(),()=>callback(new Error('Session storage unavailable.')));
 }
 // Reads never extend expiry: login expires at its original deadline.
 touch(sid,value,callback=()=>{}) {callback();}
}
module.exports={NeonSessionStore,sessionSql,setupSessions};
