var PickStorage = (function () {
  'use strict';
  function create(DexieCtor,name) {
    var db=new DexieCtor(name);db.version(1).stores({jobs:'id,state,updatedAt',meta:'key'});
    function conflict(){throw new Error('El picking cambió en otra pestaña. Se recargó la versión guardada; revisá antes de continuar.');}
    async function change(id,revision,fn){
      return db.transaction('rw',db.jobs,async function(){var job=await db.jobs.get(id);if(!job||job.revision!==revision)conflict();if(job.state!=='DRAFT')throw Error('Este picking ya está cerrado.');var next=fn(structuredClone(job));next.revision++;next.updatedAt=Date.now();await db.jobs.put(next);return next;});
    }
    return {
      db:db,open:function(){return db.open();},get:function(id){return db.jobs.get(id);},list:function(){return db.jobs.orderBy('updatedAt').reverse().toArray();},
      create:async function(meta){var id=new Date().toISOString().slice(0,10).replace(/-/g,'')+'_'+crypto.randomUUID();var job={id:id,state:'DRAFT',revision:0,meta:meta,scans:[],undo:null,createdAt:Date.now(),updatedAt:Date.now()};await db.jobs.add(job);return job;},
      change:change,
      freeze:function(id,revision,payload){return change(id,revision,function(j){j.payload=payload;j.state='QUEUED';j.undo=null;return j;});},
      remote:function(id,remote){return db.transaction('rw',db.jobs,async function(){var job=await db.jobs.get(id);if(!job||!job.payload)throw Error('No se encuentra el pedido local cerrado.');job.remote=remote;job.updatedAt=Date.now();await db.jobs.put(job);return job;});},
      remember:function(key,value){return db.meta.put({key:key,value:value});},
      recall:async function(key){return (await db.meta.get(key))?.value;},
      close:function(){db.close();}
    };
  }
  return {create:create};
})();
if(typeof module!=='undefined')module.exports=PickStorage;
