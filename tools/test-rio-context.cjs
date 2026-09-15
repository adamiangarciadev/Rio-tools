const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync('assets/rio-context.js','utf8');
test('named local profiles hide ecommerce apps and reject their direct URLs',()=>{
  const branches=['AV2','NAZCA','QUILMES','CORRIENTES','DEPOSITO','LAMARCA','SARMIENTO','PUEYRREDON'];
  const hidden=['pedidos-web','clientes-contactar','pedidos-dashboard','categorizador'];
  for(const branch of branches)for(const slug of hidden)for(const unlocked of [false,true]){
    const {api,redirect}=boot(branch,slug,unlocked);
    assert.equal(api.canUse({slug}),false,`${branch}: ${slug}`);
    assert.equal(redirect,'https://example.test/Rio-tools/index.html');
  }
});
test('local web orders remain available only for the three named exceptions within the local group',()=>{
  for(const branch of ['AV2','NAZCA','QUILMES','CORRIENTES','DEPOSITO','LAMARCA','SARMIENTO','PUEYRREDON']){
    const allowed=['AV2','CORRIENTES','QUILMES'].includes(branch);
    const {api,redirect}=boot(branch,'pedidos-web-locales');
    assert.equal(api.canUse({slug:'pedidos-web-locales'}),allowed,branch);
    assert.equal(redirect==='',allowed,branch);
    assert.equal(boot(branch).api.canUse({slug:'incidentes'}),true);
  }
  // CASTELLI was not included in this request; retain its current access.
  assert.equal(boot('CASTELLI').api.canUse({slug:'pedidos-web'}),true);
  assert.equal(boot('WEB').api.canUse({slug:'pedidos-web'}),true);
});
function boot(branch='',slug='',unlocked=false){
  const values=new Map(branch?[['rio_workspace_branch_v1',branch]]:[]);
  let redirect='';
  const window={RioAccess:{isUnlocked:()=>unlocked}};
  const context={URL,window,decodeURIComponent,queueMicrotask,
    document:{currentScript:{src:'https://example.test/Rio-tools/assets/rio-context.js'},readyState:'loading',addEventListener(){}},
    location:{pathname:'/Rio-tools/'+(slug?'apps/'+slug+'/':'index.html'),replace:u=>redirect=String(u),assign(){}},
    localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},addEventListener(){}};
  vm.runInNewContext(code,context);
  return {api:window.RioContext,values,redirect};
}
test('first direct app visit returns to the Pages-prefixed home',()=>{
  assert.equal(boot('','asistencia').redirect,'https://example.test/Rio-tools/index.html');
});
test('only depot profile can open picking, including direct URLs',()=>{
  assert.match(boot('QUILMES','picking-salida').redirect,/notice=deposito/);
  assert.equal(boot('DEPOSITO','picking-salida').redirect,'');
  assert.equal(boot('ADMINISTRACION','picking-salida',true).api.canUse({slug:'picking-salida'}),false);
});
test('admin profile must renew access when the session expires',()=>{
  assert.ok(boot('ADMINISTRACION','check-depositos').redirect);
  assert.equal(boot('ADMINISTRACION','check-depositos',true).redirect,'');
  assert.equal(boot('QUILMES').api.canUse({slug:'margenes',restricted:true}),false);
});
test('branch spellings resolve to the same operating branch',()=>{
  const {api}=boot('AV2');
  for(const name of ['AV2','Avellaneda 2','Avellaneda 3249'])assert.equal(api.canonical(name),'AV2');
  assert.equal(api.canonical('Pueyrredón'),'PUEYRREDON');
  assert.equal(api.canonical('Avellaneda 2900'),'NAZCA');
});
test('legacy branch preferences are seeded before app code executes',()=>{
  const {values}=boot('QUILMES');
  for(const key of ['rio_sucursal','asistencia_sucursal_v1','rio_sucursal_web','rio_remitos_sucursal'])assert.equal(values.get(key),'QUILMES');
});
test('draft keys are isolated between branches',()=>{
  assert.notEqual(boot('QUILMES').api.storageKey('pedido_v1'),boot('NAZCA').api.storageKey('pedido_v1'));
});

test('all workspace branch names are uppercase and Corrientes 2 is no longer selectable',()=>{
  const {api}=boot('AV2');
  assert.equal(api.branches.includes('CORRIENTES2'),false);
  for(const branch of api.branches)assert.equal(api.label(branch),api.label(branch).toLocaleUpperCase('es-AR'));
  assert.ok(boot('CORRIENTES2','asistencia').redirect);
});

test('administration tools require access and become available after authentication',()=>{
  const tool={slug:'check-depositos',restricted:true};
  assert.equal(boot('ADMINISTRACION','',false).api.canUse(tool),false);
  assert.equal(boot('ADMINISTRACION','',true).api.canUse(tool),true);
});

 test('profile menus contain exactly the requested applications, even after supervisor unlock',()=>{
  const catalogCode=fs.readFileSync('assets/app-catalog.js','utf8');
  const sandbox={window:{}};vm.runInNewContext(catalogCode,sandbox);
  const expected={ADMINISTRACION:['supervisores','asistencia-dashboard','check-depositos'],WEB:['categorizador','pedidos-web','pedidos-dashboard','clientes-contactar','banco-medios','asistencia','confirmacion-depositos','etiquetas','incidentes','objetivos-ventas']};
  for(const [profile,slugs] of Object.entries(expected)){
    const api=boot(profile,'',true).api;
    assert.deepEqual(Array.from(sandbox.window.RioCatalog.filter(api.canUse),item=>item.slug).sort(),slugs.sort());
    assert.ok(boot(profile,'entrada-mercaderia',true).redirect);
  }
 });
