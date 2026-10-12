/* Shared validation: browser, Apps Script and executable tests use this same file. */
var PickDomain = (function () {
  'use strict';
  var RESPONSABLES = ['DAVID','DIEGO','JOEL','MARTIN','MIGUEL','NAHUEL','RODRIGO','RAMON','ROBERTO','SERGIO','PATO','FRANCO','MATIAS'];
  var BRANCHES = ['AV2','NAZCA','LAMARCA','CORRIENTES','CASTELLI','QUILMES','SARMIENTO','DEPOSITO','PUEYRREDON'];
  var LIMIT = 10000;
  function fail(code, message, permanent) { var e = new Error(message); e.code = code; e.permanent = permanent !== false; throw e; }
  function assert(ok, code, message) { if (!ok) fail(code, message); }
  function validId(id) { return typeof id === 'string' && /^\d{8}_[a-f0-9-]{36}$/.test(id); }
  function clean(code) { return String(code || '').replace(/[\u0000-\u001f\u007f]/g, '').trim(); }
  function parseVariant(code) { var p = code.split('!').map(function(s){return s.trim();}); return p.length === 3 && p[0] && (p[1] || p[2]) ? {article:p[0],color:p[1],size:p[2]} : null; }
  function checkCode(code) {
    assert(typeof code === 'string' && code === clean(code) && code.length >= 3 && code.length <= 128, 'CODE', 'Lectura inválida (entre 3 y 128 caracteres).');
    assert(!code.includes('!') || parseVariant(code), 'CODE', 'Usá artículo!color!talle.');
    return code;
  }
  function normalize(input) {
    assert(input && input.version === 2 && validId(input.id), 'PAYLOAD', 'Identificador de operación inválido.');
    assert(RESPONSABLES.includes(input.responsable), 'RESPONSABLE', 'Seleccioná un responsable.');
    assert(BRANCHES.includes(input.origen) && BRANCHES.includes(input.destino), 'RUTA', 'Seleccioná origen y destino.');
    assert(Number.isInteger(input.bultos) && input.bultos >= 0 && input.bultos <= 9999, 'BULTOS', 'Bultos debe ser un entero entre 0 y 9999.');
    assert(Array.isArray(input.scans) && input.scans.length > 0 && input.scans.length <= LIMIT, 'SCANS', 'El picking debe contener entre 1 y ' + LIMIT + ' lecturas.');
    var seen = Object.create(null);
    var scans = input.scans.map(function(s) {
      assert(s && typeof s.id === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(s.id) && !seen[s.id], 'EVENT', 'ID de lectura repetido o inválido.');
      seen[s.id] = true;
      return {id:s.id,code:checkCode(s.code)};
    });
    assert(typeof input.catalogVersion === 'string' && input.catalogVersion.length <= 160 && input.catalogVersion.length > 0, 'CATALOG', 'Falta versión de equivalencias.');
    assert(input.reviewedUnknown === true, 'REVIEW', 'Confirmá la revisión de lecturas.');
    return {version:2,id:input.id,responsable:input.responsable,origen:input.origen,destino:input.destino,bultos:input.bultos,catalogVersion:input.catalogVersion,reviewedUnknown:input.reviewedUnknown,scans:scans};
  }
  function content(p) { return p.scans.map(function(s){return s.code;}).join('\n'); }
  function name(p, remito, date) { return (date.slice(8,10)+date.slice(5,7)+date.slice(2,4)+' '+p.destino+' '+p.responsable+' '+p.bultos+'B REM'+remito+'.txt').replace(/[\\/:*?"<>|]+/g,'_'); }
  function statusLabel(state) { return ({DRAFT:'En este equipo',QUEUED:'Pendiente de envío',RECEIVING:'Falta recibir contenido',RECEIVED:'Contenido respaldado',NUMBERED:'Preparando TXT',TXT_VERIFIED:'Actualizando cuadernillo',READY:'Listo para despachar',ATTENTION:'Requiere atención',CANCELLED:'Anulado'})[state] || state; }
  return {RESPONSABLES:RESPONSABLES,BRANCHES:BRANCHES,LIMIT:LIMIT,fail:fail,assert:assert,validId:validId,clean:clean,parseVariant:parseVariant,checkCode:checkCode,normalize:normalize,content:content,name:name,statusLabel:statusLabel};
})();
if (typeof module !== 'undefined') module.exports = PickDomain;


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


/* Runtime adapter. No business data or credentials belong in source control. */
function pickingConfig_() {
  var raw=PropertiesService.getScriptProperties().getProperty('PICKING_CONFIG');
  if(!raw) throw new Error('Ejecutá setupPickingV2 antes de usar el servicio.');
  return JSON.parse(raw);
}
function pickingGoogleStore_(cfg) {
  var started=Date.now(), db=SpreadsheetApp.openById(cfg.controlId),owned={},positions={};
  function sheet(name){var s=db.getSheetByName(name);if(!s)throw new Error('Falta pestaña de control: '+name);return s;}
  function month(id){PickDomain.assert(PickDomain.validId(id),'ID','ID inválido.');return id.slice(0,6);}
  function ledger(id){var name='OPS_'+month(id),s=db.getSheetByName(name);if(!s){s=db.insertSheet(name);s.appendRow(['ID','REGISTRO_JSON']);s.setFrozenRows(1);SpreadsheetApp.flush();}return s;}
  // Read through the same API used for writes; avoid SpreadsheetApp read caches after batchUpdate.
  function values(s,range){return Sheets.Spreadsheets.Values.get(s.getParent().getId(),"'"+s.getName().replace(/'/g,"''")+"'!"+range,{valueRenderOption:'UNFORMATTED_VALUE'}).values||[];}
  function findRow(s,id){var key=s.getSheetId()+':'+id;if(positions[key])return positions[key];var rows=values(s,'A:A'),index=rows.findIndex(function(r){return r[0]===id;});if(index>=0)positions[key]=index+1;return index<0?0:index+1;}
  function lastRow(s){return values(s,'A:A').length;}
  function cells(s,row,col,values){return {updateCells:{start:{sheetId:s.getSheetId(),rowIndex:row-1,columnIndex:col-1},rows:[{values:values.map(function(v){return {userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:String(v)}};})}],fields:'userEnteredValue'}};}
  function ensureRows(s,row){if(row>s.getMaxRows())s.insertRowsAfter(s.getMaxRows(),Math.max(100,row-s.getMaxRows()));}
  function get(id){if(owned[id]&&owned[id].leaseUntil>Date.now())return JSON.parse(JSON.stringify(owned[id]));var s=db.getSheetByName('OPS_'+month(id));if(!s)return null;var r=findRow(s,id);return r?JSON.parse(values(s,'B'+r)[0][0]):null;}
  function requests(j){
    var s=ledger(j.id),r=findRow(s,j.id)||lastRow(s)+1;ensureRows(s,r);positions[s.getSheetId()+':'+j.id]=r;
    var q=sheet('PENDIENTES'), qr=findRow(q,j.id), active=!['READY','CANCELLED','ATTENTION'].includes(j.state);
    var out=[cells(s,r,1,[j.id,JSON.stringify(j)])];
    if(active){
      if(!qr){var vals=values(q,'A2:A');var hole=vals.findIndex(function(v){return !v[0];});qr=hole>=0?hole+2:vals.length+2;}
      ensureRows(q,qr);positions[q.getSheetId()+':'+j.id]=qr;out.push(cells(q,qr,1,[j.id,j.nextAt||0,j.leaseUntil||0]));
    }else if(qr)out.push(cells(q,qr,1,['','','']));
    return out;
  }
  function commit(j,reqs){try{Sheets.Spreadsheets.batchUpdate({requests:reqs},cfg.controlId);if(j.lease)owned[j.id]=JSON.parse(JSON.stringify(j));else delete owned[j.id];}catch(e){delete owned[j.id];positions={};throw e;}}
  function save(j){commit(j,requests(j));}
  function hash(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
  function file(id){
    try{return Drive.Files.get(id,{fields:'id,name,parents,trashed,mimeType',supportsAllDrives:true});}
    catch(e){if(/File not found|404|notFound/i.test(String(e.message)))return null;throw e;}
  }
  function read(id){return DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8');}
  function ensure(id,name,parent,mime,body,alreadyVerified){
    var existing=file(id);
    if(!existing){
      PickDomain.assert(!alreadyVerified,'FILE_MISSING','El TXT verificado ya no está disponible. Revisá si fue consumido o movido; no se recreará automáticamente.');
      try{Drive.Files.create({id:id,name:name,parents:[parent],mimeType:mime},Utilities.newBlob(body,mime,name),{fields:'id',supportsAllDrives:true});}
      catch(e){if(!file(id))throw e;}
      existing=file(id);
    }
    PickDomain.assert(existing && !existing.trashed && existing.name===name && (existing.parents||[]).includes(parent),'FILE_LOCATION','Archivo movido, eliminado o con nombre/carpeta distintos. Requiere conciliación.');
    PickDomain.assert(hash(read(id))===hash(body),'FILE_CONTENT','El archivo existente tiene otro contenido.');
  }
  function outputSheet(){var s=SpreadsheetApp.openById(cfg.cuadernoId).getSheetByName(cfg.cuadernoSheet);PickDomain.assert(s,'CONFIG','No existe el cuadernillo configurado.');return s;}
  var HEADERS=['FECHA','REMITO','ORIGEN','DESTINO','BULTOS','RESPONSABLE','ACLARACION','PICKING_ID','TXT_ID','UNIDADES','ESTADO'];
  function rowValues(j){return [j.date.slice(8,10)+'/'+j.date.slice(5,7)+'/'+j.date.slice(0,4),String(j.remito),j.meta.origen,j.meta.destino,j.meta.bultos,j.meta.responsable,'',j.id,j.txtId,j.count,'LISTO'];}
  function publicationRow(s,j){var matches=[];values(s,'H2:H').forEach(function(r,i){if(r[0]===j.id)matches.push(i+2);});PickDomain.assert(matches.length<=1,'DUPLICATE_ROW','Hay filas duplicadas; requiere conciliación.');return matches[0]||0;}
  function same(values,wanted){return values.length===wanted.length&&values.every(function(v,i){return String(v)===String(wanted[i]);});}
  function checkHeaders(s){PickDomain.assert(same(values(s,'A1:K1')[0]||[],HEADERS),'HEADERS','Se modificaron las columnas del cuadernillo.');}
  return {
    now:Date.now,uuid:function(){return Utilities.getUuid();},hash:hash,
    businessDate:function(){return Utilities.formatDate(new Date(),'America/Argentina/Buenos_Aires','yyyy-MM-dd');},
    route:function(o,d){return cfg.routes[o+'>'+d]||'';},
    ids:function(){return Drive.Files.generateIds({count:2,space:'drive',type:'files'}).ids;},
    lock:function(fn){var l=LockService.getScriptLock();if(!l.tryLock(10000))PickDomain.fail('BUSY','El servicio está ocupado. Se reintentará.',false);try{return fn();}finally{l.releaseLock();}},
    get:get,save:save,
    reserveNumber:function(j){var control=sheet('CONTROL'),n=Number((values(control,'B2')[0]||[])[0]);PickDomain.assert(Number.isSafeInteger(n)&&n>=0,'COUNTER','Contador inválido.');j.remito=String(n+1);j.state='NUMBERED';j.updatedAt=Date.now();commit(j,[cells(control,2,2,[n+1])].concat(requests(j)));return j;},
    ensureManifest:function(j,body){ensure(j.manifestId,j.id+'.json',cfg.backupFolderId,'application/json',body,!!j.accepted);},
    readManifest:function(j){var f=file(j.manifestId);if(!f)return null;PickDomain.assert(!f.trashed && (f.parents||[]).includes(cfg.backupFolderId),'MANIFEST','El respaldo fue movido o eliminado.');return read(j.manifestId);},
    ensureTxt:function(j,body,verified){ensure(j.txtId,j.fileName,j.folderId,'text/plain',body,verified);},
    verifyTxt:function(j,body){var f=file(j.txtId);return !!(f&&!f.trashed&&f.name===j.fileName&&(f.parents||[]).includes(j.folderId)&&hash(read(j.txtId))===hash(body));},
    publish:function(j){
      var lock=LockService.getScriptLock();lock.waitLock(10000);
      try{
        var current=get(j.id);PickDomain.assert(current.lease===j.lease,'LEASE','Reserva de proceso perdida.');
        var s=outputSheet();checkHeaders(s);var r=publicationRow(s,j),wanted=rowValues(j);
        if(r){PickDomain.assert(same(values(s,'A'+r+':K'+r)[0]||[],wanted),'ROW_CONFLICT','La fila existente no coincide.');return;}
        // Only this service writes this NEW cuadernillo; no append on retry without ID lookup.
        r=lastRow(s)+1;ensureRows(s,r);Sheets.Spreadsheets.batchUpdate({requests:[cells(s,r,1,wanted)]},cfg.cuadernoId);
      }finally{lock.releaseLock();}
    },
    verifyPublication:function(j){var s=outputSheet();checkHeaders(s);var r=publicationRow(s,j);return !!r&&same(values(s,'A'+r+':K'+r)[0]||[],rowValues(j));},
    pending:function(limit){var q=sheet('PENDIENTES');return values(q,'A2:C').filter(function(r){return r[0]&&Number(r[1])<=Date.now()&&Number(r[2])<=Date.now();}).slice(0,limit).map(function(r){return r[0];});},
    history:function(m,actor){PickDomain.assert(/^\d{6}$/.test(m||''),'MONTH','Elegí un mes válido.');var s=db.getSheetByName('OPS_'+m);if(!s)return [];return values(s,'B2:B').map(function(r){return JSON.parse(r[0]);}).filter(function(j){return actor.role==='admin'||j.owner===actor.sub;}).sort(function(a,b){return b.createdAt-a.createdAt;}).slice(0,500);},
    health:function(actor){var last=Number(PropertiesService.getScriptProperties().getProperty('PICKING_HEARTBEAT')||0);return {mode:cfg.mode,role:actor.role,stationName:actor.name||'',origins:actor.origins,routes:Object.keys(cfg.routes),lastRecovery:last,stale:!last||Date.now()-last>900000};},
    heartbeat:function(){PropertiesService.getScriptProperties().setProperty('PICKING_HEARTBEAT',String(Date.now()));},
    timeBudgetExceeded:function(){return Date.now()-started>240000;}
  };
}


/* Account-free operator access. Secrets are issued once per workstation, never bundled in the web. */
function stationHash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function stationSecret_(){return Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');}
function stations_(){return JSON.parse(PropertiesService.getScriptProperties().getProperty('PICKING_STATIONS')||'[]');}
function stationActor_(token){
 PickDomain.assert(typeof token==='string'&&/^[a-f0-9]{64}$/.test(token),'AUTH','Este equipo todavía no está habilitado.');
 var hash=stationHash_(token),s=stations_().find(function(x){return x.enabled&&x.tokenHash===hash;});
 PickDomain.assert(s,'AUTH','La habilitación del equipo no es válida. Pedí una nueva a Sistemas.');
 return {sub:'station:'+s.id,email:'',name:s.name,role:s.role,origins:s.origins};
}
function activatePickingStation_(code){
 PickDomain.assert(typeof code==='string'&&/^[a-f0-9]{64}$/.test(code),'AUTH','Código de habilitación inválido.');
 var lock=LockService.getScriptLock();lock.waitLock(10000);
 try{
  var list=stations_(),hash=stationHash_(code),s=list.find(function(x){return x.enabled&&x.activationHash===hash&&x.activationExpires>Date.now();});
  PickDomain.assert(s,'AUTH','El código venció o ya fue utilizado. Solicitá uno nuevo.');
  var token=stationSecret_();s.tokenHash=stationHash_(token);delete s.activationHash;delete s.activationExpires;s.activatedAt=Date.now();
  PropertiesService.getScriptProperties().setProperty('PICKING_STATIONS',JSON.stringify(list));
  return {stationToken:token,stationName:s.name,role:s.role};
 }finally{lock.releaseLock();}
}
/* Run manually in the private editor. Ten operator workstations + one supervisor.
   Codes expire after 24 hours, are consumed once, and are not operator passwords. */
function preparePickingStations(){
 var lock=LockService.getScriptLock();lock.waitLock(10000);
 try{
  PickDomain.assert(!stations_().length,'EXISTS','Los equipos ya están creados. No se reemplazan habilitaciones existentes.');
  var list=[],codes=[];
  for(var i=0;i<11;i++){
   var code=stationSecret_(),name=i===10?'SUPERVISOR':'PUESTO '+String(i+1).padStart(2,'0');
   list.push({id:Utilities.getUuid(),name:name,role:i===10?'admin':'operator',origins:['DEPOSITO'],enabled:true,activationHash:stationHash_(code),activationExpires:Date.now()+86400000});
   codes.push({equipo:name,codigo:code});
  }
  PropertiesService.getScriptProperties().setProperty('PICKING_STATIONS',JSON.stringify(list));
  console.log('Códigos privados de habilitación (24 h, un uso). Entregar solo al administrador de cada equipo: '+JSON.stringify(codes));
 }finally{lock.releaseLock();}
}
/* For recovery, edit stationId inside this function in the PRIVATE editor before running.
   Disabled devices are rejected immediately by every request. */
function reissuePickingStation(){
 var stationId='REEMPLAZAR_POR_ID_DEL_EQUIPO';
 var lock=LockService.getScriptLock();lock.waitLock(10000);
 try{var list=stations_(),s=list.find(function(x){return x.id===stationId;});PickDomain.assert(s,'STATION','Seleccioná un ID de equipo existente.');var code=stationSecret_();s.enabled=true;s.activationHash=stationHash_(code);s.activationExpires=Date.now()+86400000;delete s.tokenHash;PropertiesService.getScriptProperties().setProperty('PICKING_STATIONS',JSON.stringify(list));console.log(s.name+' — código privado de un uso: '+code);}finally{lock.releaseLock();}
}


function doGet(){return pickingJson_({ok:true,version:2,service:'Picking Salida V2',message:'Usá la aplicación autenticada.'});}
function doPost(e){
  try{
    var raw=e&&e.postData&&e.postData.contents;PickDomain.assert(raw&&raw.length<=2200000,'SIZE','Pedido demasiado grande.');
    var envelope=JSON.parse(raw);
    if(envelope.action==='activate')return pickingJson_(Object.assign({ok:true,version:2},activatePickingStation_(envelope.code)));
    if(envelope.stationToken){var station=stationActor_(envelope.stationToken);return pickingJson_(Object.assign({ok:true,version:2},PickEngine.create(pickingGoogleStore_(pickingConfig_())).handle(envelope.request,station)));}
    PickDomain.fail('AUTH','Este equipo todavía no está habilitado.');
  }catch(err){return pickingJson_({ok:false,version:2,code:err.code||'SERVER',error:err.permanent?err.message:'Google no pudo completar la operación. Consultá el estado antes de reenviar.',retryable:err.permanent!==true});}
}
function pickingJson_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function recoverPickingV2(){var store=pickingGoogleStore_(pickingConfig_());return PickEngine.create(store).recover(10);}

/* Run once in the Apps Script editor. Creates NEW private resources, never changes V1. */
function setupPickingV2(){
  var props=PropertiesService.getScriptProperties();
  if(props.getProperty('PICKING_CONFIG'))return pickingConfig_();
  var root=DriveApp.createFolder('RÍO — Picking Salida V2'),backup=root.createFolder('Respaldo privado'),out=root.createFolder('TXT');
  var control=SpreadsheetApp.create('RÍO — Picking V2 — Control'),book=SpreadsheetApp.create('RÍO — Picking V2 — Cuadernillo');
  DriveApp.getFileById(control.getId()).moveTo(root);DriveApp.getFileById(book.getId()).moveTo(root);
  var sheet=control.getSheets()[0];sheet.setName('CONTROL');sheet.getRange(1,1,2,2).setValues([['CLAVE','VALOR'],['ULTIMO_REMITO',0]]);
  control.insertSheet('PENDIENTES').appendRow(['ID','PROXIMO_INTENTO','RESERVA_HASTA']);
  var cb=book.getSheets()[0];cb.setName('REMITOS');cb.appendRow(['FECHA','REMITO','ORIGEN','DESTINO','BULTOS','RESPONSABLE','ACLARACION','PICKING_ID','TXT_ID','UNIDADES','ESTADO']);cb.setFrozenRows(1);cb.getRange('A:K').setNumberFormat('@');cb.getRange(1,1,1,11).setBackground('#23253b').setFontColor('#ffffff').setFontWeight('bold');cb.autoResizeColumns(1,11);
  var routes={};['DEPOSITO','AV2','SARMIENTO','PUEYRREDON'].forEach(function(origin){var folder=out.createFolder(origin);PickDomain.BRANCHES.forEach(function(dest){routes[origin+'>'+dest]=folder.createFolder(dest).getId();});});
  var email=Session.getEffectiveUser().getEmail();PickDomain.assert(email,'SETUP','No se identificó al propietario.');
  var cfg={mode:'pilot',rootFolderId:root.getId(),controlId:control.getId(),cuadernoId:book.getId(),cuadernoSheet:'REMITOS',backupFolderId:backup.getId(),routes:routes,users:{}};
  cfg.users[email.toLowerCase()]={role:'admin',origins:['DEPOSITO','AV2','SARMIENTO','PUEYRREDON'],enabled:true};
  props.setProperty('PICKING_CONFIG',JSON.stringify(cfg));
  installPickingRecovery();
  console.log('Recursos nuevos: '+root.getUrl()+' | '+book.getUrl());
  return cfg;
}
function installPickingRecovery(){var triggers=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='recoverPickingV2';});if(!triggers.length)ScriptApp.newTrigger('recoverPickingV2').timeBased().everyMinutes(5).create();}


/* Manual integration check: synthetic data, only the isolated pilot resources. */
function smokeTestPickingV2(){
 var cfg=pickingConfig_();PickDomain.assert(cfg.mode==='pilot','MODE','El ensayo solo se ejecuta en piloto.');
 var props=PropertiesService.getScriptProperties(),id=props.getProperty('PICKING_SMOKE_ID');
 if(!id){id=Utilities.formatDate(new Date(),'America/Argentina/Buenos_Aires','yyyyMMdd')+'_'+Utilities.getUuid();props.setProperty('PICKING_SMOKE_ID',id);}
 var p={version:2,id:id,responsable:'DAVID',origen:'DEPOSITO',destino:'AV2',bultos:1,catalogVersion:'ENSAYO-INTEGRACION-V2',reviewedUnknown:true,scans:[{id:'prueba-evento-0001',code:'ENSAYO!NEGRO!M'},{id:'prueba-evento-0002',code:'ENSAYO!NEGRO!M'}]};
 var actor={sub:'pilot-server-test',email:Session.getEffectiveUser().getEmail(),role:'admin',origins:['DEPOSITO']},store=pickingGoogleStore_(cfg),engine=PickEngine.create(store);
 var first=engine.handle({action:'submit',payload:p},actor).job;
 var second=engine.handle({action:'submit',payload:p},actor).job;
 PickDomain.assert(first.state==='READY'&&second.state==='READY'&&first.remito===second.remito&&first.fileId===second.fileId,'TEST','Ensayo incompleto: '+JSON.stringify(second));
 var content=engine.handle({action:'download',id:id},actor).content;
 PickDomain.assert(content==='ENSAYO!NEGRO!M\nENSAYO!NEGRO!M','TEST','Contenido distinto del original.');
 console.log(JSON.stringify({test:'PASS',id:id,remito:second.remito,txtId:second.fileId,count:second.count,duplicateSubmission:'same ID, same remito, same TXT'}));
}
