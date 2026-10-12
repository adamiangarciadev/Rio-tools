// Intentionally login-free at the owner's request. CORS is NOT authentication.
// Only list/action/status are public; imports remain on the private worker API.
const url=Deno.env.get('SUPABASE_URL')!;
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const branches=['SARMIENTO','NAZCA','AVELLANEDA 2','CORRIENTES','CASTELLI','MORENO','QUILMES','LAMARCA','DEPOSITO','PUEYRREDON'];
const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
const publicOrigin='https://adamiangarciadev.github.io';
const allowedOrigin=(origin:string|null)=>!origin||origin===publicOrigin||/^http:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}$/.test(origin);
async function rpc(name:string,p:unknown){
 const r=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(p)});
 const d=await r.json(); if(!r.ok)throw Error(d.message||'No se pudo guardar');return d;
}
function project(r:any){
 const fields=['remito','fecha','desde','hacia','local','cliente','codigo_cliente','vendedor','total_prendas','importe_total','via_sarmiento','items'];
 return {id:r.id,version:r.version,estado:r.estado,visible_en:r.visible_en,data:Object.fromEntries(fields.map(k=>[k,r.data[k]]))};
}
async function limitedBody(req:Request){
 const reader=req.body?.getReader();if(!reader)throw Error('Solicitud vacía');
 let size=0;const chunks:Uint8Array[]=[];
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>22*1024*1024){await reader.cancel();throw Error('Solicitud demasiado grande');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin');
 const cors={'Access-Control-Allow-Origin':allowedOrigin(origin)?origin||publicOrigin:publicOrigin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'content-type','Vary':'Origin','Cache-Control':'no-store'};
 const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:cors});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return reply({error:'Método no permitido'},405);
 if(!req.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Formato inválido'},415);
 if(!allowedOrigin(origin))return reply({error:'Origen no permitido'},403);
 const uploaded:string[]=[];
 try{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown'));
  const ip=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(!await rpc('mt2_web_rate',{p_key:ip,p_limit:120,p_seconds:60}))return reply({error:'Demasiadas consultas. Esperá un minuto.'},429);
  const p=await limitedBody(req);
  if(p.op==='client_branches')return reply({ok:true,sucursales:branches.filter(b=>b!=='MORENO')});
  if(p.op==='client_list'||p.op==='client_action'){
   if(!branches.includes(p.sucursal)||p.sucursal==='MORENO')throw Error('Seleccioná una sucursal válida');
   if(p.op==='client_list')return reply(await rpc('crc_list',{p:{sucursal:p.sucursal,search:String(p.search||'').slice(0,100),offset:Math.max(0,Math.trunc(Number(p.offset)||0))}}));
   if(typeof p.remito!=='string'||p.remito.length>40||!Number.isInteger(p.version)||p.version<0)throw Error('Remito o versión inválidos');
   if(!await rpc('mt2_web_rate',{p_key:'client-action:'+ip,p_limit:30,p_seconds:60}))return reply({error:'Demasiados cambios. Esperá un minuto.'},429);
   return reply(await rpc('crc_action',{p:{sucursal:p.sucursal,remito:p.remito,version:p.version,estado:p.estado}}));
  }
  if(p.op==='status')return reply({branches,database:'Supabase · v.2',sync:{automatic:true,running:false,pending:0}});
  if(p.op==='list'){
   const data=await rpc('mt2_pilot_list',{p:{branch:branches.includes(p.branch)?p.branch:'',search:String(p.search||'').slice(0,100),offset:Math.max(0,Math.min(100000,Number(p.offset)||0)),closed:false,state:''}});
   return reply(data.map(project));
  }
  if(p.op!=='action')return reply({error:'Operación no permitida'},403);
  if(!/^[0-9a-f-]{36}$/.test(p.id)||!Number.isInteger(p.version)||p.version<1)throw Error('Remito o versión inválidos');
  if(typeof p.codigo!=='string'||!p.codigo.trim()||p.codigo.length>30)throw Error('Ingresá el código de personal');
  if(typeof p.observacion!=='string'||p.observacion.length>3000)throw Error('Observación inválida');
  if(!Array.isArray(p.files)||p.files.length>3)throw Error('Máximo 3 adjuntos');
  if(p.estado!=='DIFERENCIAS'&&(p.files.length||p.observacion))throw Error('Los adjuntos y observaciones son solo para Diferencias');
  if(p.estado==='DIFERENCIAS'&&!p.observacion.trim())throw Error('Detallá las diferencias');
  if(!await rpc('mt2_web_rate',{p_key:'action:'+ip,p_limit:30,p_seconds:60}))return reply({error:'Demasiados cambios. Esperá un minuto.'},429);
  const evidence=[];
  for(const file of p.files){
   if(typeof file.base64!=='string'||file.base64.length>6990510)throw Error('Cada adjunto debe pesar menos de 5 MB');
   const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));if(!bytes.length||bytes.length>5*1024*1024)throw Error('Adjunto inválido');
   if(!await rpc('mt2_web_rate',{p_key:'uploads-global',p_limit:100,p_seconds:86400}))throw Error('Se alcanzó el límite diario de adjuntos');
   const path=p.id+'/'+crypto.randomUUID();
   const r=await fetch(url+'/storage/v1/object/mt2-evidence/'+path,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/octet-stream'},body:bytes});
   if(!r.ok)throw Error('No se pudo guardar el adjunto');uploaded.push(path);
   evidence.push({name:String(file.name||'Adjunto').slice(0,200),bucket:'mt2-evidence',path});
  }
  const result=await rpc('mt2_pilot_action',{p:{id:p.id,version:p.version,estado:String(p.estado),codigo:p.codigo.trim(),observacion:p.observacion,destino:branches.includes(p.destino)?p.destino:'',evidencias:evidence}});
  return reply(project(result));
 }catch(e){
  if(uploaded.length)await fetch(url+'/storage/v1/object/mt2-evidence',{method:'DELETE',headers,body:JSON.stringify({prefixes:uploaded})});
  return reply({error:e instanceof Error?e.message:'No se pudo completar la operación'},400);
 }
});

