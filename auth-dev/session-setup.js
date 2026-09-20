const {sessionSql,setupSessions}=require('./session-store');
setupSessions(sessionSql(process.env.DATABASE_URL))
 .then(()=>console.log('Session table is ready. Existing users and rosters were not changed.'))
 .catch(()=>{console.error('Session table setup failed. Check DATABASE_URL and database permissions.');process.exitCode=1;});
