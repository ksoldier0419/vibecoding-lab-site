const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
function editor(value=''){
 const win={Event:class{constructor(type){this.type=type;}},ChatMarkdown:{render(n,text){n.textContent=text;}}};
 class Element{constructor(){this.dataset={};this.events={};this.children=[];this.value='';this.selectionStart=this.selectionEnd=0;this.maxLength=20000;this.ownerDocument=doc;this.disabled=false;}append(...n){this.children.push(...n);}before(){}querySelectorAll(){return [];}replaceChildren(){this.children=[];this.textContent='';}setAttribute(k,v){this[k]=v;}addEventListener(k,f){(this.events[k]??=[]).push(f);}dispatchEvent(e){for(const f of this.events[e.type]||[])f(e);}focus(){doc.activeElement=this;}setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}setRangeText(text,a,b){this.value=this.value.slice(0,a)+text+this.value.slice(b);}classList={add(){},remove(){}};}
 const doc={defaultView:win,createElement:()=>new Element(),querySelector:()=>null,getSelection:()=>({isCollapsed:true})};const input=new Element();input.id='lesson-note';input.value=value;let edits=0;input.addEventListener('input',()=>edits++);
 const sandbox={window:win};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'public/note-editor.js'),'utf8'),sandbox);const api=win.NoteEditor.attach(input);
 function press(key,extra={}){let prevented=false;input.dispatchEvent({type:'keydown',key,preventDefault(){prevented=true;},...extra});return prevented;}
 return {input,api,press,edits:()=>edits};
}
test('notes start as viewers; bold/italic shortcuts combine and toggle while preserving selection',()=>{
 const e=editor('word');assert.equal(e.input.hidden,true);e.api.edit();assert.equal(e.input.hidden,false);e.input.setSelectionRange(0,4);e.press('b',{ctrlKey:true});assert.equal(e.input.value,'**word**');assert.equal(e.input.selectionStart,2);e.press('i',{ctrlKey:true});assert.equal(e.input.value,'***word***');assert.equal(e.edits(),2);e.press('Escape');assert.equal(e.input.hidden,true);
 const i=editor('word');i.api.edit();i.input.setSelectionRange(0,4);i.press('i',{metaKey:true});assert.equal(i.input.value,'*word*');i.press('i',{ctrlKey:true});assert.equal(i.input.value,'word');
});
test('Enter continues nested, numbered and task lists; empty items end lists and code fences/IME are left alone',()=>{
 for(const [source,expected] of [['- item','- item\n- '],['  - child','  - child\n  - '],['7. item','7. item\n8. '],['- [x] done','- [x] done\n- [ ] ']]){const e=editor(source);e.api.edit();e.input.setSelectionRange(source.length,source.length);assert.equal(e.press('Enter'),true);assert.equal(e.input.value,expected);}
 const empty=editor('- item\n- ');empty.api.edit();empty.input.setSelectionRange(empty.input.value.length,empty.input.value.length);empty.press('Enter');assert.equal(empty.input.value,'- item\n');
 const code=editor('```java\n- item');code.api.edit();code.input.setSelectionRange(code.input.value.length,code.input.value.length);assert.equal(code.press('Enter'),false);
 const ime=editor('- item');ime.api.edit();ime.input.setSelectionRange(6,6);assert.equal(ime.press('Enter',{isComposing:true}),false);assert.equal(ime.edits(),0);
});
test('Tab indents/outdents selected lines; formatting respects note length and unavailable notes stay in viewer',()=>{
 const e=editor('- a\n- b');e.api.edit();e.input.setSelectionRange(0,e.input.value.length);e.press('Tab');assert.equal(e.input.value,'  - a\n  - b');e.press('Tab',{shiftKey:true});assert.equal(e.input.value,'- a\n- b');
 e.input.maxLength=e.input.value.length;e.input.setSelectionRange(0,3);const before=e.edits();e.press('b',{ctrlKey:true});assert.equal(e.input.value,'- a\n- b');assert.equal(e.edits(),before);
 const unavailable=editor();unavailable.input.disabled=true;unavailable.api.refresh();unavailable.api.edit();assert.equal(unavailable.input.hidden,true);
});
