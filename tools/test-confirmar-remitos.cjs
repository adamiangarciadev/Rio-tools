const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync('apps/confirmar-remitos/app.js','utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function boot(failures = new Set(), extraRows = []){
  const elements=new Map(),posts=[];
  function element(id){if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',disabled:false,hidden:false,events:{},addEventListener(name,fn){this.events[name]=fn;},append(li){this.innerHTML+=li.textContent;},showModal(){},close(){}});return elements.get(id);}
  const rows=[{id:'id-a',version:1,estado:'RECIBIDO EN SUCURSAL',data:{remito:'A',fecha:'01/07/2026',hacia:'QUILMES',desde:'DEPOSITO'}}, {id:'id-b',version:2,estado:'DIFERENCIAS',data:{remito:'B',fecha:'15/09/2026',hacia:'NAZCA',desde:'DEPOSITO'}}, {id:'id-c',version:1,estado:'ENVIADO A SUCURSAL',data:{remito:'C',fecha:'16/09/2026',hacia:'NAZCA',desde:'DEPOSITO'}}];
  rows.push(...extraRows);
  const context={window:{RioContext:{branch:'DEPOSITO'},RioAccess:{isUnlocked:()=>true},addEventListener(){}},document:{getElementById:element,createElement:()=>({textContent:''})},localStorage:{getItem:()=> 'DEPOSITO'},URLSearchParams,AbortController,setTimeout,clearTimeout,
    fetch:async(url,options)=>{const body=JSON.parse(options.body);if(body.op==='action'){posts.push(body);return {ok:true,json:async()=>body.id==='id-b'?{error:'rechazado'}:{record:{id:body.id}}};}if(body.op==='status')return {ok:true,json:async()=>({branches:['QUILMES','NAZCA']})};if(failures.has(body.branch))throw new Error('Sucursal no disponible');return {ok:true,json:async()=>rows.filter(row=>row.data.hacia===body.branch).slice(body.offset,body.offset+50)};}};
  vm.runInNewContext(code,context);return {element,posts};
}
test('date and destination filters select only visible pending remitos and clear previous selection',async()=>{
  const {element:e}=boot();await tick();
  e('selectAll').onclick();assert.match(e('count').textContent,/2 seleccionados/);
  e('to').value='2026-07-31';e('to').events.input();assert.match(e('count').textContent,/0 seleccionados · 1 visibles/);
  e('selectAll').onclick();e('review').onclick();assert.match(e('reviewList').innerHTML,/A/);assert.doesNotMatch(e('reviewList').innerHTML,/B/);
  e('branch').value='NAZCA';e('branch').events.input();assert.match(e('count').textContent,/0 seleccionados · 0 visibles/);
});
test('batch confirms each unique remito once with destination and staff code, reports partial failure and requires refresh',async()=>{
  const {element:e,posts}=boot();await tick();
  e('selectAll').onclick();e('review').onclick();e('staff').value='123';await e('confirmForm').onsubmit({preventDefault(){}});
  assert.deepEqual(posts,[
    {id:'id-a',version:1,estado:'CONFIRMADO OK',codigo:'123',observacion:'',destino:'',files:[],op:'action'},
    {id:'id-b',version:2,estado:'CONFIRMADO OK',codigo:'123',observacion:'',destino:'',files:[],op:'action'}
  ]);
  assert.equal(e('summary').textContent,'1 confirmados · 1 requieren revisión.');
  e('selectAll').onclick();assert.equal(e('review').disabled,true);
});

test('one failing branch retains successful remitos on first load',async()=>{
 const {element:e}=boot(new Set(['NAZCA']));await tick();
 assert.match(e('status').textContent,/Carga parcial/);
 assert.match(e('status').textContent,/NAZCA/);
 assert.match(e('count').textContent,/1 visibles/);
 e('selectAll').onclick();assert.equal(e('review').disabled,false);
});
test('total refresh failure preserves rows but prevents stale confirmation',async()=>{
 const failures=new Set();const {element:e}=boot(failures);await tick();
 failures.add('NAZCA');failures.add('QUILMES');await e('refresh').onclick();
 assert.match(e('count').textContent,/2 visibles/);
 assert.match(e('rows').innerHTML,/Pendiente de actualizar/);
 e('selectAll').onclick();assert.match(e('count').textContent,/0 seleccionados/);
});
test('loads all pages when a branch has more than fifty remitos',async()=>{
 const extra=Array.from({length:51},(_,i)=>({id:`id-extra-${i}`,version:1,estado:'RECIBIDO EN SUCURSAL',data:{remito:`Q-${i}`,fecha:'20/09/2026',hacia:'QUILMES',desde:'DEPOSITO'}}));
 const {element:e}=boot(new Set(),extra);await tick();
 assert.match(e('count').textContent,/53 visibles/);
 assert.match(e('rows').innerHTML,/Q-50/);
});
