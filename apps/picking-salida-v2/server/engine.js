/* Synchronous recovery protocol. Google adapter owns locks and atomic record writes. */
var PickEngine = (function () {
  'use strict';
  var D = typeof PickDomain !== 'undefined' ? PickDomain : require('../shared/domain.js');
  function create(store) {
    function get(id) { D.assert(D.validId(id),'ID','Operación inválida.'); var j=store.get(id); D.assert(j,'NOT_FOUND','No se encontró esta operación.'); return j; }
    function allowed(j, actor) { D.assert(actor && (j.owner === actor.sub || actor.role === 'admin'),'FORBIDDEN','Esta operación pertenece a otro usuario.'); }
    function view(j) {
      return {id:j.id,state:j.state,remito:j.remito || '',fileName:j.fileName || '',fileId:j.state==='READY'?j.txtId:'',destino:j.meta.destino,origen:j.meta.origen,responsable:j.meta.responsable,bultos:j.meta.bultos,count:j.count,createdAt:j.createdAt,updatedAt:j.updatedAt,accepted:!!j.accepted,attempts:j.attempts,error:j.error||'',code:j.code||'',nextAt:j.nextAt||0,hash:j.hash};
    }
    function submit(input, actor) {
      var p=D.normalize(input), canonical=JSON.stringify(p), hash=store.hash(canonical);
      D.assert(actor && actor.sub && actor.origins.includes(p.origen),'FORBIDDEN','No tenés permiso para este origen.');
      D.assert(store.route(p.origen,p.destino),'ROUTE','Esta ruta no está configurada.');
      var j=store.lock(function(){
        var old=store.get(p.id);
        if(old){ allowed(old,actor); D.assert(old.hash===hash,'CONFLICT','La operación ya existe con otro contenido.'); return old; }
        var ids=store.ids(), now=store.now();
        var fresh={id:p.id,owner:actor.sub,ownerEmail:actor.email,hash:hash,contentHash:store.hash(D.content(p)),meta:{responsable:p.responsable,origen:p.origen,destino:p.destino,bultos:p.bultos},count:p.scans.length,state:'RECEIVING',manifestId:ids[0],txtId:ids[1],folderId:store.route(p.origen,p.destino),date:store.businessDate(),createdAt:now,updatedAt:now,attempts:0,nextAt:0};
        store.save(fresh); return fresh;
      });
      if(j.state==='CANCELLED') D.fail('CANCELLED','Esta operación está anulada.');
      if(j.state==='READY') return view(j);
      return process(j.id,p);
    }
    function process(id, payload) {
      var lease=store.uuid(), j=store.lock(function(){
        var current=get(id);
        if(['READY','CANCELLED','ATTENTION'].includes(current.state) || (current.leaseUntil||0)>store.now() || ((current.nextAt||0)>store.now() && !(payload&&!current.accepted))) return null;
        current.lease=lease; current.leaseUntil=store.now()+8*60*1000; current.attempts++; store.save(current); return current;
      });
      if(!j) return view(get(id));
      function update(values) {
        return store.lock(function(){var x=get(id);D.assert(x.lease===lease,'LEASE','Otro proceso tomó esta operación.');Object.assign(x,values,{updatedAt:store.now()});store.save(x);j=x;return x;});
      }
      try {
        var manifest;
        if(!j.accepted){
          if(payload) store.ensureManifest(j,JSON.stringify(payload));
          manifest=store.readManifest(j);
          if(!manifest){update({lease:'',leaseUntil:0,nextAt:store.now()+300000,error:'Falta reenviar el contenido desde el equipo.'});return view(j);}
          D.assert(store.hash(manifest)===j.hash,'MANIFEST','El respaldo no coincide con el pedido.');
          update({accepted:true,state:'RECEIVED',error:'',code:''});
        } else manifest=store.readManifest(j);
        D.assert(manifest && store.hash(manifest)===j.hash,'MANIFEST','No se pudo verificar el respaldo original.');
        var p=D.normalize(JSON.parse(manifest));
        if(!j.remito){
          j=store.lock(function(){var x=get(id);D.assert(x.lease===lease,'LEASE','Reserva de proceso perdida.');return store.reserveNumber(x);});
        }
        if(!j.fileName) update({fileName:D.name(p,j.remito,j.date)});
        var txt=D.content(p);
        // Never recreate a file once its successful creation has been checkpointed.
        store.ensureTxt(j,txt,!!j.txtVerified);
        D.assert(store.verifyTxt(j,txt),'TXT','No se pudo verificar el TXT y su carpeta.');
        update({state:'TXT_VERIFIED',txtVerified:true,error:'',code:''});
        store.publish(j); // same stable operation ID; adapter verifies an existing row
        D.assert(store.verifyPublication(j),'SHEET','No se pudo verificar la fila del cuadernillo.');
        update({state:'READY',lease:'',leaseUntil:0,nextAt:0,error:'',code:'',completedAt:store.now()});
      } catch(e) {
        if(e.crash) throw e; // test-only simulation of process death; never set by Google adapter
        var permanent=e.permanent===true || j.attempts>=8;
        update({state:permanent?'ATTENTION':j.state,lease:'',leaseUntil:0,nextAt:permanent?0:store.now()+Math.min(3600000,15000*Math.pow(2,j.attempts-1)),error:String(e.message||e).slice(0,350),code:e.code||'UPSTREAM'});
      }
      return view(j);
    }
    function handle(req, actor) {
      D.assert(req && typeof req.action==='string','REQUEST','Pedido inválido.');
      if(req.action==='submit') return {job:submit(req.payload,actor)};
      if(req.action==='history') return {jobs:store.history(req.month,actor).map(view)};
      if(req.action==='health') return store.health(actor);
      var j=get(req.id);allowed(j,actor);
      if(req.action==='status') return {job:view(j)};
      if(req.action==='download') {
        D.assert(j.accepted,'PENDING','El servidor todavía no confirmó el contenido.');
        var raw=store.readManifest(j);D.assert(raw && store.hash(raw)===j.hash,'MANIFEST','Respaldo inconsistente.');
        return {content:D.content(JSON.parse(raw)),fileName:j.fileName||('BORRADOR-'+j.id+'.txt'),job:view(j)};
      }
      if(req.action==='retry') {
        D.assert(actor.role==='admin','FORBIDDEN','La recuperación manual requiere un supervisor.');
        store.lock(function(){var x=get(j.id);D.assert((x.leaseUntil||0)<=store.now(),'BUSY','La operación sigue en curso.');D.assert(!['READY','CANCELLED'].includes(x.state),'STATE','Esta operación ya está cerrada.');x.state=x.accepted?'RECEIVED':'RECEIVING';x.attempts=0;x.nextAt=0;x.error='';x.code='';store.save(x);});
        return {job:process(j.id)};
      }
      if(req.action==='cancel') {
        D.assert(actor.role==='admin','FORBIDDEN','La anulación requiere un supervisor.');
        D.assert(typeof req.reason==='string' && req.reason.trim().length>=8 && req.reason.length<=300,'REASON','Indicá el motivo de anulación (8 a 300 caracteres).');
        store.lock(function(){var x=get(j.id);D.assert((x.leaseUntil||0)<=store.now(),'BUSY','La operación sigue en curso.');D.assert(!x.remito && !x.accepted,'STATE','Solo se anulan recepciones sin contenido ni número. Una salida emitida requiere conciliación.');x.state='CANCELLED';x.error=req.reason;x.updatedAt=store.now();store.save(x);});
        return {job:view(get(j.id))};
      }
      D.fail('ACTION','Acción no admitida.');
    }
    function recover(limit) { var ids=store.pending(limit||10), out=[]; for(var i=0;i<ids.length;i++){if(store.timeBudgetExceeded && store.timeBudgetExceeded())break;out.push(process(ids[i]));}store.heartbeat();return out; }
    return {handle:handle,process:process,recover:recover,view:view};
  }
  return {create:create};
})();
if(typeof module!=='undefined')module.exports=PickEngine;
