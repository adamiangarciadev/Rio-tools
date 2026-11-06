const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/rio-branches.js','utf8');
function boot(path){
 const saved=new Map([['rio_workspace_branch_v1','PUEYRREDON'],['rio_sucursal','PUEY'],['other','keep']]);
 let callback;const option={value:'PUEYRREDON',textContent:'Pueyrredón',remove(){this.removed=true;}};
 const select={value:'PUEYRREDON',options:[option],dispatchEvent(){this.changed=true;}};
 const window={};
 vm.runInNewContext(source,{window,location:{pathname:path},localStorage:{getItem:k=>saved.get(k),removeItem:k=>saved.delete(k)},document:{documentElement:{},querySelectorAll:()=>[select],addEventListener(){}},MutationObserver:class{constructor(fn){callback=fn;}observe(){}},addEventListener(){},Event:class{}});
 return {saved,window,select,option,clean:callback};
}
test('retired aliases and accents are recognized without excluding active stores',()=>{
 const {window}=boot('/Rio-tools/index.html');
 for(const value of ['PUEY','PRUPUEY','Pueyrredón','pueyrredon'])assert.equal(window.RioBranches.isRetired(value),true);
 assert.equal(window.RioBranches.isRetired('QUILMES'),false);
});
test('stale preferences and dynamic choices are removed without changing unrelated storage',()=>{
 const state=boot('/Rio-tools/apps/envios/');state.clean();
 assert.equal(state.saved.has('rio_workspace_branch_v1'),false);assert.equal(state.saved.has('rio_sucursal'),false);
 assert.equal(state.saved.get('other'),'keep');assert.equal(state.option.removed,true);assert.equal(state.select.value,'');assert.equal(state.select.changed,true);
});
test('both Picking versions retain origin/destination and persisted drafts',()=>{
 for(const slug of ['picking-salida','picking-salida-v2']){
  const state=boot('/Rio-tools/apps/'+slug+'/');
  assert.equal(state.saved.get('rio_sucursal'),'PUEY');assert.equal(state.clean,undefined);assert.equal(state.option.removed,undefined);
 }
});
