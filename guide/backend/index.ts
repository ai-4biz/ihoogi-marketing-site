import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.95.3';
import {FIRST,PROMPT,nextGuideStage,parseGuideReply,reserveCost,approvedQuestionsFromHistory,schemaForStage} from './common.mjs';

// Staging-only service. It never provisions users, submits leads or sends messages.
const URL=Deno.env.get('SUPABASE_URL')||'';
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const db=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const TABLE='focus_guide_sessions';
const MODEL='google/gemini-2.5-flash-lite';
const origins=new Set(['null','http://localhost:3080','https://ihoogi.com','https://www.ihoogi.com',
 'https://ihoogi.co.il','https://www.ihoogi.co.il','https://chatgpt.com']);
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))))
 .map(n=>n.toString(16).padStart(2,'0')).join('');
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(n=>n.toString(16).padStart(2,'0')).join('');
const error=(status:number,message:string)=>Object.assign(new Error(message),{status});
const view=(s:any)=>({reply:s?.state?.reply||FIRST,turns:s?.turns||0,maxTurns:16,configured:true,
 spentUsd:Number(s?.spent_usd||0),actualUsd:Number(s?.actual_usd||0),transferConfigured:false});

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'null';
 const cors={'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'content-type,apikey,authorization,x-guide-session',
  'Access-Control-Allow-Methods':'POST, OPTIONS'};
 const send=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{...cors,
  'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(!origins.has(origin))return new Response('Forbidden',{status:403});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return send(405,{error:'נדרש POST'});
 if(!URL.includes('yyiksyufktgndonldbhn'))return send(503,{error:'המדריך מוגדר לבדיקות בלבד.'});
 try {
  if(!req.headers.get('content-type')?.startsWith('application/json'))throw error(415,'בקשה לא תקינה.');
  const raw=await req.text();if(raw.length>6000)throw error(413,'הבקשה גדולה מדי.');
  let body:any;try{body=JSON.parse(raw);}catch{throw error(400,'בקשה לא תקינה.');}
  if(body.action==='start'){
   // Public session issuance is the only unauthenticated operation.
   // Later calls require a 256-bit capability; only its hash is stored.
   const capability=token(),id=await hash(capability);
   const ip=(req.headers.get('x-forwarded-for')||req.headers.get('cf-connecting-ip')||'unknown').split(',')[0].trim();
   const {data,error:e}=await db.rpc('focus_guide_start',{p_id:id,p_ip:await hash(ip)});
   if(e)throw error(503,'לא הצלחנו לפתוח שיחה.');
   if(data!==true)throw error(429,'כבר התחלתם כמה שיחות היום. אפשר להמשיך בשיחה הקיימת.');
   return send(200,{...view(null),session:capability});
  }
  const capability=req.headers.get('x-guide-session')||'';
  if(!/^[0-9a-f]{64}$/.test(capability))throw error(401,'נדרש להתחיל שיחה.');
  const id=await hash(capability);
  const {data:s,error:se}=await db.from(TABLE).select('*').eq('id',id).maybeSingle();
  if(se||!s||Date.now()-Date.parse(s.created_at)>86400000)throw error(401,'השיחה הסתיימה. אפשר להתחיל מחדש.');
  if(body.action==='state')return send(200,view(s));
  if(body.action==='transfer')return send(503,{error:'שיחת ה־AI פעילה. החיבור ליצירת שאלון ב־iHoogi עדיין בהכנה; אפשר לשמור את הסיכום.'});
  if(body.action!=='answer')throw error(404,'לא נמצא');
  if(s.state.reply?.complete)throw error(409,'השיחה הושלמה.');
  if(typeof body.answer!=='string'||!body.answer.trim()||body.answer.length>1000)throw error(400,'כתבו תשובה עד 1,000 תווים.');
  const prior=s.state.reply||FIRST;
  if(body.approvalAction&&!['approve_rules','revise_rules'].includes(body.approvalAction))throw error(400,'פעולת אישור לא תקינה.');
  if(body.approvalAction&&prior.stage!=='approval')throw error(400,'האישור אפשרי רק בשלב המתאים.');
  const answer=body.approvalAction==='approve_rules'?'מאשר/ת את השאלות וכללי ההתאמה':
   body.approvalAction==='revise_rules'?'רוצה לתקן את השאלות או כללי ההתאמה':body.answer.trim();
  const history=s.state.messages||[];
  const recent=history.slice(-2).map((m:any)=>m.role==='assistant'?{role:'assistant',content:JSON.stringify({
   stage:JSON.parse(m.content).stage,question:JSON.parse(m.content).question,choices:JSON.parse(m.content).choices,
   reflection:JSON.parse(m.content).reflection,draft_questions:JSON.parse(m.content).draft_questions})}:m);
  const messages=[{role:'system',content:PROMPT+(s.turns>=14?' השלם סיכום חלקי אם לא אושרו כללים.':'')},
   {role:'user',content:JSON.stringify({session_notes:prior.memory||'',business_answers:history.filter((m:any)=>m.role==='user').map((m:any)=>m.content),remaining_turns:16-s.turns})},
   ...(recent.length?recent:[{role:'assistant',content:JSON.stringify(FIRST)}]),{role:'user',content:answer}];
  const targetStage=nextGuideStage(prior,history,answer,body.approvalAction);
  messages[0].content+=' השלב הבא שלך הוא '+targetStage+'. אל תחזור על נושא קודם. אם חסר מידע, סמן לחידוד והמשך. כאשר approval הצג שלוש שאלות לפונים וכללים לאישור. כאשר done הפק סיכום מלא והדגמה.';
  const output=['approval','done'].includes(targetStage)?3600:1100;
  const review=['approval','done'].includes(targetStage);
  const prices=review?{prompt:.5,completion:3}:{prompt:.2,completion:1};
  const amount=reserveCost(messages,output,prices);
  const {data:reservation,error:re}=await db.rpc('focus_guide_reserve',{p_id:id,p_amount:amount});
  if(re)throw error(503,'לא ניתן לבדוק את תקציב השיחה.');
  if(reservation?.error)throw error(reservation.error==='busy'?409:429,
   reservation.error==='busy'?'ממתינים לתשובה הקודמת.':'הגענו למכסת השיחה או המכסה היומית. התשובות הקיימות נשמרו.');
  try {
   const {data:key,error:ke}=await db.rpc('get_app_secret',{p_key:'GUIDE_OPENROUTER_API_KEY'});
   if(ke||typeof key!=='string'||!key)throw error(503,'חיבור ה־AI חסר.');
   const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+key,'X-OpenRouter-Title':'iHoogi Focus Guide'},
    body:JSON.stringify({model:review?'openai/gpt-4.1-mini':MODEL,messages,max_tokens:output,temperature:.4,
     response_format:review?{type:'json_schema',json_schema:{name:'guide_reply',strict:true,schema:schemaForStage(targetStage)}}:{type:'json_object'},plugins:[{id:'response-healing'}],
     usage:{include:true},provider:{sort:'price',require_parameters:true,data_collection:'deny',max_price:prices}}),
    signal:AbortSignal.timeout(35000)});
   const data=await response.json().catch(()=>null);
   if(!response.ok||data?.error)throw error(502,'החיבור ל־AI לא הצליח. אפשר לנסות שוב.');
   if(data.choices?.[0]?.finish_reason==='length')throw error(502,'התשובה נקטעה. אפשר לנסות שוב.');
   let reply:any;
   try{reply=parseGuideReply(data.choices?.[0]?.message?.content,targetStage,
    ((prior.memory||'')+' | '+answer).slice(-900),s.approved?approvedQuestionsFromHistory(history):null);}catch{throw error(502,'התקבלה תשובה לא תקינה. אפשר לנסות שוב.');}
   if(!reply.complete&&(typeof reply.memory!=='string'||reply.memory.length>900||!reply.memory.trim()))
    throw error(502,'חסר סיכום להמשך השיחה. אפשר לנסות שוב.');
   const actual=Number(data.usage?.cost||0);
   if(actual>amount)throw error(502,'השיחה נעצרה לבדיקת עלות.');
   const explicit=prior.stage==='approval'&&body.approvalAction==='approve_rules';
   let approved=Boolean(s.approved||explicit);
   if(body.approvalAction==='revise_rules'||(['questions','approval'].includes(reply.stage)&&!explicit))approved=false;
   if(reply.complete)reply.result.rules_approved=reply.result.rules_approved&&approved;
   history.push({role:'user',content:answer},{role:'assistant',content:JSON.stringify(reply)});
   const {error:saveError}=await db.from(TABLE).update({state:{messages:history,reply},approved,
    actual_usd:Number(s.actual_usd)+actual}).eq('id',id);
   if(saveError)throw error(503,'התשובה לא נשמרה. אפשר לנסות שוב.');
   return send(200,{...view({...s,spent_usd:Number(s.spent_usd)+amount,turns:s.turns+1,
    actual_usd:Number(s.actual_usd)+actual,state:{reply}})});
  }finally{await db.from(TABLE).update({busy:false}).eq('id',id);}
 }catch(e:any){return send(e.status||500,{error:e.status?e.message:'אירעה תקלה. נסו שוב.'});}
});
