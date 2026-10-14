const fail=(status,message)=>Object.assign(new Error(message),{status});
export function publicBusinessUrl(value){
 const input=String(value||'').trim();
 if(!input||/\s/.test(input))throw fail(400,'הדביקו קישור לעמוד העסק, למשל linkedin.com/in/your-name.');
 const normalized=/^[a-z][a-z0-9+.-]*:/i.test(input)?input:'https://'+input.replace(/^\/\//,'');
 let u;try{u=new URL(normalized);}catch{throw fail(400,'הוסיפו כתובת אתר מלאה שמתחילה ב־https://.');}
 const host=u.hostname.toLowerCase().replace(/\.$/,'');
 if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||
    !host.includes('.')||/^[\d.]+$|:|\[|\]/.test(host)||
    /(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(host))throw fail(400,'אפשר לצרף רק קישור ציבורי ב־https.');
 const id=u.hostname.endsWith('facebook.com')&&u.pathname==='/profile.php'?u.searchParams.get('id'):null;
 u.search='';if(id&&/^\d+$/.test(id))u.searchParams.set('id',id);u.hash='';return u.href;
}
export function validateIntake(body,requireContact=false){
 const c=body.contact||{};const name=String(c.name||'').trim(),email=String(c.email||'').trim().toLowerCase(),phone=String(c.phone||'').trim();
 if((requireContact||body.contact)&&(!name||name.length>100||email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||!/^\+?[\d ()-]{9,25}$/.test(phone)||phone.replace(/\D/g,'').length<9))
  throw fail(400,'מלאו שם, נייד ומייל תקינים כדי להתחיל.');
 if((requireContact||body.contact)&&body.accepted!==true)throw fail(400,'נדרש אישור לשמירת הפרטים והתשובות לצורך ההדרכה.');
 const links=body.links||[];if(!Array.isArray(links)||links.length>3||links.some(v=>typeof v!=='string'||v.length>1000))throw fail(400,'אפשר לצרף עד שלושה קישורים.');
 return {contact:body.contact||requireContact?{name,email,phone}:null,links:[...new Set(links.filter(v=>v.trim()).map(publicBusinessUrl))],accepted:body.accepted===true,marketing:body.marketing===true};
}
export async function readBusinessSources(links,fetcher=fetch){
 // Fetch only a fixed public reader service. Never fetch user URLs from our server,
 // follow redirects or send private contact information to the reader.
 return Promise.all(links.map(async url=>{
  try{
   const r=await fetcher('https://r.jina.ai/'+url,{headers:{Accept:'application/json','X-Respond-With':'text'},redirect:'error',signal:AbortSignal.timeout(20000)});
   if(!r.ok)throw Error('unavailable');
   const reader=r.body?.getReader();if(!reader)throw Error('no body');let bytes=0,raw='';const decoder=new TextDecoder();
   try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>64000)throw Error('too large');raw+=decoder.decode(value,{stream:true});}}finally{await reader.cancel().catch(()=>{});}
   const data=JSON.parse(raw);if(Number(data.data?.httpStatus)>=400)throw Error('blocked');const content=data.data?.content??data.data?.text??data.content??data.text;
   if(typeof content!=='string'||content.trim().length<80||/sign in to continue|log in to continue|access denied/i.test(content))throw Error('blocked');
   return {url,status:'read',text:content.trim().slice(0,1500)};
  }catch{return {url,status:'unavailable',text:''};}
 }));
}
export function intakeReply(first,sources){
 if(!sources.length)return {...first};
 const count=sources.filter(s=>s.status==='read').length;
 return {...first,explanation:(count?'קראנו תוכן ציבורי מ־'+count+' מהקישורים שצירפתם. נשתמש בו כרקע, ואתם תתקנו ותגדירו לאן העסק רוצה להגיע.':'לא הצלחנו לקרוא את הקישורים. אפשר להמשיך כרגיל לפי התשובות שלכם.')+' '+first.explanation};
}

export function validateLogo(logo){
 if(!logo)return null;
 if(typeof logo.name!=='string'||logo.name.length>100||!['image/png','image/jpeg','image/webp'].includes(logo.mime)||typeof logo.base64!=='string'||logo.base64.length>1400000||!/^[A-Za-z0-9+/]+={0,2}$/.test(logo.base64))throw fail(400,'בחרו לוגו PNG, JPEG או WebP עד 1MB.');
 let bytes;try{bytes=Uint8Array.from(atob(logo.base64),c=>c.charCodeAt(0));}catch{throw fail(400,'קובץ הלוגו לא תקין.');}
 if(bytes.length>1048576)throw fail(400,'הלוגו גדול מדי.');
 const isPng=bytes.length>8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
 const isJpg=bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const isWebp=bytes.length>12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(!(logo.mime==='image/png'?isPng:logo.mime==='image/jpeg'?isJpg:isWebp))throw fail(400,'קובץ הלוגו אינו תמונה תקינה.');
 return {name:logo.name,mime:logo.mime,base64:logo.base64};
}
