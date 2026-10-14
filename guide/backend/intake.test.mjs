import test from 'node:test';import assert from 'node:assert/strict';
import {validateIntake,publicBusinessUrl,readBusinessSources,validateLogo} from './intake.mjs';
import {openStore,createGuide,FIRST} from '../server.mjs';
const intake={contact:{name:'QA',email:'qa@example.com',phone:'0501234567'},links:['https://business.example.com/about'],accepted:true};
test('intake requires contact and consent, rejects private URLs and strips query secrets',()=>{
 assert.throws(()=>validateIntake({},true),/מלאו/);assert.throws(()=>validateIntake({...intake,accepted:false}),/אישור/);
 for(const u of ['https://127.0.0.1','https://[::1]','https://x.local','http://example.com','https://user:pass@example.com','https://2130706433'])assert.throws(()=>publicBusinessUrl(u));
 assert.equal(publicBusinessUrl('https://example.com/?secret=x#token'),'https://example.com/');
});
test('reader uses a fixed service and reports inaccessible sources honestly',async()=>{
 let url,opts;const rows=await readBusinessSources(intake.links,async(u,o)=>{url=u;opts=o;return new Response('blocked',{status:403});});
 assert.equal(new URL(url).hostname,'r.jina.ai');assert.equal(opts.redirect,'error');assert.equal(opts.headers.Authorization,undefined);
 assert.equal(rows[0].status,'unavailable');assert.equal(rows[0].text,'');
});
test('intake and sources survive answers; AI receives public text but no contact',async()=>{
 const db=openStore(':memory:');let calls=0;
 const {handle}=createGuide({db,env:{OPENROUTER_API_KEY:'test',GUIDE_MODEL:'test',GUIDE_REQUIRE_CONTACT:'true'},fetcher:async(url,opts)=>{
  if(new URL(url).hostname==='r.jina.ai')return Response.json({data:{content:'תיאור העסק הציבורי. '.repeat(100)}});
  calls++;const body=JSON.parse(opts.body);const notes=JSON.parse(body.messages[1].content);
  assert.equal(notes.business_sources[0].status,'read');assert.equal(notes.business_sources[0].text.length,1500);
  assert.equal(JSON.stringify(body.messages).includes(intake.contact.email),false);
  return Response.json({choices:[{message:{content:JSON.stringify({...FIRST,stage:'goal',question:'מה תרצו להשיג?',memory:'העסק מתאר שירותים ציבוריים'})},finish_reason:'stop'}],usage:{cost:.0001}});
 }});
 await assert.rejects(handle('start',{},null),e=>e.status===400);assert.equal(calls,0);
 const s=await handle('start',intake,null);assert.equal(s.contact.email,intake.contact.email);assert.match(s.reply.explanation,/קראנו/);
 await handle('answer',{answer:'אני בעל העסק'},s.id);const restored=await handle('state',{},s.id);
 assert.deepEqual(restored.contact,intake.contact);assert.deepEqual(restored.links,intake.links);assert.equal(calls,1);
});

test('start needs no contact, public reader text format is supported',async()=>{
 assert.equal(validateIntake({links:[]}).contact,null);
 const rows=await readBusinessSources(intake.links,async()=>Response.json({data:{httpStatus:200,text:'תיאור עסק אמיתי. '.repeat(20)}}));
 assert.equal(rows[0].status,'read');assert.match(rows[0].text,/תיאור/);
});
test('logo rejects disguised and oversized files',()=>{
 assert.throws(()=>validateLogo({name:'x.png',mime:'image/png',base64:btoa('<script>bad</script>')}),/תמונה/);
 assert.throws(()=>validateLogo({name:'x.svg',mime:'image/svg+xml',base64:'YWJj'}),/בחרו/);
 assert.throws(()=>validateLogo({name:'x.png',mime:'image/png',base64:'A'.repeat(1400001)}),/בחרו/);
});
test('contact is saved after the summary and trial choice is explicit',async()=>{
 const db=openStore(':memory:');const {handle}=createGuide({db,env:{}});const s=await handle('start',{},null);
 await assert.rejects(handle('contact',intake,s.id),e=>e.status===400);
 db.prepare('UPDATE sessions SET reply=? WHERE id=?').run(JSON.stringify({...FIRST,complete:true,result:{goal:'מטרה',ideal_customer:'קהל'}}),s.id);
 const response=await handle('contact',intake,s.id);assert.equal(response.interested,false);assert.equal(response.deliveryConfigured,false);
 const saved=JSON.parse(db.prepare('SELECT intake FROM sessions WHERE id=?').get(s.id).intake);
 assert.equal(saved.contact.email,intake.contact.email);assert.equal(saved.request.interested,false);
 await handle('contact',{...intake,interested:true},s.id);
 assert.equal(JSON.parse(db.prepare('SELECT intake FROM sessions WHERE id=?').get(s.id).intake).request.interested,true);
});
