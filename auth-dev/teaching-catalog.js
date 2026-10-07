const fs=require('node:fs');
const path=require('node:path');
function catalog() {return JSON.parse(fs.readFileSync(path.join(__dirname,'private/catalog.json'),'utf8'));}
function findLesson(folder,lesson) {
 const course=catalog().find(c=>c.id===folder);
 return course?.lessons.some(l=>l.id===lesson)?course:null;
}
module.exports={catalog,findLesson};
