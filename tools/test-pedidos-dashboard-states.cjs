const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('apps/pedidos-dashboard/app.js', 'utf8');
const constants = source.slice(source.indexOf('  const NORMALIZATION'), source.indexOf('  const DEMO_ROWS'));
function extract(name) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf('\n  function ', start + 1);
  return source.slice(start, end);
}
const context = {state:{rows:[]}, el:Object.fromEntries(['fromDate','toDate','searchInput','branchFilter','stateFilter','shippingFilter','webFilter','userFilter'].map(k=>[k,{value:''}]))};
vm.createContext(context);
vm.runInContext(constants + ['normalizeValue','normalizeText','clean','orderKey','latestOrderRows','isBuildDoneRow','buildOrderCycles','getFilteredRows','formatDuration'].map(extract).join('\n') + '\nthis.api={normalizeValue,latestOrderRows,buildOrderCycles,getFilteredRows,formatDuration};', context);
const {api} = context;
for(const s of ['ARMADO','PICKEADO','CONTROLADO','ENVIADO','ENVIADO A SUCURSAL','EN SUCURSAL','RETIRADO','CANCELADO','PEDIDO CON FALTANTES']) assert.equal(api.normalizeValue(s,'estado'),s);
assert.equal(api.normalizeValue('ARMADO/PICKEADO','estado'),'ARMADO / PICKEADO (HISTÓRICO)');
function row(status,time,web='MINORISTA',id='1',n=1){return {estadoActual:status,timestamp:time,web,idPedido:id,rowNumber:n};}
const rows=[row('PARA ARMAR',1000),row('ARMADO',2000),row('PICKEADO',3000),row('CONTROLADO',4000),row('RETIRADO',5000),row('PARA ARMAR',1000,'MAYORISTA'),row('PICKEADO',8000,'MAYORISTA')];
assert.equal(api.getFilteredRows(rows).length,7,'No recortar los movimientos posteriores al armado');
assert.equal(api.latestOrderRows(rows).length,2,'No mezclar IDs de distintos canales');
assert.equal(api.latestOrderRows(rows)[0].estadoActual,'RETIRADO');
assert.equal(api.latestOrderRows([row('ARMADO',1000,'MINORISTA','1',2),row('PICKEADO',1000,'MINORISTA','1',3)])[0].estadoActual,'PICKEADO');
const cycles=api.buildOrderCycles(rows); assert.equal(cycles.length,2); assert.equal(cycles[0].durationMs,1000); assert.equal(cycles[1].durationMs,7000);
assert.equal(api.buildOrderCycles([row('ARMADO',2000)]).length,0,'No inventar inicio si falta historia');
assert.equal(api.buildOrderCycles([row('PARA ARMAR',1000),row('ARMADO / PICKEADO (HISTÓRICO)',2000)]).length,1);
assert.equal(api.formatDuration(0),'0m');
context.el.stateFilter.value='CONTROLADO'; assert.equal(api.getFilteredRows(rows).length,1);
console.log('OK: estados separados, históricos, recorrido completo, último estado, canales y tiempos.');
