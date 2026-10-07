function createChatRepository(sql) {
 let ready;
 function setup(){if(!ready)ready=sql.transaction([
  sql.query(`CREATE TABLE IF NOT EXISTS lesson_ai_chats (google_id TEXT NOT NULL REFERENCES login_dev_users(google_id) ON DELETE CASCADE,
   course VARCHAR(100) NOT NULL,lesson VARCHAR(150) NOT NULL,messages JSONB NOT NULL DEFAULT '[]',version INTEGER NOT NULL DEFAULT 0,
   request_id UUID,busy_until TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(google_id,course,lesson))`),
  sql.query(`CREATE TABLE IF NOT EXISTS lesson_ai_usage (google_id TEXT NOT NULL REFERENCES login_dev_users(google_id) ON DELETE CASCADE,
   day DATE NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(google_id,day))`)
 ]).catch(e=>{ready=undefined;throw e;});return ready;}
 async function read(user,course,lesson){await setup();const rows=await sql.query(`SELECT messages,version,request_id AS "requestId",busy_until AS "busyUntil" FROM lesson_ai_chats WHERE google_id=$1 AND course=$2 AND lesson=$3`,[user,course,lesson]);return rows[0]||{messages:[],version:0};}
 return {
  getChat:read,
  async beginChat(user,course,lesson,version,requestId,limit=30){
   await setup();await sql.query(`INSERT INTO lesson_ai_chats(google_id,course,lesson) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[user,course,lesson]);
   const rows=await sql.query(`WITH candidate AS (SELECT google_id FROM lesson_ai_chats WHERE google_id=$1 AND course=$2 AND lesson=$3 AND version=$4
    AND (busy_until IS NULL OR busy_until<clock_timestamp()) AND jsonb_array_length(messages)<60 FOR UPDATE),
    quota AS (INSERT INTO lesson_ai_usage(google_id,day,attempts) SELECT $1,(clock_timestamp() AT TIME ZONE 'UTC')::date,1 WHERE EXISTS(SELECT 1 FROM candidate)
     ON CONFLICT(google_id,day) DO UPDATE SET attempts=lesson_ai_usage.attempts+1 WHERE lesson_ai_usage.attempts<$6 RETURNING google_id)
    UPDATE lesson_ai_chats SET request_id=$5::uuid,busy_until=clock_timestamp()+interval '90 seconds'
    WHERE google_id=$1 AND course=$2 AND lesson=$3 AND EXISTS(SELECT 1 FROM quota) RETURNING messages,version`,[user,course,lesson,version,requestId,limit]);return rows[0]||null;
  },
  async finishChat(user,course,lesson,version,requestId,messages){
   const rows=await sql.query(`UPDATE lesson_ai_chats SET messages=$6::jsonb,version=version+1,busy_until=NULL,updated_at=clock_timestamp()
    WHERE google_id=$1 AND course=$2 AND lesson=$3 AND version=$4 AND request_id=$5::uuid AND busy_until IS NOT NULL RETURNING messages,version`,[user,course,lesson,version,requestId,JSON.stringify(messages)]);return rows[0]||null;
  },
  async cancelChat(user,course,lesson,requestId){await sql.query(`UPDATE lesson_ai_chats SET busy_until=NULL,request_id=NULL WHERE google_id=$1 AND course=$2 AND lesson=$3 AND request_id=$4::uuid`,[user,course,lesson,requestId]);},
  async resetChat(user,course,lesson,version){await setup();const rows=await sql.query(`UPDATE lesson_ai_chats SET messages='[]',version=version+1,request_id=NULL WHERE google_id=$1 AND course=$2 AND lesson=$3 AND version=$4 AND (busy_until IS NULL OR busy_until<clock_timestamp()) RETURNING messages,version`,[user,course,lesson,version]);return rows[0]||null;}
 };
}
module.exports={createChatRepository};
