import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,createGuide,validateReply,reserveCost,FIRST,nextGuideStage,schemaForStage,parseGuideReply} from './server.mjs';
const env={OPENROUTER_API_KEY:'test-only',GUIDE_MODEL:'test/pinned',PUBLIC_ORIGIN:'http://localhost:3080'};
const mid={...FIRST,stage:'goal',question:'מה חשוב להשיג?',memory:'עסק: משרד עורכי דין, ליווי מעסיקים'};
const result={goal:'יציבות הכנסה',service:'ליווי מעסיקים',ideal_customer:'עסק עם עובדים',customer_need:'ליווי שוטף',
 must_have:['עובדים'],nice_to_have:['ליווי שוטף'],marketing_message:'ליווי מותאם למעסיקים',insight:'חשוב לכם קשר מתמשך',
 channels:['אתר'],points_to_refine:[],rules_approved:true,
 screening_questions:[{id:'q1',question:'איזה ליווי נדרש?',reason:'התאמה לשירות',weight:1,options:[
 {label:'שוטף',fit:'preferred',essential:false},{label:'נקודתי',fit:'neutral',essential:false}]}],
 demo:[{label:'א - הדגמה',answers:[{question_id:'q1',option_label:'שוטף'}],explanation:'מתאים לליווי קבוע'},
 {label:'ב - הדגמה',answers:[{question_id:'q1',option_label:'נקודתי'}],explanation:'התאמה פחותה למטרה הנוכחית'}]};
const done={...mid,stage:'done',question:'',complete:true,result};
function approvalStage(db,id){
 db.prepare('UPDATE sessions SET reply=?,approved=1 WHERE id=?').run(JSON.stringify({...mid,stage:'channels'}),id);
}
function fixture(reply=mid,extra={},fetcher){
 const db=openStore(':memory:');let calls=0;
 const app=createGuide({db,env:{...env,...extra},fetcher:fetcher||(async(_url,opts)=>{
   calls++; const body=JSON.parse(opts.body);
   assert.equal(body.provider.max_price.prompt,.2);assert.equal(body.provider.max_price.completion,1);
   assert.equal(body.model,'test/pinned');
   return Response.json({choices:[{message:{content:JSON.stringify(reply)},finish_reason:'stop'}],usage:{cost:0.0001}});
 })});
 return {...app,db,calls:()=>calls};
}
test('validates approved result and rejects invalid demo options',()=>{
 assert.equal(validateReply(structuredClone(done)).result.rules_approved,true);
 const bad=structuredClone(done);bad.result.demo[0].answers[0].option_label='invented';
 assert.throws(()=>validateReply(bad),/תקינות/);
});
test('missing key never calls a provider',async()=>{
 const f=fixture(mid,{OPENROUTER_API_KEY:''}),s=await f.handle('start',{},null);
 await assert.rejects(f.handle('answer',{answer:'ספר'},s.id),e=>e.status===503);
 assert.equal(f.calls(),0);
});
test('auto routing rejected to maintain fixed pricing boundary',async()=>{
 const f=fixture(mid,{GUIDE_MODEL:'openrouter/auto'}),s=await f.handle('start',{},null);
 await assert.rejects(f.handle('answer',{answer:'ספר'},s.id),e=>e.status===503);assert.equal(f.calls(),0);
});
test('budget reserved before request; calls stop before spending above budget',async()=>{
 const f=fixture(mid,{GUIDE_SESSION_USD:'0.02'}),s=await f.handle('start',{},null);
 let stopped=false;
 for(let i=0;i<16;i++){try{await f.handle('answer',{answer:'אני לא בטוח'},s.id);}catch(e){assert.equal(e.status,429);stopped=true;break;}}
 assert.equal(stopped,true);assert.ok(f.db.prepare('SELECT spent FROM sessions').get().spent<=.02);
 assert.ok(f.calls()>0);
});
test('uncertain upstream failures retain reserved budget',async()=>{
 const f=fixture(mid,{},async()=>{throw new Error('timeout');}),s=await f.handle('start',{},null);
 await assert.rejects(f.handle('answer',{answer:'ספר'},s.id));const row=f.db.prepare('SELECT * FROM sessions').get();
 assert.ok(row.spent>0);assert.equal(row.busy,0);
});
test('daily budget blocks without a paid call',async()=>{
 const f=fixture(mid,{GUIDE_DAILY_USD:'.001'}),s=await f.handle('start',{},null);
 await assert.rejects(f.handle('answer',{answer:'ספר'},s.id),e=>e.status===429);assert.equal(f.calls(),0);
});
test('concurrent answer cannot double spend',async()=>{
 let release;const wait=new Promise(r=>release=r);
 const f=fixture(mid,{},async()=>{await wait;return Response.json({choices:[{message:{content:JSON.stringify(mid)},finish_reason:'stop'}]});});
 const s=await f.handle('start',{},null);const first=f.handle('answer',{answer:'ספר'},s.id);
 await assert.rejects(f.handle('answer',{answer:'עוד'},s.id),e=>e.status===409);release();await first;
 assert.equal(f.db.prepare('SELECT turns FROM sessions').get().turns,1);
});
test('long inputs rejected before reserving budget',async()=>{
 const f=fixture(),s=await f.handle('start',{},null);
 await assert.rejects(f.handle('answer',{answer:'א'.repeat(1001)},s.id),e=>e.status===400);assert.equal(f.calls(),0);
});
test('transfer requires approved result and explicit consent',async()=>{
 const f=fixture(done),s=await f.handle('start',{},null);
 approvalStage(f.db,s.id);
 await f.handle('answer',{answer:'אינסטגרם ווואטסאפ'},s.id);
 await assert.rejects(f.handle('transfer',{accepted:false},s.id),e=>e.status===400);assert.equal(f.calls(),1);
});
test('unconfigured handoff never claims success',async()=>{
 const f=fixture(done),s=await f.handle('start',{},null);approvalStage(f.db,s.id);await f.handle('answer',{answer:'אינסטגרם ווואטסאפ'},s.id);
 await assert.rejects(f.handle('transfer',{accepted:true,contact:{name:'בדיקה',email:'test@example.com',phone:''}},s.id),e=>e.status===503);
});
test('verified handoff includes answers, branding, consent; duplicate does not resend',async()=>{
 let sent=0,payload;
 const f=fixture(done,{IHOOGI_IMPORT_URL:'https://receiver.example/import',IHOOGI_IMPORT_TOKEN:'fake'},async(url,opts)=>{
  if(String(url).includes('openrouter')) return Response.json({choices:[{message:{content:JSON.stringify(done)},finish_reason:'stop'}]});
  sent++;payload=JSON.parse(opts.body);return Response.json({url:'https://ihoogi.com/profile',status:'pending'});
 });
 const s=await f.handle('start',{},null);approvalStage(f.db,s.id);await f.handle('answer',{answer:'אינסטגרם ווואטסאפ'},s.id);
 const body={accepted:true,marketing:false,contact:{name:'בדיקה',email:'test@example.com',phone:''},
 brand:{color:'#123456',websites:['https://example.com']}};
 await f.handle('transfer',body,s.id);await f.handle('transfer',body,s.id);
 assert.equal(sent,1);assert.equal(payload.summary.goal,result.goal);assert.equal(payload.brand.color,'#123456');
 assert.equal(payload.consent.marketing,false);assert.ok(payload.idempotency_key);
});
test('image disguised as png is blocked',async()=>{
 const f=fixture(done),s=await f.handle('start',{},null);approvalStage(f.db,s.id);await f.handle('answer',{answer:'אינסטגרם ווואטסאפ'},s.id);
 await assert.rejects(f.handle('transfer',{accepted:true,contact:{name:'בדיקה',email:'test@example.com',phone:''},
  brand:{logo:{name:'logo.png',mime:'image/png',base64:Buffer.from('<html>').toString('base64')}}},s.id),e=>e.status===400);
});
test('outbound redirects disabled and foreign returned URL rejected',async()=>{
 const f=fixture(done,{IHOOGI_IMPORT_URL:'https://receiver.example/import',IHOOGI_IMPORT_TOKEN:'fake'},async(url,opts)=>{
  if(String(url).includes('openrouter'))return Response.json({choices:[{message:{content:JSON.stringify(done)},finish_reason:'stop'}]});
  assert.equal(opts.redirect,'error');return Response.json({url:'https://evil.example',status:'ready'});
 });
 const s=await f.handle('start',{},null);approvalStage(f.db,s.id);await f.handle('answer',{answer:'אינסטגרם ווואטסאפ'},s.id);
 await assert.rejects(f.handle('transfer',{accepted:true,contact:{name:'בדיקה',email:'test@example.com',phone:''}},s.id),e=>e.status===502);
});
test('new-session abuse bounded independently of model calls',async()=>{
 const f=fixture();for(let i=0;i<6;i++)await f.handle('start',{},null,'one-ip');
 await assert.rejects(f.handle('start',{},null,'one-ip'),e=>e.status===429);assert.equal(f.calls(),0);
});
test('HTTP rejects cross-origin request and uses HttpOnly cookie',async()=>{
 const f=fixture();await new Promise(r=>f.server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+f.server.address().port;
 try{
  const bad=await fetch(url+'/api/start',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});assert.equal(bad.status,403);
  const ok=await fetch(url+'/api/start',{method:'POST',headers:{Origin:env.PUBLIC_ORIGIN,'Content-Type':'application/json'},body:'{}'});
  assert.equal(ok.status,200);assert.match(ok.headers.get('set-cookie'),/HttpOnly/);assert.equal((await ok.json()).id,undefined);
 }finally{await new Promise(r=>f.server.close(r));}
});
test('reservation includes multibyte Hebrew and output limit',()=>{
 assert.ok(reserveCost([{role:'user',content:'שלום'}])>reserveCost([{role:'user',content:'test'}]));
 assert.ok(reserveCost([],2600)>reserveCost([],1100));
});
test('model cannot fabricate user approval',async()=>{
 const f=fixture(done),s=await f.handle('start',{},null);
 await assert.rejects(f.handle('answer',{answer:'אני ספר'},s.id),e=>e.status===502);
 assert.equal(f.db.prepare('SELECT approved FROM sessions').get().approved,0);
 await assert.rejects(f.handle('transfer',{accepted:true},s.id),e=>e.status===400);
});
test('free-text assent does not substitute for the fixed approval action',async()=>{
 const f=fixture({...mid,draft_questions:result.screening_questions}),s=await f.handle('start',{},null);
 f.db.prepare('UPDATE sessions SET reply=? WHERE id=?').run(JSON.stringify({...mid,stage:'approval',draft_questions:result.screening_questions}),s.id);
 const response=await f.handle('answer',{answer:'נשמע טוב'},s.id);
 assert.equal(response.reply.result,null);assert.equal(f.db.prepare('SELECT approved FROM sessions').get().approved,0);
});
test('approval action outside the approval stage is blocked before provider call',async()=>{
 const f=fixture(),s=await f.handle('start',{},null);
 await assert.rejects(f.handle('answer',{answer:'מאשר',approvalAction:'approve_rules'},s.id),e=>e.status===400);
 assert.equal(f.calls(),0);
});
test('revision revokes an earlier approval',async()=>{
 const f=fixture({...mid,draft_questions:result.screening_questions}),s=await f.handle('start',{},null);
 f.db.prepare('UPDATE sessions SET reply=?,approved=1 WHERE id=?').run(JSON.stringify({...mid,stage:'approval',draft_questions:result.screening_questions}),s.id);
 const response=await f.handle('answer',{answer:'רוצה לתקן',approvalAction:'revise_rules'},s.id);
 assert.equal(response.reply.result,null);assert.equal(f.db.prepare('SELECT approved FROM sessions').get().approved,0);
});
test('uncertain answer gets at most one follow-up before progressing',()=>{
 const prior={...mid,stage:'customer'};
 const history=[{role:'assistant',content:JSON.stringify(prior)}];
 assert.equal(nextGuideStage(prior,history,'לא בטוח'), 'customer');
 history.push({role:'assistant',content:JSON.stringify(prior)});
 assert.equal(nextGuideStage(prior,history,'לא בטוח'), 'need');
});
test('business criteria lead to proposed questions, not a customer questionnaire',()=>{
 assert.equal(nextGuideStage({...mid,stage:'boundaries'},[],'הגעה לקדימה ושירות צבע'),'approval');
 const s=schemaForStage('approval');
 assert.deepEqual(s.properties.stage.enum,['approval']);
 assert.equal(s.properties.draft_questions.minItems,3);
});
test('explicit approval proceeds to channels then summary',()=>{
 assert.equal(nextGuideStage({...mid,stage:'approval',draft_questions:result.screening_questions},[],'מאשר','approve_rules'),'channels');
 assert.equal(nextGuideStage({...mid,stage:'channels'},[],'וואטסאפ'),'done');
 assert.deepEqual(schemaForStage('done').properties.complete.enum,[true]);
});

test('final questions and demo use exactly the approved rules',()=>{
 const changed=structuredClone(done);changed.result.screening_questions[0].options[0].essential=true;
 const parsed=parseGuideReply(JSON.stringify(changed),'done','',result.screening_questions);
 assert.deepEqual(parsed.result.screening_questions,result.screening_questions);
 assert.equal(parsed.result.demo[0].answers[0].option_label,'שוטף');
 assert.equal(parsed.result.demo[1].answers[0].option_label,'נקודתי');
});
test('approval cannot present an empty or invalid proposal',()=>{
 assert.throws(()=>parseGuideReply(JSON.stringify(mid),'approval'),/שאלות/);
});

test('customer description leads to understanding the need before criteria',()=>{
 assert.equal(nextGuideStage({...mid,stage:'customer'},[],'בעלי עסקים בתחילת הדרך'),'need');
 assert.equal(nextGuideStage({...mid,stage:'need'},[],'לא יודעים איך להגיע לקהל שלהם'),'boundaries');
});
test('other without details stays on the current question',()=>{
 assert.equal(nextGuideStage(FIRST,[],'תחום אחר'),'intro');
 assert.equal(nextGuideStage({...mid,stage:'customer'},[],'אחר'),'customer');
});

test('approval always presents the fixed review question',()=>{
 const reply=parseGuideReply(JSON.stringify({...mid,question:'',draft_questions:result.screening_questions}),'approval');
 assert.match(reply.question,/המיקוד/);assert.deepEqual(reply.draft_questions,result.screening_questions);
});
