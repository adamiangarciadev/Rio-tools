const assert=require('node:assert/strict');
global.PreciosCore=require('../apps/precios-web/core.js');
const core=require('../apps/archivos-administrativos/precios.js');
assert.ok(core.brands.includes('XY'));
let cacheValue=null;
const storage={getItem:()=>cacheValue,setItem:(_,value)=>{cacheValue=value;}};
const cachedReport={ok:true,rows:[{articulo:'001',lista1:100,lista3:200}]};
assert.equal(core.readCache(storage,'api'),null);
assert.equal(core.saveCache(storage,'api',cachedReport),true);
assert.deepEqual(core.readCache(storage,'api'),cachedReport);
assert.equal(core.readCache(storage,'other-api'),null);
assert.equal(core.saveCache(storage,'api',{ok:false}),false);
assert.deepEqual(core.readCache(storage,'api'),cachedReport);
cacheValue='invalid JSON';assert.equal(core.readCache(storage,'api'),null);
assert.equal(core.saveCache({setItem(){throw Error('quota');}},'api',cachedReport),false);
const {jsPDF}=require('../assets/vendor/jspdf/jspdf.umd.min.js');
const base={proveedor:'ANDRESSA',clasificacion:'LINEA LINEA',tipoPrenda:'Conjuntos',lista1:100,lista3:200};
const report={ok:true,updatedAt:'2026-10-06T12:00:00Z',rows:[
 {...base,articulo:'05-100',talle:'90'}, {...base,articulo:'05-2',talle:'85'},
 {...base,articulo:'05-2',talle:'90'}, {...base,articulo:'05-2',talle:'100',lista1:150},
 {...base,articulo:'05-3',tipoPrenda:'Bombachas de malla'},
 {...base,articulo:'05-4',tipoPrenda:'Trajes de baño'},
 {...base,articulo:'05-5',clasificacion:'DISC DISCONTINUO'},
 {...base,articulo:'05-6',clasificacion:'PROMO PROMO'},
 {...base,articulo:'05-7',lista1:null},
 {...base,articulo:'05-8',conflicto:true},
 {...base,articulo:'05-9',proveedor:'OTRA'},
 {...base,articulo:'06-1',proveedor:'BELEN',lista1:0}
]};
const one=core.prepare(report,1);
assert.deepEqual(one.sections.map(g=>[g.brand,g.section]),[['Andressa','Línea'],['Andressa','Verano'],['Belén','Línea']]);
assert.deepEqual(one.sections[0].rows.map(r=>r.article),['05-2','05-2','05-100']);
assert.equal(one.sections[0].rows[0].sizes,'85/90');
assert.equal(one.sections[0].rows[0].showSizes,true);
assert.equal(one.sections[2].rows[0].price,0);
assert.equal(one.missing,1);assert.equal(one.conflicts,1);
assert.equal(core.prepare(report,3).sections[0].rows[0].showSizes,false);
assert.equal(core.prepare(report,1,['Belén']).count,1);
const groupsReport={...report,rows:[{...base,articulo:'05-1',tipoPrenda:undefined,grupo:'Trajes de baño'},{...base,articulo:'05-2',tipoPrenda:undefined,grupo:'Bombachas de malla'}]};
assert.equal(core.prepare(groupsReport,1).unknownType,0);
assert.equal(core.prepare(groupsReport,1).sections[0].section,'Verano');
assert.equal(core.prepare(groupsReport,1).count,2);
const underwearReport={...report,rows:[
  {...base,articulo:'05-10',grupo:'BOMBACHAS'},
  {...base,articulo:'05-2',grupo:'PACK BOMBACHAS'},
  {...base,articulo:'05-3',grupo:'MALLA BOMBACHA'},
  {...base,articulo:'05-1',grupo:'CORSETERIA'}
]};
for(const n of [1,3]){
  const sections=core.prepare(underwearReport,n).sections;
  assert.deepEqual(sections.map(g=>g.section),['Línea','Bombachas y packs','Verano']);
  assert.deepEqual(sections[1].rows.map(r=>r.article),['05-2','05-10']);
  assert.equal(sections[2].rows[0].article,'05-3');
}
assert.equal(core.prepare({...groupsReport,rows:[{...groupsReport.rows[0],conflictoGrupo:true}]},1).count,0);
assert.throws(()=>core.pdf({...report,rows:[{...base,articulo:'1',tipoPrenda:''}]},1,core.brands,jsPDF),/tipo de prenda/);
const many={...report,rows:Array.from({length:1200},(_,i)=>({...base,articulo:'05-'+i,tipoPrenda:i%3?'Conjuntos':'Trajes de baño',lista1:123456.78}))};
const output=core.pdf(many,1,core.brands,jsPDF);
assert.equal(output.count,1200);assert.ok(output.doc.getNumberOfPages()>1);
require('node:fs').mkdirSync('tmp/pdfs',{recursive:true});
require('node:fs').writeFileSync('tmp/pdfs/listas-administrativas-prueba.pdf',Buffer.from(output.doc.output('arraybuffer')));
console.log('Listas administrativas: filtros, orden, variantes, Verano y paginación correctos.');
