const {test}=require('node:test');const assert=require('node:assert/strict');const M=require('../apps/vales/model.js');
const attendance=require('../apps/vales/attendance.js');
test('vista semanal local se vacía domingo y lunes excluye vales anteriores, incluso al cambiar mes o año',()=>{
 assert.equal(attendance.localWeek('2026-10-11'),null);
 assert.deepEqual(attendance.localWeek('2026-10-12'),{start:'2026-10-12',end:'2026-10-18'});
 assert.deepEqual(attendance.localWeek('2026-10-10'),{start:'2026-10-05',end:'2026-10-11'});
 assert.deepEqual(attendance.localWeek('2027-01-01'),{start:'2026-12-28',end:'2027-01-03'});
});
test('visibilidad del local usa solo ENTRADAS de hoy de la sucursal y elimina duplicados',()=>{
 const response={ok:true,fecha:'2026-10-09',local:'AVELLANEDA',items:[
  {vendedor_id:'1',tipo_evento:'ENTRADA'}, {vendedor_id:'1',tipo_evento:'ENTRADA'},
  {vendedor_id:'2',tipo_evento:'FALTA'}, {vendedor_id:'3',tipo_evento:'ENTRADA',fecha_operativa:'2026-10-08'},
  {vendedor_id:'4',tipo_evento:'ENTRADA',sucursal:'NAZCA'}, {vendedor_id:'5',tipo_evento:'SALIDA'}]};
 assert.deepEqual(attendance.enteredToday(response,'AV2','2026-10-09'),['1']);
});
test('asistencia vacía no habilita legajos y respuesta fallida o de otro día se rechaza',()=>{
 assert.deepEqual(attendance.enteredToday({ok:true,fecha:'2026-10-09',local:'AVELLANEDA',items:[]},'AV2','2026-10-09'),[]);
 assert.throws(()=>attendance.enteredToday({ok:false},'AV2','2026-10-09'));
 assert.throws(()=>attendance.enteredToday({ok:true,fecha:'2026-10-08',items:[]},'AV2','2026-10-09'));
});
test('alerta individual es estrictamente superior a 100.000',()=>{assert.equal(M.requestAlert({requested_cash:100000}),false);assert.equal(M.requestAlert({requested_cash:100000.01}),true);});
test('acumulado reúne sucursales por legajo y conserva importes pedidos aunque se rechace o apruebe menos',()=>{const rows=[{staff_code:'1',staff_name:'Ana',requested_cash:300000,approved_cash:100000,status:'approved'},{staff_code:'1',staff_name:'Ana',requested_cash:200000,status:'rejected'},{staff_code:'2',staff_name:'Ana',requested_cash:2}];const groups=M.groups(rows);assert.equal(groups.length,2);const g=groups.find(g=>g.code==='1');assert.equal(g.total,500000);assert.equal(g.approved,100000);assert.equal(M.monthlyAlert(g),false);g.total+=.01;assert.equal(M.monthlyAlert(g),true);});
test('exportación filtrada conserva solo solicitudes altas y no todas las de un empleado con una solicitud alta',()=>{const rows=[{staff_code:'1',requested_cash:150000},{staff_code:'1',requested_cash:50000},{staff_code:'2',requested_cash:100000}];assert.equal(M.exportRows(rows,true).length,1);assert.equal(M.exportRows(rows,false).length,3);});
test('importes argentinos, mercadería sin efectivo y negativos inválidos',()=>{assert.equal(M.amount('150.000,50'),150000.5);assert.equal(M.amount('0'),0);assert.throws(()=>M.amount('-1'));assert.throws(()=>M.amount('abc'));});
