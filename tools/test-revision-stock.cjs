const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('apps/revision-stock/app.js','utf8');
function engine(priority=true){
 const ctx=vm.createContext({window:{},Intl,document:{getElementById:()=>({checked:priority})}});
 vm.runInContext(source.slice(source.indexOf('const DATA_URL'),source.indexOf('let searchTimer')),ctx);
 return ctx;
}
test('stock totals are conserved, transfers never exceed available units',()=>{
 for(const priority of [false,true])for(const total of [0,3,4,5,8,30,101]){
  const c=engine(priority);
  const variant=c.normalize({records:[{code:'TEST',article:'Artículo de prueba',classification:'LINEA',branches:{'Avellaneda 2900':[total,2]}}]})[0];
  const item=c.compute(variant),next=c.projected(item);
  assert.equal(Object.values(next).reduce((a,b)=>a+b,0),total);
  assert.ok(Object.values(next).every(n=>n>=0));
  if(priority&&total>=5)assert.ok(next['Avellaneda 3249 + Web']>=5);
 }
});
test('Avellaneda and Web aggregate; excluded transfers do not alter projected stock',()=>{
 const c=engine(false);const v=c.normalize({records:[{code:'TEST',article:'Prueba',branches:{'Avellaneda 3249':[10,2],Web:[20,3]}}]})[0];
 assert.equal(v.stock['Avellaneda 3249 + Web'],30);assert.equal(v.totalSales,5);
 const item=c.compute(v);c.item=item;
 vm.runInContext('item.moves.forEach(m=>state.excluded.add(key(item,m)))',c);
 assert.equal(JSON.stringify(c.projected(item)),JSON.stringify(item.current));
});
test('CSV escapes delimiters and spreadsheet formulas',()=>{
 const c=engine();assert.equal(c.csvCell('A,B'),'"A,B"');assert.equal(c.csvCell('=SUM(A1)'),'\'=SUM(A1)');assert.equal(c.csvCell(12),'12');
});
