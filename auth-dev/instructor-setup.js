// Additive migration; uses the same explicit database configuration as the login server.
const {createRepository}=require('./db');
createRepository(process.env.DATABASE_URL).setupInstructorNotes()
 .then(()=>console.log('Instructor note table ready.'))
 .catch(()=>{console.error('Instructor note setup failed; connection details omitted.');process.exitCode=1;});
