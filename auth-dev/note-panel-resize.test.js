const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
function resize(saved=null){
 const events={},classes=new Set(),values={},store=new Map(saved?[['lesson-note-panel-width',saved]]:[]),handle={attrs:{},events:{},setAttribute(k,v){this.attrs[k]=String(v);},addEventListener(k,f){this.events[k]=f;},setPointerCapture(){},focus(){}};
 const layout={clientWidth:1200,style:{setProperty(k,v){values[k]=v;}},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}},panel={before(){}};
 const window={innerWidth:1440,addEventListener(k,f){events[k]=f;}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'public/note-panel-resize.js'),'utf8'),{window,document:{querySelector:()=>layout,getElementById:()=>panel,createElement:()=>handle},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)}});
 return {handle,layout,window,events,classes,store,width:()=>Number(handle.attrs['aria-valuenow']),key:key=>handle.events.keydown({key,preventDefault(){}})};
}
test('note panel resize supports keyboard bounds, persistence and reset',()=>{
 const r=resize('420');assert.equal(r.width(),420);r.key('ArrowLeft');assert.equal(r.width(),452);r.key('ArrowRight');assert.equal(r.width(),420);r.key('Home');assert.equal(r.width(),280);r.key('End');assert.equal(r.width(),840);assert.equal(r.store.get('lesson-note-panel-width'),'840');r.handle.events.dblclick();assert.equal(r.width(),360);
});
test('note panel pointer resize cleans up and responds to viewport bounds',()=>{
 const r=resize();r.handle.events.pointerdown({button:0,pointerId:1,clientX:800,preventDefault(){}});r.handle.events.pointermove({pointerId:1,clientX:600});assert.equal(r.width(),560);assert.equal(r.classes.has('notes-resizing'),true);r.handle.events.pointercancel({pointerId:1});assert.equal(r.classes.has('notes-resizing'),false);assert.equal(r.store.get('lesson-note-panel-width'),'560');r.layout.clientWidth=900;r.events.resize();assert.equal(r.width(),540);
});
