'use strict';
const $=id=>document.getElementById(id);
let state=null, history=[], waiting=false, logo=null;
let remoteSession='';
try{remoteSession=sessionStorage.getItem('ihoogi-focus-session-v3')||'';}catch{}
const stages={intro:'היכרות עם העסק',goal:'מה רוצים להשיג?',service:'במה מתמקדים?',customer:'למי השירות מתאים?',need:'איזה צורך מביא אותם אליכם?',boundaries:'מה חשוב בהתאמה?',done:'מפת המיקוד שלכם'};
const order=Object.keys(stages);
function text(tag,value,className){const e=document.createElement(tag);e.textContent=value;if(className)e.className=className;return e;}
async function api(action,body={}) {
  if(window.GUIDE_REMOTE_ENDPOINT){
    if(action==='state'&&!remoteSession)return {configured:true,transferConfigured:false,turns:0,
      reply:{stage:'intro',explanation:'נתחיל בכמה מילים. מתוך התשובות שלכם נעזור לחדד את המטרה ואת הלקוחות שמתאימים לה.',
      question:'במה העסק שלכם עוסק?',choices:['מספרה','משרד עורכי דין','קליניקה','ייעוץ','תחום אחר'],reflection:'',complete:false,result:null}};
    const r=await fetch(window.GUIDE_REMOTE_ENDPOINT,{method:'POST',
      headers:{'Content-Type':'application/json',...(remoteSession&&action!=='start'?{'x-guide-session':remoteSession}:{})},
      body:JSON.stringify({action,...body}),signal:AbortSignal.timeout(60000)});
    const d=await r.json();if(!r.ok)throw new Error(d.error||'אירעה תקלה');
    if(d.session){remoteSession=d.session;try{sessionStorage.setItem('ihoogi-focus-session-v3',remoteSession);}catch{}}
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
  const station=['intro','goal','service'].includes(r.stage)?0:['customer','need','boundaries'].includes(r.stage)?1:r.stage==='boundaries'?2:3;
  document.querySelectorAll('[data-station]').forEach(e=>{const n=Number(e.dataset.station);e.classList.toggle('current',n===station);e.classList.toggle('finished',n<station);if(n===station)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current');});
  $('reflection').textContent=r.reflection;$('explanation').textContent=r.explanation;$('question').textContent=r.question;
  const choices=[...r.choices];
  if(!choices.some(isOtherChoice))choices.push('אחר — במילים שלי');
  for(const [i,choice] of choices.entries()){
    const b=text('button',choice,'choice');b.type='button';
    b.onclick=()=>{if(isOtherChoice(choice)){chooseOther();return;}
      answer(choice);};
    $('choices').append(b);
  }
  $('answer-form').querySelector('label').textContent='אפשר גם לכתוב במילים שלכם';
  $('answer').placeholder='מספיק כמה מילים כדי להתחיל…';
  $('history').replaceChildren();
  for(const item of history){const d=document.createElement('details');d.append(text('summary',item.answer),text('p',item.question));$('history').append(d);}
  $('answer').value='';$('question').setAttribute('tabindex','-1');$('question').focus();
}
function isOtherChoice(choice){return /^(?:תחום\s+)?אחר(?:ת)?(?:$|\s|[—–:,-])/.test(choice.trim());}
function chooseOther(){
  const prompts={intro:'ספרו בכמה מילים מה העסק שלכם מציע.',goal:'מה הייתם רוצים להשיג בעסק עכשיו?',
    service:'איזה מוצר או שירות תרצו לקדם?',customer:'מי הלקוחות שתרצו להגיע אליהם?',
    need:'איזה צורך או קושי מביא את הלקוחות האלה אליכם?',boundaries:'מה חשוב לכם בהתאמה של לקוח לעסק?',channels:'איפה תרצו לפנות ללקוחות האלה?'};
  const prompt=prompts[state.reply.stage]||'כתבו את האפשרות שמתאימה לכם.';
  $('answer-form').querySelector('label').textContent=prompt;
  $('answer').placeholder=prompt;$('answer').focus();
  $('answer-form').scrollIntoView({behavior:'smooth',block:'center'});
}
async function start(force=false){
  $('availability').textContent='פותחים את ההדרכה וקוראים את הקישורים שצירפתם…';$('error').textContent='';$('start').disabled=true;
  try{const f=new FormData($('intake-form'));const intake={links:['source1','source2','source3'].map(k=>f.get(k)).filter(Boolean)};state=await api(!force&&remoteSession?'state':'start',intake);history=[];render();if(!state.configured)$('error').textContent='התצוגה מוכנה, אך שיחת ה־AI עדיין אינה מחוברת. אין חיוב או שליחת מידע למודל.';}
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
    r.insight?'מה התחדד: '+r.insight:'',
    r.points_to_refine.length?'לחידוד: '+r.points_to_refine.join(', '):''].filter(Boolean).join('\n\n');
}
function renderResult(r){
  $('insight').replaceChildren();
  if(r.insight)$('insight').append(text('b','זה מה שהתחדד אצלכם'),text('p',r.insight));
  $('summary').replaceChildren();
  for(const [title,value] of [['המטרה',r.goal],['השירות לקידום',r.service],['הלקוחות שמתאימים',r.ideal_customer],
    ['הצורך שלהם',r.customer_need],['מה חיוני',r.must_have.join(' · ')||'טרם הוגדר'],
    ['מה עדיף',r.nice_to_have.join(' · ')||'טרם הוגדר']]){
    const card=text('article','','summary-card');card.append(text('h3',title),text('p',value));$('summary').append(card);
  }
  $('refine').textContent=r.points_to_refine.length?'עדיין כדאי לחדד: '+r.points_to_refine.join(' · '):'אפשר לעדכן את המיקוד בהמשך לפי הפניות שתקבלו.';
  if(state.contact)for(const key of ['name','email','phone']){const e=document.querySelector('#contact-form [name='+key+']');if(e)e.value=state.contact[key]||'';}

}
$('intake-form').onsubmit=e=>{e.preventDefault();start();};$('restart').onclick=()=>{if(confirm('להתחיל שיחה חדשה? אפשר לשמור קודם את הסיכום הקיים.'))start(true);};
$('edit').onclick=()=>{if(confirm('להתחיל שיחה חדשה לחידוד? שמרו קודם את המפה הקיימת.'))start(true);};
$('answer-form').onsubmit=e=>{e.preventDefault();answer($('answer').value);};
$('help').onclick=()=>answer('קשה לי לנסח, עזרו לי עם דוגמאות שמתאימות לעסק שלי.');
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(summaryText(state.reply.result));$('copy').textContent='הועתק';}catch{$('copy').textContent='אפשר לשמור בקובץ במקום';}};
$('download').onclick=()=>{const url=URL.createObjectURL(new Blob([summaryText(state.reply.result)],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='ihoogi-focus-summary.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('interested').onchange=e=>{$('brand-details').classList.toggle('hidden',!e.target.checked);};
$('brand-logo').onchange=async e=>{
  logo=null;$('brand-logo-preview').classList.add('hidden');$('brand-status').textContent='';const f=e.target.files[0];if(!f)return;
  if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>1048576){$('brand-status').textContent='בחרו לוגו PNG, JPEG או WebP עד 1MB.';e.target.value='';return;}
  try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(f);});
   logo={name:f.name,mime:f.type,base64:data.split(',')[1]};$('brand-logo-preview').src=data;$('brand-logo-preview').classList.remove('hidden');
  }catch{$('brand-status').textContent='לא הצלחנו לקרוא את הלוגו. אפשר לבחור קובץ אחר.';}
};
$('contact-form').onsubmit=async e=>{
  e.preventDefault();const f=new FormData(e.target);$('contact-submit').disabled=true;$('contact-status').textContent='שומרים את הבקשה שלכם…';
  try{const r=await api('contact',{contact:{name:f.get('name'),email:f.get('email'),phone:f.get('phone')},accepted:f.get('accepted')==='on',interested:f.get('interested')==='on',marketing:f.get('marketing')==='on',logo:f.get('interested')==='on'?logo:null});
    $('contact-status').textContent=r.deliveryConfigured?'הבקשה התקבלה.':
      'הפרטים והבקשה נשמרו בסביבת הבדיקות. שליחת הסיכום והלינק עדיין לא הופעלה.';
  }catch(e){$('contact-status').textContent=e.message;}finally{$('contact-submit').disabled=false;}
};
api('state').then(s=>{state=s;if(s.turns){render();}else if(!s.configured)$('availability').textContent='המדריך בהכנה. שיחת ה־AI תופעל לאחר חיבור המודל.';}).catch(()=>{});
