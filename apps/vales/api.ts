import "./attendance.js";
const branches=['AV2','NAZCA','LAMARCA','CORRIENTES','CASTELLI','QUILMES','SARMIENTO','PUEYRREDON','WEB','DEPOSITO','ADMINISTRACION'];
const origins=new Set(['https://adamiangarciadev.github.io','http://127.0.0.1:4173','http://localhost:4173','http://127.0.0.1:8765','http://localhost:8765']);
const db=Deno.env.get('SUPABASE_URL')!,secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const validAmount=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=999999999&&Math.abs(v*100-Math.round(v*100))<0.00001;
async function same(a:string,b:string){const enc=new TextEncoder(),hash=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)));const [x,y]=await Promise.all([hash(a),hash(b)]);let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;}
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'',cors={'Access-Control-Allow-Origin':origins.has(origin)?origin:'null','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(origin&&!origins.has(origin))return reply({error:'Origen no permitido.'},403);
 if(req.method!=='POST')return reply({error:'Método no permitido.'},405);
 try{
  const raw=await req.text();if(raw.length>10000)return reply({error:'Solicitud demasiado grande.'},413);
  const p=JSON.parse(raw);if(!branches.includes(p.branch))return reply({error:'Elegí una sucursal válida.'},400);
  const admin=String(p.action).startsWith('admin_');
  if(admin){const pass=Deno.env.get('VALES_ADMIN_PASSWORD');const fallbackHash='dbb91e7e659e7def6dcb38f9a69003505ae742317d02e57ae7ad12bfb5570f98'; const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(p.adminPassword||''))))).map(v=>v.toString(16).padStart(2,'0')).join('');if(p.branch!=='ADMINISTRACION'||typeof p.adminPassword!=='string'||!(pass?await same(p.adminPassword,pass):await same(digest,fallbackHash)))return reply({error:'Acceso de Administración inválido.'},403);}
  const request=async(query:string,method='GET',body?:unknown)=>{const r=await fetch(db+'/rest/v1/staff_vouchers'+query,{method,headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json',Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const d=await r.json();if(!r.ok)throw new Error('No se pudo guardar o consultar el vale.');return d;};
  if(p.action==='list'||p.action==='admin_list'){
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.month))return reply({error:'Mes inválido.'},400);
   const [y,m]=p.month.split('-').map(Number);if(y<1900||y>2200)return reply({error:'Mes inválido.'},400);
   const localWeek=admin?null:(globalThis as any).RioValesAttendance.localWeek(today());if(!admin&&!localWeek)return reply([]);
   let attendanceFilter='';
   if(!admin){
    try{const local=p.branch==='AV2'?'AVELLANEDA':p.branch;const response=await fetch('https://script.google.com/macros/s/AKfycbwqAzCaD5HXVSWRoag2LbzBrDA1FJJD1VcOkw7-HkY9Do3NXKpKPuEjEZwcdT-6cla74Q/exec?accion=eventos_hoy&local='+encodeURIComponent(local),{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error();const codes=(globalThis as any).RioValesAttendance.enteredToday(await response.json(),p.branch,today());if(!codes.length)return reply([]);attendanceFilter='&staff_code=in.('+codes.join(',')+')';}catch{return reply({error:'No se pudo validar la asistencia de hoy. No se muestran vales hasta poder comprobar las ENTRADAS de esta sucursal.'},503);}
   }
   const end=admin?new Date(Date.UTC(y,m,1)).toISOString().slice(0,10):localWeek.end,start=admin?p.month+'-01':localWeek.start,filter='&business_date=gte.'+start+'&business_date=lt.'+end+(admin?'':'&branch=eq.'+p.branch)+attendanceFilter;
   const rows=[];for(let offset=0;;offset+=500){const batch=await request('?select=*'+filter+'&order=business_date.desc,created_at.desc,id.asc&limit=500&offset='+offset);rows.push(...batch);if(batch.length<500)break;}return reply(rows);
  }
  if(p.action==='create'||p.action==='admin_create'){
   if(!admin&&p.branch==='ADMINISTRACION')return reply({error:'Usá la carga de Administración.'},403);
   if(!validAmount(p.requestedCash)||typeof p.merchandiseRequested!=='boolean'||(!p.requestedCash&&!p.merchandiseRequested))return reply({error:'Ingresá un importe en efectivo o solicitá mercadería.'},400);
   if(admin&&!branches.includes(p.targetBranch))return reply({error:'Elegí la sucursal del vale.'},400);const date=admin?p.date:today();if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)return reply({error:'Fecha inválida.'},400);
   const r=await fetch('https://script.google.com/macros/s/AKfycbwqAzCaD5HXVSWRoag2LbzBrDA1FJJD1VcOkw7-HkY9Do3NXKpKPuEjEZwcdT-6cla74Q/exec?accion=padron_all',{signal:AbortSignal.timeout(20000)}),d=await r.json(),employees=d.data?.rows||d.data?.padron||d.data?.vendedores;
   if(!r.ok||!d.ok||!Array.isArray(employees))return reply({error:'No se pudo validar el padrón. Reintentá.'},503);
   const employee=employees.find((s:any)=>String(s.id??s.vendedor_id??'').trim()===String(p.staffCode)&&s.activo!==false);
   const name=employee&&(employee.nombre??employee.vendedor_nombre??employee.apellido_nombre);if(!name)return reply({error:'Seleccioná un empleado activo del padrón.'},400);
   return reply(await request('','POST',{branch:admin?p.targetBranch:p.branch,staff_code:String(p.staffCode),staff_name:String(name),business_date:date,requested_cash:p.requestedCash,merchandise_requested:p.merchandiseRequested}));
  }
  if(p.action==='admin_review'||p.action==='admin_delete'){
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id)||!Number.isInteger(p.version)||p.version<1)return reply({error:'Registro inválido.'},400);
   const query='?id=eq.'+p.id+'&version=eq.'+p.version;
   let saved;
   if(p.action==='admin_delete')saved=await request(query,'DELETE');
   else{if(!['approved','rejected'].includes(p.status)||!validAmount(p.approvedCash)||!validAmount(p.approvedMerchandise)||(p.status==='rejected'&&(p.approvedCash||p.approvedMerchandise)))return reply({error:'Revisá los importes aprobados.'},400);
    const existing=await request(query+'&select=requested_cash');if(!existing.length)return reply({error:'El vale cambió en otro equipo. Actualizá antes de confirmar.'},409);
    if(p.approvedCash>Number(existing[0].requested_cash)||(p.status==='approved'&&!p.approvedCash&&!p.approvedMerchandise))return reply({error:'El efectivo aprobado no puede superar lo pedido. Para rechazar, usá Rechazar.'},400);
    saved=await request(query,'PATCH',{status:p.status,approved_cash:p.approvedCash,approved_merchandise:p.approvedMerchandise,reviewed_at:new Date().toISOString(),version:p.version+1});}
   if(!saved.length)return reply({error:'El vale cambió en otro equipo. Actualizá antes de continuar.'},409);return reply(saved);
  }
  return reply({error:'Operación inválida.'},400);
 }catch{return reply({error:'No se pudo completar la operación. Revisá los datos y reintentá.'},400);}
});
