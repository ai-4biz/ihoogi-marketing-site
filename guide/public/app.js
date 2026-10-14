'use strict';
const $=id=>document.getElementById(id);
let state=null, history=[], waiting=false, logo=null;
let remoteSession='';
try{remoteSession=sessionStorage.getItem('ihoogi-guide-session')||'';}catch{}
const stages={intro:'היכרות עם העסק',goal:'מה רוצים להשיג?',service:'במה מתמקדים?',customer:'למי השירות מתאים?',boundaries:'מה חשוב בהתאמה?',questions:'מה כדאי לברר?',approval:'בודקים יחד את השאלות',channels:'איפה תפיצו?',done:'מפת המיקוד שלכם'};
const order=Object.keys(stages);
function text(tag,value,className){const e=document.createElement(tag);e.textContent=value;if(className)e.className=className;return e;}
async function api(action,body={}) {
  if(window.GUIDE_REMOTE_ENDPOINT){
    if(action==='state'&&!remoteSession)return {configured:true,transferConfigured:false,turns:0,
      reply:{stage:'intro',explanation:'נתחיל בכמה מילים. מתוך התשובות שלכם נעזור לחדד את המטרה ואת הלקוחות שמתאימים לה.',
      question:'במה העסק שלכם עוסק?',choices:['מספרה','משרד עורכי דין','קליניקה','ייעוץ','תחום אחר'],reflection:'',complete:false,result:null}};
    const r=await fetch(window.GUIDE_REMOTE_ENDPOINT,{method:'POST',
      headers:{'Content-Type':'application/json',...(remoteSession&&action!=='start'?{'x-guide-session':remoteSession}:{})},
      body:JSON.stringify({action,...body}),signal:AbortSignal.timeout(45000)});
    const d=await r.json();if(!r.ok)throw new Error(d.error||'אירעה תקלה');
    if(d.session){remoteSession=d.session;try{sessionStorage.setItem('ihoogi-guide-session',remoteSession);}catch{}}
    return d;
  }
  const r=await fetch('/api/'+action,{method:action==='state'?'GET':'POST',
    headers:{'Content-Type':'application/json'},...(action==='state'?{}:{body:JSON.stringify(body)})});
  const d=await r.json();if(!r.ok)throw new Error(d.error||'אירעה תקלה');return d;
}
function show(id){for(const x of ['landing','conversation','result'])$(x).classList.toggle('hidden',x!==id);}
function busy(value){waiting=value;document.querySelectorAll('#conversation button,#answer').forEach(e=>e.disabled=value);$('busy').classList.toggle('hidden',!value);$('question-card').setAttribute('aria-busy',String(value));}
function render() {
  const r=state.reply;
  if(r.complete){renderResult(r.result);show('result');$('result-title').focus();return;}
  show('conversation');$('conversation-title').textContent=stages[r.stage];$('stage-label').textContent=stages[r.stage];
  $('progress-fill').style.width=Math.max(5,(order.indexOf(r.stage)+1)/order.length*100)+'%';
  const station=['intro','goal','service'].includes(r.stage)?0:['customer','boundaries'].includes(r.stage)?1:['questions','approval'].includes(r.stage)?2:3;
  document.querySelectorAll('[data-station]').forEach(e=>{const n=Number(e.dataset.station);e.classList.toggle('current',n===station);e.classList.toggle('finished',n<station);if(n===station)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current');});
  $('reflection').textContent=r.reflection;$('explanation').textContent=r.explanation;$('question').textContent=r.question;
  $('draft-questions').replaceChildren();
  for(const q of r.draft_questions||[]){const card=text('article','','screening');card.append(text('h3',q.question),text('p',q.reason));
    const tags=text('div','','tags');for(const o of q.options||[])tags.append(text('span',o.label+' · '+({preferred:'מועדף',neutral:'ניטרלי',unsuitable:'פחות מתאים'}[o.fit]||''),'tag'));
    card.append(tags);$('draft-questions').append(card);}
  $('choices').replaceChildren();
  const choices=r.stage==='approval'?['מאשר/ת את השאלות וכללי ההתאמה','רוצה לתקן']:r.choices;
  for(const [i,choice] of choices.entries()){const b=text('button',choice,'choice');b.type='button';b.onclick=()=>answer(choice,r.stage==='approval'?(i===0?'approve_rules':'revise_rules'):undefined);$('choices').append(b);}
  $('history').replaceChildren();
  for(const item of history){const d=document.createElement('details');d.append(text('summary',item.answer),text('p',item.question));$('history').append(d);}
  $('answer').value='';$('question').setAttribute('tabindex','-1');$('question').focus();
}
async function start(force=false){
  $('availability').textContent='פותחים את ההדרכה…';$('error').textContent='';$('start').disabled=true;
  try{state=await api(!force&&remoteSession?'state':'start');history=[];render();if(!state.configured)$('error').textContent='התצוגה מוכנה, אך שיחת ה־AI עדיין אינה מחוברת. אין חיוב או שליחת מידע למודל.';}
  catch(e){$('availability').textContent=e.name==='TimeoutError'?'השרת לא ענה בזמן. לחצו שוב כדי לנסות.':e.message;}
  finally{$('start').disabled=false;}
}
async function answer(value,approvalAction){
  if(waiting||!value.trim())return;busy(true);$('error').textContent='';
  const prev=state.reply.question;
  try{state=await api('answer',{answer:value,...(approvalAction?{approvalAction}:{})});history.push({question:prev,answer:value});render();}
  catch(e){$('error').textContent=e.message;}
  finally{busy(false);}
}
function summaryText(r){
  return ['מפת המיקוד שלי','מטרה: '+r.goal,'שירות: '+r.service,'לקוחות מתאימים: '+r.ideal_customer,
    'הצורך: '+r.customer_need,'חיוני: '+r.must_have.join(', '),'עדיף: '+r.nice_to_have.join(', '),
    'מסר: '+r.marketing_message,r.insight?'מה התחדד: '+r.insight:'',
    ...r.screening_questions.map(q=>q.question+'\n'+q.reason+'\n'+q.options.map(o=>o.label).join(' / ')),
    r.points_to_refine.length?'לחידוד: '+r.points_to_refine.join(', '):''].filter(Boolean).join('\n\n');
}
function renderResult(r){
  $('insight').replaceChildren();
  if(r.insight)$('insight').append(text('b','זה מה שהתחדד אצלכם'),text('p',r.insight));
  $('summary').replaceChildren();
  for(const [title,value] of [['המטרה',r.goal],['השירות לקידום',r.service],['הלקוחות שמתאימים',r.ideal_customer],
    ['הצורך שלהם',r.customer_need],['מה חיוני',r.must_have.join(' · ')||'טרם הוגדר'],
    ['מה עדיף',r.nice_to_have.join(' · ')||'טרם הוגדר'],['המסר שלכם',r.marketing_message],['ערוצי הפצה',r.channels.join(' · ')||'לבחירה בהמשך']]){
    const card=text('article','','summary-card');card.append(text('h3',title),text('p',value));$('summary').append(card);
  }
  $('refine').textContent=r.points_to_refine.length?'עדיין כדאי לחדד: '+r.points_to_refine.join(' · '):'אפשר לעדכן את המיקוד בהמשך לפי הפניות שתקבלו.';
  $('questions').replaceChildren();
  for(const q of r.screening_questions){const e=text('article','','screening');e.append(text('h3',q.question),text('p',q.reason));
    const tags=text('div','','tags');for(const o of q.options)tags.append(text('span',o.label+' · '+({preferred:'מועדף',neutral:'ניטרלי',unsuitable:'פחות מתאים'}[o.fit]),'tag'));
    e.append(tags);$('questions').append(e);}
  $('demo-cards').replaceChildren();
  for(const d of r.demo){const card=text('article','','demo-card');card.append(text('h3',d.label));
    for(const a of d.answers){const q=r.screening_questions.find(q=>q.id===a.question_id);card.append(text('p',q.question+' '+a.option_label));}
    const b=text('button','הייתי חוזר/ת לפנייה הזאת קודם','quiet');
    b.onclick=()=>{$('demo-feedback').classList.remove('hidden');$('demo-feedback').textContent=r.demo.map(x=>x.label+': '+x.explanation).join('\n\n');};
    card.append(b);$('demo-cards').append(card);}
  $('open-transfer').disabled=!r.rules_approved;
  if(!r.rules_approved)$('refine').textContent+=' השאלות וכללי ההתאמה טרם אושרו; זהו סיכום חלקי.';
  $('preview-title').textContent=r.service;$('preview-questions').replaceChildren();
  for(const q of r.screening_questions){$('preview-questions').append(text('p',q.question));
    for(const o of q.options)$('preview-questions').append(text('span',o.label,'preview-option'));}
}
$('start').onclick=()=>start();$('restart').onclick=()=>{if(confirm('להתחיל שיחה חדשה? אפשר לשמור קודם את הסיכום הקיים.'))start(true);};
$('edit').onclick=()=>{if(confirm('להתחיל שיחה חדשה לחידוד? שמרו קודם את המפה הקיימת.'))start(true);};
$('answer-form').onsubmit=e=>{e.preventDefault();answer($('answer').value);};
$('help').onclick=()=>answer('קשה לי לנסח, עזרו לי עם דוגמאות שמתאימות לעסק שלי.');
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(summaryText(state.reply.result));$('copy').textContent='הועתק';}catch{$('copy').textContent='אפשר לשמור בקובץ במקום';}};
$('download').onclick=()=>{const url=URL.createObjectURL(new Blob([summaryText(state.reply.result)],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='ihoogi-focus-summary.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('open-transfer').onclick=()=>{$('transfer').classList.remove('hidden');$('transfer').scrollIntoView({behavior:'smooth'});if(!state.transferConfigured)$('transfer-status').textContent='חיבור ההעברה ל־iHoogi עדיין בהכנה. אפשר לשמור בינתיים את מפת המיקוד.';};
document.querySelector('input[name=color]').oninput=e=>{$('preview').style.borderColor=e.target.value;document.querySelector('.preview-button').style.background=e.target.value;};
$('logo').onchange=async e=>{
  logo=null;$('logo-preview').classList.add('hidden');const f=e.target.files[0];if(!f)return;
  if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>2*1024*1024){$('transfer-status').textContent='בחרו תמונת PNG, JPEG או WebP עד 2MB.';e.target.value='';return;}
  const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(f);});
  logo={name:f.name,mime:f.type,base64:data.split(',')[1]};$('logo-preview').src=data;$('logo-preview').classList.remove('hidden');$('transfer-status').textContent='';
};
$('transfer-form').onsubmit=async e=>{
  e.preventDefault();const f=new FormData(e.target);$('transfer-submit').disabled=true;$('transfer-status').textContent='מעבירים את המיקוד שלכם…';
  try{const r=await api('transfer',{contact:{name:f.get('name'),email:f.get('email'),phone:f.get('phone')},
    brand:{color:f.get('color'),websites:f.get('website')?[f.get('website')]:[],logo},
    accepted:f.get('accepted')==='on',marketing:f.get('marketing')==='on'});
    $('transfer-status').replaceChildren(text('span',r.status==='ready'?'השאלון שלכם מוכן. ':'הבקשה התקבלה. '));
    const a=text('a','המשך ל־iHoogi');a.href=r.url;a.rel='noopener noreferrer';$('transfer-status').append(a);
  }catch(e){$('transfer-status').textContent=e.message;}finally{$('transfer-submit').disabled=false;}
};
api('state').then(s=>{state=s;if(s.turns){render();}else if(!s.configured)$('availability').textContent='המדריך בהכנה. שיחת ה־AI תופעל לאחר חיבור המודל.';}).catch(()=>{});
