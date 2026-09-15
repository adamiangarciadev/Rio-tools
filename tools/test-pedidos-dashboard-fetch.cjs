const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('apps/pedidos-dashboard/app.js','utf8');
const fn=source.slice(source.indexOf('  async function fetchJson('),source.indexOf('  function normalizeRows('));
async function run(responses){
 const calls=[];
 const ctx={URL,AbortController,setTimeout,clearTimeout,fetch:async(url,options)=>{calls.push({url,options});const result=responses.shift();if(result instanceof Error)throw result;return {ok:result.http!==false,text:async()=>result.body};}};
 vm.createContext(ctx);vm.runInContext(fn,ctx);
 let data,error;try{data=await ctx.fetchJson('https://example.test/exec?accion=listar_log');}catch(e){error=e;}
 return {data,error,calls};
}
(async()=>{
 const html='<html><script>private error</script>Pagina no encontrada</html>';
 const valid={body:JSON.stringify({ok:true,data:[{idPedido:'1'}]})};
 let r=await run([{body:html},valid]);assert.equal(r.data.data.length,1);assert.equal(r.calls.length,2);
 assert(r.calls.every(c=>c.options.cache==='no-store'&&c.options.credentials==='omit'&&new URL(c.url).searchParams.has('_rio')));
 r=await run([{body:html},{body:html}]);assert(r.error);assert(!r.error.message.includes('html'));assert.equal(r.calls.length,2);
 r=await run([{body:'{"ok":true}'},valid]);assert.equal(r.calls.length,2);assert(r.data);
 r=await run([new Error('network'),valid]);assert(r.data);
 r=await run([{http:false,body:html},{http:false,body:html}]);assert(r.error);
 console.log('OK: reintento, HTML, red, HTTP, validación de datos y caché.');
})().catch(e=>{console.error(e);process.exitCode=1;});
