const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const headers = ['ID','FECHA','LOCAL','DNI CLIENTE','MONTO','CUENTA','LINK','OBSERVACION','ESTADO'];
const rows = [headers, ['DUP','08-10-2026 12:30:00','WEB','123','125.000','Cuenta','','','PENDIENTE'], ['DUP','08-10-2026 12:30:00','WEB','123','125.000','Cuenta','','','PENDIENTE']];
let released = 0;
const sheet = {
  getLastRow: () => rows.length,
  getRange: (r,c,n=1,m=1) => ({
    getDisplayValues: () => rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+m)),
    getValues: () => rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+m)),
    getDisplayValue: () => rows[r-1][c-1],
    getRichTextValues: () => Array.from({length:n},()=>[null]),
    setValue: value => {rows[r-1][c-1]=value;}
  })
};
const context = vm.createContext({
  SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){released++;}})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},
  Utilities:{formatDate:()=> '08-10-2026 12:30:00'}, Logger:{log(){}}
});
vm.runInContext(fs.readFileSync('apps/check-depositos/apps-script-admin.gs','utf8'),context);
const expected = {local:'WEB',dniCliente:'123',monto:'125.000',cuenta:'Cuenta',estado:'PENDIENTE'};
function remove(rowNumber,extra={}) { return context.doPost({postData:{contents:JSON.stringify({accion:'eliminar_deposito',id:'DUP',rowNumber,expected,...extra})}}); }
assert.equal(remove(3,{expected:{...expected,monto:'99'}}).ok,false);
assert.equal(rows[2][8],'PENDIENTE');
assert.equal(remove(1).ok,false);
assert.equal(remove(3,{id:'OTHER'}).ok,false);
assert.equal(remove(3).estado,'ELIMINADO');
assert.equal(rows[1][8],'PENDIENTE');
assert.equal(rows[2][8],'ELIMINADO');
assert.equal(remove(3).ok,true);
const listing = context.doGet({parameter:{accion:'listar_depositos'}});
assert.equal(listing.data.length,1);
assert.equal(listing.data[0].rowNumber,2);
assert.equal(context.confirmarDeposito_({id:'DUP',rowNumber:3}).ok,false);
assert.equal(context.actualizarDeposito_({id:'DUP',rowNumber:3,monto:'1',cuenta:'Cuenta'}).ok,false);
assert.equal(rows.length,3);
assert.equal(released,7);
rows.splice(0,rows.length,
  ['ID','FECHA','LOCAL','MONTO','CUENTA','LINK','OBSERVACION','ESTADO'],
  ['ONE','08-10-2026 12:30:00','WEB','125.000','Cuenta','','','CONFIRMADO'],
  ['TWO','08-10-2026 12:30:00','WEB','89.500','Cuenta','','','PENDIENTE']);
const beforeLegacyRead=JSON.stringify(rows);
const legacyListing=context.doGet({parameter:{accion:'listar_depositos'}});
assert.equal(legacyListing.ok,true);
assert.equal(legacyListing.data.filter(row=>row.estado==='CONFIRMADO').length,1);
assert.equal(legacyListing.data.filter(row=>row.estado==='PENDIENTE').length,1);
assert.equal(legacyListing.data[0].monto,'125.000');
assert.equal(legacyListing.data[0].cuenta,'Cuenta');
assert.equal(JSON.stringify(rows),beforeLegacyRead);
assert.equal(context.actualizarDeposito_({id:'TWO',rowNumber:3,monto:'90.000',cuenta:'Cuenta nueva'}).ok,true);
assert.equal(rows[2][3],'90.000');
assert.equal(rows[2][4],'Cuenta nueva');
assert.equal(rows[2][7],'PENDIENTE');
assert.equal(context.eliminarDeposito_({id:'TWO',rowNumber:3,expected:{local:'WEB',dniCliente:'',monto:'90.000',cuenta:'Cuenta nueva',estado:'PENDIENTE'}}).ok,true);
assert.equal(rows[2][7],'ELIMINADO');
rows[0][3]='CABECERA INVALIDA';
const beforeInvalidRead=JSON.stringify(rows);
assert.equal(context.doGet({parameter:{accion:'listar_depositos'}}).ok,false);
assert.equal(JSON.stringify(rows),beforeInvalidRead);
console.log('PASS: legacy 8 columns and current 9 columns, confirmed/pending states preserved, reads never modify headers or data.');
console.log('PASS: target duplicate only, stale data rejected, deleted row retained and hidden, no confirmation/edit resurrection, locks released.');
