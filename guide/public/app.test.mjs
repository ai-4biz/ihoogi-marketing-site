import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('other asks for details without an AI call, then sends the custom business answer',async()=>{
 const nodes=new Map();
 class Element{
  children=[];value='';textContent='';placeholder='';style={};dataset={};
  classList={toggle(){},add(){},remove(){}};
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  setAttribute(){} removeAttribute(){} focus(){this.focused=true;} scrollIntoView(){}
  querySelector(){return this.label||(this.label=new Element());}
 }
 const node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 const requests=[];
 const intro={stage:'intro',question:'במה העסק שלכם עוסק?',explanation:'נכיר את העסק.',reflection:'',choices:['מספרה','תחום אחר'],complete:false};
 const context=vm.createContext({document:{getElementById:node,createElement:()=>new Element(),querySelector:()=>node('color'),querySelectorAll:()=>[]},
  FormData:class{get(k){return ({name:'בדיקה',email:'qa@example.com',phone:'0501234567',accepted:'on'})[k]||'';}},window:{GUIDE_REMOTE_ENDPOINT:'https://guide.example/api'},sessionStorage:{getItem(){return '';},setItem(){}},AbortSignal,
  fetch:async(_url,opts)=>{const body=JSON.parse(opts.body);requests.push(body);return {ok:true,json:async()=>({configured:true,turns:body.action==='start'?0:1,session:'a'.repeat(64),reply:body.action==='start'?intro:{...intro,stage:'goal',question:'מה תרצו להשיג עם החנות?'}})};}
 });
 vm.runInContext(readFileSync(new URL('./app.js',import.meta.url),'utf8'),context);
 await Promise.resolve();await vm.runInContext('start()',context);
 const other=node('choices').children.find(c=>c.textContent==='תחום אחר');assert.ok(other);
 other.onclick();assert.equal(requests.length,1);assert.ok(node('answer').focused);assert.match(node('answer').placeholder,/העסק/);
 await vm.runInContext("answer('אני מוכר מוצרים בחנות אינטרנטית')",context);
 assert.equal(requests[1].answer,'אני מוכר מוצרים בחנות אינטרנטית');assert.equal(node('question').textContent,'מה תרצו להשיג עם החנות?');
});
