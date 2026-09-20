// Vercel Express entry point. Local development continues with npm run dev.
const express=require('express');
const app=express();
app.use(require('./auth-dev/runtime').createRuntimeApp());
module.exports=app;
