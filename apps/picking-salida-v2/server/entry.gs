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
