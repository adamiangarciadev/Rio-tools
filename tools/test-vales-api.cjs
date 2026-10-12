// Prueba de integración explícita: crea un registro temporal y lo elimina al terminar.
const fs=require('node:fs'),assert=require('node:assert/strict');
const endpoint='https://hczekjyagyoxdqkzdimd.supabase.co/functions/v1/vales-api';
const password=fs.readFileSync('assets/rio-access.js','utf8').match(/ACCESS_PASS = "([^"]+)"/)[1];
const month=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);
async function call(action,data={},admin=false){const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,month,branch:admin?'ADMINISTRACION':'AV2',...(admin?{adminPassword:password}:{}),...data})});return {status:r.status,body:await r.json()};}
(async()=>{let record;try{
 const denied=await call('admin_list',{branch:'ADMINISTRACION',adminPassword:'invalid'});assert.equal(denied.status,403);
 const staff=await fetch('https://script.google.com/macros/s/AKfycbwqAzCaD5HXVSWRoag2LbzBrDA1FJJD1VcOkw7-HkY9Do3NXKpKPuEjEZwcdT-6cla74Q/exec?accion=padron_all').then(r=>r.json());const employees=staff.data.rows||staff.data.padron||staff.data.vendedores;const employee=employees.find(r=>r.activo!==false);
 const created=await call('create',{staffCode:String(employee.id??employee.vendedor_id),requestedCash:100000.01,merchandiseRequested:true});assert.equal(created.status,200,JSON.stringify(created.body));record=created.body[0];assert.equal(record.status,'pending');assert.equal(record.approved_cash,null);
 const invalid=await call('admin_review',{id:record.id,version:record.version,status:'approved',approvedCash:200000,approvedMerchandise:0},true);assert.equal(invalid.status,400);
 const approved=await call('admin_review',{id:record.id,version:record.version,status:'approved',approvedCash:50000,approvedMerchandise:15000},true);assert.equal(approved.status,200);record=approved.body[0];assert.equal(record.approved_merchandise,15000);
 const conflict=await call('admin_review',{id:record.id,version:1,status:'rejected',approvedCash:0,approvedMerchandise:0},true);assert.equal(conflict.status,409);
 const local=await call('list');assert.equal(local.status,200);const attendance=await fetch('https://script.google.com/macros/s/AKfycbwqAzCaD5HXVSWRoag2LbzBrDA1FJJD1VcOkw7-HkY9Do3NXKpKPuEjEZwcdT-6cla74Q/exec?accion=eventos_hoy&local=AVELLANEDA').then(r=>r.json());const eligible=require('../apps/vales/attendance.js').enteredToday(attendance,'AV2',require('../apps/vales/model.js').today());assert.ok(local.body.every(r=>eligible.includes(r.staff_code)));const adminRows=await call('admin_list',{},true);const reflected=adminRows.body.find(r=>r.id===record.id);assert.equal(reflected.approved_cash,50000);assert.equal(reflected.status,'approved');
 const rejected=await call('admin_review',{id:record.id,version:record.version,status:'rejected',approvedCash:0,approvedMerchandise:0},true);assert.equal(rejected.status,200);record=rejected.body[0];
 const removed=await call('admin_delete',{id:record.id,version:record.version},true);assert.equal(removed.status,200);record=null;
 const date=require('../apps/vales/model.js').today();
 const manual=await call('admin_create',{targetBranch:'NAZCA',date,staffCode:String(employee.id??employee.vendedor_id),requestedCash:0,merchandiseRequested:true},true);assert.equal(manual.status,200,JSON.stringify(manual.body));record=manual.body[0];assert.equal(record.branch,'NAZCA');
 const destination=await call('list',{branch:'NAZCA'});assert.equal(destination.status,200);const manualRows=await call('admin_list',{},true);assert.ok(manualRows.body.some(r=>r.id===record.id));assert.equal(record.requested_cash,0);
 console.log('API: solicitud, acceso de administración, aprobación parcial, mercadería, rechazo, conflicto, carga manual y respuesta al local: OK.');
 }finally{if(record){const removed=await call('admin_delete',{id:record.id,version:record.version},true);assert.equal(removed.status,200);console.log('Registro temporal eliminado.');}}})().catch(e=>{console.error(e.message);process.exitCode=1;});
