const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../apps/stock-proveedores/core.js');
test('comparativo conserva ventas netas y las exporta solo cuando se eligen',()=>{
 const table={name:'Comparativo',rows:[['Nombre Proveedor','Artículo','Descripción Colores (original)','Talle','Stock Actual','Cant. Vend.'],['SIGRY','04-8501','BLANCO','100','10.00','4.00'],['SIGRY','04-8501','BLANCO','100','2.00','-1.00']]};
 const data=core.fromTables([table],'comparativo.xls');assert.equal(data.hasSales,true);assert.equal(data.rows[0].sales,3);assert.equal(data.rows[0].stock,12);
 assert.equal(core.sheets(data.rows)[0].rows[1].length,5);assert.deepEqual(core.sheets(data.rows,{sales:true,period:'2026-09-01 a 2026-09-30'})[0].rows[1],['SIGRY','04-8501','BLANCO','100',12,3]);
 table.rows[1][5]='error';assert.throws(()=>core.fromTables([table],'x.xls'),/Venta inválida/);
});
test('muestra y exporta descripciones sin códigos y conserva el artículo',()=>{
 const data=core.normalize({reportDate:'2026-10-01',records:[{supplier:'04 SIGRY',code:'04-8501',color:'BLA BLANCO',size:'100 100',branches:{Web:[2,0]}},{supplier:'14 COA COA',code:'014',color:'VO VERDE OLIVA',size:'U UNICO',branches:{Web:[1,0]}}]});
 const sigry=data.rows.find(r=>r.supplier==='SIGRY');
 assert.deepEqual(sigry,{supplier:'SIGRY',article:'04-8501',color:'BLANCO',size:'100',stock:2});
 assert.deepEqual(core.sheets([sigry])[0].rows[1],['SIGRY','04-8501','BLANCO','100',2]);
 assert.equal(data.rows.find(r=>r.article==='014').supplier,'COA COA');
 assert.equal(data.rows.find(r=>r.article==='014').color,'VERDE OLIVA');
});
test('consolida todas las bases, negativos y variantes repetidas sin perder códigos',()=>{
const data=core.normalize({reportDate:'2026-10-01',records:[{supplier:'Sigry',code:'0010',color:'Azul',size:'10',branches:{Web:[3,0],Deposito:[8,0],Otro:[-2,0]}},{supplier:'Sigry',code:'0010',color:'Azul',size:'10',branches:{Web:[1,0]}}]});
assert.equal(data.rows[0].stock,10);assert.equal(data.rows[0].article,'0010');assert.deepEqual(data.branches,['Deposito','Otro','Web']);
});
test('ordena artículo, color y talle de menor a mayor',()=>{
const rows=[['2','Azul','2'],['10','Rojo','2'],['10','Azul','2'],['10','Azul','10']].map(([article,color,size])=>({supplier:'A',article,color,size,stock:1})).sort(core.sortRows);
assert.deepEqual(rows.map(r=>[r.article,r.color,r.size]),[['2','Azul','2'],['10','Azul','2'],['10','Azul','10'],['10','Rojo','2']]);
});
test('resuelve grupos con tildes y puntuación e informa faltantes',()=>{
assert.deepEqual(core.resolveGroup(core.defaults.GrupoBK,['04 SIGRY','50 B & K','06 Belén']),{found:['04 SIGRY','50 B & K','06 Belén'],missing:['lara','bakhou','gabela']});
});
test('hojas válidas únicas y texto literal en Excel',()=>{
const rows=['A/B','A:B','a:b',"'"].map(supplier=>({supplier,article:'=001',color:'Azul',size:'01',stock:4}));const sheets=core.sheets(rows);
assert.equal(new Set(sheets.map(s=>s.name.toLowerCase())).size,4);assert.ok(sheets.every(s=>s.name.length<=31&&!/[\\/?*\[\]:]/.test(s.name)));assert.equal(sheets[0].rows[1][1],'=001');
});
test('rechaza stocks inválidos',()=>assert.throws(()=>core.normalize({reportDate:'2026-10-01',records:[{branches:{Web:['error',0]}}]}),/inválido/));
test('importa columnas reales, preserva descripciones compuestas y consolida cantidades',()=>{
 const tables=[{name:'Stock',rows:[['Nombre','Artículo','Color descripción','Talle','Cantidad'],['COA COA','001','VERDE OLIVA','100','2.00'],['COA COA','001','VERDE OLIVA','100','-1.00']]}];
 const data=core.fromTables(tables,'StockPorArticulos_20261001_162931.XLS');
 assert.deepEqual(data.rows,[{supplier:'COA COA',article:'001',color:'VERDE OLIVA',size:'100',stock:1}]);assert.equal(data.reportDate,'2026-10-01');
 assert.throws(()=>core.fromTables([{name:'Mal',rows:[['Otro']]}],'a.xls'),/columnas/);
 tables[0].rows[1][4]='error';assert.throws(()=>core.fromTables(tables,'a.xls'),/Cantidad inválida/);
});
