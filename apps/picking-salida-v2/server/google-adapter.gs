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
