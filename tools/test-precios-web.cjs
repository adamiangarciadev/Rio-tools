const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../apps/precios-web/core.js');
const header = 'Proveedor - Descripción,Artículo - Código,Clasificación,Talle,Lista de precios - Número,Precio\n';
const one = core.parse(header+'"Proveedor, A",001,LINEA LINEA,01,LISTA1,"1.000,00"\nB,002,DISC DISCONTINUO,,LISTA1,"0,00"','LISTA1');
const three = core.parse(header+'"Proveedor, A",001,LINEA LINEA,01,LISTA3,"1.500,00"\nB,002,PROMO PROMO,,LISTA3,"10,00"\nC,003,,,LISTA3,"12,00"','LISTA3');
const rows=core.merge(one,three);
const groupedHeader='Grupo - Descripción,'+header;
const groupedOne=core.parse(groupedHeader+'Trajes de baño,B,001,LINEA LINEA,85,LISTA1,"100,00"','LISTA1');
const groupedThree=core.parse(groupedHeader+'Bombachas de malla,B,001,LINEA LINEA,85,LISTA3,"200,00"','LISTA3');
assert.equal(groupedOne.values().next().value.grupo,'Trajes de baño');
const flexible=core.parse('Grupo – Descripción,Proveedor-Descripción,Artículo - Código,Clasificación - Descripción,Talle - Código,Lista de precios - Número,Precio\nMallas,A,001,LINEA LINEA,85,LISTA1,"100,00"','LISTA1');
assert.equal(flexible.values().next().value.grupo,'Mallas');
assert.throws(()=>core.parse('Proveedor,Precio\nA,"100,00"','LISTA1'),/faltan columnas Artículo, Clasificación, Talle, Lista de precios.*Encabezados recibidos: Proveedor \| Precio/);
const groupedRows=core.merge(groupedOne,groupedThree);
const equivalent=core.merge(core.parse(header+'A,001,LINEA,85,LISTA1,"100,00"','LISTA1'),core.parse(header+'A,001,LINEA LINEA,85,LISTA3,"200,00"','LISTA3'));
assert.equal(equivalent[0].conflicto,false);
assert.equal(groupedRows[0].grupoLista3,'Bombachas de malla');
assert.equal(groupedRows[0].conflictoGrupo,true);
assert.equal(core.unify([{...groupedRows[0],grupo:'A'},{...groupedRows[0],grupo:'B'}]).length,2);
assert.equal(core.merge(one,three)[0].grupo,'');
assert.throws(()=>core.parse(groupedHeader+'A,B,001,LINEA LINEA,85,LISTA1,"100,00"\nB,B,001,LINEA LINEA,85,LISTA1,"100,00"','LISTA1'),/Duplicado contradictorio/);
assert.equal(rows.find(r=>r.articulo==='001').diferencia,.5);
assert.equal(rows.find(r=>r.articulo==='001').talle,'01');
assert.equal(rows.find(r=>r.articulo==='002').diferencia,null);
assert.equal(rows.find(r=>r.articulo==='002').conflicto,true);
assert.equal(rows.find(r=>r.articulo==='003').lista1,null);
assert.equal(core.condition('AP PROMOCION DISC.3X2'),'Discontinuo');
assert.deepEqual(core.csv('a;b\r\n"uno\n""dos""";x'),[['a','b'],['uno\n"dos"','x']]);
assert.throws(()=>core.parse(header+'B,1,,,LISTA3,"1,00"','LISTA1'));
assert.throws(()=>core.parse(header+'B,1,,,LISTA1,"1,00"\nB,1,,,LISTA1,"2,00"','LISTA1'));
assert.throws(()=>core.parse(header+'B,1,,,LISTA1,"precio"','LISTA1'));
const example = n => `C:/Users/usuario/Downloads/Reporte zNube - PRECIOS LISTA${n} (1).eml`;
const newExample = n => `C:/Users/usuario/Downloads/Reporte zNube - PRECIOS LISTA${n} (3).eml`;
if(fs.existsSync(newExample(1))&&fs.existsSync(newExample(3))){
  const read=n=>{const eml=fs.readFileSync(newExample(n),'utf8'),part=eml.split(/\r?\n(?=Content-Type:)/i).find(p=>/^Content-Type:\s*application\/octet-stream/i.test(p));return Buffer.from(part.split(/\r?\n\r?\n/).slice(1).join('\n\n').split(/\r?\n--/)[0].replace(/\s/g,''),'base64').toString('utf8');};
  const updated=core.merge(core.parse(read(1),'LISTA1'),core.parse(read(3),'LISTA3'));
  global.PreciosCore=core;
  const administrative=require('../apps/archivos-administrativos/precios.js');
  for(const n of [1,3]){
    const result=administrative.prepare({ok:true,rows:updated},n,administrative.brands,{includeMedias:true});
    assert.equal(result.unknownType,0);assert.equal(result.conflicts,0);assert.equal(result.count,1143);
    assert.equal(result.sections.filter(g=>g.section==='Verano').reduce((total,g)=>total+g.rows.length,0),108);
  }
  console.log('Mails nuevos: Grupo conservado, 1143 filas por lista, 108 de Verano.');
}
if(fs.existsSync(example(1))&&fs.existsSync(example(3))){
  function attachment(path){ const eml=fs.readFileSync(path,'utf8'), section=eml.split(/\r?\n(?=Content-Type:)/i).find(p=>/^Content-Type:\s*application\/octet-stream/i.test(p));return Buffer.from(section.split(/\r?\n\r?\n/).slice(1).join('\n\n').split(/\r?\n--/)[0].replace(/\s/g,''),'base64').toString('utf8'); }
  const a=core.parse(attachment(example(1)),'LISTA1'),b=core.parse(attachment(example(3)),'LISTA3'),joined=core.merge(a,b);
  assert.equal(core.csv(attachment(example(1))).length,24772);
  assert.equal(core.csv(attachment(example(3))).length,24755);
  assert.equal(joined.find(r=>r.articulo==='05-21013').lista1,8270);
  assert.equal(joined.find(r=>r.articulo==='05-21013').lista3,13875);
  console.log(`Mails reales: ${a.size} / ${b.size} claves; ${joined.length} combinadas; ${joined.filter(r=>r.lista1===null||r.lista3===null).length} incompletas.`);
}
// El programador revisa novedades durante todo el día.
let attempts=0, hour='7', stored={};
const context={Utilities:{formatDate:(_,__,format)=>format==='H'?hour:'2026-10-01'},PropertiesService:{getScriptProperties:()=>({getProperty:k=>stored[k],setProperty:(k,v)=>stored[k]=v})},console:{error(){}}};
vm.createContext(context);vm.runInContext(fs.readFileSync('apps/precios-web/apps-script.gs','utf8'),context);
context.actualizarPreciosWeb=()=>{attempts++;};
context.actualizarPreciosProgramado();assert.equal(attempts,1);
hour='8';context.actualizarPreciosProgramado();assert.equal(attempts,2);
stored.completedDay='2026-10-01';context.actualizarPreciosProgramado();assert.equal(attempts,3);
stored={};context.actualizarPreciosWeb=()=>{throw Error('Falta LISTA3');};context.actualizarPreciosProgramado();assert.equal(stored.syncError,'Falta LISTA3');
console.log('Precios WEB: verificaciones correctas.');
function mail(id,date){return {getDate:()=>new Date(date),getFrom:()=>'znube@zoologic.com.ar',getSubject:()=>'Reporte zNube - PRECIOS LISTA1',getId:()=>id,getAttachments:()=>[{getName:()=>'PRECIOS LISTA1.CSV',getDataAsString:()=>'csv '+id}]};}
context.GmailApp={search:()=>[{getMessages:()=>[mail('morning','2026-10-01T09:10:00Z'),mail('evening','2026-10-01T22:10:00Z'),mail('midday','2026-10-01T14:12:00Z')]}]};
const latest=context.buscarListaPrecios_(1);
assert.equal(latest.source.messageId,'evening');
assert.equal(latest.text,'csv evening');
console.log('Último mail: envío de la tarde elegido por encima de mañana y mediodía.');
const tienda=core.tienda('SKU;Nombre\n001#NEG#01;Uno\n001#BLA#02;Dos\n002;Tres\n;Sin SKU\n03.10#A;Cuatro');
assert.deepEqual(tienda.articles,['001','002','03.10']);assert.equal(tienda.emptyCount,1);assert.equal(tienda.sourceRows.length,5);
const matched=core.matchTienda(rows,tienda);assert.equal(matched.length,3);assert.equal(matched[0].articulo,'001');assert.equal(matched[2].missing,true);assert.equal(matched[2].lista1,null);
assert.throws(()=>core.tienda('Nombre,Precio\nX,1'));
const tiendaPath='C:/Users/usuario/Downloads/tiendanube-6839142-17908666868888855328425855070.csv';
const unified=core.unify([{...rows[0],talle:'2 2'},{...rows[0],talle:'1 1'},{...rows[0],talle:''},{...rows[0],talle:'1 1'},{...rows[0],talle:'3 3',lista3:2000}]);
assert.equal(unified.length,2);assert.equal(unified[0].talle,'1 1 / 2 2');assert.equal(unified[1].lista3,2000);
assert.equal(core.unify([{...rows[0],proveedor:'A'},{...rows[0],proveedor:'B'}]).length,2);
assert.deepEqual(core.unify(unified),unified);
if(fs.existsSync(tiendaPath)){const actual=core.tienda(new TextDecoder('windows-1252').decode(fs.readFileSync(tiendaPath)));assert.equal(actual.sourceRows.length,1974);assert.equal(actual.sourceRows[0].sku,'05-48#BLA#90');assert.equal(actual.sourceRows[0].articulo,'05-48');console.log(`Tiendanube real: ${actual.sourceRows.length} filas, ${actual.articles.length} artículos, ${actual.emptyCount} sin SKU.`);}
