import "./rules.js";
const rules=(globalThis as any).CajaRules;
// Acceso directo sin contraseña, solicitado para la primera etapa.
// La clave del servidor permanece en Supabase. La API limita operaciones y valida la sucursal.
const branches=['AV2','NAZCA','LAMARCA','CORRIENTES','CASTELLI','QUILMES','SARMIENTO','PUEYRREDON','WEB','DEPOSITO','ADMINISTRACION'];
const origins=new Set(['https://adamiangarciadev.github.io','http://127.0.0.1:8765','http://localhost:8765']);
const db=Deno.env.get('SUPABASE_URL')!, secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const cors={'Access-Control-Allow-Origin':origins.has(origin)?origin:'null','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(origin&&!origins.has(origin))return reply({error:'Origen no permitido'},403);
 if(req.method!=='POST')return reply({error:'Método no permitido'},405);
 try{
  const raw=await req.text();if(raw.length>200000)return reply({error:'Planilla demasiado grande'},413);
  const p=JSON.parse(raw);if(!branches.includes(p.branch))return reply({error:'Sucursal inválida'},400);
  const filter='branch=eq.'+encodeURIComponent(p.branch);
  let query:string,method:string,body:string|undefined;
  if(p.action==='web_close'){
   if(p.branch!=='AV2'||!/^\d{4}-\d{2}-\d{2}$/.test(p.date))return reply({error:'Consulta WEB inválida'},400);
   query='?select=id,business_date,version,data,totals&branch=eq.WEB&business_date=eq.'+p.date+'&limit=1';method='GET';
  }else if(p.action==='list'){
   const offset=Number(p.offset||0);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return reply({error:'Página inválida'},400);
   query='?select=id,business_date,version,data,totals&'+filter+'&order=business_date.desc&limit=30&offset='+offset;method='GET';
  }else if(p.action==='save'){
   if(!p.data||!/^\d{4}-\d{2}-\d{2}$/.test(p.data.date))return reply({error:'Fecha inválida'},400);
   if(p.data.f9===undefined||p.data.f9===null||p.data.f9==='')return reply({error:'Ingresá el F9 informado por el sistema antes de guardar el cierre.'},400);
   const code=String(p.data.responsibleCode||'').trim();
   if(!/^\d{1,20}$/.test(code))return reply({error:'Elegí un responsable del padrón de Asistencia.'},400);
   const staffResponse=await fetch('https://script.google.com/macros/s/AKfycbwqAzCaD5HXVSWRoag2LbzBrDA1FJJD1VcOkw7-HkY9Do3NXKpKPuEjEZwcdT-6cla74Q/exec?accion=padron_all',{signal:AbortSignal.timeout(15000)});
   const staffData=await staffResponse.json();
   const employees=staffData.data?.rows||staffData.data?.padron||staffData.data?.vendedores;
   if(!staffResponse.ok||!staffData.ok||!Array.isArray(employees))return reply({error:'NO SE PUDO VALIDAR EL PADRÓN DE ASISTENCIA. REINTENTÁ.'},503);
   const employee=(id:string)=>employees.find((r:any)=>String(r.id??r.vendedor_id??'').trim()===id&&r.activo!==false);
   const responsible=employee(code);
   if(!responsible?.nombre)return reply({error:'EL LEGAJO RESPONSABLE NO ESTÁ HABILITADO EN ASISTENCIA.'},400);
   p.data.responsibleCode=code;p.data.responsible=responsible.nombre;
   if(!Array.isArray(p.data.vouchers))return reply({error:'VALES INVÁLIDOS.'},400);
   for(const voucher of p.data.vouchers){
    const person=employee(String(voucher.staffCode||'').trim());
    if(!person?.nombre)return reply({error:'ELEGÍ UN LEGAJO ACTIVO DE ASISTENCIA PARA CADA VALE.'},400);
    voucher.staffCode=String(person.id??person.vendedor_id).trim();voucher.name=person.nombre;
   }
   p.data=rules.normalize(p.data);
   try{rules.validateExpenses(p.data.expenses);}catch(e){return reply({error:(e as Error).message},400);}
   if(p.id){
    if(!/^[a-f0-9-]{36}$/.test(p.id)||!Number.isSafeInteger(p.version)||p.version<1)return reply({error:'Versión inválida'},400);
    query='?'+filter+'&id=eq.'+p.id+'&version=eq.'+p.version;method='PATCH';body=JSON.stringify({data:p.data,version:p.version+1});
   }else{query='';method='POST';body=JSON.stringify({branch:p.branch,business_date:p.data.date,data:p.data});}
  }else return reply({error:'Operación inválida'},400);
  const response=await fetch(db+'/rest/v1/cash_sheets'+query,{method,body,headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json',Prefer:'return=representation'},signal:AbortSignal.timeout(15000)});
  const rows=await response.json();
  if(!response.ok)return reply({error:rows.code==='23505'?'Ya existe una planilla para esa fecha. Abrila desde Historial.':rows.message||'No se pudo guardar la planilla.'},response.status);
  if(p.action==='save'&&!rows.length)return reply({error:'La planilla cambió en otro equipo. Abrila desde Historial antes de editarla.'},409);
  return reply(rows);
 }catch{return reply({error:'No se pudo completar la operación. Revisá los datos y reintentá.'},400);}
});
